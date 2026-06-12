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

  private var tileHeight: CGFloat {
    family == .systemSmall ? 38 : 48
  }

  private var tileSpacing: CGFloat {
    family == .systemSmall ? 6 : 8
  }

  private var tileColor: Color {
    Color(white: 0.22)
  }

  var body: some View {
    Group {
      if family == .systemMedium {
        mediumLayout
      } else {
        smallLayout
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .padding(family == .systemSmall ? 8 : 10)
    .containerBackground(Color.black, for: .widget)
  }

  private var smallLayout: some View {
    VStack(spacing: tileSpacing) {
      HStack(spacing: tileSpacing) {
        widgetButton(title: "Enter", symbol: "door.left.hand.open", intent: EnterRoomIntent())
        widgetButton(title: "Leave", symbol: "figure.walk.departure", intent: LeaveRoomIntent())
      }

      HStack(spacing: tileSpacing) {
        widgetButton(title: "AC On", symbol: "snowflake", intent: ACOnIntent())
        widgetButton(title: "AC Off", symbol: "power", intent: ACOffIntent())
      }

      HStack(spacing: tileSpacing) {
        widgetButton(title: "Light On", symbol: "lightbulb.fill", intent: LightsOnIntent())
        widgetButton(title: "Light Off", symbol: "lightbulb", intent: LightsOffIntent())
      }
    }
  }

  private var mediumLayout: some View {
    VStack(spacing: tileSpacing) {
      HStack(spacing: tileSpacing) {
        widgetButton(title: "Enter", symbol: "door.left.hand.open", intent: EnterRoomIntent())
        widgetButton(title: "Leave", symbol: "figure.walk.departure", intent: LeaveRoomIntent())
        widgetButton(title: "AC On", symbol: "snowflake", intent: ACOnIntent())
      }

      HStack(spacing: tileSpacing) {
        widgetButton(title: "AC Off", symbol: "power", intent: ACOffIntent())
        widgetButton(title: "Light On", symbol: "lightbulb.fill", intent: LightsOnIntent())
        widgetButton(title: "Light Off", symbol: "lightbulb", intent: LightsOffIntent())
      }
    }
  }

  private func widgetButton<I: AppIntent>(
    title: String,
    symbol: String,
    intent: I
  ) -> some View {
    Button(intent: intent) {
      VStack(spacing: family == .systemSmall ? 4 : 5) {
        Image(systemName: symbol)
          .font(.system(size: family == .systemSmall ? 14 : 17, weight: .semibold))
          .symbolRenderingMode(.hierarchical)

        Text(title)
          .font(.system(size: family == .systemSmall ? 10 : 12, weight: .semibold))
          .lineLimit(1)
          .minimumScaleFactor(0.78)
      }
      .foregroundStyle(Color.white)
      .frame(maxWidth: .infinity, minHeight: tileHeight)
      .background(
        RoundedRectangle(cornerRadius: family == .systemSmall ? 13 : 16, style: .continuous)
          .fill(tileColor)
      )
      .overlay(
        RoundedRectangle(cornerRadius: family == .systemSmall ? 13 : 16, style: .continuous)
          .stroke(Color.white.opacity(0.18), lineWidth: 1)
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
    .description("Quick controls for room, AC, and lights.")
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}

@main
struct RoomWidgetsBundle: WidgetBundle {
  var body: some Widget {
    RoomActionsWidget()
  }
}
