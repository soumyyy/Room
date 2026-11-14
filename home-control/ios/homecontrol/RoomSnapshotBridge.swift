import Foundation
import WidgetKit

/// Lets the React Native app write into the same App Group snapshot the widget
/// and Siri read, so a change made in the app is visible on the Home Screen.
///
/// Reloading from the app while it is in the foreground is immediate and is not
/// charged against the widget's refresh budget, which makes this the most
/// reliable update path we have.
@objc(RoomSnapshotBridge)
final class RoomSnapshotBridge: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool { false }

  @objc(readScene:reject:)
  func readScene(_ resolve: @escaping (Any?) -> Void, reject: @escaping (String?, String?, Error?) -> Void) {
    do { resolve(String(data: try JSONEncoder().encode(RoomSnapshotStore.report()), encoding: .utf8)) }
    catch { reject("scene_read", error.localizedDescription, error) }
  }

  @objc(performScene:resolve:reject:)
  func performScene(_ action: String, resolve: @escaping (Any?) -> Void, reject: @escaping (String?, String?, Error?) -> Void) {
    Task {
      defer { self.reload() }
      do {
        let report = try await RoomController.shared.performScene(action)
        resolve(String(data: try JSONEncoder().encode(report), encoding: .utf8))
      } catch { reject("scene_failed", error.localizedDescription, error) }
    }
  }

  @objc(recordObservation:)
  func recordObservation(_ payload: NSDictionary) {
    guard let milliseconds = payload["observedAt"] as? Double,
          let body = payload["snapshot"] as? [String: Any],
          let keys = payload["keys"] as? [String],
          let data = try? JSONSerialization.data(withJSONObject: body),
          let incoming = try? JSONDecoder().decode(RoomSnapshot.self, from: data) else { return }
    RoomSnapshotStore.update(keys: keys, observedAt: Date(timeIntervalSince1970: milliseconds / 1000), command: payload["command"] as? Bool ?? false) {
      if let ac = incoming.ac { $0.ac = ac }
      if let node = incoming.node { $0.apply(node) }
      for (id, light) in incoming.lights {
        var state = light
        state.presetID = light.presetID ?? $0.lights[id]?.presetID
        state.brightness = light.brightness ?? $0.lights[id]?.brightness
        $0.lights[id] = state
      }
      if let bulbs = incoming.bulbs {
        if $0.bulbs == nil { $0.bulbs = [:] }
        for (id, pilot) in bulbs { $0.bulbs?[id] = pilot }
      }
    }
    reload()
  }

  /// Hands the app whatever the room was last known to be doing, so the first
  /// frame can show real values instead of waiting on the network. Returns a
  /// JSON string rather than a dictionary to keep one encoding of the snapshot.
  @objc(read:reject:)
  func read(
    _ resolve: @escaping (Any?) -> Void,
    reject: @escaping (String?, String?, Error?) -> Void
  ) {
    let snapshot = RoomSnapshotStore.load()

    guard snapshot.updatedAt != nil,
          let data = try? JSONEncoder().encode(snapshot),
          let json = String(data: data, encoding: .utf8) else {
      // Nothing has ever been recorded; say so rather than invent a room.
      resolve(nil)
      return
    }

    resolve(json)
  }

  /// What Leave room turned off, kept in the App Group so it survives the app
  /// being closed while the user is out. It is the app's own bookkeeping, not
  /// part of the snapshot the widget reads, so it lives under its own key.
  private static let awayKey = "roomAwayState"

  @objc(readAway:reject:)
  func readAway(
    _ resolve: @escaping ([Any]?) -> Void,
    reject: @escaping (String?, String?, Error?) -> Void
  ) {
    let json = UserDefaults(suiteName: RoomConfig.appGroupID)?.string(forKey: Self.awayKey)
    resolve([json ?? NSNull()])
  }

  /// A nil or empty string clears it: the user is back in the room.
  @objc(saveAway:)
  func saveAway(_ json: String?) {
    let defaults = UserDefaults(suiteName: RoomConfig.appGroupID)

    if let json, !json.isEmpty {
      defaults?.set(json, forKey: Self.awayKey)
    } else {
      defaults?.removeObject(forKey: Self.awayKey)
    }
  }

  /// The switchboard's relays, so the widget can show and toggle them. Both
  /// arguments are required: the app only records once it has read the node.
  @objc(recordNode:fan:)
  func recordNode(_ tube: NSNumber, fan: NSNumber) {
    RoomSnapshotStore.update {
      $0.apply(NodeState(tube: tube.boolValue, fan: fan.boolValue))
    }
    reload()
  }

  @objc(recordAC:mode:temp:wind:)
  func recordAC(_ power: NSNumber, mode: NSNumber, temp: NSNumber, wind: NSNumber) {
    let scene = AcScene(
      power: RoomConfig.clampPower(power.intValue),
      mode: RoomConfig.clampMode(mode.intValue),
      temp: RoomConfig.clampTemp(temp.intValue),
      wind: RoomConfig.clampWind(wind.intValue)
    )

    RoomSnapshotStore.update { $0.ac = scene }
    reload()
  }

  /// Takes one dictionary rather than positional arguments: React Native
  /// requires every NSNumber argument to be nonnull, and brightness is genuinely
  /// absent on a plain on/off toggle. A nullable NSNumber logs an argument error
  /// and coerces the missing value to zero, which would record a brightness the
  /// user never set.
  @objc(recordLights:)
  func recordLights(_ payload: NSDictionary) {
    let ids = (payload["groups"] as? [Any])?.compactMap { $0 as? String } ?? []
    guard !ids.isEmpty else { return }

    let isOn = (payload["isOn"] as? NSNumber)?.boolValue ?? false
    let brightness = payload["brightness"] as? NSNumber
    let presetID = payload["presetId"] as? String

    RoomSnapshotStore.update { snapshot in
      for id in ids {
        // Preserve whatever we already knew that this command did not change.
        var state = snapshot.lights[id] ?? .init(isOn: isOn)
        state.isOn = isOn

        if let brightness {
          state.brightness = RoomConfig.clampBrightness(brightness.intValue)
        }

        if let presetID {
          state.presetID = presetID
        }

        snapshot.lights[id] = state
      }
    }

    reload()
  }

  /// A finished action from the React Native side; native intents log themselves.
  @objc(logAction:)
  func logAction(_ payload: NSDictionary) {
    guard let action = payload["action"] as? String,
          let startedAt = payload["startedAt"] as? Double else { return }
    RoomActionLog.save(RoomActionRecord(
      id: UUID().uuidString,
      at: Date(timeIntervalSince1970: startedAt / 1000),
      action: action,
      source: "app",
      milliseconds: (payload["milliseconds"] as? NSNumber)?.intValue,
      error: payload["error"] as? String
    ))
  }

  /// The shared action log as a JSON array, oldest first.
  @objc(readActionLog:reject:)
  func readActionLog(_ resolve: @escaping (Any?) -> Void, reject: @escaping (String?, String?, Error?) -> Void) {
    let encoder = JSONEncoder()
    encoder.dateEncodingStrategy = .millisecondsSince1970
    do { resolve(String(data: try encoder.encode(RoomActionLog.entries()), encoding: .utf8)) }
    catch { reject("log_read", error.localizedDescription, error) }
  }

  @objc func clearActionLog() { RoomActionLog.clear() }

  private func reload() {
    RoomIntentSupport.reloadWidget()
  }
}
