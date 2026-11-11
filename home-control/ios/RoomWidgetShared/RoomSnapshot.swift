import Foundation
import Darwin

/// What the room was last known to be doing, shared between the app, the
/// widget extension and Siri through the App Group.
///
/// Every field is optional-by-absence: a room we have never observed reports
/// `nil` rather than `false`, so the widget can show "unknown" instead of
/// claiming something is off when we simply have not looked yet.
struct RoomSnapshot: Codable, Sendable, Equatable {
  struct LightState: Codable, Sendable, Equatable {
    var isOn: Bool
    var brightness: Int?
    var presetID: String?
  }

  var ac: AcScene?
  /// Keyed by the group ids in RoomConfig.lightGroupIDs.
  var lights: [String: LightState]
  var updatedAt: Date?
  /// The switchboard's relays. Absent in a snapshot saved before it existed,
  /// which decodes as nil, so an old file still loads.
  var node: NodeState?
  var observedAt: [String: Date]? = nil
  var commandedAt: [String: Date]? = nil
  var bulbs: [String: WizPilot]? = nil

  static let unknown = RoomSnapshot(ac: nil, lights: [:], updatedAt: nil, node: nil)

  var acIsOn: Bool? {
    guard let ac else { return nil }
    return ac.power == 1
  }

  var anyLightOn: Bool? {
    guard !lights.isEmpty else { return nil }
    return lights.values.contains { $0.isOn }
  }

  /// Mean brightness across the groups that are currently on.
  var litBrightness: Int? {
    let lit = lights.values.filter(\.isOn).compactMap(\.brightness)
    guard !lit.isEmpty else { return nil }
    return lit.reduce(0, +) / lit.count
  }

  var acReading: DeviceReading {
    DeviceReading(isOn: acIsOn, value: "\(ac?.temp ?? RoomConfig.acOnScene.temp)°")
  }

  var lightsReading: DeviceReading {
    DeviceReading(isOn: anyLightOn, value: "\(litBrightness ?? RoomConfig.maxBrightness)%")
  }

  var tubeReading: DeviceReading {
    DeviceReading(isOn: node?.tube, value: "On")
  }

  var fanReading: DeviceReading {
    DeviceReading(isOn: node?.fan, value: "On")
  }

  /// Folds a reading into the node, filling only what it reports so a partial
  /// answer never erases a known relay.
  mutating func apply(_ reading: NodeState) {
    var current = node ?? NodeState()
    if let tube = reading.tube { current.tube = tube }
    if let fan = reading.fan { current.fan = fan }
    node = current
  }

  mutating func setLights(_ state: LightState, forGroups groups: [String]) {
    for group in groups {
      lights[group] = state
    }
  }
}

/// One durable restore plan shared by the app, Shortcuts and widget.
struct RoomSceneState: Codable, Sendable {
  var restore: RoomSnapshot
  var phase: String
  var pending: [String]
  var failures: [String: String] = [:]
}

struct RoomSceneReport: Codable, Sendable {
  var phase: String?
  var failed: [String]
  var snapshot: RoomSnapshot
}

/// Each relay is optional on its own: the app may know the tube light while the
/// fan has never been observed, and unknown must not read as off.
struct NodeState: Codable, Sendable, Equatable {
  var tube: Bool?
  var fan: Bool?
}

/// One bulb's answer to getPilot.
struct WizReading: Sendable, Equatable {
  let isOn: Bool
  let brightness: Int?
}

extension RoomSnapshot {
  /// Folds a group's bulb readings into one group state. Returns nil when no
  /// bulb answered at all — silence means "could not look", and overwriting a
  /// known state with `off` on a dropped packet would be a lie.
  static func groupState(from readings: [WizReading]) -> LightState? {
    guard !readings.isEmpty else { return nil }

    let lit = readings.filter(\.isOn)
    let levels = lit.compactMap(\.brightness)

    return LightState(
      isOn: !lit.isEmpty,
      brightness: levels.isEmpty ? nil : levels.reduce(0, +) / levels.count,
      presetID: nil
    )
  }
}

/// What one device tile shows. `unknown` is a distinct case from `off`: on a
/// fresh install nothing has been recorded yet, and claiming the AC is off when
/// we have simply never looked would be a lie the tile cannot back up.
enum DeviceReading: Equatable {
  case unknown
  case off
  case on(String)

  init(isOn: Bool?, value: @autoclosure () -> String) {
    switch isOn {
    case .none: self = .unknown
    case .some(false): self = .off
    case .some(true): self = .on(value())
    }
  }

  var text: String {
    switch self {
    case .unknown: return "—"
    case .off: return "Off"
    case let .on(value): return value
    }
  }

  var isOn: Bool {
    if case .on = self { return true }
    return false
  }
}

