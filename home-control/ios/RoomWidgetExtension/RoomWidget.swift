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
        // A change made with the remote or a wall switch reaches the
        // Control Center switches too.
        if room != stored, #available(iOS 18.0, *) { ControlCenter.shared.reloadAllControls() }
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

/// A tile's glyph. AC and Fan sit in a disc, like Control Center; the bulbs
/// and the tube are drawn bare, the tube as the upright bar the app uses.
private enum TileIcon {
  case disc(String)
  case symbol(String)
  case tube
}

/// What a lit tile glows with: the light's own colour for the WiZ bulbs and the
/// tube (the warm white of the app icon), cool cyan for the AC and fan.
private enum TileGlow {
  case warm
  case cool

  var color: Color {
    switch self {
    case .warm: return Color(red: 1.0, green: 0.796, blue: 0.541)  // #FFCB8A
    case .cool: return Color(red: 0.541, green: 0.871, blue: 1.0)  // #8ADEFF
    }
  }
}

/// The widget's palette: a pure black widget, buttons a shade above it, no
/// borders. A lit button carries its glow in from the top-left corner.
private enum Palette {
  static let tile = Color(red: 0.071, green: 0.071, blue: 0.078)  // #121214
  static let disc = Color(red: 0.141, green: 0.141, blue: 0.149)  // #242426
  static let offLabel = Color(red: 0.557, green: 0.557, blue: 0.576)  // #8E8E93
  static let offValue = Color(red: 0.388, green: 0.388, blue: 0.4)  // #636366
  static let offGlyph = Color(red: 0.282, green: 0.282, blue: 0.29)  // #48484A
  static let onLabel = Color.white.opacity(0.72)
}

struct RoomWidgetView: View {
  @Environment(\.widgetFamily) private var family

  let entry: RoomWidgetEntry

  private var isSmall: Bool { family == .systemSmall }

  /// One corner radius for every button in a layout. The small one is
  /// concentric with the widget's own corner (about 22pt, inset by 9pt).
  private var tileRadius: CGFloat { 13 }

