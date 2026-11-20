import CryptoKit
import Foundation

private struct TuyaEnvelope<Result: Decodable>: Decodable {
  let success: Bool
  let msg: String?
  let code: Int?
  let result: Result?

  private enum CodingKeys: String, CodingKey { case success, msg, code, result }

  init(from decoder: Decoder) throws {
    let fields = try decoder.container(keyedBy: CodingKeys.self)
    success = try fields.decode(Bool.self, forKey: .success)
    msg = try fields.decodeIfPresent(String.self, forKey: .msg)
    if let number = try? fields.decode(Int.self, forKey: .code) {
      code = number
    } else {
      code = (try? fields.decode(String.self, forKey: .code)).flatMap(Int.init)
    }
    result = success ? try fields.decodeIfPresent(Result.self, forKey: .result) : nil
  }
}

private struct TuyaIgnoredResult: Decodable {
  init(from decoder: Decoder) throws {}
}

private struct TuyaTokenResult: Decodable {
  let access_token: String
  let expire_time: Int
}

/// Kept in the App Group, not just in memory: every widget tap and Siri
/// request can start a fresh extension process, and without this each one
/// paid an extra token round trip before it could touch the AC.
private struct TuyaTokenCache: Codable, Sendable {
  var accessToken: String = ""
  var expiresAt: Date = .distantPast

  private static let key = "tuya.accessToken"

  static func load() -> TuyaTokenCache {
    guard let data = UserDefaults(suiteName: RoomConfig.appGroupID)?.data(forKey: key),
          let cache = try? JSONDecoder().decode(TuyaTokenCache.self, from: data) else { return TuyaTokenCache() }
    return cache
  }

  func save() {
    UserDefaults(suiteName: RoomConfig.appGroupID)?.set(try? JSONEncoder().encode(self), forKey: Self.key)
  }
}

/// Tuya reports scene fields as numbers on some remotes and as numeric strings
/// on others, so accept either rather than failing the whole decode.
private struct LooseInt: Decodable {
  let value: Int?

  init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()

    if let int = try? container.decode(Int.self) {
      value = int
    } else if let double = try? container.decode(Double.self), double.isFinite {
      value = Int(double)
    } else if let string = try? container.decode(String.self) {
      if let int = Int(string) {
        value = int
      } else if let double = Double(string), double.isFinite {
        value = Int(double)
      } else {
        value = nil
      }
    } else {
      value = nil
    }
  }
}

private struct TuyaACStatusResult: Decodable {
  let power_open: Bool?
  let power: LooseInt?
  let mode: LooseInt?
  let temp: LooseInt?
  let temperature: LooseInt?
  let fan: LooseInt?
  let wind: LooseInt?

  /// Same precedence the TypeScript client uses in app/tuya.ts.
  var scene: AcScene {
    let resolvedPower: Int
    if let power_open {
      resolvedPower = power_open ? 1 : 0
    } else {
      resolvedPower = power?.value ?? RoomConfig.acOffScene.power
    }

    return AcScene(
      power: RoomConfig.clampPower(resolvedPower),
      mode: RoomConfig.clampMode(mode?.value ?? RoomConfig.acOnScene.mode),
      temp: RoomConfig.clampTemp(temperature?.value ?? temp?.value ?? RoomConfig.acOnScene.temp),
      wind: RoomConfig.clampWind(fan?.value ?? wind?.value ?? RoomConfig.acOnScene.wind)
    )
  }
}

/// One datapoint of a device reply. Only switches matter here, so a value that
/// is not a boolean (a countdown, an empty string) reads as absent rather than
/// failing the whole decode.
private struct TuyaDatapoint: Decodable {
  let code: String
  let value: Bool?

  private enum CodingKeys: String, CodingKey { case code, value }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    code = try container.decode(String.self, forKey: .code)
    value = try? container.decode(Bool.self, forKey: .value)
  }
}

private struct TuyaNodeResult: Decodable {
  let online: Bool?
  let status: [TuyaDatapoint]?
}

private struct TuyaCommandBody: Encodable {
  let commands: [NodeCommand]
}

enum RoomNetworkError: LocalizedError {
  case invalidURL
  case invalidResponse
  case tuya(message: String)
  case wiz(message: String)

  var errorDescription: String? {
    switch self {
    case .invalidURL:
      return "The request URL is invalid."
    case .invalidResponse:
      return "The device returned an invalid response."
    case let .tuya(message), let .wiz(message):
      return message
    }
  }
}

