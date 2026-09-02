import Foundation
import Network

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

  /// Sends `pilot` to every bulb. Unreachable bulbs are tolerated — the call
  /// only throws when no bulb at all accepted the command, so one sleeping
  /// light can't fail the whole widget action.
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

    if failures.count == bulbs.count, let first = failures.first {
      throw first
    }
  }

  private func sendPilot(_ pilot: WizPilot, to host: String) async throws {
    let payload = try JSONEncoder().encode(WizEnvelope(method: "setPilot", params: pilot))

    try await send(payload, to: host)
    try await Task.sleep(nanoseconds: RoomConfig.wizRetryDelayNanoseconds)
    try? await send(payload, to: host)
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
}

private struct WizEnvelope<Params: Encodable>: Encodable {
  let method: String
  let params: Params
}