  var body: some View {
    if family == .accessoryCircular {
      lockScreenDoor
        .containerBackground(for: .widget) { AccessoryWidgetBackground() }
    } else {
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
  }

  /// Whether anything in the room is on. Decides which scene the door offers.
  private var occupied: Bool {
    let room = entry.room
    return room.acReading.isOn || room.lightsReading.isOn
      || room.fanReading.isOn || room.tubeReading.isOn
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
    HStack(spacing: 8) {
      sceneButton
        .frame(width: 104)

      // AC and Fan split the column evenly.
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
    .padding(12)
  }

  // MARK: - Device tiles

  private func acTile(compact: Bool) -> some View {
    deviceTile(
      name: "AC",
      icon: .disc("air.conditioner.horizontal.fill"),
      glow: .cool,
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
      icon: .disc("fan.ceiling.fill"),
      glow: .cool,
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
      glow: .warm,
      reading: entry.room.tubeReading,
      failed: entry.room.tubeFailed,
      onIntent: TubeOnIntent(),
      offIntent: TubeOffIntent()
    )
  }

  private var lightsTile: some View {
    deviceTile(
      name: "Lights",
      icon: .symbol("lightbulb.2.fill"),
      glow: .warm,
      reading: entry.room.lightsReading,
      failed: entry.room.lightsFailed,
      onIntent: LightsOnIntent(),
      offIntent: LightsOffIntent()
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
    let lit = reading.isOn
    let warm = TileGlow.warm.color

    return ZStack {
      Text("Tube")
        .font(.system(size: 11, weight: .semibold))
        .foregroundStyle(lit ? Color.white : Palette.offLabel)
        .lineLimit(1)
        .invalidatableContent()

      HStack {
        tubeGlyph(lit: lit, height: 16)
        Spacer(minLength: 0)
        if failed {
          Self.failureMark.font(.system(size: 11, weight: .semibold))
        }
      }
      .padding(.horizontal, 13)
    }
    .frame(maxWidth: .infinity)
    .frame(height: 32)
    .background {
      tileShape.fill(Palette.tile)
      if lit {
        tileShape.fill(
          LinearGradient(
            colors: [warm.opacity(0.34), warm.opacity(0.08)],
            startPoint: .leading,
            endPoint: .trailing
          )
        )
      }
    }
  }

  /// The value is both the readout and the control, so a tile that shows state
  /// needs no separate "off" twin. An unobserved tile offers to turn the device
  /// on, which is the useful guess when we cannot know.
  @ViewBuilder
  private func deviceTile<On: AppIntent, Off: AppIntent>(
    name: String,
    icon: TileIcon,
    glow: TileGlow,
    reading: DeviceReading,
    failed: Bool = false,
    compact: Bool = false,
    onIntent: On,
    offIntent: Off
  ) -> some View {
    let value = (reading == .unknown ? "unknown" : reading.text) + (failed ? ", last command not confirmed" : "")
    if reading.isOn {
      Button(intent: offIntent) {
        tileBody(name: name, icon: icon, glow: glow, reading: reading, failed: failed, compact: compact)
      }
      .buttonStyle(.plain)
      .accessibilityLabel(name)
      .accessibilityValue(value)
    } else {
      Button(intent: onIntent) {
        tileBody(name: name, icon: icon, glow: glow, reading: reading, failed: failed, compact: compact)
      }
      .buttonStyle(.plain)
      .accessibilityLabel(name)
      .accessibilityValue(value)
    }
  }

  private func tileBody(
    name: String,
    icon: TileIcon,
    glow: TileGlow,
    reading: DeviceReading,
    failed: Bool = false,
    compact: Bool = false
  ) -> some View {
    let lit = reading.isOn
    // A half-height tile has room for a single line of value, not the big one.
    let valueSize: CGFloat = compact ? 18 : (isSmall ? 18 : 24)

    return VStack(alignment: .leading, spacing: 0) {
      HStack(spacing: 4) {
        Text(name)
          .font(.system(size: 11, weight: .semibold))
          .foregroundStyle(lit ? Palette.onLabel : Palette.offLabel)
          .lineLimit(1)
          .minimumScaleFactor(0.7)
          .layoutPriority(1)

        Spacer(minLength: 2)

        if failed {
          // The last command was not confirmed: the value is a best guess.
          Self.failureMark.font(.system(size: 12, weight: .semibold))
        } else {
          tileGlyph(icon, glow: glow, lit: lit)
        }
      }

      Spacer(minLength: 4)

      Text(reading.text)
        .font(.system(size: valueSize, weight: .semibold))
        .monospacedDigit()
        .foregroundStyle(lit ? Color.white : Palette.offValue)
        .lineLimit(1)
        .minimumScaleFactor(0.6)
        // Shown as pending from the tap until the timeline reloads, so a slow
        // command reads as "working" rather than "ignored".
        .invalidatableContent()
    }
    .padding(.horizontal, isSmall ? 8 : 10)
    .padding(.vertical, isSmall ? 8 : 9)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    .background { tileBackground(glow: glow, lit: lit) }
  }

  @ViewBuilder
  private func tileGlyph(_ icon: TileIcon, glow: TileGlow, lit: Bool) -> some View {
    switch icon {
    case let .disc(systemName):
      let size: CGFloat = isSmall ? 20 : 22
      Image(systemName: systemName)
        .font(.system(size: isSmall ? 10 : 11, weight: .semibold))
        .foregroundStyle(lit ? Color.black : Palette.offLabel)
        .frame(width: size, height: size)
        .background(Circle().fill(lit ? glow.color : Palette.disc))
        .shadow(color: lit ? glow.color.opacity(0.5) : .clear, radius: 5)
    case let .symbol(systemName):
      Image(systemName: systemName)
        .font(.system(size: isSmall ? 13 : 15, weight: .semibold))
        .foregroundStyle(lit ? glow.color : Palette.offGlyph)
        .shadow(color: lit ? glow.color.opacity(0.75) : .clear, radius: 4)
    case .tube:
      tubeGlyph(lit: lit, height: 15)
    }
  }

  private func tubeGlyph(lit: Bool, height: CGFloat) -> some View {
    Capsule()
      .fill(lit ? Color.white : Color.white.opacity(0.3))
      .frame(width: 5, height: height)
      .shadow(color: lit ? Color.white.opacity(0.6) : .clear, radius: 4)
  }

  /// Grey for every button; a lit one adds its glow from the top-left corner.
  @ViewBuilder
  private func tileBackground(glow: TileGlow, lit: Bool) -> some View {
    tileShape.fill(Palette.tile)
    if lit {
      tileShape.fill(
        RadialGradient(
          stops: [
            .init(color: glow.color.opacity(glow == .warm ? 0.40 : 0.32), location: 0),
            .init(color: glow.color.opacity(0.07), location: 0.6),
            .init(color: .clear, location: 1),
          ],
          center: .topLeading,
          startRadius: 0,
          endRadius: 140
        )
      )
    }
  }

  // MARK: - Scene

  /// One button for both scenes. While anything is on it offers Leave Room,
  /// with the door open and lit; once everything is off it offers Enter Room,
  /// the door shut with light under it.
  @ViewBuilder
  private var sceneButton: some View {
    if occupied {
      Button(intent: LeaveRoomIntent()) { sceneBody(title: "Leave", open: true) }
        .buttonStyle(.plain)
        .accessibilityLabel("Leave Room")
    } else {
      Button(intent: EnterRoomIntent()) { sceneBody(title: "Enter", open: false) }
        .buttonStyle(.plain)
        .accessibilityLabel("Enter Room")
    }
  }

  private func sceneBody(title: String, open: Bool) -> some View {
    VStack(alignment: .leading, spacing: 0) {
      DoorGlyph(open: open)
        .frame(width: 22, height: 30)
      Spacer(minLength: 4)
      Text(title)
        .font(.system(size: 16, weight: .semibold))
        .foregroundStyle(Color.white)
        .lineLimit(1)
        .invalidatableContent()
    }
    .padding(11)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    .background(tileShape.fill(Palette.tile))
  }

  /// The Lock Screen circle: the same door and the same choice as the medium
  /// widget's scene button, drawn in the Lock Screen's single colour.
  @ViewBuilder
  private var lockScreenDoor: some View {
    if occupied {
      Button(intent: LeaveRoomIntent()) { LockScreenDoorGlyph(open: true) }
        .buttonStyle(.plain)
        .accessibilityLabel("Leave Room")
    } else {
      Button(intent: EnterRoomIntent()) { LockScreenDoorGlyph(open: false) }
        .buttonStyle(.plain)
        .accessibilityLabel("Enter Room")
    }
  }

  /// Replaces a tile's icon when its last command was not confirmed.
  private static var failureMark: some View {
    Image(systemName: "exclamationmark.triangle.fill")
      .foregroundStyle(Color(red: 1.0, green: 0.45, blue: 0.38))
  }

  private var tileShape: RoundedRectangle {
    RoundedRectangle(cornerRadius: tileRadius, style: .continuous)
  }
}

/// The app icon's door, small. Open: a warm doorway with the dark door swung
/// in front of it. Shut: a dark door with a line of warm light beneath.
private struct DoorGlyph: View {
  let open: Bool

  var body: some View {
    GeometryReader { geo in
      let w = geo.size.width
      let h = geo.size.height
      let warm = TileGlow.warm.color
      if open {
        ZStack(alignment: .topLeading) {
          RoundedRectangle(cornerRadius: w * 0.08)
            .fill(LinearGradient(
              colors: [Color(red: 1.0, green: 0.945, blue: 0.863), warm],
              startPoint: .top,
              endPoint: .bottom
            ))
            .shadow(color: warm.opacity(0.5), radius: 4)
          Path { p in
            p.move(to: .zero)
            p.addLine(to: CGPoint(x: w * 0.5, y: h * 0.07))
            p.addLine(to: CGPoint(x: w * 0.5, y: h))
            p.addLine(to: CGPoint(x: 0, y: h * 0.93))
            p.closeSubpath()
          }
          .fill(Color(red: 0.102, green: 0.102, blue: 0.11))
        }
      } else {
        ZStack(alignment: .bottom) {
          RoundedRectangle(cornerRadius: w * 0.1)
            .fill(Color(red: 0.173, green: 0.173, blue: 0.18))
            .overlay(
              RoundedRectangle(cornerRadius: w * 0.1)
                .stroke(Palette.offGlyph, lineWidth: 1)
            )
          Capsule()
            .fill(warm.opacity(0.75))
            .frame(height: 1.5)
            .padding(.horizontal, 1)
            .offset(y: 2)
        }
      }
    }
  }
}

/// The door in one colour, for the Lock Screen. Open: a faint doorway with the
/// door swung solid in front of it. Shut: an outlined door with a handle and a
/// line of light beneath.
private struct LockScreenDoorGlyph: View {
  let open: Bool

  var body: some View {
    GeometryReader { geo in
      let w = geo.size.width
      let h = geo.size.height
      if open {
        ZStack(alignment: .topLeading) {
          RoundedRectangle(cornerRadius: w * 0.08).fill(Color.white.opacity(0.45))
          Path { p in
            p.move(to: .zero)
            p.addLine(to: CGPoint(x: w * 0.5, y: h * 0.11))
            p.addLine(to: CGPoint(x: w * 0.5, y: h))
            p.addLine(to: CGPoint(x: 0, y: h * 0.89))
            p.closeSubpath()
          }
          .fill(Color.white)
        }
      } else {
        ZStack(alignment: .bottom) {
          RoundedRectangle(cornerRadius: w * 0.1)
            .stroke(Color.white, lineWidth: 1.6)
            .padding(.bottom, 3.5)
          Circle()
            .fill(Color.white)
            .frame(width: 2.4, height: 2.4)
            .position(x: w * 0.75, y: h * 0.5)
          Capsule().fill(Color.white).frame(height: 1.6)
        }
      }
    }
    .frame(width: 13, height: 20)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .widgetAccentable()
  }
}

struct RoomActionsWidget: Widget {
  let kind = RoomConfig.widgetKind

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: RoomWidgetProvider()) { entry in
      RoomWidgetView(entry: entry)
    }
    .configurationDisplayName("Room")
    .description("AC, lights, fan and tube. The medium size adds Enter or Leave Room; on the Lock Screen it is just the door.")
    .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular])
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
    if #available(iOS 18.0, *) {
      RoomSceneControl()
      ACControl()
      LightsControl()
      FanControl()
      TubeControl()
    }
  }
}
