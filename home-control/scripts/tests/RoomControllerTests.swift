import Foundation

enum RoomNetworkError: Error { case invalidResponse; case tuya(message: String); case wiz(message: String) }

actor TuyaClient {
  static let shared = TuyaClient()
  var scene = AcScene(power: 1, mode: 0, temp: 23, wind: 2)
  var node = NodeState(tube: true, fan: true)
  func fetchACScene() throws -> AcScene { scene }
  func infraredIsOnline() throws -> Bool { true }
  func fetchNode() throws -> NodeState? { node }
  func sendACScene(_ value: AcScene) throws { scene = value }
  func sendNodeCommands(_ commands: [NodeCommand]) throws {
    for command in commands {
      if command.code == "switch_1" { node.tube = command.value }
      if command.code == "switch_2" { node.fan = command.value }
    }
  }
}

actor WiZClient {
  static let shared = WiZClient()
  var pilots = Dictionary(uniqueKeysWithValues: RoomConfig.bulbs.map { ($0.id, WizPilot(state: true, dimming: 37, temp: 2700)) })
  var failing: Set<String> = []
  var calls: [String: Int] = [:]
  func fail(_ ids: Set<String>) { failing = ids }
  func count(_ id: String) -> Int { calls[id] ?? 0 }
  func readPilots() -> [String: WizPilot] { pilots }
  func apply(_ pilot: WizPilot, to bulbs: [BulbConfig]) throws {
    for bulb in bulbs {
      calls[bulb.id, default: 0] += 1
      if failing.contains(bulb.id) { throw RoomNetworkError.wiz(message: "test timeout") }
      pilots[bulb.id] = pilot
      RoomSnapshotStore.update(keys: ["bulb:" + bulb.id]) {
        if $0.bulbs == nil { $0.bulbs = [:] }
        $0.bulbs?[bulb.id] = pilot
      }
    }
  }
}

@main struct RoomControllerTests {
  static func check(_ condition: Bool, _ message: String) { precondition(condition, message) }
  static func main() async throws {
    if CommandLine.arguments.count > 1 {
      let key = CommandLine.arguments[1]
      for _ in 0..<60 {
        RoomSnapshotStore.update(keys: [key]) {
          if key == "ac" { $0.ac = RoomConfig.acOnScene.with(temp: 30) }
          else { $0.apply(NodeState(tube: true, fan: nil)) }
        }
      }
      return
    }
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent("room-controller-tests-" + UUID().uuidString)
    setenv("ROOM_STATE_TEST_DIRECTORY", directory.path, 1)
    defer { try? FileManager.default.removeItem(at: directory) }

    let failedID = RoomConfig.bulbs[0].id
    let successfulID = RoomConfig.bulbs[1].id
    await WiZClient.shared.fail([failedID])
    let partial = try await RoomController.shared.performScene("leave")
    check(partial.phase == "leaving", "Partial leave must stay retryable")
    check(partial.failed == ["bulb:" + failedID], "Only failed device stays pending")
    check(partial.snapshot.ac?.power == 0, "Successful AC leg must be recorded")
    check(partial.snapshot.node?.fan == false, "Successful fan leg must be recorded")
    let plan = RoomSnapshotStore.scene()!
    check(plan.restore.ac?.temp == 23, "Original temperature must survive partial failure")
    check(plan.restore.node?.fan == true && plan.restore.node?.tube == true, "Restore plan includes fan and tube")

    await WiZClient.shared.fail([])
    let away = try await RoomController.shared.performScene("leave")
    check(away.phase == "away" && away.failed.isEmpty, "Retry completes leaving")
    let count = await WiZClient.shared.count(successfulID)
    check(count == 1, "Retry must not repeat successful device actions")
    check(RoomSnapshotStore.scene()?.restore.ac?.power == 1, "Retry must not save the already-off room")

    await WiZClient.shared.fail([failedID])
    let partialEnter = try await RoomController.shared.performScene("enter")
    check(partialEnter.phase == "entering", "Partial enter remains retryable")
    check(RoomSnapshotStore.scene() != nil, "Failed enter retains restore plan")
    await WiZClient.shared.fail([])
    let entered = try await RoomController.shared.performScene("enter")
    check(entered.phase == nil && RoomSnapshotStore.scene() == nil, "Successful restore clears plan")
    check(entered.snapshot.ac?.temp == 23 && entered.snapshot.ac?.power == 1, "Enter restores saved AC settings")
    check(entered.snapshot.node?.fan == true && entered.snapshot.node?.tube == true, "Enter restores both relays")
    check(entered.snapshot.bulbs?[failedID]?.dimming == 37, "Enter restores individual bulb settings")

    let newer = Date().addingTimeInterval(10)
    RoomSnapshotStore.update(keys: ["ac"], observedAt: newer) { $0.ac = RoomConfig.acOnScene.with(temp: 25) }
    RoomSnapshotStore.update(keys: ["ac"], observedAt: Date()) { $0.ac = RoomConfig.acOffScene }
    check(RoomSnapshotStore.load().ac?.temp == 25, "Old response cannot overwrite newer observation")
    let stamp = RoomSnapshotStore.load().updatedAt
    RoomSnapshotStore.update(keys: []) { _ in }
    check(RoomSnapshotStore.load().updatedAt == stamp, "A failed refresh cannot renew freshness")

    // Two separate processes write independent devices into the same document.
    RoomSnapshotStore.save(.unknown)
    let children = ["ac", "tube"].map { key -> Process in
      let process = Process()
      process.executableURL = URL(fileURLWithPath: CommandLine.arguments[0])
      process.arguments = [key]
      return process
    }
    for child in children { try child.run() }
    for child in children { child.waitUntilExit(); check(child.terminationStatus == 0, "Snapshot writer failed") }
    let combined = RoomSnapshotStore.load()
    check(combined.ac?.temp == 30 && combined.node?.tube == true, "Cross-process updates must preserve both devices")
    check(WizPilot(state: true, dimming: 40).matches(WizPilot(state: true, dimming: 40)), "Matching WiZ readback accepted")
    check(!WizPilot(state: true, dimming: 40).matches(WizPilot(state: false, dimming: 40)), "Wrong power cannot confirm a command")
    // Back-to-back AC commands (any process) are spaced so the IR blaster does not drop one.
    try await RoomController.shared.acOn()
    let firstSent = Date()
    try await RoomController.shared.setACTemperature(24)
    check(Date().timeIntervalSince(firstSent) >= RoomConfig.acCommandGap - 0.05, "AC commands must be spaced out")
    check(RoomSnapshotStore.load().ac?.temp == 24, "Spaced command still lands")
    print("scene retries, saved restore state, per-device freshness and cross-process persistence: passed")
  }
}
