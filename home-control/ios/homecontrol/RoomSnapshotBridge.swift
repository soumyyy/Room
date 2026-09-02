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

  @objc(recordLights:isOn:brightness:presetId:)
  func recordLights(
    _ groups: NSArray,
    isOn: Bool,
    brightness: NSNumber?,
    presetId: NSString?
  ) {
    let ids = groups.compactMap { $0 as? String }
    guard !ids.isEmpty else { return }

    RoomSnapshotStore.update { snapshot in
      for id in ids {
        // Preserve whatever we already knew that this command did not change.
        var state = snapshot.lights[id] ?? .init(isOn: isOn)
        state.isOn = isOn

        if let brightness {
          state.brightness = RoomConfig.clampBrightness(brightness.intValue)
        }

        if let presetId {
          state.presetID = presetId as String
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
