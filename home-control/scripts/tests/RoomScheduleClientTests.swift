import Foundation

final class FakeScheduler: URLProtocol {
  static var status = 200
  static var body = "{\"schedules\":[]}"
  static var seen: [URLRequest] = []
  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
  override func startLoading() {
    Self.seen.append(request)
    let response = HTTPURLResponse(url: request.url!, statusCode: Self.status, httpVersion: nil, headerFields: ["Content-Type":"application/json"])!
    client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
    client?.urlProtocol(self, didLoad: Data(Self.body.utf8))
    client?.urlProtocolDidFinishLoading(self)
  }
  override func stopLoading() {}
}

@main struct ScheduleClientTests {
  static func main() async throws {
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [FakeScheduler.self]
    RoomScheduleClient.testSession = URLSession(configuration: config)
    RoomScheduleClient.testToken = "test-secret"
    RoomScheduleClient.testURL = "http://example.test"
    precondition(!RoomScheduleClient.configured, "HTTP must be rejected")
    RoomScheduleClient.testURL = "https://example.test"
    precondition(RoomScheduleClient.configured)
    _ = try await RoomScheduleClient.list()
    precondition(FakeScheduler.seen.last?.value(forHTTPHeaderField: "Authorization") == "Bearer test-secret")
    precondition(FakeScheduler.seen.last?.url?.path == "/v1/schedules")
    precondition(!RoomScheduleClient.settings().keys.contains("token"))
    FakeScheduler.status = 503
    FakeScheduler.body = "{\"error\":\"Scheduler unavailable\"}"
    do {
      _ = try await RoomScheduleClient.create(["action":"acOff", "runAt":"2030-01-01T00:00:00Z"])
      fatalError("Failed creation must throw")
    } catch let error as ScheduleError { precondition(error.message == "Scheduler unavailable") }
    let request = FakeScheduler.seen.last!
    precondition(request.httpMethod == "POST")
    FakeScheduler.status = 200
    FakeScheduler.body = "{\"id\":\"11111111-1111-4111-8111-111111111111\",\"action\":\"acOff\",\"runAt\":\"2030-01-01T00:00:00Z\",\"status\":\"pending\"}"
    let created = try await RoomScheduleClient.create(["action":"acOff", "runAt":"2030-01-01T00:00:00Z"])
    precondition(created["id"] as? String == "11111111-1111-4111-8111-111111111111")
    FakeScheduler.body = "{}"
    do {
      _ = try await RoomScheduleClient.create(["action":"acOff", "runAt":"2030-01-01T00:00:00Z"])
      fatalError("Malformed acknowledgement must throw")
    } catch is ScheduleError {}
    print("schedule client contract: ok")
  }
}
