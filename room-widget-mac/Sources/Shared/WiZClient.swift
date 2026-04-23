import Foundation
import Network

actor WiZClient {
  static let shared = WiZClient()

  func apply(_ pilot: WizPilot, to bulbs: [BulbConfig]) async throws {
    try await withThrowingTaskGroup(of: Void.self) { group in
      for bulb in bulbs {
        group.addTask {
          try await self.sendPilot(pilot, to: bulb.ip)
        }
      }

      try await group.waitForAll()
    }
  }

  func apply(_ states: [SavedBulbState]) async throws {
    try await withThrowingTaskGroup(of: Void.self) { group in
      for state in states {
        group.addTask {
          try await self.sendPilot(state.pilot, to: state.ip)
        }
      }

      try await group.waitForAll()
    }
  }

  func readStates(for bulbs: [BulbConfig]) async throws -> [SavedBulbState] {
    let states = await withTaskGroup(of: SavedBulbState?.self) { group in
      for bulb in bulbs {
        group.addTask {
          do {
            let pilot = try await self.getPilot(from: bulb.ip)
            return SavedBulbState(id: bulb.id, ip: bulb.ip, pilot: pilot)
          } catch {
            return nil
          }
        }
      }

      var results: [SavedBulbState] = []
      for await state in group {
        if let state {
          results.append(state)
        }
      }
      return results
    }

    guard !states.isEmpty else {
      throw RoomNetworkError.wiz(message: "Unable to read any WiZ lights.")
    }

    return states
  }

  private func sendPilot(_ pilot: WizPilot, to host: String) async throws {
    let payload = try JSONEncoder().encode(WizEnvelope(method: "setPilot", params: pilot))

    try await send(payload, to: host)
    try await Task.sleep(nanoseconds: RoomConfig.wizRetryDelayNanoseconds)
    try await send(payload, to: host)
  }

  private func getPilot(from host: String) async throws -> WizPilot {
    let payload = try JSONEncoder().encode(WizEnvelope(method: "getPilot", params: EmptyParams()))
    let reply: WizReply<WizPilotPayload> = try await request(payload, to: host)

    if let message = reply.error?.message {
      throw RoomNetworkError.wiz(message: message)
    }

    guard let result = reply.result else {
      throw RoomNetworkError.wiz(message: "WiZ device returned an invalid response.")
    }

    return WizPilot(
      state: result.state ?? false,
      dimming: result.dimming,
      temp: result.temp,
      r: result.r,
      g: result.g,
      b: result.b
    )
  }

  private func send(_ payload: Data, to host: String) async throws {
    let connection = NWConnection(
      host: NWEndpoint.Host(host),
      port: NWEndpoint.Port(rawValue: RoomConfig.wizPort)!,
      using: .udp
    )

    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      connection.stateUpdateHandler = { state in
        switch state {
        case .failed(let error):
          connection.stateUpdateHandler = nil
          connection.cancel()
          continuation.resume(throwing: RoomNetworkError.wiz(message: error.localizedDescription))
        case .ready:
          connection.stateUpdateHandler = nil
          connection.send(content: payload, completion: .contentProcessed { error in
            connection.cancel()
            if let error {
              continuation.resume(throwing: RoomNetworkError.wiz(message: error.localizedDescription))
            } else {
              continuation.resume()
            }
          })
        default:
          break
        }
      }

      connection.start(queue: .global(qos: .userInitiated))
    }
  }

  private func request<Response: Decodable>(_ payload: Data, to host: String) async throws -> Response {
    let connection = NWConnection(
      host: NWEndpoint.Host(host),
      port: NWEndpoint.Port(rawValue: RoomConfig.wizPort)!,
      using: .udp
    )
    let queue = DispatchQueue.global(qos: .userInitiated)

    return try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Response, Error>) in
      var didResume = false

      func finish(with result: Result<Response, Error>) {
        guard !didResume else {
          return
        }

        didResume = true
        connection.stateUpdateHandler = nil
        connection.cancel()

        switch result {
        case let .success(response):
          continuation.resume(returning: response)
        case let .failure(error):
          continuation.resume(throwing: error)
        }
      }

      let timeout = DispatchWorkItem {
        finish(with: .failure(RoomNetworkError.wiz(message: "WiZ device \(host) timed out.")))
      }
      queue.asyncAfter(deadline: .now() + .nanoseconds(Int(RoomConfig.wizReadTimeoutNanoseconds)), execute: timeout)

      connection.stateUpdateHandler = { state in
        switch state {
        case .failed(let error):
          timeout.cancel()
          finish(with: .failure(RoomNetworkError.wiz(message: error.localizedDescription)))
        case .ready:
          connection.stateUpdateHandler = nil
          connection.send(content: payload, completion: .contentProcessed { error in
            if let error {
              timeout.cancel()
              finish(with: .failure(RoomNetworkError.wiz(message: error.localizedDescription)))
              return
            }

            connection.receiveMessage { data, _, _, error in
              timeout.cancel()

              if let error {
                finish(with: .failure(RoomNetworkError.wiz(message: error.localizedDescription)))
                return
              }

              guard let data else {
                finish(with: .failure(RoomNetworkError.wiz(message: "WiZ device returned no data.")))
                return
              }

              do {
                let decoded = try JSONDecoder().decode(Response.self, from: data)
                finish(with: .success(decoded))
              } catch {
                finish(with: .failure(RoomNetworkError.wiz(message: "Invalid WiZ response from \(host).")))
              }
            }
          })
        default:
          break
        }
      }

      connection.start(queue: queue)
    }
  }
}

private struct WizEnvelope<Params: Encodable>: Encodable {
  let method: String
  let params: Params
}

private struct EmptyParams: Encodable {}

private struct WizReply<Result: Decodable>: Decodable {
  let result: Result?
  let error: WizErrorPayload?
}

private struct WizErrorPayload: Decodable {
  let message: String?
}

private struct WizPilotPayload: Decodable {
  let state: Bool?
  let dimming: Int?
  let temp: Int?
  let r: Int?
  let g: Int?
  let b: Int?

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    state = try container.decodeIfPresent(Bool.self, forKey: .state)
    dimming = try container.decodeFlexibleIntIfPresent(forKey: .dimming)
    temp = try container.decodeFlexibleIntIfPresent(forKey: .temp)
    r = try container.decodeFlexibleIntIfPresent(forKey: .r)
    g = try container.decodeFlexibleIntIfPresent(forKey: .g)
    b = try container.decodeFlexibleIntIfPresent(forKey: .b)
  }

  private enum CodingKeys: String, CodingKey {
    case state
    case dimming
    case temp
    case r
    case g
    case b
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
