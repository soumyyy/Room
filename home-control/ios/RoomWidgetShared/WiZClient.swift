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
  ///
  /// A bulb that took the command but never confirmed it is recorded as doing
  /// what was asked, since that is by far the likelier outcome, and marked
  /// failed so the widget can say it is unconfirmed. A bulb no packet reached
  /// keeps its last known state.
  func apply(_ pilot: WizPilot, to bulbs: [BulbConfig]) async throws {
    guard !bulbs.isEmpty else { return }
    let began = Date()

    let failures = await withTaskGroup(of: (BulbConfig, delivered: Bool, Error)?.self) { group -> [(BulbConfig, delivered: Bool, Error)] in
      for bulb in bulbs {
        group.addTask {
          var delivered = false
          do {
            try await self.sendPilot(pilot, to: bulb, delivered: &delivered)
            return nil
          } catch {
            return (bulb, delivered, error)
          }
        }
      }

      var collected: [(BulbConfig, delivered: Bool, Error)] = []
      for await failure in group {
        if let failure { collected.append(failure) }
      }
      return collected
    }

    guard let first = failures.first else { return }
    for (bulb, delivered, _) in failures where delivered {
      // Stamped with the command's start, so any real reading taken during
      // the attempt is newer and wins over this assumption.
      RoomSnapshotStore.update(keys: ["bulb:" + bulb.id], observedAt: began, command: true) {
        let assumed = pilot.applied(to: $0.bulbs?[bulb.id])
        if $0.bulbs == nil { $0.bulbs = [:] }
        $0.bulbs?[bulb.id] = assumed
      }
    }
    RoomSnapshotStore.markFailed(keys: failures.map { "bulb:" + $0.0.id })
    throw first.2
  }

  /// Rounds of: send the command a few times, then read the bulb back. Repeats
  /// until the bulb confirms or the budget runs out. `delivered` turns true once
  /// any send leaves the phone.
  private func sendPilot(_ pilot: WizPilot, to bulb: BulbConfig, delivered: inout Bool) async throws {
    let host = bulb.ip
    let payload = try JSONEncoder().encode(WizEnvelope(method: "setPilot", params: pilot))
    let deadline = Date().addingTimeInterval(RoomConfig.wizCommandBudget)
    var lastError: Error?

    func remaining() -> TimeInterval { deadline.timeIntervalSinceNow }

    while remaining() > 0.05 {
      let roundBegan = Date()
      var sentThisRound = false

      for index in 0..<RoomConfig.wizBurstCount {
        if index > 0 { try await Self.sleep(min(RoomConfig.wizBurstGap, remaining())) }
        guard remaining() > 0.05 else { break }
        do {
          try await send(payload, to: host, timeout: min(RoomConfig.wizSendTimeout, remaining()))
          sentThisRound = true
          delivered = true
        } catch {
          // "Host is down" right after the phone wakes is usually brief.
          lastError = error
        }
      }

      guard sentThisRound else {
        try await Self.sleep(min(RoomConfig.wizUnreachableRetryDelay, max(0, remaining())))
        continue
      }

      try await Self.sleep(min(0.15, max(0, remaining())))
      guard remaining() > 0.05 else { break }
      if let actual = try? await readPilot(from: host, timeout: min(RoomConfig.wizConfirmTimeout, remaining())) {
        RoomSnapshotStore.update(keys: ["bulb:" + bulb.id], observedAt: roundBegan) {
          if $0.bulbs == nil { $0.bulbs = [:] }
          $0.bulbs?[bulb.id] = actual
        }
        if pilot.matches(actual) { return }
      }
    }

    if delivered || lastError == nil {
      throw RoomNetworkError.wiz(message: "\(host) did not confirm the light command.")
    }
    throw lastError!
  }

  private static func sleep(_ seconds: TimeInterval) async throws {
    guard seconds > 0 else { return }
    try await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
  }

  private func send(_ payload: Data, to host: String, timeout: TimeInterval = RoomConfig.wizSendTimeout) async throws {
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
        queue.asyncAfter(deadline: .now() + timeout, execute: deadline)

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

  private func readPilot(from host: String, timeout: TimeInterval = RoomConfig.wizSendTimeout) async throws -> WizPilot {
    let payload = try JSONEncoder().encode(WizEnvelope(method: "getPilot", params: WizEmptyParams()))
    let data = try await request(payload, from: host, timeout: timeout)
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
  private func request(_ payload: Data, from host: String, timeout: TimeInterval = RoomConfig.wizSendTimeout) async throws -> Data {
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
        queue.asyncAfter(deadline: .now() + timeout, execute: deadline)

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
