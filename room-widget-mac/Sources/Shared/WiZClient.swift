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

  private func sendPilot(_ pilot: WizPilot, to host: String) async throws {
    let payload = try JSONEncoder().encode([
      "method": "setPilot",
      "params": pilot,
    ] as [String: AnyEncodable])

    try await send(payload, to: host)
    try await Task.sleep(nanoseconds: RoomConfig.wizRetryDelayNanoseconds)
    try await send(payload, to: host)
  }

  private func send(_ payload: Data, to host: String) async throws {
    let connection = NWConnection(
      host: NWEndpoint.Host(host),
      port: NWEndpoint.Port(rawValue: RoomConfig.wizPort)!,
      using: .udp
    )

    try await withCheckedThrowingContinuation { continuation in
      var hasResumed = false

      func resume(_ result: Result<Void, Error>) {
        guard !hasResumed else { return }
        hasResumed = true
        connection.cancel()
        continuation.resume(with: result)
      }

      connection.stateUpdateHandler = { state in
        switch state {
        case .failed(let error):
          resume(.failure(RoomNetworkError.wiz(message: error.localizedDescription)))
        case .ready:
          connection.send(content: payload, completion: .contentProcessed { error in
            if let error {
              resume(.failure(RoomNetworkError.wiz(message: error.localizedDescription)))
            } else {
              resume(.success(()))
            }
          })
        default:
          break
        }
      }

      connection.start(queue: .global(qos: .userInitiated))
    }
  }
}

private struct AnyEncodable: Encodable {
  private let encodeImpl: (Encoder) throws -> Void

  init<T: Encodable>(_ value: T) {
    encodeImpl = value.encode
  }

  func encode(to encoder: Encoder) throws {
    try encodeImpl(encoder)
  }
}
