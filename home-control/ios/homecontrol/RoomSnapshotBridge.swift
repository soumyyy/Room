import Foundation
import WidgetKit
import UserNotifications
import UIKit
internal import React

/// Lets the React Native app write into the same App Group snapshot the widget
/// and Siri read, so a change made in the app is visible on the Home Screen.
///
/// Reloading from the app while it is in the foreground is immediate and is not
/// charged against the widget's refresh budget, which makes this the most
/// reliable update path we have.
@objc(RoomSnapshotBridge)
final class RoomSnapshotBridge: RCTEventEmitter {
  @objc override static func requiresMainQueueSetup() -> Bool { false }

  // MARK: - Live updates
  //
  // Siri, the widget and Control Center write the shared state from other
  // processes. Each write posts a Darwin notification; while the screen
  // listens, it becomes a "roomStateChanged" event.

  static let changedEvent = "roomStateChanged"
  private var observing = false

  override func supportedEvents() -> [String]! { [Self.changedEvent] }

  override func startObserving() {
    guard !observing else { return }
    observing = true
    CFNotificationCenterAddObserver(
      CFNotificationCenterGetDarwinNotifyCenter(),
      Unmanaged.passUnretained(self).toOpaque(),
      { _, observer, _, _, _ in
        guard let observer else { return }
        let bridge = Unmanaged<RoomSnapshotBridge>.fromOpaque(observer).takeUnretainedValue()
        bridge.sendEvent(withName: RoomSnapshotBridge.changedEvent, body: nil)
      },
      RoomSnapshotStore.changedNotification as CFString, nil, .deliverImmediately)
  }

  override func stopObserving() {
    guard observing else { return }
    observing = false
    CFNotificationCenterRemoveObserver(
      CFNotificationCenterGetDarwinNotifyCenter(),
      Unmanaged.passUnretained(self).toOpaque(),
      CFNotificationName(RoomSnapshotStore.changedNotification as CFString), nil)
  }

  deinit { stopObserving() }

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

  @objc(readScheduleSettings:reject:)
  func readScheduleSettings(_ resolve: @escaping (Any?) -> Void, reject: @escaping (String?, String?, Error?) -> Void) {
    UNUserNotificationCenter.current().getNotificationSettings { settings in
      RoomScheduleClient.setNotificationStatus(Self.notificationStatus(settings.authorizationStatus))
      do { resolve(try RoomScheduleClient.json(RoomScheduleClient.settings())) }
      catch { reject("schedule_settings", error.localizedDescription, error) }
    }
  }

  @objc(configureSchedules:resolve:reject:)
  func configureSchedules(_ input: NSDictionary, resolve: @escaping (Any?) -> Void, reject: @escaping (String?, String?, Error?) -> Void) {
    do {
      try RoomScheduleClient.configure(input as? [String: Any] ?? [:])
      Task { await RoomScheduleClient.registerSavedPush() }
      resolve(try RoomScheduleClient.json(RoomScheduleClient.settings()))
    } catch { reject("schedule_config", error.localizedDescription, error) }
  }

  @objc(listSchedules:reject:)
  func listSchedules(_ resolve: @escaping (Any?) -> Void, reject: @escaping (String?, String?, Error?) -> Void) {
    Task {
      do { resolve(try RoomScheduleClient.json(try await RoomScheduleClient.list())) }
      catch { reject("schedule_list", error.localizedDescription, error) }
    }
  }

  @objc(createSchedule:resolve:reject:)
  func createSchedule(_ input: NSDictionary, resolve: @escaping (Any?) -> Void, reject: @escaping (String?, String?, Error?) -> Void) {
    Task {
      do { resolve(try RoomScheduleClient.json(try await RoomScheduleClient.create(input as? [String: Any] ?? [:]))) }
      catch { reject("schedule_create", error.localizedDescription, error) }
    }
  }

  @objc(cancelSchedule:resolve:reject:)
  func cancelSchedule(_ id: String, resolve: @escaping (Any?) -> Void, reject: @escaping (String?, String?, Error?) -> Void) {
    Task {
      do { resolve(try RoomScheduleClient.json(try await RoomScheduleClient.cancel(id))) }
      catch { reject("schedule_cancel", error.localizedDescription, error) }
    }
  }

  @objc(retrySchedule:resolve:reject:)
  func retrySchedule(_ input: NSDictionary, resolve: @escaping (Any?) -> Void, reject: @escaping (String?, String?, Error?) -> Void) {
    Task {
      do { resolve(try RoomScheduleClient.json(try await RoomScheduleClient.retry(input as? [String: Any] ?? [:]))) }
      catch { reject("schedule_retry", error.localizedDescription, error) }
    }
  }

  @objc(editSchedule:resolve:reject:)
  func editSchedule(_ input: NSDictionary, resolve: @escaping (Any?) -> Void, reject: @escaping (String?, String?, Error?) -> Void) {
    Task {
      do { resolve(try RoomScheduleClient.json(try await RoomScheduleClient.edit(input as? [String: Any] ?? [:]))) }
      catch { reject("schedule_edit", error.localizedDescription, error) }
    }
  }

  @objc(consumeScheduleNotification:reject:)
  func consumeScheduleNotification(_ resolve: @escaping (Any?) -> Void, reject: @escaping (String?, String?, Error?) -> Void) {
    resolve(RoomScheduleClient.consumeNotificationLink())
  }

  @objc(requestScheduleNotifications:reject:)
  func requestScheduleNotifications(_ resolve: @escaping (Any?) -> Void, reject: @escaping (String?, String?, Error?) -> Void) {
    Task {
      do {
        let allowed = try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])
        RoomScheduleClient.setNotificationStatus(allowed ? "authorized" : "denied")
        if allowed { await MainActor.run { UIApplication.shared.registerForRemoteNotifications() } }
        resolve(try RoomScheduleClient.json(RoomScheduleClient.settings()))
      } catch { reject("schedule_notifications", error.localizedDescription, error) }
    }
  }

  private static func notificationStatus(_ status: UNAuthorizationStatus) -> String {
    switch status {
    case .authorized: return "authorized"
    case .denied: return "denied"
    case .provisional: return "provisional"
    case .ephemeral: return "ephemeral"
    default: return "notDetermined"
    }
  }

  private func reload() {
    RoomIntentSupport.reloadWidget()
  }
}
