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
    let savedState = await RoomStateStore.shared.load()
    guard let savedState, savedState.hasRestorableState else {
      async let acTask: Void = TuyaClient.shared.sendACScene(RoomConfig.enterScene)
      async let lightsTask: Void = WiZClient.shared.apply(RoomConfig.enterLights, to: RoomConfig.bulbs)
      _ = try await (acTask, lightsTask)
      return
    }

    async let acTask: Void = restoreAC(from: savedState)
    async let lightsTask: Void = restoreLights(from: savedState)
    _ = try await (acTask, lightsTask)
  }

  func leaveRoom() async throws {
    async let currentACState: AcScene? = try? TuyaClient.shared.getACStatus()
    async let currentLightStates: [SavedBulbState]? = try? WiZClient.shared.readStates(for: RoomConfig.bulbs)

    let snapshot = SavedRoomState(
      ac: try await currentACState,
      bulbs: try await currentLightStates ?? [],
      savedAt: Date()
    )

    if snapshot.hasRestorableState {
      try await RoomStateStore.shared.save(snapshot)
    }

    async let acTask: Void = TuyaClient.shared.sendACScene(RoomConfig.leaveScene)
    async let lightsTask: Void = WiZClient.shared.apply(RoomConfig.leaveLights, to: RoomConfig.bulbs)
    _ = try await (acTask, lightsTask)
  }

  private func restoreAC(from snapshot: SavedRoomState) async throws {
    guard let ac = snapshot.ac, ac.power == 1 else {
      return
    }

    try await TuyaClient.shared.sendACScene(ac)
  }

  private func restoreLights(from snapshot: SavedRoomState) async throws {
    guard !snapshot.bulbs.isEmpty else {
      try await WiZClient.shared.apply(RoomConfig.enterLights, to: RoomConfig.bulbs)
      return
    }

    try await WiZClient.shared.apply(snapshot.bulbs)
  }
}