/// Shared-container persistence. Reads and writes are cheap and synchronous so
/// a TimelineProvider can call them without hopping to an actor.
enum RoomSnapshotStore {
  private struct Document: Codable {
    var snapshot: RoomSnapshot = .unknown
    var scene: RoomSceneState?
  }
  private static let lock = NSLock()
  private static var directory: URL {
    #if ROOM_TESTS
    if let path = ProcessInfo.processInfo.environment["ROOM_STATE_TEST_DIRECTORY"] { return URL(fileURLWithPath: path) }
    #endif
    return FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: RoomConfig.appGroupID)
      ?? FileManager.default.temporaryDirectory.appendingPathComponent(RoomConfig.appGroupID)
  }
  private static var file: URL { directory.appendingPathComponent("room-state-v2.json") }

  private static func coordinated<T>(_ body: () -> T) -> T {
    lock.lock()
    defer { lock.unlock() }
    try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    let fd = open(directory.appendingPathComponent("snapshot.lock").path, O_CREAT | O_RDWR, S_IRUSR | S_IWUSR)
    if fd >= 0 { flock(fd, LOCK_EX) }
    defer { if fd >= 0 { flock(fd, LOCK_UN); close(fd) } }
    return body()
  }

  private static func readDocument() -> Document {
    if let data = try? Data(contentsOf: file), let value = try? JSONDecoder().decode(Document.self, from: data) { return value }
    // Preserve installs that used the original UserDefaults snapshot/away keys.
    let defaults = UserDefaults(suiteName: RoomConfig.appGroupID)
    var document = Document()
    if let data = defaults?.data(forKey: "room.snapshot"), let value = try? JSONDecoder().decode(RoomSnapshot.self, from: data) { document.snapshot = value }
    struct LegacyAway: Decodable { var ac: AcScene; var activeGroupIds: [String]; var node: NodeState? }
    if let json = defaults?.string(forKey: "roomAwayState"), let value = try? JSONDecoder().decode(LegacyAway.self, from: Data(json.utf8)) {
      var restore = document.snapshot
      restore.ac = value.ac
      restore.node = value.node
      for id in RoomConfig.lightGroupIDs {
        var light = restore.lights[id] ?? .init(isOn: false)
        light.isOn = value.activeGroupIds.contains(id)
        restore.lights[id] = light
      }
      document.scene = RoomSceneState(restore: restore, phase: "away", pending: [])
    }
    return document
  }

  private static func write(_ document: Document) throws {
    try JSONEncoder().encode(document).write(to: file, options: .atomic)
  }

  static func load() -> RoomSnapshot { coordinated { readDocument().snapshot } }
  static func scene() -> RoomSceneState? { coordinated { readDocument().scene } }
  static func report() -> RoomSceneReport {
    coordinated {
      let document = readDocument()
      return RoomSceneReport(phase: document.scene?.phase, failed: document.scene?.pending ?? [], snapshot: document.snapshot)
    }
  }
  static func saveScene(_ scene: RoomSceneState?) throws {
    var failure: Error?
    coordinated {
      var document = readDocument()
      document.scene = scene
      do { try write(document) } catch { failure = error }
    }
    if let failure { throw failure }
  }
  static func save(_ snapshot: RoomSnapshot) {
    coordinated {
      var document = readDocument()
      document.snapshot = snapshot
      try? write(document)
    }
  }

  /// Per-device merge under a cross-process lock. A delayed read cannot replace
  /// a command recorded after that read began. Empty/failed reads do not age data.
  static func update(keys: [String]? = nil, observedAt: Date = Date(), command: Bool = false, _ mutate: (inout RoomSnapshot) -> Void) {
    coordinated {
      var document = readDocument()
      let before = document.snapshot
      var next = before
      mutate(&next)
      let candidates = keys ?? (["ac", "fan", "tube"] + RoomConfig.lightGroupIDs.map { "lights:" + $0 } + RoomConfig.bulbs.map { "bulb:" + $0.id })
      var stamps = before.observedAt ?? [:]
      var commands = before.commandedAt ?? [:]
      var touched = false
      for key in candidates {
        if let time = stamps[key], time > observedAt { continue }
        if !command, let time = commands[key], observedAt.timeIntervalSince(time) < 2 { continue }
        var changed = false
        switch key {
        case "ac": changed = next.ac != before.ac; document.snapshot.ac = next.ac
        case "fan": changed = next.node?.fan != before.node?.fan; document.snapshot.apply(NodeState(tube: nil, fan: next.node?.fan))
        case "tube": changed = next.node?.tube != before.node?.tube; document.snapshot.apply(NodeState(tube: next.node?.tube, fan: nil))
        default:
          if key.hasPrefix("lights:") {
            let id = String(key.dropFirst(7))
            changed = next.lights[id] != before.lights[id]
            document.snapshot.lights[id] = next.lights[id]
          } else if key.hasPrefix("bulb:") {
            let id = String(key.dropFirst(5))
            changed = next.bulbs?[id] != before.bulbs?[id]
            if document.snapshot.bulbs == nil { document.snapshot.bulbs = [:] }
            document.snapshot.bulbs?[id] = next.bulbs?[id]
          }
        }
        if keys != nil || changed {
          stamps[key] = observedAt
          if command { commands[key] = observedAt }
          touched = true
        }
      }
      guard touched else { return }
      document.snapshot.observedAt = stamps
      document.snapshot.commandedAt = commands
      document.snapshot.updatedAt = stamps.values.max()
      try? write(document)
    }
  }

  /// Serialize whole scene transactions across the app and extension. Never
  /// block an executor while another process is performing network requests.
  static func acquireSceneLock() async throws -> Int32 {
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    let fd = open(directory.appendingPathComponent("scene.lock").path, O_CREAT | O_RDWR, S_IRUSR | S_IWUSR)
    guard fd >= 0 else { throw CocoaError(.fileWriteUnknown) }
    let deadline = Date().addingTimeInterval(20)
    while flock(fd, LOCK_EX | LOCK_NB) != 0 {
      if Date() > deadline { close(fd); throw CocoaError(.fileLocking) }
      do { try await Task.sleep(nanoseconds: 100_000_000) } catch { close(fd); throw error }
    }
    return fd
  }
  static func releaseSceneLock(_ fd: Int32) { flock(fd, LOCK_UN); close(fd) }
}
