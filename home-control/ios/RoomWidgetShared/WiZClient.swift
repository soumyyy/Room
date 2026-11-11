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

  /// Every addressed bulb must confirm. Successful bulbs are recorded even
  /// when a sibling fails, allowing a scene to retry only its unfinished work.
  func apply(_ pilot: WizPilot, to bulbs: [BulbConfig]) async throws {
    guard !bulbs.isEmpty else { return }

    let failures = await withTaskGroup(of: Error?.self) { group -> [Error] in
      for bulb in bulbs {
        group.addTask {
          do {
            try await self.sendPilot(pilot, to: bulb.ip)
            return nil
          } catch {
            return error
          }
        }
      }

      var collected: [Error] = []
      for await failure in group {
        if let failure {
          collected.append(failure)
        }
      }
      return collected
    }

    if let first = failures.first {
      throw first
    }
  }

  private func sendPilot(_ pilot: WizPilot, to host: String) async throws {
    let payload = try JSONEncoder().encode(WizEnvelope(method: "setPilot", params: pilot))
    for attempt in 0..<2 {
      let began = Date()
      try await send(payload, to: host)
      try await Task.sleep(nanoseconds: 200_000_000)
      if let actual = try? await readPilot(from: host) {
        if let bulb = RoomConfig.bulbs.first(where: { $0.ip == host }) {
          RoomSnapshotStore.update(keys: ["bulb:" + bulb.id], observedAt: began) {
            if $0.bulbs == nil { $0.bulbs = [:] }
            $0.bulbs?[bulb.id] = actual
          }
        }
        if pilot.matches(actual) { return }
      }
      if attempt == 0 { try await Task.sleep(nanoseconds: 250_000_000) }
    }
    throw RoomNetworkError.wiz(message: "\(host) did not confirm the light command.")
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
        queue.asyncAfter(deadline: .now() + RoomConfig.wizSendTimeout, execute: deadline)

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

  // MARK: - Reading

  /// Asks every bulb what it is doing and folds the answers into per-group
  /// state. Bulbs that stay silent are simply absent from the result, so a
  /// group nobody answered for is left alone rather than reported off.
  func readPilots() async -> [String: WizPilot] {
    await withTaskGroup(of: (String, WizPilot?).self) { group in
      for bulb in RoomConfig.bulbs {
        group.addTask { (bulb.id, try? await self.readPilot(from: bulb.ip)) }
      }
      var result: [String: WizPilot] = [:]
      for await (id, reading) in group { if let reading { result[id] = reading } }
      return result
    }
  }

  func readGroupStates() async -> [String: RoomSnapshot.LightState] {
    let pilots = await readPilots()
    var states: [String: RoomSnapshot.LightState] = [:]

    for group in RoomConfig.lightGroupIDs {
      let bulbs = RoomConfig.bulbs(inGroup: group)

      let readings = bulbs.compactMap { pilots[$0.id] }.map { WizReading(isOn: $0.state, brightness: $0.dimming) }

      if readings.count == bulbs.count, let state = RoomSnapshot.groupState(from: readings) {
        states[group] = state
      }
    }

    return states
  }

  private func readPilot(from host: String) async throws -> WizPilot {
    let payload = try JSONEncoder().encode(WizEnvelope(method: "getPilot", params: WizEmptyParams()))
    let data = try await request(payload, from: host)
    let response = try JSONDecoder().decode(WizGetPilotResponse.self, from: data)

    guard let result = response.result, let state = result.state else {
      throw RoomNetworkError.wiz(message: "\(host) returned no pilot state.")
    }

    return WizPilot(
      state: state,
      dimming: result.dimming.map(RoomConfig.clampBrightness),
      temp: result.temp, r: result.r, g: result.g, b: result.b, c: result.c, w: result.w
    )
  }

  /// Same shape as `send`, but waits for the bulb's reply.
  private func request(_ payload: Data, from host: String) async throws -> Data {
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
        queue.asyncAfter(deadline: .now() + RoomConfig.wizSendTimeout, execute: deadline)

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

private struct WizEmptyParams: Encodable {}

private struct WizGetPilotResponse: Decodable {
  struct Result: Decodable {
    let state: Bool?
    let dimming: Int?
    let temp: Int?
    let r: Int?
    let g: Int?
    let b: Int?
    let c: Int?
    let w: Int?
  }

  let result: Result?
}

private struct WizEnvelope<Params: Encodable>: Encodable {
  let method: String
  let params: Params
}
