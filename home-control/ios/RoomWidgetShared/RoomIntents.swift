import AppIntents
import WidgetKit

// MARK: - Spoken parameters
//
// An App Shortcut phrase can only interpolate a parameter whose type conforms
// to AppEnum or AppEntity — a bare Int will not do. Anything meant to be said
// out loud therefore needs a finite set of cases, which is why temperature is
// modelled as one enum case per degree rather than as a number.

@available(iOS 17.0, *)
enum LightGroup: String, AppEnum {
  case all
  case left
  case right

  static let typeDisplayRepresentation: TypeDisplayRepresentation = "Lights"
  static let caseDisplayRepresentations: [LightGroup: DisplayRepresentation] = [
    .all: "all",
    .left: "left",
    .right: "right",
  ]

  /// `all` maps to every bulb rather than a named group.
  var configGroup: String? { self == .all ? nil : rawValue }
}

@available(iOS 17.0, *)
enum ACTemperature: Int, AppEnum {
  case degrees16 = 16
  case degrees17 = 17
  case degrees18 = 18
  case degrees19 = 19
  case degrees20 = 20
  case degrees21 = 21
  case degrees22 = 22
  case degrees23 = 23
  case degrees24 = 24
  case degrees25 = 25
  case degrees26 = 26
  case degrees27 = 27
  case degrees28 = 28
  case degrees29 = 29
  case degrees30 = 30

  static let typeDisplayRepresentation: TypeDisplayRepresentation = "Temperature"
  /// Synonyms let Siri take "25", "25 degrees" or "twenty five" straight away
  /// instead of answering with the list of every temperature.
  static let caseDisplayRepresentations: [ACTemperature: DisplayRepresentation] = [
    .degrees16: DisplayRepresentation(title: "16 degrees", synonyms: ["16", "16°", "16 degree", "16 °C", "sixteen", "sixteen degrees"]),
    .degrees17: DisplayRepresentation(title: "17 degrees", synonyms: ["17", "17°", "17 degree", "17 °C", "seventeen", "seventeen degrees"]),
    .degrees18: DisplayRepresentation(title: "18 degrees", synonyms: ["18", "18°", "18 degree", "18 °C", "eighteen", "eighteen degrees"]),
    .degrees19: DisplayRepresentation(title: "19 degrees", synonyms: ["19", "19°", "19 degree", "19 °C", "nineteen", "nineteen degrees"]),
    .degrees20: DisplayRepresentation(title: "20 degrees", synonyms: ["20", "20°", "20 degree", "20 °C", "twenty", "twenty degrees"]),
    .degrees21: DisplayRepresentation(title: "21 degrees", synonyms: ["21", "21°", "21 degree", "21 °C", "twenty one", "twenty one degrees", "twenty-one"]),
    .degrees22: DisplayRepresentation(title: "22 degrees", synonyms: ["22", "22°", "22 degree", "22 °C", "twenty two", "twenty two degrees", "twenty-two"]),
    .degrees23: DisplayRepresentation(title: "23 degrees", synonyms: ["23", "23°", "23 degree", "23 °C", "twenty three", "twenty three degrees", "twenty-three"]),
    .degrees24: DisplayRepresentation(title: "24 degrees", synonyms: ["24", "24°", "24 degree", "24 °C", "twenty four", "twenty four degrees", "twenty-four"]),
    .degrees25: DisplayRepresentation(title: "25 degrees", synonyms: ["25", "25°", "25 degree", "25 °C", "twenty five", "twenty five degrees", "twenty-five"]),
    .degrees26: DisplayRepresentation(title: "26 degrees", synonyms: ["26", "26°", "26 degree", "26 °C", "twenty six", "twenty six degrees", "twenty-six"]),
    .degrees27: DisplayRepresentation(title: "27 degrees", synonyms: ["27", "27°", "27 degree", "27 °C", "twenty seven", "twenty seven degrees", "twenty-seven"]),
    .degrees28: DisplayRepresentation(title: "28 degrees", synonyms: ["28", "28°", "28 degree", "28 °C", "twenty eight", "twenty eight degrees", "twenty-eight"]),
    .degrees29: DisplayRepresentation(title: "29 degrees", synonyms: ["29", "29°", "29 degree", "29 °C", "twenty nine", "twenty nine degrees", "twenty-nine"]),
    .degrees30: DisplayRepresentation(title: "30 degrees", synonyms: ["30", "30°", "30 degree", "30 °C", "thirty", "thirty degrees"]),
  ]
}

