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

  /// Hands the app whatever the room was last known to be doing, so the first
  /// frame can show real values instead of waiting on the network. Returns a
  /// JSON string rather than a dictionary to keep one encoding of the snapshot.
  @objc(read:reject:)
  func read(
    _ resolve: @escaping ([Any]?) -> Void,
    reject: @escaping (String?, String?, Error?) -> Void
  ) {
    let snapshot = RoomSnapshotStore.load()

    guard snapshot.updatedAt != nil,
          let data = try? JSONEncoder().encode(snapshot),
          let json = String(data: data, encoding: .utf8) else {
      // Nothing has ever been recorded; say so rather than invent a room.
      resolve([NSNull()])
      return
    }

    resolve([json])
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

  private func reload() {
    WidgetCenter.shared.reloadTimelines(ofKind: RoomConfig.widgetKind)
  }
}
