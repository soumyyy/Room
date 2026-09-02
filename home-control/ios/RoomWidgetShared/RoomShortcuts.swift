import AppIntents

// Compiled into the app target only. An app registers exactly one
// AppShortcutsProvider; building it into the widget extension as well made
// both bundles claim the same Siri phrases.
//
// Apple asks for at most ten shortcuts per app, so SetACModeIntent and
// SetFanSpeedIntent are deliberately absent — they stay available in the
// Shortcuts app without spending a spoken slot.
@available(iOS 16.0, *)
struct RoomShortcutsProvider: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: EnterRoomIntent(),
      phrases: [
        "Enter \(.applicationName)",
        "Enter room with \(.applicationName)"
      ],
      shortTitle: "Enter Room",
      systemImageName: "door.left.hand.open"
    )

    AppShortcut(
      intent: LeaveRoomIntent(),
      phrases: [
        "Leave \(.applicationName)",
        "Leave room with \(.applicationName)"
      ],
      shortTitle: "Leave Room",
      systemImageName: "figure.walk.departure"
    )

    AppShortcut(
      intent: ACOnIntent(),
      phrases: [
        "Turn AC on in \(.applicationName)",
        "Switch on AC with \(.applicationName)"
      ],
      shortTitle: "AC On",
      systemImageName: "snowflake"
    )

    AppShortcut(
      intent: ACOffIntent(),
      phrases: [
        "Turn AC off in \(.applicationName)",
        "Switch off AC with \(.applicationName)"
      ],
      shortTitle: "AC Off",
      systemImageName: "power"
    )

    AppShortcut(
      intent: SetACTemperatureIntent(),
      phrases: [
        "Set \(.applicationName) to \(\.$temperature)",
        "Set the \(.applicationName) temperature to \(\.$temperature)"
      ],
      shortTitle: "Set Temperature",
      systemImageName: "thermometer.medium"
    )

    AppShortcut(
      intent: AdjustACTemperatureIntent(),
      phrases: [
        "Make \(.applicationName) \(\.$shift)",
        "Turn \(.applicationName) \(\.$shift)"
      ],
      shortTitle: "Warmer or Cooler",
      systemImageName: "thermometer.variable"
    )

    AppShortcut(
      intent: LightsOnIntent(),
      phrases: [
        "Turn on \(.applicationName) lights",
        "Turn on the \(\.$group) lights in \(.applicationName)"
      ],
      shortTitle: "Lights On",
      systemImageName: "lightbulb.fill"
    )

    AppShortcut(
      intent: LightsOffIntent(),
      phrases: [
        "Turn off \(.applicationName) lights",
        "Turn off the \(\.$group) lights in \(.applicationName)"
      ],
      shortTitle: "Lights Off",
      systemImageName: "lightbulb"
    )

    AppShortcut(
      intent: SetLightBrightnessIntent(),
      phrases: [
        "Set \(.applicationName) lights to \(\.$level)",
        "Dim \(.applicationName) lights to \(\.$level)"
      ],
      shortTitle: "Set Brightness",
      systemImageName: "sun.max"
    )

    AppShortcut(
      intent: SetLightColorIntent(),
      phrases: [
        "Set \(.applicationName) lights to \(\.$color)",
        "Turn \(.applicationName) lights \(\.$color)"
      ],
      shortTitle: "Set Colour",
      systemImageName: "paintpalette"
    )
  }
}
