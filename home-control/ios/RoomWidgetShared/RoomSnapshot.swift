import Foundation

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

  static let unknown = RoomSnapshot(ac: nil, lights: [:], updatedAt: nil)

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

  mutating func setLights(_ state: LightState, forGroups groups: [String]) {
    for group in groups {
      lights[group] = state
    }
  }
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
  private static let key = "room.snapshot"
  private static let lock = NSLock()

  private static var defaults: UserDefaults? {
    UserDefaults(suiteName: RoomConfig.appGroupID)
  }

  static func load() -> RoomSnapshot {
    guard let data = defaults?.data(forKey: key) else { return .unknown }
    return (try? JSONDecoder().decode(RoomSnapshot.self, from: data)) ?? .unknown
  }

  static func save(_ snapshot: RoomSnapshot) {
    guard let data = try? JSONEncoder().encode(snapshot) else { return }
    defaults?.set(data, forKey: key)
  }

  /// Read-modify-write. The lock serialises callers inside one process; across
  /// processes the last writer wins, which is harmless here because the next
  /// read from a device corrects it.
  static func update(_ mutate: (inout RoomSnapshot) -> Void) {
    lock.lock()
    defer { lock.unlock() }

    var snapshot = load()
    mutate(&snapshot)
    snapshot.updatedAt = Date()
    save(snapshot)
  }
}
