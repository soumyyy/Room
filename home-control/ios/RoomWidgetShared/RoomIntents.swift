import AppIntents
import WidgetKit

struct EnterRoomIntent: AppIntent {
  static let title: LocalizedStringResource = "Enter Room"
  static let openAppWhenRun = false
  static let isDiscoverable = true

  func perform() async throws -> some IntentResult {
    try await RoomController.shared.enterRoom()
    WidgetCenter.shared.reloadTimelines(ofKind: RoomConfig.widgetKind)
    return .result()
  }
}

struct LeaveRoomIntent: AppIntent {
  static let title: LocalizedStringResource = "Leave Room"
  static let openAppWhenRun = false
  static let isDiscoverable = true

  func perform() async throws -> some IntentResult {
    try await RoomController.shared.leaveRoom()
    WidgetCenter.shared.reloadTimelines(ofKind: RoomConfig.widgetKind)
    return .result()
  }
}

struct ACOnIntent: AppIntent {
  static let title: LocalizedStringResource = "Turn AC On"
  static let openAppWhenRun = false
  static let isDiscoverable = true

  func perform() async throws -> some IntentResult {
    try await RoomController.shared.acOn()
    WidgetCenter.shared.reloadTimelines(ofKind: RoomConfig.widgetKind)
    return .result()
  }
}

struct ACOffIntent: AppIntent {
  static let title: LocalizedStringResource = "Turn AC Off"
  static let openAppWhenRun = false
  static let isDiscoverable = true

  func perform() async throws -> some IntentResult {
    try await RoomController.shared.acOff()
    WidgetCenter.shared.reloadTimelines(ofKind: RoomConfig.widgetKind)
    return .result()
  }
}

struct LightsOnIntent: AppIntent {
  static let title: LocalizedStringResource = "Turn Lights On"
  static let openAppWhenRun = false
  static let isDiscoverable = true

  func perform() async throws -> some IntentResult {
    try await RoomController.shared.lightsOn()
    WidgetCenter.shared.reloadTimelines(ofKind: RoomConfig.widgetKind)
    return .result()
  }
}

struct LightsOffIntent: AppIntent {
  static let title: LocalizedStringResource = "Turn Lights Off"
  static let openAppWhenRun = false
  static let isDiscoverable = true

  func perform() async throws -> some IntentResult {
    try await RoomController.shared.lightsOff()
    WidgetCenter.shared.reloadTimelines(ofKind: RoomConfig.widgetKind)
    return .result()
  }
}

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
      intent: LightsOnIntent(),
      phrases: [
        "Turn lights on in \(.applicationName)",
        "Switch on lights with \(.applicationName)"
      ],
      shortTitle: "Lights On",
      systemImageName: "lightbulb.fill"
    )

    AppShortcut(
      intent: LightsOffIntent(),
      phrases: [
        "Turn lights off in \(.applicationName)",
        "Switch off lights with \(.applicationName)"
      ],
      shortTitle: "Lights Off",
      systemImageName: "lightbulb"
    )
  }
}
