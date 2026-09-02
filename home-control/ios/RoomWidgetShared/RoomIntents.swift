import AppIntents
import WidgetKit

// MARK: - Spoken parameters
//
// An App Shortcut phrase can only interpolate a parameter whose type conforms
// to AppEnum or AppEntity — a bare Int will not do. Anything meant to be said
// out loud therefore needs a finite set of cases, which is why temperature is
// modelled as one enum case per degree rather than as a number.

@available(iOS 16.0, *)
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

@available(iOS 16.0, *)
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
  static let caseDisplayRepresentations: [ACTemperature: DisplayRepresentation] = [
    .degrees16: "16 degrees",
    .degrees17: "17 degrees",
    .degrees18: "18 degrees",
    .degrees19: "19 degrees",
    .degrees20: "20 degrees",
    .degrees21: "21 degrees",
    .degrees22: "22 degrees",
    .degrees23: "23 degrees",
    .degrees24: "24 degrees",
    .degrees25: "25 degrees",
    .degrees26: "26 degrees",
    .degrees27: "27 degrees",
    .degrees28: "28 degrees",
    .degrees29: "29 degrees",
    .degrees30: "30 degrees",
  ]
}

@available(iOS 16.0, *)
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
@available(iOS 16.0, *)
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

@available(iOS 16.0, *)
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

/// Coarse steps so the value can be spoken. The Shortcuts app can still drive
/// SetLightBrightnessIntent to any value between 10 and 100.
@available(iOS 16.0, *)
enum BrightnessStep: Int, AppEnum {
  case tenPercent = 10
  case quarter = 25
  case half = 50
  case threeQuarters = 75
  case full = 100

  static let typeDisplayRepresentation: TypeDisplayRepresentation = "Brightness"
  static let caseDisplayRepresentations: [BrightnessStep: DisplayRepresentation] = [
    .tenPercent: "10 percent",
    .quarter: "25 percent",
    .half: "50 percent",
    .threeQuarters: "75 percent",
    .full: "100 percent",
  ]
}

/// Mirrors GROUP_COLOR_PRESETS in app/AppScreen.tsx.
@available(iOS 16.0, *)
enum LightColorOption: String, AppEnum {
  case warmWhite = "warm-white"
  case neutralWhite = "neutral-white"
  case coolWhite = "cool-white"
  case red = "red"
  case orange = "orange"
  case yellow = "yellow"
  case green = "green"
  case cyan = "cyan"
  case blue = "blue"
  case purple = "purple"
  case pink = "pink"
  case seafoam = "seafoam"
  case lavender = "lavender"
  case blush = "blush"

  static let typeDisplayRepresentation: TypeDisplayRepresentation = "Colour"
  static let caseDisplayRepresentations: [LightColorOption: DisplayRepresentation] = [
    .warmWhite: "Warm White",
    .neutralWhite: "Neutral",
    .coolWhite: "Cool White",
    .red: "Red",
    .orange: "Orange",
    .yellow: "Yellow",
    .green: "Green",
    .cyan: "Cyan",
    .blue: "Blue",
    .purple: "Purple",
    .pink: "Pink",
    .seafoam: "Seafoam",
    .lavender: "Lavender",
    .blush: "Blush",
  ]
}

// MARK: - Scenes

@available(iOS 16.0, *)
struct EnterRoomIntent: AppIntent {
  static let title: LocalizedStringResource = "Enter Room"
  static let openAppWhenRun = false
  static let isDiscoverable = true

  func perform() async throws -> some IntentResult {
    try await RoomController.shared.enterRoom()
    RoomIntentSupport.reloadWidget()
    return .result()
  }
}

@available(iOS 16.0, *)
struct LeaveRoomIntent: AppIntent {
  static let title: LocalizedStringResource = "Leave Room"
  static let openAppWhenRun = false
  static let isDiscoverable = true

  func perform() async throws -> some IntentResult {
    try await RoomController.shared.leaveRoom()
    RoomIntentSupport.reloadWidget()
    return .result()
  }
}

// MARK: - Air conditioner

