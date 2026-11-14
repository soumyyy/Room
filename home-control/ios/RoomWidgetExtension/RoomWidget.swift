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
      let stored = RoomSnapshotStore.load()
      let room: RoomSnapshot
      if let updatedAt = stored.updatedAt, Date().timeIntervalSince(updatedAt) < RoomConfig.widgetFreshness {
        // A tap, Siri or the app just wrote this. Draw it now: asking the
        // hardware again would only delay the tile, and Tuya's readback can
        // still be reporting the scene from before the command.
        room = stored
      } else {
        // Otherwise spend the wake asking the hardware, so a change made with
        // the physical remote or a wall switch shows up. Capped, so a slow
        // network leaves the last known state on screen instead of nothing.
        room = await Self.refresh(within: RoomConfig.widgetRefreshBudget) ?? RoomSnapshotStore.load()
      }
      let entry = RoomWidgetEntry(date: .now, room: room)
      completion(Timeline(entries: [entry], policy: .after(.now.addingTimeInterval(15 * 60))))
    }
  }

  /// The refreshed room, or nil when the hardware takes longer than `seconds`.
  private static func refresh(within seconds: TimeInterval) async -> RoomSnapshot? {
    await withTaskGroup(of: RoomSnapshot?.self) { group in
      group.addTask { await RoomController.shared.refresh() }
      group.addTask {
        try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
        return nil
      }
      let first = await group.next() ?? nil
      group.cancelAll()
      return first
    }
  }
}

/// A tile's glyph: an SF Symbol, or the drawn tube bar, which has no symbol.
private enum TileIcon {
  case symbol(String)
  case tube
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

  /// One corner radius for every button in a layout. The small one is
  /// concentric with the widget's own corner (about 22pt, inset by 9pt).
  private var tileRadius: CGFloat { isSmall ? 13 : 10 }

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

