import AppIntents

// Compiled into the app target only. An app registers exactly one
// AppShortcutsProvider; building it into the widget extension as well made
// both bundles claim the same Siri phrases.
//
// Apple allows at most ten shortcuts per app, and a phrase may name at most one
// parameter. So on/off pairs are one shortcut with a power parameter
// ("Turn Room fan off"), and brightness and colour share one "Set Room lights
// to …" shortcut. The single-purpose intents (AC On, Fan Off, Set AC Mode, …)
// still drive the widget and stay available in the Shortcuts app.
@available(iOS 17.0, *)
struct RoomShortcutsProvider: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: EnterRoomIntent(),
      phrases: [
        "Enter \(.applicationName)",
        "Enter room with \(.applicationName)",
        "I'm back in \(.applicationName)",
        "Restore \(.applicationName)"
      ],
      shortTitle: "Enter Room",
      systemImageName: "figure.walk.arrival"
    )

    AppShortcut(
      intent: LeaveRoomIntent(),
      phrases: [
        "Leave \(.applicationName)",
        "Leave room with \(.applicationName)",
        "I'm leaving \(.applicationName)",
        "Turn off everything in \(.applicationName)",
        "Turn everything off in \(.applicationName)"
      ],
      shortTitle: "Leave Room",
      systemImageName: "figure.walk.departure"
    )

    AppShortcut(
      intent: SetACTemperatureIntent(),
      phrases: [
        "Set \(.applicationName) to \(\.$temperature)",
        "Set \(.applicationName) temp to \(\.$temperature)",
        "Set \(.applicationName) temperature to \(\.$temperature)",
        "Set the \(.applicationName) temperature to \(\.$temperature)",
        "Set \(.applicationName) AC to \(\.$temperature)",
        "Set the \(.applicationName) AC to \(\.$temperature)",
        "\(.applicationName) temperature \(\.$temperature)",
        "\(.applicationName) AC \(\.$temperature)",
        "Set \(.applicationName) temperature",
        "Set \(.applicationName) temp"
      ],
      shortTitle: "Set Temperature",
      systemImageName: "thermometer.medium"
    )

    AppShortcut(
      intent: SetACPowerIntent(),
      phrases: [
        "Turn \(\.$power) \(.applicationName) AC",
        "Turn \(\.$power) the \(.applicationName) AC",
        "Turn \(.applicationName) AC \(\.$power)",
        "Switch \(\.$power) \(.applicationName) AC",
        "Turn AC \(\.$power) in \(.applicationName)",
        "\(.applicationName) AC \(\.$power)"
      ],
      shortTitle: "AC On/Off",
      systemImageName: "air.conditioner.horizontal.fill"
    )

    AppShortcut(
      intent: AdjustACTemperatureIntent(),
      phrases: [
        "Make \(.applicationName) \(\.$shift)",
        "Turn \(.applicationName) \(\.$shift)",
        "Make the \(.applicationName) \(\.$shift)"
      ],
      shortTitle: "Warmer or Cooler",
      systemImageName: "thermometer.variable"
    )

    AppShortcut(
      intent: SetFanPowerIntent(),
      phrases: [
        "Turn \(\.$power) \(.applicationName) fan",
        "Turn \(\.$power) the \(.applicationName) fan",
        "Turn \(.applicationName) fan \(\.$power)",
        "Switch \(\.$power) \(.applicationName) fan",
        "Turn fan \(\.$power) in \(.applicationName)",
        "\(.applicationName) fan \(\.$power)"
      ],
      shortTitle: "Fan On/Off",
      systemImageName: "fan.ceiling.fill"
    )

    AppShortcut(
      intent: SetTubePowerIntent(),
      phrases: [
        "Turn \(\.$power) \(.applicationName) tubelight",
        "Turn \(\.$power) \(.applicationName) tube light",
        "Turn \(\.$power) the \(.applicationName) tubelight",
        "Turn \(\.$power) the \(.applicationName) tube light",
        "Turn \(.applicationName) tubelight \(\.$power)",
        "Turn \(.applicationName) tube light \(\.$power)",
        "Turn \(.applicationName) tube \(\.$power)",
        "Switch \(\.$power) \(.applicationName) tubelight",
        "Turn tubelight \(\.$power) in \(.applicationName)",
        "\(.applicationName) tubelight \(\.$power)"
      ],
      shortTitle: "Tube Light On/Off",
      systemImageName: "light.panel.fill"
    )

    AppShortcut(
      intent: LightsOnIntent(),
      phrases: [
        "Turn on \(.applicationName) lights",
        "Turn \(.applicationName) lights on",
        "Switch on \(.applicationName) lights",
        "Turn on the \(\.$group) lights in \(.applicationName)",
        "Turn on \(.applicationName) \(\.$group) lights"
      ],
      shortTitle: "Lights On",
      systemImageName: "lightbulb.2.fill"
    )

    AppShortcut(
      intent: LightsOffIntent(),
      phrases: [
        "Turn off \(.applicationName) lights",
        "Turn \(.applicationName) lights off",
        "Switch off \(.applicationName) lights",
        "Turn off the \(\.$group) lights in \(.applicationName)",
        "Turn off \(.applicationName) \(\.$group) lights"
      ],
      shortTitle: "Lights Off",
      systemImageName: "lightbulb.2"
    )

    AppShortcut(
      intent: SetLightsIntent(),
      phrases: [
        "Set \(.applicationName) lights to \(\.$setting)",
        "Turn \(.applicationName) lights \(\.$setting)",
        "Make \(.applicationName) lights \(\.$setting)",
        "Dim \(.applicationName) lights to \(\.$setting)",
        "\(.applicationName) lights \(\.$setting)"
      ],
      shortTitle: "Light Colour or Brightness",
      systemImageName: "lightbulb.max.fill"
    )
  }
}
