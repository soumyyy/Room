import Darwin
import Foundation

// The real TuyaClient pulls in secrets; WiZClient only needs the error type.
enum RoomNetworkError: LocalizedError {
  case invalidURL
  case invalidResponse
  case tuya(message: String)
  case wiz(message: String)
  var errorDescription: String? {
    if case let .wiz(message) = self { return message }
    return "\(self)"
  }
}

/// A WiZ bulb on 127.0.0.1, speaking the real UDP protocol, that can drop
/// commands or stay silent the way a sleepy bulb on a phone's Wi-Fi does.
final class FakeBulb: @unchecked Sendable {
  private let lock = NSLock()
  private var fd: Int32 = -1
  private var _state = false
  private var _dropSets = 0
  private var _dropReads = 0
  private var _silent = false
  private(set) var setsSeen = 0

  var state: Bool { lock.lock(); defer { lock.unlock() }; return _state }
  func configure(state: Bool, dropSets: Int = 0, dropReads: Int = 0, silent: Bool = false) {
    lock.lock(); defer { lock.unlock() }
    _state = state; _dropSets = dropSets; _dropReads = dropReads; _silent = silent; setsSeen = 0
  }

  func start() {
    fd = socket(AF_INET, SOCK_DGRAM, 0)
    precondition(fd >= 0, "socket")
    var yes: Int32 = 1
    setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &yes, socklen_t(MemoryLayout<Int32>.size))
    var address = sockaddr_in()
    address.sin_family = sa_family_t(AF_INET)
    address.sin_port = in_port_t(RoomConfig.wizPort).bigEndian
    address.sin_addr.s_addr = inet_addr("127.0.0.1")
    let bound = withUnsafePointer(to: &address) {
      $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { bind(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) }
    }
    precondition(bound == 0, "bind 127.0.0.1:\(RoomConfig.wizPort) failed: \(errno)")
    Thread { self.serve() }.start()
  }

  private func serve() {
    var buffer = [UInt8](repeating: 0, count: 2048)
    while true {
      var peer = sockaddr_storage()
      var length = socklen_t(MemoryLayout<sockaddr_storage>.size)
      let count = withUnsafeMutablePointer(to: &peer) {
        $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { recvfrom(fd, &buffer, buffer.count, 0, $0, &length) }
      }
      guard count > 0,
            let message = try? JSONSerialization.jsonObject(with: Data(buffer[0..<count])) as? [String: Any],
            let method = message["method"] as? String else { continue }

      lock.lock()
      var reply: [String: Any]?
      if method == "setPilot" {
        if _dropSets > 0 { _dropSets -= 1 }
        else if let state = (message["params"] as? [String: Any])?["state"] as? Bool { _state = state; setsSeen += 1 }
      } else if method == "getPilot" {
        if _silent { }
        else if _dropReads > 0 { _dropReads -= 1 }
        else { reply = ["method": "getPilot", "result": ["state": _state, "dimming": 100]] }
      }
      lock.unlock()

      guard let reply, let data = try? JSONSerialization.data(withJSONObject: reply) else { continue }
      _ = data.withUnsafeBytes { bytes in
        withUnsafePointer(to: &peer) {
          $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { sendto(fd, bytes.baseAddress, data.count, 0, $0, length) }
        }
      }
    }
  }
}

@main struct WizClientTests {
  static func check(_ condition: Bool, _ message: String) { precondition(condition, message) }

  static func main() async throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent("wiz-tests-" + UUID().uuidString)
    setenv("ROOM_STATE_TEST_DIRECTORY", directory.path, 1)
    defer { try? FileManager.default.removeItem(at: directory) }

    let bulb = FakeBulb()
    bulb.start()
    let config = BulbConfig(id: "fake", name: "Fake", ip: "127.0.0.1", group: "left")
    let off = WizPilot(state: false)
    let on = WizPilot(state: true, dimming: 100)

    // Lost first packets: the burst still lands the command in one round.
    bulb.configure(state: true, dropSets: 2)
    try await WiZClient.shared.apply(off, to: [config])
    check(!bulb.state, "A burst must survive two dropped packets")

    // A slow bulb that misses three readbacks still confirms within budget.
    // The old code gave up after two.
    bulb.configure(state: false, dropReads: 3)
    try await WiZClient.shared.apply(on, to: [config])
    check(bulb.state, "Bulb turned on")
    check(RoomSnapshotStore.load().bulbs?["fake"]?.state == true, "Confirmed reading is recorded")
    check(!RoomSnapshotStore.load().lightsFailed, "A confirmed command leaves no failure mark")

