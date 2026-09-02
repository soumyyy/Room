import Foundation

struct BulbConfig: Identifiable, Hashable, Sendable {
  let id: String
  let name: String
  let ip: String
}

struct TuyaConfig: Sendable {
  let clientID: String
  let clientSecret: String
  let apiBaseURL: URL
  let infraredID: String
  let acRemoteID: String
}

struct AcScene: Codable, Sendable {
  let power: Int
  let mode: Int
  let temp: Int
  let wind: Int
}

struct WizPilot: Codable, Sendable {
  let state: Bool
  let dimming: Int?
  let temp: Int?
  let r: Int?
  let g: Int?
  let b: Int?
}

struct SavedBulbState: Codable, Sendable {
  let id: String
  let ip: String
  let pilot: WizPilot
}

struct SavedRoomState: Codable, Sendable {
  let ac: AcScene?
  let bulbs: [SavedBulbState]
  let savedAt: Date

  var hasRestorableState: Bool {
    if let ac, ac.power == 1 {
      return true
    }

    return bulbs.contains { $0.pilot.state }
  }
}

enum RoomConfig {
  static let widgetKind = "com.soumya.roomwidgetmac.actions"
  static let sharedStateSuite = "com.soumya.roomwidgetmac.room-state"
  static let sharedStateKey = "room.saved-state"
  static let wizPort: UInt16 = 38899
  static let wizReadTimeoutNanoseconds: UInt64 = 1_500_000_000
  static let wizRetryDelayNanoseconds: UInt64 = 75_000_000

  static let bulbs: [BulbConfig] = [
    .init(id: "left-1", name: "Left Light 1", ip: "192.168.29.131"),
    .init(id: "left-2", name: "Left Light 2", ip: "192.168.29.180"),
    .init(id: "right-1", name: "Right Light 1", ip: "192.168.29.116"),
    .init(id: "right-2", name: "Right Light 2", ip: "192.168.29.151"),
  ]

  static let tuya = TuyaConfig(
    clientID: RoomSecrets.clientId,
    clientSecret: RoomSecrets.clientSecret,
    apiBaseURL: URL(string: RoomSecrets.apiBaseUrl) ?? URL(string: "https://openapi.tuyain.com")!,
    infraredID: RoomSecrets.infraredId,
    acRemoteID: RoomSecrets.acRemoteId
  )

  static let enterScene = AcScene(power: 1, mode: 0, temp: 24, wind: 1)
  static let leaveScene = AcScene(power: 0, mode: 0, temp: 24, wind: 1)

  static let enterLights = WizPilot(state: true, dimming: 100, temp: 4200, r: nil, g: nil, b: nil)
  static let leaveLights = WizPilot(state: false, dimming: nil, temp: nil, r: nil, g: nil, b: nil)
}

enum RoomAction: String, Sendable {
  case enter
  case leave

  var title: String {
    switch self {
    case .enter: "Enter Room"
    case .leave: "Leave Room"
    }
  }

  var symbolName: String {
    switch self {
    case .enter: "door.left.hand.open"
    case .leave: "figure.walk.departure"
    }
  }
}
