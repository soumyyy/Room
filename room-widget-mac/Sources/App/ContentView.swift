import SwiftUI

struct ContentView: View {
  @State private var isBusy = false
  @State private var statusLine = "Add the widget to your desktop or Notification Center."

  var body: some View {
    VStack(alignment: .leading, spacing: 18) {
      Text("Room")
        .font(.system(size: 32, weight: .semibold))

      Text("Native macOS host app for the Room widget.")
        .foregroundStyle(.secondary)

      VStack(alignment: .leading, spacing: 10) {
        actionButton(title: "Leave Room", symbol: "figure.walk.departure") {
          try await RoomController.shared.leaveRoom()
          statusLine = "Leave Room sent."
        }

        actionButton(title: "Enter Room", symbol: "door.left.hand.open") {
          try await RoomController.shared.enterRoom()
          statusLine = "Enter Room sent."
        }
      }

      Text(statusLine)
        .font(.system(size: 12, weight: .medium))
        .foregroundStyle(.secondary)

      Spacer(minLength: 0)
    }
    .padding(28)
    .frame(width: 420, height: 240)
  }

  @ViewBuilder
  private func actionButton(
    title: String,
    symbol: String,
    action: @escaping () async throws -> Void
  ) -> some View {
    Button {
      Task {
        isBusy = true
        defer { isBusy = false }

        do {
          try await action()
        } catch {
          statusLine = error.localizedDescription
        }
      }
    } label: {
      Label(title, systemImage: symbol)
        .frame(maxWidth: .infinity)
    }
    .buttonStyle(.borderedProminent)
    .disabled(isBusy)
  }
}
