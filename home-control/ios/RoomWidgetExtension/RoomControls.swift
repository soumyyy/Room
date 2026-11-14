import AppIntents
import SwiftUI
import WidgetKit

// Control Center (and Lock Screen / Action button) switches, iOS 18+.
//
// Each switch reads the shared snapshot, the same one the widget draws, so it
// shows instantly without asking the hardware. iOS flips a switch the moment
// it is tapped and runs the intent; if the intent throws, iOS flips it back,
// so a command that fails is visible as the switch springing back.

// MARK: - State

/// What a switch shows: whether it is on, plus an optional detail ("27°").
struct ControlState: Sendable {
  var isOn: Bool
  var detail: String?
}

/// Reads one device out of the shared snapshot. A device never observed
/// reads as off: a switch has no "unknown".
@available(iOS 18.0, *)
struct SnapshotValue: ControlValueProvider {
  let read: @Sendable (RoomSnapshot) -> ControlState

  var previewValue: ControlState { ControlState(isOn: false) }

  func currentValue() async throws -> ControlState {
    read(RoomSnapshotStore.load())
  }
}

// MARK: - Controls

@available(iOS 18.0, *)
struct ACControl: ControlWidget {
  var body: some ControlWidgetConfiguration {
    StaticControlConfiguration(
      kind: RoomConfig.controlKindPrefix + "ac",
      provider: SnapshotValue { ControlState(isOn: $0.acIsOn ?? false, detail: $0.ac.map { "\($0.temp)°" }) }
    ) { state in
      ControlWidgetToggle("AC", isOn: state.isOn, action: ACControlIntent()) { isOn in
        Label(isOn ? (state.detail ?? "On") : "Off", systemImage: "air.conditioner.horizontal.fill")
      }
      .tint(.cyan)
    }
    .displayName("AC")
    .description("Turn the AC on or off.")
  }
}

@available(iOS 18.0, *)
struct LightsControl: ControlWidget {
  var body: some ControlWidgetConfiguration {
    StaticControlConfiguration(
      kind: RoomConfig.controlKindPrefix + "lights",
      provider: SnapshotValue { ControlState(isOn: $0.anyLightOn ?? false, detail: $0.litBrightness.map { "\($0)%" }) }
    ) { state in
      ControlWidgetToggle("Lights", isOn: state.isOn, action: LightsControlIntent()) { isOn in
        Label(isOn ? (state.detail ?? "On") : "Off", systemImage: "lightbulb.2.fill")
      }
      .tint(.orange)
    }
    .displayName("Lights")
    .description("Turn all the lights on or off.")
  }
}

@available(iOS 18.0, *)
struct FanControl: ControlWidget {
  var body: some ControlWidgetConfiguration {
    StaticControlConfiguration(
      kind: RoomConfig.controlKindPrefix + "fan",
      provider: SnapshotValue { ControlState(isOn: $0.node?.fan ?? false) }
    ) { state in
      ControlWidgetToggle("Fan", isOn: state.isOn, action: FanControlIntent()) { isOn in
        Label(isOn ? "On" : "Off", systemImage: "fan.ceiling.fill")
      }
      .tint(.cyan)
    }
    .displayName("Fan")
    .description("Turn the fan on or off.")
  }
}

@available(iOS 18.0, *)
struct TubeControl: ControlWidget {
  var body: some ControlWidgetConfiguration {
    StaticControlConfiguration(
      kind: RoomConfig.controlKindPrefix + "tube",
      provider: SnapshotValue { ControlState(isOn: $0.node?.tube ?? false) }
    ) { state in
      ControlWidgetToggle("Tube Light", isOn: state.isOn, action: TubeControlIntent()) { isOn in
        Label(isOn ? "On" : "Off", systemImage: "light.panel.fill")
      }
      .tint(.orange)
    }
    .displayName("Tube Light")
    .description("Turn the tube light on or off.")
  }
}

/// On is Enter Room, off is Leave Room, so one slot covers both scenes and
/// the switch itself says whether you are in or away.
@available(iOS 18.0, *)
struct RoomSceneControl: ControlWidget {
  var body: some ControlWidgetConfiguration {
    StaticControlConfiguration(
      kind: RoomConfig.controlKindPrefix + "room",
      provider: RoomSceneValue()
    ) { isIn in
      ControlWidgetToggle("Room", isOn: isIn, action: RoomSceneControlIntent()) { isIn in
        Label(isIn ? "In" : "Away", systemImage: isIn ? "figure.walk.arrival" : "figure.walk.departure")
      }
      .tint(.orange)
    }
    .displayName("Room")
    .description("On runs Enter Room, off runs Leave Room.")
  }
}

/// In unless the last scene was Leave Room (finished or still retrying).
@available(iOS 18.0, *)
struct RoomSceneValue: ControlValueProvider {
  var previewValue: Bool { true }

  func currentValue() async throws -> Bool {
    let phase = RoomSnapshotStore.scene()?.phase
    return phase != "away" && phase != "leaving"
  }
}

// MARK: - Intents
//
// Not discoverable: Shortcuts and Siri already have their own on/off intents.
// The titles name Control Center so the Diagnostics log tells them apart.

@available(iOS 18.0, *)
struct ACControlIntent: SetValueIntent {
  static let title: LocalizedStringResource = "Control Center AC"
  static let isDiscoverable = false

  @Parameter(title: "On")
  var value: Bool

  func perform() async throws -> some IntentResult {
    defer { RoomIntentSupport.reloadWidget() }
    try await logged(detail: value ? "on" : "off") {
      value ? try await RoomController.shared.acOn() : try await RoomController.shared.acOff()
    }
    return .result()
  }
}

@available(iOS 18.0, *)
struct LightsControlIntent: SetValueIntent {
  static let title: LocalizedStringResource = "Control Center Lights"
  static let isDiscoverable = false

  @Parameter(title: "On")
  var value: Bool

  func perform() async throws -> some IntentResult {
    defer { RoomIntentSupport.reloadWidget() }
    try await logged(detail: value ? "on" : "off") {
      value ? try await RoomController.shared.lightsOn() : try await RoomController.shared.lightsOff()
    }
    return .result()
  }
}

@available(iOS 18.0, *)
struct FanControlIntent: SetValueIntent {
  static let title: LocalizedStringResource = "Control Center Fan"
  static let isDiscoverable = false

  @Parameter(title: "On")
  var value: Bool

  func perform() async throws -> some IntentResult {
    defer { RoomIntentSupport.reloadWidget() }
    try await logged(detail: value ? "on" : "off") { try await RoomController.shared.setFan(value) }
    return .result()
  }
}

@available(iOS 18.0, *)
struct TubeControlIntent: SetValueIntent {
  static let title: LocalizedStringResource = "Control Center Tube Light"
  static let isDiscoverable = false

  @Parameter(title: "On")
  var value: Bool

  func perform() async throws -> some IntentResult {
    defer { RoomIntentSupport.reloadWidget() }
    try await logged(detail: value ? "on" : "off") { try await RoomController.shared.setTube(value) }
    return .result()
  }
}

@available(iOS 18.0, *)
struct RoomSceneControlIntent: SetValueIntent {
  static let title: LocalizedStringResource = "Control Center Room"
  static let isDiscoverable = false

  @Parameter(title: "In")
  var value: Bool

  func perform() async throws -> some IntentResult {
    defer { RoomIntentSupport.reloadWidget() }
    try await logged(detail: value ? "enter" : "leave") {
      value ? try await RoomController.shared.enterRoom() : try await RoomController.shared.leaveRoom()
    }
    return .result()
  }
}
