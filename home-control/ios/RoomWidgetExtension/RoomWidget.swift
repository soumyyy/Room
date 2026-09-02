import AppIntents
import SwiftUI
import WidgetKit

struct RoomWidgetEntry: TimelineEntry {
  let date: Date
  let room: RoomSnapshot
}

struct RoomWidgetProvider: TimelineProvider {
  func placeholder(in context: Context) -> RoomWidgetEntry {
    RoomWidgetEntry(date: .now, room: .unknown)
  }

  func getSnapshot(in context: Context, completion: @escaping (RoomWidgetEntry) -> Void) {
    completion(RoomWidgetEntry(date: .now, room: RoomSnapshotStore.load()))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<RoomWidgetEntry>) -> Void) {
    Task {
      // A timeline wake is one of the few moments this process is alive, so
      // spend it asking the hardware rather than re-rendering what we were
      // last told — otherwise the physical AC remote leaves the tile wrong
      // with no way to notice.
      let room = await RoomController.shared.refresh()
      let entry = RoomWidgetEntry(date: .now, room: room)
      completion(Timeline(entries: [entry], policy: .after(.now.addingTimeInterval(15 * 60))))
    }
  }
}

/// Two accents, one per physical domain: amber for the WiZ bulbs and the
/// arrive-home scene, cyan for the AC.
private enum TileAccent {
  case neutral
  case amber
  case cyan

  var fill: Color {
    switch self {
    case .neutral: return Color.white.opacity(0.10)
    case .amber: return Color(red: 1.0, green: 0.624, blue: 0.039).opacity(0.20)
    case .cyan: return Color(red: 0.392, green: 0.824, blue: 1.0).opacity(0.18)
    }
  }

  var stroke: Color {
    switch self {
    case .neutral: return Color.white.opacity(0.09)
    case .amber: return Color(red: 1.0, green: 0.624, blue: 0.039).opacity(0.38)
    case .cyan: return Color(red: 0.392, green: 0.824, blue: 1.0).opacity(0.36)
    }
  }

  var label: Color {
    switch self {
    case .neutral: return .white
    case .amber: return Color(red: 1.0, green: 0.729, blue: 0.333)
    case .cyan: return Color(red: 0.541, green: 0.871, blue: 1.0)
    }
  }
}

struct RoomWidgetView: View {
  @Environment(\.widgetFamily) private var family

  let entry: RoomWidgetEntry

  private var isSmall: Bool { family == .systemSmall }

