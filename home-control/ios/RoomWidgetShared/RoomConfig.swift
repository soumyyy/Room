import Foundation

struct BulbConfig: Identifiable, Hashable, Sendable {
  let id: String
  let name: String
  let ip: String
  /// Mirrors BULB_GROUPS in app/config.ts.
  let group: String
}

struct TuyaConfig: Sendable {
  let clientID: String
  let clientSecret: String
  let apiBaseURL: URL
  let infraredID: String
  let acRemoteID: String
}

struct AcScene: Codable, Sendable, Equatable {
  let power: Int
  let mode: Int
  let temp: Int
  let wind: Int

  /// Tuya's scenes/command takes the whole scene in one payload — there is no
  /// call that changes only the temperature — so every partial edit goes
  /// through here on top of the scene the unit is currently holding.
  func with(power: Int? = nil, mode: Int? = nil, temp: Int? = nil, wind: Int? = nil) -> AcScene {
    AcScene(
      power: RoomConfig.clampPower(power ?? self.power),
      mode: RoomConfig.clampMode(mode ?? self.mode),
      temp: RoomConfig.clampTemp(temp ?? self.temp),
      wind: RoomConfig.clampWind(wind ?? self.wind)
    )
  }
}

struct WizPilot: Codable, Sendable {
  var state: Bool
  var dimming: Int?
  var temp: Int?
  var r: Int?
  var g: Int?
  var b: Int?
  /// Cold- and warm-white LEDs. A desaturated colour is the shared component
  /// on one of these plus the residual chroma on r/g/b.
  var c: Int?
  var w: Int?

  init(
    state: Bool,
    dimming: Int? = nil,
    temp: Int? = nil,
    r: Int? = nil,
    g: Int? = nil,
    b: Int? = nil,
    c: Int? = nil,
    w: Int? = nil
  ) {
    self.state = state
    self.dimming = dimming
    self.temp = temp
    self.r = r
    self.g = g
    self.b = b
    self.c = c
    self.w = w
  }
}

struct LightPreset: Identifiable, Sendable {
  let id: String
  let name: String
  let pilot: WizPilot
}

enum RoomConfig {
  static let widgetKind = "com.soumymaheshwri.room.actions"
  /// Must match the App Group on both bundle IDs in the developer portal.
  static let appGroupID = "group.org.name.homecontrol"
  static let wizPort: UInt16 = 38899
  static let wizRetryDelayNanoseconds: UInt64 = 75_000_000
  /// Upper bound on a single UDP send, so an unreachable LAN can never
  /// stall a widget intent past its execution budget.
  static let wizSendTimeout: TimeInterval = 2.0
  /// URLSession defaults to 60s, which is longer than a widget refresh lives.
  static let tuyaRequestTimeout: TimeInterval = 6.0

  static let minTemp = 16
  static let maxTemp = 30
  static let minBrightness = 10
  static let maxBrightness = 100

  static let bulbs: [BulbConfig] = [
    .init(id: "left-1", name: "Left Light 1", ip: "192.168.29.131", group: "left"),
    .init(id: "left-2", name: "Left Light 2", ip: "192.168.29.180", group: "left"),
    .init(id: "right-1", name: "Right Light 1", ip: "192.168.29.116", group: "right"),
    .init(id: "right-2", name: "Right Light 2", ip: "192.168.29.151", group: "right"),
  ]

  static let lightGroupIDs = ["left", "right"]

  /// `nil` means every bulb.
  static func bulbs(inGroup group: String?) -> [BulbConfig] {
    guard let group, group != "all" else { return bulbs }
    return bulbs.filter { $0.group == group }
  }

  /// The group ids a command addressed to `group` will actually change.
  static func groupIDs(inGroup group: String?) -> [String] {
    guard let group, group != "all" else { return lightGroupIDs }
    return lightGroupIDs.contains(group) ? [group] : []
  }

  static let tuya = TuyaConfig(
    clientID: RoomSecrets.clientId,
    clientSecret: RoomSecrets.clientSecret,
    apiBaseURL: URL(string: RoomSecrets.apiBaseUrl) ?? URL(string: "https://openapi.tuyain.com")!,
    infraredID: RoomSecrets.infraredId,
    acRemoteID: RoomSecrets.acRemoteId
  )

  static let enterScene = AcScene(power: 1, mode: 0, temp: 24, wind: 1)
  static let leaveScene = AcScene(power: 0, mode: 0, temp: 24, wind: 1)
  static let acOnScene = AcScene(power: 1, mode: 0, temp: 24, wind: 1)
  static let acOffScene = AcScene(power: 0, mode: 0, temp: 24, wind: 1)

  static let enterLights = WizPilot(state: true, dimming: 100, temp: 4200)
  static let leaveLights = WizPilot(state: false)
  static let lightsOn = WizPilot(state: true, dimming: 100, temp: 4200)
  static let lightsOff = WizPilot(state: false)

  /// Mirrors GROUP_COLOR_PRESETS in app/AppScreen.tsx — keep the two in step.
  static let lightPresets: [LightPreset] = [
    .init(id: "warm-white", name: "Warm White", pilot: WizPilot(state: true, temp: 2700)),
    .init(id: "neutral-white", name: "Neutral", pilot: WizPilot(state: true, temp: 4200)),
    .init(id: "cool-white", name: "Cool White", pilot: WizPilot(state: true, temp: 6500)),
    .init(id: "red", name: "Red", pilot: WizPilot(state: true, r: 255, g: 59, b: 48)),
    .init(id: "orange", name: "Orange", pilot: WizPilot(state: true, r: 255, g: 149, b: 0)),
    .init(id: "yellow", name: "Yellow", pilot: WizPilot(state: true, r: 255, g: 214, b: 10)),
    .init(id: "green", name: "Green", pilot: WizPilot(state: true, r: 48, g: 209, b: 88)),
    .init(id: "cyan", name: "Cyan", pilot: WizPilot(state: true, r: 0, g: 199, b: 190)),
    .init(id: "blue", name: "Blue", pilot: WizPilot(state: true, r: 10, g: 132, b: 255)),
    .init(id: "purple", name: "Purple", pilot: WizPilot(state: true, r: 191, g: 90, b: 242)),
    .init(id: "pink", name: "Pink", pilot: WizPilot(state: true, r: 255, g: 45, b: 85)),
    .init(id: "seafoam", name: "Seafoam", pilot: WizPilot(state: true, r: 0, g: 73, b: 43, c: 167)),
    .init(id: "lavender", name: "Lavender", pilot: WizPilot(state: true, r: 10, g: 0, b: 55, c: 200)),
    .init(id: "blush", name: "Blush", pilot: WizPilot(state: true, r: 57, g: 0, b: 18, w: 198)),
  ]

  static func preset(id: String) -> LightPreset? {
    lightPresets.first { $0.id == id }
  }

  static func clampPower(_ value: Int) -> Int { value == 1 ? 1 : 0 }
  static func clampMode(_ value: Int) -> Int { (0...4).contains(value) ? value : acOnScene.mode }
  static func clampWind(_ value: Int) -> Int { (0...3).contains(value) ? value : acOnScene.wind }
  static func clampTemp(_ value: Int) -> Int { min(max(value, minTemp), maxTemp) }
  static func clampBrightness(_ value: Int) -> Int { min(max(value, minBrightness), maxBrightness) }
}