@available(iOS 17.0, *)
enum PowerState: String, AppEnum {
  case on
  case off

  static let typeDisplayRepresentation: TypeDisplayRepresentation = "Power"
  static let caseDisplayRepresentations: [PowerState: DisplayRepresentation] = [
    .on: "on",
    .off: "off",
  ]

  var isOn: Bool { self == .on }
}

@available(iOS 17.0, *)
enum TemperatureShift: String, AppEnum {
  case warmer
  case cooler

  static let typeDisplayRepresentation: TypeDisplayRepresentation = "Direction"
  static let caseDisplayRepresentations: [TemperatureShift: DisplayRepresentation] = [
    .warmer: "warmer",
    .cooler: "cooler",
  ]

  var delta: Int { self == .warmer ? 1 : -1 }
}

/// Mirrors MODE_OPTIONS in app/AppScreen.tsx, which leaves out heat.
@available(iOS 17.0, *)
enum ACModeOption: Int, AppEnum {
  case cool = 0
  case auto = 2
  case fan = 3
  case dry = 4

  static let typeDisplayRepresentation: TypeDisplayRepresentation = "Mode"
  static let caseDisplayRepresentations: [ACModeOption: DisplayRepresentation] = [
    .cool: "cool",
    .auto: "auto",
    .fan: "fan",
    .dry: "dry",
  ]
}

@available(iOS 17.0, *)
enum FanSpeedOption: Int, AppEnum {
  case auto = 0
  case low = 1
  case medium = 2
  case high = 3

  static let typeDisplayRepresentation: TypeDisplayRepresentation = "Fan Speed"
  static let caseDisplayRepresentations: [FanSpeedOption: DisplayRepresentation] = [
    .auto: "auto",
    .low: "low",
    .medium: "medium",
    .high: "high",
  ]
}

/// Everything "Set Room lights to …" can mean: a brightness or a colour. One
/// enum, so both share a phrase instead of two shortcuts competing for it.
@available(iOS 17.0, *)
enum LightSetting: String, AppEnum {
  case percent10 = "10"
  case percent25 = "25"
  case percent50 = "50"
  case percent75 = "75"
  case percent100 = "100"
  case warmWhite = "warm-white"
  case neutralWhite = "neutral-white"
  case coolWhite = "cool-white"
  case red, orange, yellow, green, cyan, blue, purple, pink, seafoam, lavender, blush

  static let typeDisplayRepresentation: TypeDisplayRepresentation = "Light Setting"
  static let caseDisplayRepresentations: [LightSetting: DisplayRepresentation] = [
    .percent10: DisplayRepresentation(title: "10 percent", synonyms: ["10", "10%", "ten percent", "lowest"]),
    .percent25: DisplayRepresentation(title: "25 percent", synonyms: ["25", "25%", "twenty five percent", "quarter"]),
    .percent50: DisplayRepresentation(title: "50 percent", synonyms: ["50", "50%", "fifty percent", "half"]),
    .percent75: DisplayRepresentation(title: "75 percent", synonyms: ["75", "75%", "seventy five percent"]),
    .percent100: DisplayRepresentation(title: "100 percent", synonyms: ["100", "100%", "full", "full brightness", "max"]),
    .warmWhite: DisplayRepresentation(title: "Warm White", synonyms: ["warm", "warm light"]),
    .neutralWhite: DisplayRepresentation(title: "Neutral", synonyms: ["white", "neutral white", "normal", "daylight"]),
    .coolWhite: DisplayRepresentation(title: "Cool White", synonyms: ["cool", "cold white", "bright white"]),
    .red: "Red",
    .orange: "Orange",
    .yellow: "Yellow",
    .green: "Green",
    .cyan: DisplayRepresentation(title: "Cyan", synonyms: ["aqua", "teal"]),
    .blue: "Blue",
    .purple: DisplayRepresentation(title: "Purple", synonyms: ["violet"]),
    .pink: "Pink",
    .seafoam: DisplayRepresentation(title: "Seafoam", synonyms: ["mint"]),
    .lavender: "Lavender",
    .blush: DisplayRepresentation(title: "Blush", synonyms: ["light pink", "pastel pink"]),
  ]

  var brightness: Int? { Int(rawValue) }
}

// MARK: - Scenes

