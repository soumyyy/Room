import Foundation

actor RoomController {
  static let shared = RoomController()

  func enterRoom() async throws {
    let report = try await performScene("enter")
    if !report.failed.isEmpty { throw RoomNetworkError.tuya(message: "\(RoomConfig.describe(report.failed)) didn't come back on. Run Enter Room again to retry just that.") }
  }

  func leaveRoom() async throws {
    let report = try await performScene("leave")
    if !report.failed.isEmpty { throw RoomNetworkError.tuya(message: "\(RoomConfig.describe(report.failed)) didn't confirm off. Run Leave Room again to retry just that.") }
  }

  /// The same transaction is used by React Native, Siri and WidgetKit. The
  /// restore plan is durable before any command; successes are committed one by one.
  func performScene(_ action: String) async throws -> RoomSceneReport {
    let lease = try await RoomSnapshotStore.acquireSceneLock()
    defer { RoomSnapshotStore.releaseSceneLock(lease) }
    var plan = RoomSnapshotStore.scene()
    if action == "leave" {
      if let saved = plan, saved.phase == "away" {
        // Already away, but something may have been switched back on since
        // (the app, the widget, a wall switch). Turn everything off again and
        // keep the plan Enter Room restores: what the room was before leaving.
        plan = RoomSceneState(restore: saved.restore, phase: "leaving", pending: Self.sceneKeys)
      } else if plan?.phase != "leaving" {
        let current = await refresh()
        // A failed Enter retains the original restore plan on a new Leave.
        plan = RoomSceneState(restore: plan?.restore ?? current, phase: "leaving", pending: Self.sceneKeys)
      }
    } else if action == "enter" {
      if plan?.phase != "entering" {
        var restore = plan?.restore ?? RoomSnapshot.unknown
        if plan == nil {
          restore.ac = RoomConfig.enterScene
          restore.setLights(.init(isOn: true, brightness: 100, presetID: "neutral-white"), forGroups: RoomConfig.lightGroupIDs)
        }
        var targets: [String] = []
        if restore.ac?.power == 1 { targets.append("ac") }
        if restore.node?.fan == true { targets.append("fan") }
        if restore.node?.tube == true { targets.append("tube") }
        for bulb in RoomConfig.bulbs {
          if restore.bulbs?[bulb.id]?.state ?? restore.lights[bulb.group]?.isOn ?? false {
            targets.append("bulb:" + bulb.id)
          }
        }
        plan = RoomSceneState(restore: restore, phase: "entering", pending: targets)
      }
    } else { throw RoomNetworkError.invalidResponse }
    guard var current = plan else { return RoomSnapshotStore.report() }
    try RoomSnapshotStore.saveScene(current)
    let restore = current.restore
    let leaving = current.phase == "leaving"
    let targets = current.pending
    await withTaskGroup(of: (String, String?).self) { group in
      for key in targets {
        group.addTask {
          let began = Date()
          do { try await self.sceneDevice(key, leaving: leaving, restore: restore); return (key, nil) }
          catch {
            // The scene's own entry only says that something failed; this says what.
            RoomActionLog.save(RoomActionRecord(
              id: UUID().uuidString, at: began, action: (leaving ? "Leave Room · " : "Enter Room · ") + key,
              source: "scene step", milliseconds: Int(Date().timeIntervalSince(began) * 1000),
              error: error.localizedDescription))
            return (key, error.localizedDescription)
          }
        }
      }
      for await (key, error) in group {
        if let error { current.failures[key] = error }
        else { current.pending.removeAll { $0 == key }; current.failures.removeValue(forKey: key) }
        // A save failure must not erase the last durable retry list. Repeating
        // an explicit on/off action is safe if the process is interrupted here.
        try? RoomSnapshotStore.saveScene(current)
      }
    }
    if current.pending.isEmpty {
      if leaving { current.phase = "away"; try RoomSnapshotStore.saveScene(current) }
      else { try RoomSnapshotStore.saveScene(nil) }
    } else { try RoomSnapshotStore.saveScene(current) }
    updateLightGroups()
    return RoomSnapshotStore.report()
  }

  private static let sceneKeys = ["ac", "fan", "tube"] + RoomConfig.bulbs.map { "bulb:" + $0.id }

  private func sceneDevice(_ key: String, leaving: Bool, restore: RoomSnapshot) async throws {
    switch key {
    case "ac": try await setACScene(leaving ? (restore.ac ?? RoomConfig.acOffScene).with(power: 0) : (restore.ac ?? RoomConfig.enterScene))
    case "fan": try await setFan(!leaving)
    case "tube": try await setTube(!leaving)
    default:
      guard let bulb = RoomConfig.bulbs.first(where: { "bulb:" + $0.id == key }) else { throw RoomNetworkError.invalidResponse }
      var pilot = restore.bulbs?[bulb.id]
      if pilot == nil {
        let light = restore.lights[bulb.group]
        pilot = RoomConfig.preset(id: light?.presetID ?? "neutral-white")?.pilot ?? RoomConfig.enterLights
        pilot?.dimming = light?.brightness
      }
      var desired = pilot ?? RoomConfig.enterLights
      desired.state = !leaving
      try await WiZClient.shared.apply(leaving ? WizPilot(state: false) : desired, to: [bulb])
    }
  }

  @discardableResult
  func acStatus() async throws -> AcScene {
    let began = Date()
    let scene = try await TuyaClient.shared.fetchACScene()
    RoomSnapshotStore.update(keys: ["ac"], observedAt: began) { $0.ac = scene }
    return scene
  }

  private func setACScene(_ scene: AcScene) async throws {
    _ = try await queueAC { _ in scene }
  }

  private func transmitACScene(_ scene: AcScene) async throws {
    do { try await TuyaClient.shared.sendACScene(scene) }
    catch { RoomSnapshotStore.markFailed(keys: ["ac"]); throw error }
    RoomSnapshotStore.update(keys: ["ac"], command: true) { $0.ac = scene }
  }
  func acOn() async throws { _ = try await queueAC { $0.with(power: 1) } }
  func acOff() async throws { _ = try await queueAC { $0.with(power: 0) } }

  private var acTail: Task<Void, Never>?
  private func amendScene(_ edit: @escaping @Sendable (AcScene) -> AcScene) async throws -> AcScene {
    try await queueAC { edit($0).with(power: 1) }
  }
  private func queueAC(_ edit: @escaping @Sendable (AcScene) -> AcScene) async throws -> AcScene {
    let previous = acTail
    let task = Task<AcScene, Error> {
      await previous?.value
      let current: AcScene
      if let known = RoomSnapshotStore.load().ac { current = known }
      else { current = (try? await TuyaClient.shared.fetchACScene()) ?? RoomConfig.acOnScene }
      let next = edit(current)
      // The last send may have come from another process; the shared snapshot
      // records it, so the gap holds across the app, widget and Siri.
      if let last = RoomSnapshotStore.load().commandedAt?["ac"] {
        let wait = min(RoomConfig.acCommandGap, RoomConfig.acCommandGap - Date().timeIntervalSince(last))
        if wait > 0 { try await Task.sleep(nanoseconds: UInt64(wait * 1_000_000_000)) }
      }
      try await self.transmitACScene(next)
      return next
    }
    acTail = Task { _ = try? await task.value }
    return try await task.value
  }
  @discardableResult func setACTemperature(_ temp: Int) async throws -> AcScene { try await amendScene { $0.with(temp: temp) } }
  @discardableResult func adjustACTemperature(by delta: Int) async throws -> AcScene { try await amendScene { $0.with(temp: $0.temp + delta) } }
  @discardableResult func setACMode(_ mode: Int) async throws -> AcScene { try await amendScene { $0.with(mode: mode) } }
  @discardableResult func setFanSpeed(_ wind: Int) async throws -> AcScene { try await amendScene { $0.with(wind: wind) } }

  func setTube(_ on: Bool) async throws { try await setNode(tube: on, fan: nil) }
  func setFan(_ on: Bool) async throws { try await setNode(tube: nil, fan: on) }
  private func setNode(tube: Bool?, fan: Bool?) async throws {
    let keys = (tube == nil ? [] : ["tube"]) + (fan == nil ? [] : ["fan"])
    do { try await TuyaClient.shared.sendNodeCommands(RoomConfig.nodeCommands(tube: tube, fan: fan)) }
    catch { RoomSnapshotStore.markFailed(keys: keys); throw error }
    RoomSnapshotStore.update(keys: keys, command: true) { $0.apply(NodeState(tube: tube, fan: fan)) }
  }

  func lightsOn(group: String? = nil) async throws { try await applyLight(RoomConfig.lightsOn, group: group, preset: "neutral-white") }
  func lightsOff(group: String? = nil) async throws { try await applyLight(RoomConfig.lightsOff, group: group) }
  func setBrightness(_ level: Int, group: String? = nil) async throws { try await applyLight(WizPilot(state: true, dimming: RoomConfig.clampBrightness(level)), group: group) }
  func setPreset(_ presetID: String, group: String? = nil) async throws {
    guard let preset = RoomConfig.preset(id: presetID) else { throw RoomNetworkError.wiz(message: "Unknown light preset.") }
    try await applyLight(preset.pilot, group: group, preset: preset.id)
  }
  private func applyLight(_ pilot: WizPilot, group: String?, preset: String? = nil) async throws {
    do {
      try await WiZClient.shared.apply(pilot, to: RoomConfig.bulbs(inGroup: group))
      updateLightGroups(preset: preset, groups: RoomConfig.groupIDs(inGroup: group))
    } catch { updateLightGroups(); throw error }
  }

  private func updateLightGroups(preset: String? = nil, groups: [String] = RoomConfig.lightGroupIDs) {
    let snapshot = RoomSnapshotStore.load()
    for id in groups {
      let bulbs = RoomConfig.bulbs(inGroup: id)
      let pilots = bulbs.compactMap { snapshot.bulbs?[$0.id] }
      guard pilots.count == bulbs.count, let reading = RoomSnapshot.groupState(from: pilots.map { WizReading(isOn: $0.state, brightness: $0.dimming) }) else { continue }
      let oldest = bulbs.compactMap { snapshot.observedAt?["bulb:" + $0.id] }.min() ?? .distantPast
      RoomSnapshotStore.update(keys: ["lights:" + id], observedAt: oldest) {
        var light = reading
        light.presetID = preset ?? $0.lights[id]?.presetID
        $0.lights[id] = light
      }
    }
  }

  @discardableResult
  func refresh() async -> RoomSnapshot {
    let began = Date()
    async let scene = try? TuyaClient.shared.fetchACScene()
    async let online = try? TuyaClient.shared.infraredIsOnline()
    async let pilots = WiZClient.shared.readPilots()
    async let board = try? TuyaClient.shared.fetchNode()
    let (cloudScene, resolvedPilots, resolvedBoard, hubOnline) = await (scene, pilots, board, online)
    let resolvedScene = hubOnline == true ? cloudScene : nil
    var keys: [String] = []
    if resolvedScene != nil { keys.append("ac") }
    if resolvedBoard?.tube != nil { keys.append("tube") }
    if resolvedBoard?.fan != nil { keys.append("fan") }
    keys += resolvedPilots.keys.map { "bulb:" + $0 }
    RoomSnapshotStore.update(keys: keys, observedAt: began) { snapshot in
      if let resolvedScene { snapshot.ac = resolvedScene }
      if let resolvedBoard { snapshot.apply(resolvedBoard) }
      if snapshot.bulbs == nil { snapshot.bulbs = [:] }
      for (id, pilot) in resolvedPilots { snapshot.bulbs?[id] = pilot }
    }
    updateLightGroups()
    return RoomSnapshotStore.load()
  }
}