@available(iOS 16.0, *)
struct ACOnIntent: AppIntent {
  static let title: LocalizedStringResource = "Turn AC On"
  static let openAppWhenRun = false
  static let isDiscoverable = true

  func perform() async throws -> some IntentResult {
    try await RoomController.shared.acOn()
    RoomIntentSupport.reloadWidget()
    return .result()
  }
}

@available(iOS 16.0, *)
struct ACOffIntent: AppIntent {
  static let title: LocalizedStringResource = "Turn AC Off"
  static let openAppWhenRun = false
  static let isDiscoverable = true

  func perform() async throws -> some IntentResult {
    try await RoomController.shared.acOff()
    RoomIntentSupport.reloadWidget()
    return .result()
  }
}

@available(iOS 16.0, *)
struct SetACTemperatureIntent: AppIntent {
  static let title: LocalizedStringResource = "Set AC Temperature"
  static let openAppWhenRun = false
  static let isDiscoverable = true
  static var parameterSummary: some ParameterSummary {
    Summary("Set the AC to \(\.$temperature)")
  }

  @Parameter(title: "Temperature")
  var temperature: ACTemperature

  func perform() async throws -> some IntentResult & ProvidesDialog {
    let scene = try await RoomController.shared.setACTemperature(temperature.rawValue)
    RoomIntentSupport.reloadWidget()
    return .result(dialog: IntentDialog(stringLiteral: "AC set to \(scene.temp) degrees."))
  }
}

@available(iOS 16.0, *)
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
    let scene = try await RoomController.shared.adjustACTemperature(by: shift.delta)
    RoomIntentSupport.reloadWidget()
    return .result(dialog: IntentDialog(stringLiteral: "AC set to \(scene.temp) degrees."))
  }
}

@available(iOS 16.0, *)
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
    try await RoomController.shared.setACMode(mode.rawValue)
    RoomIntentSupport.reloadWidget()
    return .result()
  }
}

@available(iOS 16.0, *)
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
    try await RoomController.shared.setFanSpeed(speed.rawValue)
    RoomIntentSupport.reloadWidget()
    return .result()
  }
}

// MARK: - Lights

@available(iOS 16.0, *)
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
    try await RoomController.shared.lightsOn(group: group.configGroup)
    RoomIntentSupport.reloadWidget()
    return .result()
  }
}

@available(iOS 16.0, *)
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
    try await RoomController.shared.lightsOff(group: group.configGroup)
    RoomIntentSupport.reloadWidget()
    return .result()
  }
}

@available(iOS 16.0, *)
struct SetLightBrightnessIntent: AppIntent {
  static let title: LocalizedStringResource = "Set Light Brightness"
  static let openAppWhenRun = false
  static let isDiscoverable = true
  static var parameterSummary: some ParameterSummary {
    Summary("Set the \(\.$group) lights to \(\.$level)")
  }

  @Parameter(title: "Lights", default: .all)
  var group: LightGroup

  @Parameter(title: "Brightness")
  var level: BrightnessStep

  func perform() async throws -> some IntentResult {
    try await RoomController.shared.setBrightness(level.rawValue, group: group.configGroup)
    RoomIntentSupport.reloadWidget()
    return .result()
  }
}

@available(iOS 16.0, *)
struct SetLightColorIntent: AppIntent {
  static let title: LocalizedStringResource = "Set Light Colour"
  static let openAppWhenRun = false
  static let isDiscoverable = true
  static var parameterSummary: some ParameterSummary {
    Summary("Set the \(\.$group) lights to \(\.$color)")
  }

  @Parameter(title: "Lights", default: .all)
  var group: LightGroup

  @Parameter(title: "Colour")
  var color: LightColorOption

  func perform() async throws -> some IntentResult {
    try await RoomController.shared.setPreset(color.rawValue, group: group.configGroup)
    RoomIntentSupport.reloadWidget()
    return .result()
  }
}

enum RoomIntentSupport {
  /// A tap or a spoken command is the one moment the extension is genuinely
  /// alive, so nudge the timeline while we are here.
  static func reloadWidget() {
    WidgetCenter.shared.reloadTimelines(ofKind: RoomConfig.widgetKind)
  }
}