  var body: some View {
    Group {
      if family == .systemMedium {
        mediumLayout
      } else {
        smallLayout
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .containerBackground(Color.black, for: .widget)
  }

  // MARK: - Layouts

  private var smallLayout: some View {
    VStack(spacing: 7) {
      header

      HStack(spacing: 7) {
        acTile
        lightsTile
      }
      .frame(maxHeight: .infinity)

      HStack(spacing: 7) {
        sceneButton("Enter", symbol: "door.left.hand.open", intent: EnterRoomIntent())
        sceneButton("Leave", symbol: "figure.walk.departure", intent: LeaveRoomIntent())
      }
      .frame(height: 32)
    }
    .padding(11)
  }

  private var mediumLayout: some View {
    HStack(spacing: 9) {
      VStack(spacing: 8) {
        sceneButton(
          "Enter",
          symbol: "door.left.hand.open",
          leadingAligned: true,
          intent: EnterRoomIntent()
        )
        sceneButton(
          "Leave",
          symbol: "figure.walk.departure",
          leadingAligned: true,
          intent: LeaveRoomIntent()
        )
      }
      .frame(width: 122)

      acTile
      lightsTile
    }
    .padding(13)
  }

  private var header: some View {
    HStack(alignment: .firstTextBaseline) {
      Text("Room")
        .font(.system(size: 12, weight: .bold))

      Spacer(minLength: 4)

      if let updatedAt = entry.room.updatedAt {
        Text(updatedAt, style: .time)
          .font(.system(size: 9.5, weight: .medium))
          .foregroundStyle(Color.white.opacity(0.52))
      }
    }
  }

  // MARK: - Device tiles

  private var acTile: some View {
    deviceTile(
      name: "AC",
      symbol: "snowflake",
      accent: .cyan,
      reading: entry.room.acReading,
      onIntent: ACOnIntent(),
      offIntent: ACOffIntent()
    )
  }

  private var lightsTile: some View {
    deviceTile(
      name: "Lights",
      symbol: "lightbulb.fill",
      accent: .amber,
      reading: entry.room.lightsReading,
      onIntent: LightsOnIntent(),
      offIntent: LightsOffIntent()
    )
  }

  /// The value is both the readout and the control, so a tile that shows state
  /// needs no separate "off" twin. An unobserved tile offers to turn the device
  /// on, which is the useful guess when we cannot know.
  @ViewBuilder
  private func deviceTile<On: AppIntent, Off: AppIntent>(
    name: String,
    symbol: String,
    accent: TileAccent,
    reading: DeviceReading,
    onIntent: On,
    offIntent: Off
  ) -> some View {
    if reading.isOn {
      Button(intent: offIntent) {
        tileBody(name: name, symbol: symbol, accent: accent, reading: reading)
      }
      .buttonStyle(.plain)
    } else {
      Button(intent: onIntent) {
        tileBody(name: name, symbol: symbol, accent: accent, reading: reading)
      }
      .buttonStyle(.plain)
    }
  }

  private func tileBody(
    name: String,
    symbol: String,
    accent: TileAccent,
    reading: DeviceReading
  ) -> some View {
    let style: TileAccent = reading.isOn ? accent : .neutral

    return VStack(alignment: .leading, spacing: 0) {
      HStack(spacing: 4) {
        Text(name)
          .font(.system(size: isSmall ? 10.5 : 11, weight: .semibold))
          .foregroundStyle(reading.isOn ? style.label.opacity(0.82) : Color.white.opacity(0.52))
          .lineLimit(1)
          .minimumScaleFactor(0.8)

        Spacer(minLength: 2)

        Image(systemName: symbol)
          .font(.system(size: 13, weight: .semibold))
          .foregroundStyle(reading.isOn ? style.label : Color.white.opacity(0.34))
      }

      Spacer(minLength: 4)

      Text(reading.text)
        .font(.system(size: isSmall ? 20 : 27, weight: .semibold))
        .monospacedDigit()
        .foregroundStyle(reading.isOn ? Color.white : Color.white.opacity(0.34))
        .lineLimit(1)
        .minimumScaleFactor(0.6)
    }
    .padding(.horizontal, isSmall ? 10 : 13)
    .padding(.vertical, isSmall ? 9 : 12)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    .background(tileShape(15).fill(style.fill))
    .overlay(tileShape(15).stroke(style.stroke, lineWidth: 1))
  }

  // MARK: - Scenes

  private func sceneButton<I: AppIntent>(
    _ title: String,
    symbol: String,
    leadingAligned: Bool = false,
    intent: I
  ) -> some View {
    Button(intent: intent) {
      Group {
        if leadingAligned {
          HStack(spacing: 9) {
            Image(systemName: symbol)
              .font(.system(size: 15, weight: .semibold))
            Text(title)
              .font(.system(size: 13.5, weight: .semibold))
            Spacer(minLength: 0)
          }
          .padding(.horizontal, 13)
        } else {
          HStack(spacing: 5) {
            Image(systemName: symbol)
              .font(.system(size: 13, weight: .semibold))
            Text(title)
              .font(.system(size: 11.5, weight: .semibold))
          }
        }
      }
      .lineLimit(1)
      .minimumScaleFactor(0.8)
      .foregroundStyle(Color.white)
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .background(tileShape(leadingAligned ? 15 : 11).fill(TileAccent.neutral.fill))
      .overlay(tileShape(leadingAligned ? 15 : 11).stroke(TileAccent.neutral.stroke, lineWidth: 1))
    }
    .buttonStyle(.plain)
  }

  private func tileShape(_ radius: CGFloat) -> RoundedRectangle {
    RoundedRectangle(cornerRadius: radius, style: .continuous)
  }
}

struct RoomActionsWidget: Widget {
  let kind = RoomConfig.widgetKind

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: RoomWidgetProvider()) { entry in
      RoomWidgetView(entry: entry)
    }
    .configurationDisplayName("Room")
    .description("Live AC and light state, with arrive and leave scenes.")
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}

@main
struct RoomWidgetsBundle: WidgetBundle {
  var body: some Widget {
    RoomActionsWidget()
  }
}
