import Foundation

/// App and Siri use the same acknowledged cloud API. No phone timer executes jobs.
enum RoomScheduleClient {
  #if ROOM_SCHEDULE_TESTS
  private static let defaults = UserDefaults(suiteName: "org.name.homecontrol.scheduler-tests")!
  static var testSession: URLSession?
  static var testToken = ""
  static var testURL = ""
  #else
  private static let defaults = UserDefaults(suiteName: RoomConfig.appGroupID) ?? .standard
  #endif
  private static let redirectDelegate = ScheduleRedirectDelegate()
  private static let session = URLSession(configuration: {
    let config = URLSessionConfiguration.ephemeral
    config.timeoutIntervalForRequest = 15
    config.timeoutIntervalForResource = 20
    return config
  }(), delegate: redirectDelegate, delegateQueue: nil)

  static var configured: Bool { baseURL != nil && token != nil }
  private static var baseURL: URL? {
    #if ROOM_SCHEDULE_TESTS
    let text = testURL
    #else
    let text = RoomSchedulerConfig.url
    #endif
    guard let url = URL(string: text), url.scheme == "https", url.host != nil,
          url.user == nil, url.password == nil, url.query == nil, url.fragment == nil else { return nil }
    return url
  }

  private static var token: String? {
    #if ROOM_SCHEDULE_TESTS
    let value = testToken
    #else
    let value = RoomSchedulerConfig.token
    #endif
    return value.isEmpty ? nil : value
  }

  static func settings() -> [String: Any] {
    ["configured": configured,
      "notificationStatus": defaults.string(forKey: "scheduleNotificationStatus") ?? "notDetermined",
      "pushRegistered": defaults.bool(forKey: "schedulePushRegistered")]
  }
  static func list() async throws -> [String: Any] { try await request("GET", "v1/schedules") }
  static func cancel(_ id: String) async throws -> [String: Any] {
    guard UUID(uuidString: id) != nil else { throw ScheduleError("Choose a valid schedule.") }
    return try await request("DELETE", "v1/schedules/" + id)
  }
  static func retry(_ input: [String: Any]) async throws -> [String: Any] {
    guard let id = input["id"] as? String, UUID(uuidString: id) != nil else { throw ScheduleError("Choose a valid schedule.") }
    return try await request("POST", "v1/schedules/" + id + "/retry", ["requestId": input["requestId"] ?? UUID().uuidString])
  }
  static func edit(_ input: [String: Any]) async throws -> [String: Any] {
    guard let id = input["id"] as? String, UUID(uuidString: id) != nil else { throw ScheduleError("Choose a valid schedule.") }
    var payload: [String: Any] = ["runAt": input["runAt"] ?? "", "revision": input["revision"] ?? 0]
    if let recurrence = input["recurrence"] { payload["recurrence"] = recurrence }
    return try await request("PATCH", "v1/schedules/" + id, payload)
  }
  static func consumeNotificationLink() -> String? {
    let key = "scheduleNotificationLink"
    let value = defaults.string(forKey: key)
    defaults.removeObject(forKey: key)
    return value
  }
  static func create(_ input: [String: Any]) async throws -> [String: Any] {
    var payload = input
    if payload["requestId"] == nil { payload["requestId"] = UUID().uuidString }
    if payload["timeZone"] == nil { payload["timeZone"] = TimeZone.current.identifier }
    let action = payload["action"] as? String
    if action == "enter" || action == "leave" {
      guard payload["acknowledgePartialScene"] as? Bool == true else {
        throw ScheduleError("Scheduled room scenes cannot reach local bulbs. Confirm the partial scene before scheduling.")
      }
      let restore = RoomSnapshotStore.scene()?.restore ?? (action == "leave" ? RoomSnapshotStore.load() : nil)
      if let restore { payload["restore"] = try object(restore) }
    }
    let accepted = try await request("POST", "v1/schedules", payload)
    guard let id = accepted["id"] as? String, UUID(uuidString: id) != nil,
      accepted["runAt"] as? String != nil, accepted["status"] as? String != nil else {
      throw ScheduleError("The scheduler did not acknowledge a saved schedule. Check the list before trying again.")
    }
    return accepted
  }
  static func syncScene() async {
    guard configured else { return }
    do {
      var payload: [String: Any] = ["snapshot": try object(RoomSnapshotStore.load())]
      if let restore = RoomSnapshotStore.scene()?.restore { payload["restore"] = try object(restore) }
      _ = try await request("PUT", "v1/scene-state", payload)
    } catch {
      // Scene controls still work when cloud scheduling is unavailable.
      RoomActionLog.save(RoomActionRecord(id: UUID().uuidString, at: Date(), action: "Sync scheduled room state",
        source: "scheduler", milliseconds: nil, error: error.localizedDescription))
    }
  }
  static func registerPush(_ data: Data) async {
    defaults.set(data.map { String(format: "%02x", $0) }.joined(), forKey: "schedulePushToken")
    await registerSavedPush()
  }
  static func registerSavedPush() async {
    guard configured, let saved = defaults.string(forKey: "schedulePushToken") else { return }
    let signingEnvironment = Bundle.main.object(forInfoDictionaryKey: "RoomAPNSEnvironment") as? String
    let environment = signingEnvironment == "production" ? "production" : "sandbox"
    do {
      _ = try await request("PUT", "v1/push-tokens", ["token": saved, "environment": environment])
      defaults.set(true, forKey: "schedulePushRegistered")
    } catch { defaults.set(false, forKey: "schedulePushRegistered") }
  }
  static func setNotificationStatus(_ status: String) { defaults.set(status, forKey: "scheduleNotificationStatus") }
  static func json(_ object: Any) throws -> String {
    String(decoding: try JSONSerialization.data(withJSONObject: object), as: UTF8.self)
  }
  private static func object<T: Encodable>(_ value: T) throws -> Any {
    let encoder = JSONEncoder()
    encoder.dateEncodingStrategy = .iso8601
    return try JSONSerialization.jsonObject(with: encoder.encode(value))
  }
  private static func request(_ method: String, _ path: String, _ body: [String: Any]? = nil) async throws -> [String: Any] {
    guard let baseURL, let token else { throw ScheduleError("Scheduling is unavailable in this build.") }
    var req = URLRequest(url: baseURL.appendingPathComponent(path))
    req.httpMethod = method
    req.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    if let body { req.httpBody = try JSONSerialization.data(withJSONObject: body) }
    #if ROOM_SCHEDULE_TESTS
    let activeSession = testSession ?? session
    #else
    let activeSession = session
    #endif
    let (data, response) = try await activeSession.data(for: req)
    guard let http = response as? HTTPURLResponse else { throw ScheduleError("The scheduler did not respond.") }
    let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
    guard (200..<300).contains(http.statusCode) else {
      let message = object["error"] as? String ?? "The scheduler could not complete that request (\(http.statusCode))."
      throw ScheduleError(message)
    }
    return object
  }
}

struct ScheduleError: LocalizedError {
  let message: String
  init(_ message: String) { self.message = message }
  var errorDescription: String? { message }
}

private final class ScheduleRedirectDelegate: NSObject, URLSessionTaskDelegate {
  func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
    completionHandler(nil)
  }
}