@available(iOS 17.0, *)
struct EnterRoomIntent: AppIntent {
  static let title: LocalizedStringResource = "Enter Room"
  static let openAppWhenRun = false
  static let isDiscoverable = true

  func perform() async throws -> some IntentResult & ProvidesDialog {
    defer { RoomIntentSupport.reloadWidget() }
    try await logged { try await RoomController.shared.enterRoom() }
    return .result(dialog: "Welcome back. The room is as you left it.")
  }
}

@available(iOS 17.0, *)
struct LeaveRoomIntent: AppIntent {
  static let title: LocalizedStringResource = "Leave Room"
  static let openAppWhenRun = false
  static let isDiscoverable = true

  func perform() async throws -> some IntentResult & ProvidesDialog {
    defer { RoomIntentSupport.reloadWidget() }
    try await logged { try await RoomController.shared.leaveRoom() }
    return .result(dialog: "Everything's off. Enter Room brings it back.")
  }
}

/// The Lock Screen door's actions. They ask for Face ID while the phone is
/// locked, so a tap from a pocket does nothing; Siri and the Home Screen
/// widget keep the plain intents above, which never ask.
@available(iOS 17.0, *)
struct LockScreenEnterRoomIntent: AppIntent {
  static let title: LocalizedStringResource = "Lock Screen Enter Room"
  static let openAppWhenRun = false
  static let isDiscoverable = false
  static var authenticationPolicy: IntentAuthenticationPolicy { .requiresAuthentication }

  func perform() async throws -> some IntentResult {
    defer { RoomIntentSupport.reloadWidget() }
    try await logged { try await RoomController.shared.enterRoom() }
    return .result()
  }
}

@available(iOS 17.0, *)
struct LockScreenLeaveRoomIntent: AppIntent {
  static let title: LocalizedStringResource = "Lock Screen Leave Room"
  static let openAppWhenRun = false
  static let isDiscoverable = false
  static var authenticationPolicy: IntentAuthenticationPolicy { .requiresAuthentication }

  func perform() async throws -> some IntentResult {
    defer { RoomIntentSupport.reloadWidget() }
    try await logged { try await RoomController.shared.leaveRoom() }
    return .result()
  }
}

// MARK: - Air conditioner

@available(iOS 17.0, *)
struct ACOnIntent: AppIntent {
  static let title: LocalizedStringResource = "Turn AC On"
  static let openAppWhenRun = false
  static let isDiscoverable = true

  func perform() async throws -> some IntentResult {
    try await logged { try await RoomController.shared.acOn() }
    RoomIntentSupport.reloadWidget()
    return .result()
  }
}

@available(iOS 17.0, *)
struct ACOffIntent: AppIntent {
  static let title: LocalizedStringResource = "Turn AC Off"
  static let openAppWhenRun = false
  static let isDiscoverable = true

  func perform() async throws -> some IntentResult {
    try await logged { try await RoomController.shared.acOff() }
    RoomIntentSupport.reloadWidget()
    return .result()
  }
}

/// One spoken shortcut for both: "Turn Room AC on" / "Turn off Room AC".
@available(iOS 17.0, *)
struct SetACPowerIntent: AppIntent {
  static let title: LocalizedStringResource = "Turn AC On or Off"
  static let openAppWhenRun = false
  static let isDiscoverable = true
  static var parameterSummary: some ParameterSummary {
    Summary("Turn the AC \(\.$power)")
  }

  @Parameter(title: "Power")
  var power: PowerState

  func perform() async throws -> some IntentResult & ProvidesDialog {
    try await logged(detail: power.rawValue) {
      power.isOn ? try await RoomController.shared.acOn() : try await RoomController.shared.acOff()
    }
    RoomIntentSupport.reloadWidget()
    let temp = RoomSnapshotStore.load().ac?.temp
    return .result(dialog: IntentDialog(stringLiteral: power.isOn ? "AC on\(temp.map { " at \($0) degrees" } ?? "")." : "AC off."))
  }
}

@available(iOS 17.0, *)
struct SetACTemperatureIntent: AppIntent {
  static let title: LocalizedStringResource = "Set AC Temperature"
  static let openAppWhenRun = false
  static let isDiscoverable = true
  static var parameterSummary: some ParameterSummary {
    Summary("Set the AC to \(\.$temperature)")
  }

  /// What a spoken phrase fills in. Optional: when Siri hears the phrase but
  /// not a temperature it knows, `degrees` asks for a plain number rather than
  /// reading out every option.
  @Parameter(title: "Temperature")
  var temperature: ACTemperature?