actor TuyaClient {
  static let shared = TuyaClient()

  private let session = URLSession.shared
  private var tokenCache = TuyaTokenCache.load()
  private var tokenTask: Task<String, Error>?

  func sendACScene(_ scene: AcScene) async throws {
    let accepted = try await request(
      method: "POST",
      path: "/v2.0/infrareds/\(RoomConfig.tuya.infraredID)/air-conditioners/\(RoomConfig.tuya.acRemoteID)/scenes/command",
      body: scene,
      expecting: Bool.self
    )
    guard accepted else { throw RoomNetworkError.tuya(message: "AC command was not accepted.") }
  }

  /// The scene the IR remote believes the unit is holding. Note this is the
  /// blaster's own model, not a reading from the air conditioner — reach for
  /// the physical remote and Tuya will not know.
  func fetchACScene() async throws -> AcScene {
    let result = try await request(
      method: "GET",
      path: "/v2.0/infrareds/\(RoomConfig.tuya.infraredID)/remotes/\(RoomConfig.tuya.acRemoteID)/ac/status",
      expecting: TuyaACStatusResult.self
    )

    return result.scene
  }

  func infraredIsOnline() async throws -> Bool {
    let device = try await request(method: "GET", path: "/v1.0/devices/\(RoomConfig.tuya.infraredID)", expecting: TuyaNodeResult.self)
    return device.online == true
  }

  /// The relays as the cloud reports them, or nil when the node is offline or
  /// the reply names neither switch.
  func fetchNode() async throws -> NodeState? {
    let result = try await request(
      method: "GET",
      path: "/v1.0/devices/\(RoomConfig.tuya.nodeID)",
      expecting: TuyaNodeResult.self
    )

    return NodeState(
      online: result.online,
      datapoints: (result.status ?? []).map { (code: $0.code, value: $0.value) }
    )
  }

  func sendNodeCommands(_ commands: [NodeCommand]) async throws {
    guard !commands.isEmpty else { return }

    let accepted = try await request(
      method: "POST",
      path: "/v1.0/devices/\(RoomConfig.tuya.nodeID)/commands",
      body: TuyaCommandBody(commands: commands),
      expecting: Bool.self
    )
    guard accepted else { throw RoomNetworkError.tuya(message: "Switchboard command was not accepted.") }
  }

  private func request<Result: Decodable, Body: Encodable>(
    method: String,
    path: String,
    query: [String: CustomStringConvertible] = [:],
    body: Body,
    expecting: Result.Type
  ) async throws -> Result {
    try await request(
      method: method,
      path: path,
      query: query,
      bodyData: try JSONEncoder().encode(body),
      expecting: Result.self
    )
  }

  private func request<Result: Decodable>(
    method: String,
    path: String,
    query: [String: CustomStringConvertible] = [:],
    bodyData: Data = Data(),
    expecting _: Result.Type
  ) async throws -> Result {
    do {
      return try await performRequest(
        method: method,
        path: path,
        query: query,
        bodyData: bodyData,
        expecting: Result.self,
        forceRefresh: false
      )
    } catch let error as URLError where Self.isBriefDrop(error) {
      // A widget, Siri or Control Center process often starts with the radio
      // still waking, and its first request drops at once. One quick retry.
      // An AC code carries the whole scene, so a duplicate send is harmless.
      try await Task.sleep(nanoseconds: 400_000_000)
      return try await performRequest(
        method: method,
        path: path,
        query: query,
        bodyData: bodyData,
        expecting: Result.self,
        forceRefresh: false
      )
    } catch let error as NSError where error.domain == "RoomTuya" && (error.code == 1010 || error.code == 1011) {
      tokenCache = TuyaTokenCache()
      tokenCache.save()
      return try await performRequest(
        method: method,
        path: path,
        query: query,
        bodyData: bodyData,
        expecting: Result.self,
        forceRefresh: true
      )
    }
  }

  /// Failures that are over in a moment. Not timeouts: retrying one would
  /// double an already long wait.
  private static func isBriefDrop(_ error: URLError) -> Bool {
    [.networkConnectionLost, .cannotConnectToHost, .cannotFindHost, .dnsLookupFailed, .secureConnectionFailed]
      .contains(error.code)
  }

  private func performRequest<Result: Decodable>(
    method: String,
    path: String,
    query: [String: CustomStringConvertible],
    bodyData: Data,
    expecting _: Result.Type,
    forceRefresh: Bool
  ) async throws -> Result {
    let accessToken = try await accessToken(forceRefresh: forceRefresh)
    let requestPath = buildRequestPath(path: path, query: query)
    guard let url = URL(string: requestPath, relativeTo: RoomConfig.tuya.apiBaseURL) else {
      throw RoomNetworkError.invalidURL
    }

    var request = URLRequest(url: url)
    request.httpMethod = method
    request.timeoutInterval = RoomConfig.tuyaRequestTimeout
    if !bodyData.isEmpty {
      request.httpBody = bodyData
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    }

    signedHeaders(
      method: method,
      requestPath: requestPath,
      bodyData: bodyData,
      accessToken: accessToken
    ).forEach { request.setValue($1, forHTTPHeaderField: $0) }

    let (data, response) = try await session.data(for: request)
    guard let http = response as? HTTPURLResponse else {
      throw RoomNetworkError.invalidResponse
    }

    let envelope = try JSONDecoder().decode(TuyaEnvelope<Result>.self, from: data)
    guard http.statusCode < 400, envelope.success, let result = envelope.result else {
      let error = NSError(
        domain: "RoomTuya",
        code: envelope.code ?? http.statusCode,
        userInfo: [NSLocalizedDescriptionKey: envelope.msg ?? "Tuya request failed."]
      )
      throw error
    }

    return result
  }

  private func accessToken(forceRefresh: Bool) async throws -> String {
    if !forceRefresh,
       !tokenCache.accessToken.isEmpty,
       tokenCache.expiresAt.timeIntervalSinceNow > 60 {
      return tokenCache.accessToken
    }
    if let tokenTask { return try await tokenTask.value }
    let task = Task { try await self.fetchAccessToken() }
    tokenTask = task
    defer { tokenTask = nil }
    return try await task.value
  }

  private func fetchAccessToken() async throws -> String {
    let requestPath = buildRequestPath(path: "/v1.0/token", query: ["grant_type": 1])
    guard let url = URL(string: requestPath, relativeTo: RoomConfig.tuya.apiBaseURL) else {
      throw RoomNetworkError.invalidURL
    }

    var request = URLRequest(url: url)
    request.httpMethod = "GET"
    request.timeoutInterval = RoomConfig.tuyaRequestTimeout
    signedHeaders(method: "GET", requestPath: requestPath, bodyData: Data(), accessToken: "")
      .forEach { request.setValue($1, forHTTPHeaderField: $0) }

    let (data, response) = try await session.data(for: request)
    guard let http = response as? HTTPURLResponse else {
      throw RoomNetworkError.invalidResponse
    }

    let envelope = try JSONDecoder().decode(TuyaEnvelope<TuyaTokenResult>.self, from: data)
    guard http.statusCode < 400, envelope.success, let result = envelope.result else {
      throw RoomNetworkError.tuya(message: envelope.msg ?? "Unable to refresh the Tuya token.")
    }

    tokenCache.accessToken = result.access_token
    tokenCache.expiresAt = Date().addingTimeInterval(TimeInterval(result.expire_time))
    tokenCache.save()
    return result.access_token
  }

  private func buildRequestPath(path: String, query: [String: CustomStringConvertible]) -> String {
    guard !query.isEmpty else { return path }

    let queryString = query
      .sorted(by: { $0.key < $1.key })
      .map { key, value in
        "\(key)=\(String(describing: value).addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")"
      }
      .joined(separator: "&")

    return "\(path)?\(queryString)"
  }

  private func signedHeaders(
    method: String,
    requestPath: String,
    bodyData: Data,
    accessToken: String
  ) -> [String: String] {
    let timestamp = String(Int(Date().timeIntervalSince1970 * 1000))
    let nonce = UUID().uuidString.replacingOccurrences(of: "-", with: "")
    let bodyHash = SHA256.hash(data: bodyData).hexStringLowercased
    let stringToSign = [method.uppercased(), bodyHash, "", requestPath].joined(separator: "\n")
    let payload = RoomConfig.tuya.clientID + accessToken + timestamp + nonce + stringToSign
    let signature = HMAC<SHA256>.authenticationCode(
      for: Data(payload.utf8),
      using: SymmetricKey(data: Data(RoomConfig.tuya.clientSecret.utf8))
    )

    var headers = [
      "client_id": RoomConfig.tuya.clientID,
      "t": timestamp,
      "nonce": nonce,
      "sign_method": "HMAC-SHA256",
      "sign": Data(signature).hexStringUppercased,
    ]

    if !accessToken.isEmpty {
      headers["access_token"] = accessToken
    }

    return headers
  }
}

private extension Digest {
  var hexStringLowercased: String {
    map { String(format: "%02x", $0) }.joined()
  }
}

private extension Data {
  var hexStringUppercased: String {
    map { String(format: "%02X", $0) }.joined()
  }
}
