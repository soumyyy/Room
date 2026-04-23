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
  @Environment(\.widgetFamily) private var family

  var body: some View {
    VStack(spacing: family == .systemSmall ? 8 : 10) {
      widgetButton(title: "Leave Room", symbol: "figure.walk.departure", intent: LeaveRoomIntent())
      widgetButton(title: "Enter Room", symbol: "door.left.hand.open", intent: EnterRoomIntent())
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .padding(12)
    .containerBackground(Color(.systemBackground), for: .widget)
  }

  private func widgetButton<I: AppIntent>(title: String, symbol: String, intent: I) -> some View {
    Button(intent: intent) {
      HStack(spacing: 8) {
        Image(systemName: symbol)
          .font(.system(size: family == .systemSmall ? 14 : 15, weight: .semibold))
        Text(title)
          .font(.system(size: family == .systemSmall ? 13 : 14, weight: .semibold))
          .lineLimit(1)
        Spacer(minLength: 0)
      }
      .foregroundStyle(Color.white)
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.horizontal, 12)
      .padding(.vertical, family == .systemSmall ? 11 : 13)
      .background(
        RoundedRectangle(cornerRadius: 16, style: .continuous)
          .fill(Color.black)
      )
    }
    .buttonStyle(.plain)
  }
}

struct RoomActionsWidget: Widget {
  let kind = RoomConfig.widgetKind

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: RoomWidgetProvider()) { _ in
      RoomWidgetView()
    }
    .configurationDisplayName("Room")
    .description("Quick enter and leave actions.")
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}

@main
struct RoomWidgetsBundle: WidgetBundle {
  var body: some Widget {
    RoomActionsWidget()
  }
}