  @Parameter(title: "Degrees", inclusiveRange: (16, 30))
  var degrees: Int?

  func perform() async throws -> some IntentResult & ProvidesDialog {
    let asked: Int
    if let temperature { asked = temperature.rawValue }
    else if let degrees { asked = degrees }
    else { asked = try await $degrees.requestValue("What temperature?") }

    let target = RoomConfig.clampTemp(asked)
    let scene = try await logged(detail: "\(target)°") { try await RoomController.shared.setACTemperature(target) }
    RoomIntentSupport.reloadWidget()
    let note = target == asked ? "" : " That's as far as it goes."
    return .result(dialog: IntentDialog(stringLiteral: "AC set to \(scene.temp) degrees.\(note)"))
  }
}

@available(iOS 17.0, *)
struct AdjustACTemperatureIntent: AppIntent {
  static let title: LocalizedStringResource = "Make Room Warmer or Cooler"
  static let openAppWhenRun = false
  static let isDiscoverable = true
  static var parameterSummary: some ParameterSummary {
    Summary("Make the room \(\.$shift)")
  }

  @Parameter(title: "Direction")
  var shift: TemperatureShift

  func perform() async throws -> some IntentResult & ProvidesDialog {
    let scene = try await logged(detail: shift.rawValue) { try await RoomController.shared.adjustACTemperature(by: shift.delta) }
    RoomIntentSupport.reloadWidget()
    return .result(dialog: IntentDialog(stringLiteral: "AC set to \(scene.temp) degrees."))
  }
}

@available(iOS 17.0, *)
struct SetACModeIntent: AppIntent {
  static let title: LocalizedStringResource = "Set AC Mode"
  static let openAppWhenRun = false
  static let isDiscoverable = true
  static var parameterSummary: some ParameterSummary {
    Summary("Set the AC to \(\.$mode) mode")
  }

  @Parameter(title: "Mode")
  var mode: ACModeOption

  func perform() async throws -> some IntentResult {
    try await logged(detail: "\(mode)") { try await RoomController.shared.setACMode(mode.rawValue) }
    RoomIntentSupport.reloadWidget()
    return .result()
  }
}

@available(iOS 17.0, *)
struct SetFanSpeedIntent: AppIntent {
  static let title: LocalizedStringResource = "Set AC Fan Speed"
  static let openAppWhenRun = false
  static let isDiscoverable = true
  static var parameterSummary: some ParameterSummary {
    Summary("Set the AC fan to \(\.$speed)")
  }

  @Parameter(title: "Fan Speed")
  var speed: FanSpeedOption

  func perform() async throws -> some IntentResult {
    try await logged(detail: "\(speed)") { try await RoomController.shared.setFanSpeed(speed.rawValue) }
    RoomIntentSupport.reloadWidget()
    return .result()
  }
}

// MARK: - Fan and tube light

@available(iOS 17.0, *)
struct FanOnIntent: AppIntent {
  static let title: LocalizedStringResource = "Turn Fan On"
  static let openAppWhenRun = false
  static let isDiscoverable = true

  func perform() async throws -> some IntentResult {
    try await logged { try await RoomController.shared.setFan(true) }
    RoomIntentSupport.reloadWidget()
    return .result()
  }
}

@available(iOS 17.0, *)
struct FanOffIntent: AppIntent {
  static let title: LocalizedStringResource = "Turn Fan Off"
  static let openAppWhenRun = false
  static let isDiscoverable = true

  func perform() async throws -> some IntentResult {
    try await logged { try await RoomController.shared.setFan(false) }
    RoomIntentSupport.reloadWidget()
    return .result()
  }
}

@available(iOS 17.0, *)
struct TubeOnIntent: AppIntent {
  static let title: LocalizedStringResource = "Turn Tube Light On"
  static let openAppWhenRun = false
  static let isDiscoverable = true

  func perform() async throws -> some IntentResult {
    try await logged { try await RoomController.shared.setTube(true) }
    RoomIntentSupport.reloadWidget()
    return .result()
  }
}

@available(iOS 17.0, *)
struct TubeOffIntent: AppIntent {
  static let title: LocalizedStringResource = "Turn Tube Light Off"
  static let openAppWhenRun = false
  static let isDiscoverable = true

  func perform() async throws -> some IntentResult {
    try await logged { try await RoomController.shared.setTube(false) }
    RoomIntentSupport.reloadWidget()
    return .result()
  }
}