  /// Four equal switches, one per device. Enter and Leave Room live on the
  /// medium widget and Siri; at this size they cost two devices' worth of room.
  private var smallLayout: some View {
    VStack(spacing: 6) {
      HStack(spacing: 6) {
        acTile(compact: false)
        lightsTile
      }

      HStack(spacing: 6) {
        fanTile(compact: false)
        tubeTile
      }
    }
    .padding(9)
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

      // AC and Fan split the column evenly, so Fan is exactly as tall as Leave.
      VStack(spacing: 8) {
        acTile(compact: true)
        fanTile(compact: true)
      }

      // Lights keeps the tall tile; Tube is a thin bar beneath it.
      VStack(spacing: 8) {
        lightsTile
        tubeBar
      }
    }
    .padding(13)
  }

  // MARK: - Device tiles

  private func acTile(compact: Bool) -> some View {
    deviceTile(
      name: "AC",
      icon: .symbol("snowflake"),
      accent: .cyan,
      reading: entry.room.acReading,
      failed: entry.room.acFailed,
      compact: compact,
      onIntent: ACOnIntent(),
      offIntent: ACOffIntent()
    )
  }

  private func fanTile(compact: Bool) -> some View {
    deviceTile(
      name: "Fan",
      icon: .symbol("fan.fill"),
      accent: .cyan,
      reading: entry.room.fanReading,
      failed: entry.room.fanFailed,
      compact: compact,
      onIntent: FanOnIntent(),
      offIntent: FanOffIntent()
    )
  }

  /// The small widget's tube switch. The medium widget draws the tube as a bar.
  private var tubeTile: some View {
    deviceTile(
      name: "Tube",
      icon: .tube,
      accent: .amber,
      reading: entry.room.tubeReading,
      failed: entry.room.tubeFailed,
      onIntent: TubeOnIntent(),
      offIntent: TubeOffIntent()
    )
  }

  /// A low, full-width bar. It is the tube light, drawn as the same simple
  /// vertical rounded bar the app uses, lit when the tube is on.
  @ViewBuilder
  private var tubeBar: some View {
    let reading = entry.room.tubeReading
    let failed = entry.room.tubeFailed
    let note = failed ? ", last command not confirmed" : ""

    if reading.isOn {
      Button(intent: TubeOffIntent()) { tubeBarBody(reading, failed: failed) }
        .buttonStyle(.plain)
        .accessibilityLabel("Tube light, on" + note)
    } else {
      Button(intent: TubeOnIntent()) { tubeBarBody(reading, failed: failed) }
        .buttonStyle(.plain)
        .accessibilityLabel("Tube light, \(reading == .unknown ? "unknown" : "off")" + note)
    }
  }

  private func tubeBarBody(_ reading: DeviceReading, failed: Bool) -> some View {
    let style: TileAccent = reading.isOn ? .amber : .neutral

    return ZStack {
      Text("Tube")
        .font(.system(size: 11, weight: .semibold))
        .foregroundStyle(reading.isOn ? style.label : Color.white.opacity(0.7))
        .lineLimit(1)
        .invalidatableContent()

      HStack {
        Capsule()
          .fill(reading.isOn ? Color.white : Color.white.opacity(0.34))
          .frame(width: 5, height: 16)
          .shadow(color: reading.isOn ? Color.white.opacity(0.55) : .clear, radius: 4)

        Spacer(minLength: 0)

        if failed {
          Self.failureMark.font(.system(size: 11, weight: .semibold))
        }
      }
      .padding(.horizontal, 14)
    }
    .frame(maxWidth: .infinity)
    .frame(height: 34)
    .background(tileShape(tileRadius).fill(style.fill))
    .overlay(tileShape(tileRadius).stroke(style.stroke, lineWidth: 1))
  }

  private var lightsTile: some View {
    deviceTile(
      name: "Lights",
      icon: .symbol("lightbulb.fill"),
      accent: .amber,
      reading: entry.room.lightsReading,
      failed: entry.room.lightsFailed,
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
    icon: TileIcon,
    accent: TileAccent,
    reading: DeviceReading,
    failed: Bool = false,
    compact: Bool = false,
    onIntent: On,
    offIntent: Off
  ) -> some View {
    let value = (reading == .unknown ? "unknown" : reading.text) + (failed ? ", last command not confirmed" : "")
    if reading.isOn {
      Button(intent: offIntent) {
        tileBody(name: name, icon: icon, accent: accent, reading: reading, failed: failed, compact: compact)
      }
      .buttonStyle(.plain)
      .accessibilityLabel(name)
      .accessibilityValue(value)
    } else {
      Button(intent: onIntent) {
        tileBody(name: name, icon: icon, accent: accent, reading: reading, failed: failed, compact: compact)
      }
      .buttonStyle(.plain)
      .accessibilityLabel(name)
      .accessibilityValue(value)
    }
  }

  private func tileBody(
    name: String,
    icon: TileIcon,
    accent: TileAccent,
    reading: DeviceReading,
    failed: Bool = false,
    compact: Bool = false
  ) -> some View {
    let style: TileAccent = reading.isOn ? accent : .neutral
    // A half-height tile has room for a single line of value, not the big one.
    let valueSize: CGFloat = compact ? 18 : (isSmall ? 22 : 24)

    return VStack(alignment: .leading, spacing: 0) {
      HStack(spacing: 4) {
        Text(name)
          .font(.system(size: isSmall ? 10.5 : 10, weight: .semibold))
          .foregroundStyle(reading.isOn ? style.label.opacity(0.82) : Color.white.opacity(0.52))
          .lineLimit(1)
          .minimumScaleFactor(0.7)
          .layoutPriority(1)

        Spacer(minLength: 2)

        if failed {
          // The last command was not confirmed: the value is a best guess.
          Self.failureMark.font(.system(size: isSmall ? 12 : 13, weight: .semibold))
        } else {
          Group {
            switch icon {
            case let .symbol(systemName):
              Image(systemName: systemName).font(.system(size: isSmall ? 12 : 13, weight: .semibold))
            case .tube:
              // The same upright bar the app and the medium widget use.
              Capsule().frame(width: 4.5, height: 14)
            }
          }
          .foregroundStyle(reading.isOn ? style.label : Color.white.opacity(0.34))
        }
      }

      Spacer(minLength: 4)

      Text(reading.text)
        .font(.system(size: valueSize, weight: .semibold))
        .monospacedDigit()
        .foregroundStyle(reading.isOn ? Color.white : Color.white.opacity(0.34))
        .lineLimit(1)
        .minimumScaleFactor(0.6)
        // Shown as pending from the tap until the timeline reloads, so a slow
        // command reads as "working" rather than "ignored".
        .invalidatableContent()
    }
    // Narrow enough that "Lights" keeps full size beside its icon.
    .padding(.horizontal, isSmall ? 9 : 13)
    .padding(.vertical, compact ? 8 : (isSmall ? 9 : 12))
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    .background(tileShape(tileRadius).fill(style.fill))
    .overlay(tileShape(tileRadius).stroke(style.stroke, lineWidth: 1))
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
      .background(tileShape(leadingAligned ? tileRadius : 11).fill(TileAccent.neutral.fill))
      .overlay(tileShape(leadingAligned ? tileRadius : 11).stroke(TileAccent.neutral.stroke, lineWidth: 1))
    }
    .buttonStyle(.plain)
  }

  /// Replaces a tile's icon when its last command was not confirmed.
  private static var failureMark: some View {
    Image(systemName: "exclamationmark.triangle.fill")
      .foregroundStyle(Color(red: 1.0, green: 0.45, blue: 0.38))
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
    .description("AC, lights, fan and tube. The medium size adds Enter and Leave Room.")
    .supportedFamilies([.systemSmall, .systemMedium])
    // WidgetKit adds its own content margins on top of whatever the view sets.
    // Those cost roughly 16pt a side, which shrank the medium tiles enough to
    // truncate "Lights". The layout sets its own padding, so turn them off.
    .contentMarginsDisabled()
  }
}

@main
struct RoomWidgetsBundle: WidgetBundle {
  var body: some Widget {
    RoomActionsWidget()
  }
}
