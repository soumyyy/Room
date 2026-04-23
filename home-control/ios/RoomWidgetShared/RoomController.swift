import Foundation

actor RoomController {
  static let shared = RoomController()

  func enterRoom() async throws {
    async let acTask: Void = TuyaClient.shared.sendACScene(RoomConfig.enterScene)
    async let lightsTask: Void = WiZClient.shared.apply(RoomConfig.enterLights, to: RoomConfig.bulbs)
    _ = try await (acTask, lightsTask)
  }

  func leaveRoom() async throws {
    async let acTask: Void = TuyaClient.shared.sendACScene(RoomConfig.leaveScene)
    async let lightsTask: Void = WiZClient.shared.apply(RoomConfig.leaveLights, to: RoomConfig.bulbs)
    _ = try await (acTask, lightsTask)
  }
}
