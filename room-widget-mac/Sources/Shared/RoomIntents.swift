import AppIntents
import WidgetKit

struct EnterRoomIntent: AppIntent {
  static let title: LocalizedStringResource = "Enter Room"
  static let description = IntentDescription("Turn the room back on using the default AC and light scene.")
  static let openAppWhenRun = false
  static let isDiscoverable = false

  func perform() async throws -> some IntentResult {
    try await RoomController.shared.enterRoom()
    WidgetCenter.shared.reloadTimelines(ofKind: RoomConfig.widgetKind)
    return .result()
  }
}

struct LeaveRoomIntent: AppIntent {
  static let title: LocalizedStringResource = "Leave Room"
  static let description = IntentDescription("Turn the AC off and switch all room lights off.")
  static let openAppWhenRun = false
  static let isDiscoverable = false

  func perform() async throws -> some IntentResult {
    try await RoomController.shared.leaveRoom()
    WidgetCenter.shared.reloadTimelines(ofKind: RoomConfig.widgetKind)
    return .result()
  }
}
