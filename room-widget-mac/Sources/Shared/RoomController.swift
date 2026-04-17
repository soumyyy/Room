import Foundation

actor RoomController {
  static let shared = RoomController()

  func perform(_ action: RoomAction) async throws {
    switch action {
    case .enter:
      try await enterRoom()
    case .leave:
      try await leaveRoom()
    }
  }

  func enterRoom() async throws {
    async let acTask = TuyaClient.shared.sendACScene(RoomConfig.enterScene)
    async let lightsTask = WiZClient.shared.apply(RoomConfig.enterLights, to: RoomConfig.bulbs)
    _ = try await (acTask, lightsTask)
  }

  func leaveRoom() async throws {
    async let acTask = TuyaClient.shared.sendACScene(RoomConfig.leaveScene)
    async let lightsTask = WiZClient.shared.apply(RoomConfig.leaveLights, to: RoomConfig.bulbs)
    _ = try await (acTask, lightsTask)
  }
}