@available(iOS 17.0, *)
struct SetFanPowerIntent: AppIntent {
  static let title: LocalizedStringResource = "Turn Fan On or Off"
  static let openAppWhenRun = false
  static let isDiscoverable = true
  static var parameterSummary: some ParameterSummary {
    Summary("Turn the fan \(\.$power)")
  }

  @Parameter(title: "Power")
  var power: PowerState

  func perform() async throws -> some IntentResult & ProvidesDialog {
    try await logged(detail: power.rawValue) { try await RoomController.shared.setFan(power.isOn) }
    RoomIntentSupport.reloadWidget()
    return .result(dialog: power.isOn ? "Fan on." : "Fan off.")
  }
}

@available(iOS 17.0, *)
struct SetTubePowerIntent: AppIntent {
  static let title: LocalizedStringResource = "Turn Tube Light On or Off"
  static let openAppWhenRun = false
  static let isDiscoverable = true
  static var parameterSummary: some ParameterSummary {
    Summary("Turn the tube light \(\.$power)")
  }

  @Parameter(title: "Power")
  var power: PowerState

  func perform() async throws -> some IntentResult & ProvidesDialog {
    try await logged(detail: power.rawValue) { try await RoomController.shared.setTube(power.isOn) }
    RoomIntentSupport.reloadWidget()
    return .result(dialog: power.isOn ? "Tube light on." : "Tube light off.")
  }
}

// MARK: - Lights

@available(iOS 17.0, *)
struct LightsOnIntent: AppIntent {
  static let title: LocalizedStringResource = "Turn Lights On"
  static let openAppWhenRun = false
  static let isDiscoverable = true
  static var parameterSummary: some ParameterSummary {
    Summary("Turn on the \(\.$group) lights")
  }

  @Parameter(title: "Lights", default: .all)
  var group: LightGroup

  func perform() async throws -> some IntentResult {
    try await logged(detail: group.rawValue) { try await RoomController.shared.lightsOn(group: group.configGroup) }
    RoomIntentSupport.reloadWidget()
    return .result()
  }
}

@available(iOS 17.0, *)
struct LightsOffIntent: AppIntent {
  static let title: LocalizedStringResource = "Turn Lights Off"
  static let openAppWhenRun = false
  static let isDiscoverable = true
  static var parameterSummary: some ParameterSummary {
    Summary("Turn off the \(\.$group) lights")
  }

  @Parameter(title: "Lights", default: .all)
  var group: LightGroup

  func perform() async throws -> some IntentResult {
    try await logged(detail: group.rawValue) { try await RoomController.shared.lightsOff(group: group.configGroup) }
    RoomIntentSupport.reloadWidget()
    return .result()
  }
}

@available(iOS 17.0, *)
struct SetLightsIntent: AppIntent {
  static let title: LocalizedStringResource = "Set Lights"
  static let openAppWhenRun = false
  static let isDiscoverable = true
  static var parameterSummary: some ParameterSummary {
    Summary("Set the \(\.$group) lights to \(\.$setting)")
  }

  @Parameter(title: "Lights", default: .all)
  var group: LightGroup

  @Parameter(title: "Setting")
  var setting: LightSetting

  func perform() async throws -> some IntentResult {
    try await logged(detail: "\(group.rawValue) \(setting.rawValue)") {
      if let level = setting.brightness {
        try await RoomController.shared.setBrightness(level, group: group.configGroup)
      } else {
        try await RoomController.shared.setPreset(setting.rawValue, group: group.configGroup)
      }
    }
    RoomIntentSupport.reloadWidget()
    return .result()
  }
}

@available(iOS 17.0, *)
extension AppIntent {
  /// Runs `body` under the shared action log, named after the intent.
  @discardableResult
  func logged<T>(detail: String? = nil, _ body: () async throws -> T) async throws -> T {
    let name = String(localized: Self.title)
    return try await RoomActionLog.run(detail.map { name + " · " + $0 } ?? name, body)
  }
}

enum RoomIntentSupport {
  /// A tap or a spoken command is the one moment the extension is genuinely
  /// alive, so nudge the timeline while we are here.
  static func reloadWidget() {
    WidgetCenter.shared.reloadTimelines(ofKind: RoomConfig.widgetKind)
    // Control Center switches read the same snapshot; keep them in step.
    if #available(iOS 18.0, *) { ControlCenter.shared.reloadAllControls() }
  }
}
