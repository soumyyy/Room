import Foundation

actor RoomController {
  static let shared = RoomController()

  // MARK: - Scenes

  func enterRoom() async throws {
    async let acTask: Void = TuyaClient.shared.sendACScene(RoomConfig.enterScene)
    async let lightsTask: Void = WiZClient.shared.apply(RoomConfig.enterLights, to: RoomConfig.bulbs)
    _ = try await (acTask, lightsTask)

    record {
      $0.ac = RoomConfig.enterScene
      $0.setLights(
        .init(isOn: true, brightness: RoomConfig.enterLights.dimming, presetID: "neutral-white"),
        forGroups: RoomConfig.lightGroupIDs
      )
    }
  }

  func leaveRoom() async throws {
    async let acTask: Void = TuyaClient.shared.sendACScene(RoomConfig.leaveScene)
    async let lightsTask: Void = WiZClient.shared.apply(RoomConfig.leaveLights, to: RoomConfig.bulbs)
    _ = try await (acTask, lightsTask)

    record {
      $0.ac = RoomConfig.leaveScene
      $0.setLights(.init(isOn: false), forGroups: RoomConfig.lightGroupIDs)
    }
  }

  // MARK: - Air conditioner

  /// Reads the remote and records what it says, so a refresh also refreshes
  /// what the widget will show.
  @discardableResult
  func acStatus() async throws -> AcScene {
    let scene = try await TuyaClient.shared.fetchACScene()
    record { $0.ac = scene }
    return scene
  }

  func acOn() async throws {
    try await TuyaClient.shared.sendACScene(RoomConfig.acOnScene)
    record { $0.ac = RoomConfig.acOnScene }
  }

  func acOff() async throws {
    try await TuyaClient.shared.sendACScene(RoomConfig.acOffScene)
    record { $0.ac = RoomConfig.acOffScene }
  }

  /// Reads the scene the remote is holding, changes one field and sends the
  /// whole thing back — the only way to edit part of a Tuya AC scene. Turning
  /// the unit on is implied, matching what the app's controls do.
  private func amendScene(_ edit: (AcScene) -> AcScene) async throws -> AcScene {
    let current = (try? await TuyaClient.shared.fetchACScene()) ?? RoomConfig.acOnScene
    let next = edit(current).with(power: 1)
    try await TuyaClient.shared.sendACScene(next)
    record { $0.ac = next }
    return next
  }

  @discardableResult
  func setACTemperature(_ temp: Int) async throws -> AcScene {
    try await amendScene { $0.with(temp: temp) }
  }

  @discardableResult
  func adjustACTemperature(by delta: Int) async throws -> AcScene {
    try await amendScene { $0.with(temp: $0.temp + delta) }
  }

  @discardableResult
  func setACMode(_ mode: Int) async throws -> AcScene {
    try await amendScene { $0.with(mode: mode) }
  }

  @discardableResult
  func setFanSpeed(_ wind: Int) async throws -> AcScene {
    try await amendScene { $0.with(wind: wind) }
  }

  // MARK: - Lights

  func lightsOn(group: String? = nil) async throws {
    try await WiZClient.shared.apply(RoomConfig.lightsOn, to: RoomConfig.bulbs(inGroup: group))
    record {
      $0.setLights(
        .init(isOn: true, brightness: RoomConfig.lightsOn.dimming, presetID: "neutral-white"),
        forGroups: RoomConfig.groupIDs(inGroup: group)
      )
    }
  }

  func lightsOff(group: String? = nil) async throws {
    try await WiZClient.shared.apply(RoomConfig.lightsOff, to: RoomConfig.bulbs(inGroup: group))
    record {
      $0.setLights(.init(isOn: false), forGroups: RoomConfig.groupIDs(inGroup: group))
    }
  }

  func setBrightness(_ level: Int, group: String? = nil) async throws {
    let brightness = RoomConfig.clampBrightness(level)
    try await WiZClient.shared.apply(
      WizPilot(state: true, dimming: brightness),
      to: RoomConfig.bulbs(inGroup: group)
    )

    record { snapshot in
      for id in RoomConfig.groupIDs(inGroup: group) {
        // Keep whatever colour the group was already showing.
        var state = snapshot.lights[id] ?? .init(isOn: true)
        state.isOn = true
        state.brightness = brightness
        snapshot.lights[id] = state
      }
    }
  }

  func setPreset(_ presetID: String, group: String? = nil) async throws {
    guard let preset = RoomConfig.preset(id: presetID) else {
      throw RoomNetworkError.wiz(message: "No light preset named \(presetID).")
    }

    try await WiZClient.shared.apply(preset.pilot, to: RoomConfig.bulbs(inGroup: group))

    record { snapshot in
      for id in RoomConfig.groupIDs(inGroup: group) {
        var state = snapshot.lights[id] ?? .init(isOn: true)
        state.isOn = true
        state.presetID = preset.id
        snapshot.lights[id] = state
      }
    }
  }

  /// Only reached after the command succeeded, so the snapshot records what we
  /// actually asked the hardware to do rather than what we hoped.
  private func record(_ mutate: (inout RoomSnapshot) -> Void) {
    RoomSnapshotStore.update(mutate)
  }
}
