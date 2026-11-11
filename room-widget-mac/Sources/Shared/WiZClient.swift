import Foundation
import Network
@preconcurrency import Dispatch

/// One-shot guard so a connection's several callbacks can only resume the
/// continuation once, no matter which queue they arrive on.
private final class SendGate: @unchecked Sendable {
  private let lock = NSLock()
  private var finished = false

  func claim() -> Bool {
    lock.lock()
    defer { lock.unlock() }

    if finished {
      return false
    }

    finished = true
    return true
  }
}



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
    for _ in 0..<2 {
      try await send(payload, to: host)
      try await Task.sleep(nanoseconds: 200_000_000)
      if let actual = try? await getPilot(from: host), actual.state == pilot.state {
        let values = [(pilot.dimming, actual.dimming), (pilot.temp, actual.temp),
                      (pilot.r, actual.r), (pilot.g, actual.g), (pilot.b, actual.b)]
        if !pilot.state || values.allSatisfy({ wanted, got in
          guard let wanted else { return true }
          return got.map { abs($0 - wanted) <= 1 } ?? false
        }) { return }
      }
    }
    throw RoomNetworkError.wiz(message: "\(host) did not confirm the command.")
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
    guard let port = NWEndpoint.Port(rawValue: RoomConfig.wizPort) else {
      throw RoomNetworkError.invalidURL
    }

    let connection = NWConnection(host: NWEndpoint.Host(host), port: port, using: .udp)
    let gate = SendGate()
    let queue = DispatchQueue.global(qos: .userInitiated)

    try await withTaskCancellationHandler {
      try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
        func finish(_ result: Result<Void, Error>) {
          guard gate.claim() else { return }
          connection.stateUpdateHandler = nil
          connection.cancel()
          continuation.resume(with: result)
        }

        // A widget intent has a few seconds to live, and NWConnection will sit
        // in .waiting or .preparing indefinitely when there is no route to the
        // LAN. Never let either state strand the continuation.
        let deadline = DispatchWorkItem {
          finish(.failure(RoomNetworkError.wiz(message: "\(host) did not respond in time.")))
        }
        queue.asyncAfter(deadline: .now() + 2.0, execute: deadline)

        connection.stateUpdateHandler = { state in
          switch state {
          case .ready:
            connection.send(content: payload, completion: .contentProcessed { error in
              deadline.cancel()

              if let error {
                finish(.failure(RoomNetworkError.wiz(message: error.localizedDescription)))
              } else {
                finish(.success(()))
              }
            })

          case let .waiting(error):
            // No route to the local network (cellular only, Wi-Fi off, or
            // local-network permission denied). Fail fast instead of stalling.
            deadline.cancel()
            finish(.failure(RoomNetworkError.wiz(message: error.localizedDescription)))

          case let .failed(error):
            deadline.cancel()
            finish(.failure(RoomNetworkError.wiz(message: error.localizedDescription)))

          case .cancelled:
            deadline.cancel()
            finish(.failure(CancellationError()))

          default:
            break
          }
        }

        connection.start(queue: queue)
      }
    } onCancel: {
      connection.cancel()
    }
  }

  private func request<Response: Decodable>(_ payload: Data, to host: String) async throws -> Response {
    let data = try await requestData(payload, from: host)
    return try JSONDecoder().decode(Response.self, from: data)
  }
  private func requestData(_ payload: Data, from host: String) async throws -> Data {
    guard let port = NWEndpoint.Port(rawValue: RoomConfig.wizPort) else {
      throw RoomNetworkError.invalidURL
    }

    let connection = NWConnection(host: NWEndpoint.Host(host), port: port, using: .udp)
    let gate = SendGate()
    let queue = DispatchQueue.global(qos: .userInitiated)

    return try await withTaskCancellationHandler {
      try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Data, Error>) in
        func finish(_ result: Result<Data, Error>) {
          guard gate.claim() else { return }
          connection.stateUpdateHandler = nil
          connection.cancel()
          continuation.resume(with: result)
        }

        let deadline = DispatchWorkItem {
          finish(.failure(RoomNetworkError.wiz(message: "\(host) did not answer in time.")))
        }
        queue.asyncAfter(deadline: .now() + 2.0, execute: deadline)

        connection.stateUpdateHandler = { state in
          switch state {
          case .ready:
            connection.send(content: payload, completion: .contentProcessed { error in
              if let error {
                deadline.cancel()
                finish(.failure(RoomNetworkError.wiz(message: error.localizedDescription)))
                return
              }

              connection.receiveMessage { data, _, _, receiveError in
                deadline.cancel()

                if let data, !data.isEmpty {
                  finish(.success(data))
                } else {
                  finish(.failure(RoomNetworkError.wiz(
                    message: receiveError?.localizedDescription ?? "\(host) sent an empty reply."
                  )))
                }
              }
            })

          case let .waiting(error):
            deadline.cancel()
            finish(.failure(RoomNetworkError.wiz(message: error.localizedDescription)))

          case let .failed(error):
            deadline.cancel()
            finish(.failure(RoomNetworkError.wiz(message: error.localizedDescription)))

          case .cancelled:
            deadline.cancel()
            finish(.failure(CancellationError()))

          default:
            break
          }
        }

        connection.start(queue: queue)
      }
    } onCancel: {
      connection.cancel()
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
      return Int(value)
    }

    return nil
  }
}
