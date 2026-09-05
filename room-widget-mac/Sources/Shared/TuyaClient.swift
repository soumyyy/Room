import CryptoKit
import Foundation

private struct TuyaEnvelope<Result: Decodable>: Decodable {
  let success: Bool
  let msg: String?
  let code: String?
  let result: Result?
}

private struct TuyaIgnoredResult: Decodable {
  init(from decoder: Decoder) throws {}
}

private struct TuyaTokenResult: Decodable {
  let access_token: String
  let expire_time: Int
}

private struct TuyaTokenCache: Sendable {
  var accessToken: String = ""
  var expiresAt: Date = .distantPast
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
  private var tokenCache = TuyaTokenCache()

  func getACStatus() async throws -> AcScene {
    let status = try await request(
      method: "GET",
      path: "/v2.0/infrareds/\(RoomConfig.tuya.infraredID)/remotes/\(RoomConfig.tuya.acRemoteID)/ac/status",
      expecting: TuyaAcStatusResult.self
    )

    return normalize(scene: status)
  }

  func sendACScene(_ scene: AcScene) async throws {
    _ = try await request(
      method: "POST",
      path: "/v2.0/infrareds/\(RoomConfig.tuya.infraredID)/air-conditioners/\(RoomConfig.tuya.acRemoteID)/scenes/command",
      body: scene,
      expecting: TuyaIgnoredResult.self
    )
  }

  private func request<Result: Decodable, Body: Encodable>(
    method: String,
    path: String,
    query: [String: CustomStringConvertible] = [:],
    body: Body? = nil,
    expecting _: Result.Type
  ) async throws -> Result {
    let bodyData = try body.map { try JSONEncoder().encode($0) } ?? Data()

    do {
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
        code: Int(envelope.code ?? "") ?? http.statusCode,
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

    let requestPath = buildRequestPath(path: "/v1.0/token", query: ["grant_type": 1])
    guard let url = URL(string: requestPath, relativeTo: RoomConfig.tuya.apiBaseURL) else {
      throw RoomNetworkError.invalidURL
    }
    var request = URLRequest(url: url)
    request.httpMethod = "GET"
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

  private func normalize(scene status: TuyaAcStatusResult) -> AcScene {
    let power = status.powerOpen ?? ((status.power ?? 0) == 1)

    return AcScene(
      power: power ? 1 : 0,
      mode: status.mode ?? 0,
      temp: status.temperature ?? status.temp ?? 27,
      wind: status.fan ?? status.wind ?? 1
    )
  }
}

private struct TuyaAcStatusResult: Decodable {
  let powerOpen: Bool?
  let power: Int?
  let mode: Int?
  let temp: Int?
  let temperature: Int?
  let wind: Int?
  let fan: Int?

  private enum CodingKeys: String, CodingKey {
    case powerOpen = "power_open"
    case power
    case mode
    case temp
    case temperature
    case wind
    case fan
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    powerOpen = try container.decodeIfPresent(Bool.self, forKey: .powerOpen)
    power = try container.decodeFlexibleIntIfPresent(forKey: .power)
    mode = try container.decodeFlexibleIntIfPresent(forKey: .mode)
    temp = try container.decodeFlexibleIntIfPresent(forKey: .temp)
    temperature = try container.decodeFlexibleIntIfPresent(forKey: .temperature)
    wind = try container.decodeFlexibleIntIfPresent(forKey: .wind)
    fan = try container.decodeFlexibleIntIfPresent(forKey: .fan)
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

private extension KeyedDecodingContainer {
  func decodeFlexibleIntIfPresent(forKey key: Key) throws -> Int? {
    if let value = try? decodeIfPresent(Int.self, forKey: key) {
      return value
    }

    if let value = try? decodeIfPresent(String.self, forKey: key) {
      return value.flatMap(Int.init)
    }

    return nil
  }
}