    // A bulb that takes the command but never answers: the intent fails inside
    // its budget, the tile shows what was asked for, and it is marked failed.
    bulb.configure(state: true, silent: true)
    let began = Date()
    var threw = false
    do { try await WiZClient.shared.apply(off, to: [config]) } catch { threw = true }
    let took = Date().timeIntervalSince(began)
    check(threw, "Unconfirmed command must still report failure")
    check(took < RoomConfig.wizCommandBudget + 0.5, "Failure must arrive within the budget, took \(took)s")
    check(!bulb.state, "Command did reach the bulb")
    let assumed = RoomSnapshotStore.load()
    check(assumed.bulbs?["fake"]?.state == false, "Unconfirmed bulb shows the requested state")
    check(assumed.lightsFailed, "Unconfirmed bulb is marked failed")
    check(assumed.updatedAt.map { Date().timeIntervalSince($0) < 1 } == true, "Failure renews freshness so the widget draws it")

    // The next confirmed command clears the mark.
    bulb.configure(state: false)
    try await WiZClient.shared.apply(on, to: [config])
    check(!RoomSnapshotStore.load().lightsFailed, "Confirmed command clears the failure mark")

    // Assumed state keeps what the command did not set and drops the other colour mode.
    let previous = WizPilot(state: true, dimming: 40, r: 255, g: 0, b: 0)
    let warm = WizPilot(state: true, temp: 2700).applied(to: previous)
    check(warm.dimming == 40 && warm.temp == 2700 && warm.r == nil, "White temperature replaces colour, keeps brightness")
    check(WizPilot(state: false).applied(to: previous) == WizPilot(state: false, dimming: 40, r: 255, g: 0, b: 0), "Off keeps the rest")

    print("wiz bursts, readback retries, unconfirmed state and failure marks: passed")

    // Room hub fallback, end to end: this WiZ client -> the real room-hub
    // process -> UDP -> the same fake bulb.
    guard let hubDir = ProcessInfo.processInfo.environment["ROOM_HUB_DIR"] else {
      print("room hub fallback: skipped (ROOM_HUB_DIR not set)"); return
    }
    let token = String(repeating: "h", count: 32)
    let port = 18_000 + Int.random(in: 0..<2000)
    let devices = directory.appendingPathComponent("devices.json")
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    try #"{"bulbs":[{"id":"fake","name":"Fake","ip":"127.0.0.1","group":"left"}]}"#.write(to: devices, atomically: true, encoding: .utf8)
    let hub = Process()
    hub.executableURL = URL(fileURLWithPath: "/usr/bin/env")
    hub.arguments = ["node", hubDir + "/src/server.mjs"]
    hub.environment = ProcessInfo.processInfo.environment.merging([
      "ROOM_HUB_TOKEN": token, "HOST": "127.0.0.1", "PORT": String(port),
      "ROOM_HUB_DEVICES": devices.path, "ROOM_HUB_PROBE_MS": "600000",
    ]) { $1 }
    hub.standardOutput = FileHandle.nullDevice
    try hub.run()
    defer { hub.terminate() }
    let base = "http://127.0.0.1:\(port)"
    var up = false
    for _ in 0..<50 where !up {
      try await Task.sleep(nanoseconds: 100_000_000)
      if let (_, response) = try? await URLSession.shared.data(from: URL(string: base + "/healthz")!),
         (response as? HTTPURLResponse)?.statusCode == 200 { up = true }
    }
    check(up, "room-hub started")

    // The phone misses every readback in its shorter budget; the hub, with the
    // last dropped read behind it, confirms. The command must succeed.
    RoomHub.settings = .init(lanURL: base, url: "", token: token)
    RoomActionLog.clear()
    bulb.configure(state: false, dropReads: 4)
    try await WiZClient.shared.apply(on, to: [config])
    check(bulb.state, "Hub landed the command")
    check(!RoomSnapshotStore.load().lightsFailed, "Hub confirmation leaves no failure mark")
    let hubEntry = RoomActionLog.entries().last { $0.source == "room hub" }
    check(hubEntry != nil && hubEntry?.error == nil, "Hub retry is logged as a success")

    // A silent bulb fails on both paths; the failure still surfaces.
    bulb.configure(state: true, silent: true)
    threw = false
    do { try await WiZClient.shared.apply(off, to: [config]) } catch { threw = true }
    check(threw && RoomSnapshotStore.load().lightsFailed, "Failure on both paths is still reported")

    // Hub down: the phone's own result stands and the log says why.
    RoomHub.settings = .init(lanURL: "http://127.0.0.1:1", url: "", token: token)
    RoomActionLog.clear()
    bulb.configure(state: true, silent: true)
    threw = false
    do { try await WiZClient.shared.apply(off, to: [config]) } catch { threw = true }
    check(threw, "Unreachable hub does not hide the failure")
    check(RoomActionLog.entries().contains { $0.error == "hub unreachable" }, "Unreachable hub is logged")
    print("room hub fallback, end to end: passed")
  }
}
