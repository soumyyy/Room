import AppIntents
import SwiftUI
import WidgetKit

struct RoomWidgetEntry: TimelineEntry {
  let date: Date
}

struct RoomWidgetProvider: TimelineProvider {
  func placeholder(in context: Context) -> RoomWidgetEntry {
    RoomWidgetEntry(date: .now)
  }

  func getSnapshot(in context: Context, completion: @escaping (RoomWidgetEntry) -> Void) {
    completion(RoomWidgetEntry(date: .now))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<RoomWidgetEntry>) -> Void) {
    completion(Timeline(entries: [RoomWidgetEntry(date: .now)], policy: .never))
  }
}

struct RoomWidgetView: View {
  let entry: RoomWidgetEntry
  @Environment(\.widgetFamily) private var family

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text("Room")
        .font(.system(size: family == .systemSmall ? 16 : 18, weight: .semibold))

      Text("Quick actions")
        .font(.system(size: 12, weight: .medium))
        .foregroundStyle(.secondary)

      VStack(spacing: 8) {
        widgetButton(title: "Leave Room", symbol: "figure.walk.departure", intent: LeaveRoomIntent())
        widgetButton(title: "Enter Room", symbol: "door.left.hand.open", intent: EnterRoomIntent())
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .padding(14)
    .containerBackground(.fill.tertiary, for: .widget)
  }

  private func widgetButton<I: AppIntent>(title: String, symbol: String, intent: I) -> some View {
    Button(intent: intent) {
      HStack(spacing: 8) {
        Image(systemName: symbol)
        Text(title)
          .lineLimit(1)
        Spacer(minLength: 0)
      }
      .font(.system(size: 12, weight: .semibold))
      .padding(.horizontal, 10)
      .padding(.vertical, 9)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(.quaternary, in: RoundedRectangle(cornerRadius: 12))
    }
    .buttonStyle(.plain)
  }
}

struct RoomActionsWidget: Widget {
  let kind = RoomConfig.widgetKind

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: RoomWidgetProvider()) { entry in
      RoomWidgetView(entry: entry)
    }
    .configurationDisplayName("Room")
    .description("Enter or leave the room from the desktop.")
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}

@main
struct RoomWidgetsBundle: WidgetBundle {
  var body: some Widget {
    RoomActionsWidget()
  }
}
