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
    let payload = try JSONEncoder().encode(WizEnvelope(method: "setPilot", params: pilot))

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
}

private struct WizEnvelope<Params: Encodable>: Encodable {
  let method: String
  let params: Params
}
