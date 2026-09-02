// Assertions over the Foundation-only domain layer: RoomConfig + RoomSnapshot.
// Deliberately not an XCTest bundle — these types have no UIKit or WidgetKit
// dependency, so they compile and run natively in about a second, which means
// they actually get run.

import Foundation

// Swift only allows top-level expressions in a file called main.swift, so the
// suite hangs off an explicit entry point instead.
@main
struct RoomDomainTests {
  static var failures = 0
  static var checks = 0

  static func check(_ label: String, _ ok: Bool) {
    checks += 1
    if !ok {
      failures += 1
      print("  FAIL  \(label)")
    }
  }

  static func section(_ name: String) { print("\n\(name)") }

  static func main() throws {
    // MARK: - Unknown is not off

    section("snapshot: absence vs. off")
    check("unknown ac is nil", RoomSnapshot.unknown.acIsOn == nil)
    check("unknown lights are nil", RoomSnapshot.unknown.anyLightOn == nil)
    check("unknown brightness is nil", RoomSnapshot.unknown.litBrightness == nil)

    var off = RoomSnapshot.unknown
    off.ac = RoomConfig.acOffScene
    off.setLights(.init(isOn: false), forGroups: RoomConfig.lightGroupIDs)
    check("off ac is false", off.acIsOn == false)
    check("off lights are false", off.anyLightOn == false)
    check("nothing lit means no brightness", off.litBrightness == nil)

    var partial = RoomSnapshot.unknown
    partial.setLights(.init(isOn: true, brightness: 60), forGroups: ["left"])
    partial.setLights(.init(isOn: false), forGroups: ["right"])
    check("one lit group means lights are on", partial.anyLightOn == true)
    check("brightness ignores dark groups", partial.litBrightness == 60)

    // MARK: - Persistence

    section("snapshot: codable + store")
    var full = RoomSnapshot.unknown
    full.ac = AcScene(power: 1, mode: 0, temp: 22, wind: 2)
    full.setLights(.init(isOn: true, brightness: 68, presetID: "seafoam"), forGroups: ["left", "right"])
    full.updatedAt = Date(timeIntervalSince1970: 1_700_000_000)

    let encoded = try JSONEncoder().encode(full)
    let decoded = try JSONDecoder().decode(RoomSnapshot.self, from: encoded)
    check("round trips equal", decoded == full)
    check("preset survives the round trip", decoded.lights["left"]?.presetID == "seafoam")

    let suite = "test.room.snapshot.\(UUID().uuidString)"
    UserDefaults().removePersistentDomain(forName: suite)
    if let store = UserDefaults(suiteName: suite) {
      func save(_ value: RoomSnapshot) { store.set(try! JSONEncoder().encode(value), forKey: "k") }
      func load() -> RoomSnapshot {
        guard let data = store.data(forKey: "k") else { return .unknown }
        return (try? JSONDecoder().decode(RoomSnapshot.self, from: data)) ?? .unknown
      }

      save(full)
      var edited = load()
      edited.setLights(.init(isOn: false), forGroups: ["right"])
      save(edited)

      let after = load()
      check("a right-only write leaves left alone", after.lights["left"]?.isOn == true)
      check("a right-only write lands", after.lights["right"]?.isOn == false)
      check("the ac survives a lights-only edit", after.ac == full.ac)
    }
    UserDefaults().removePersistentDomain(forName: suite)

    // MARK: - Groups

    section("config: group resolution")
    check("nil addresses every group", RoomConfig.groupIDs(inGroup: nil) == RoomConfig.lightGroupIDs)
    check("\"all\" addresses every group", RoomConfig.groupIDs(inGroup: "all") == RoomConfig.lightGroupIDs)
    check("a named group addresses itself", RoomConfig.groupIDs(inGroup: "left") == ["left"])
    check("an unknown group addresses nothing", RoomConfig.groupIDs(inGroup: "kitchen").isEmpty)
    check("left holds two bulbs", RoomConfig.bulbs(inGroup: "left").count == 2)
    check("all holds every bulb", RoomConfig.bulbs(inGroup: nil).count == RoomConfig.bulbs.count)
    check("every bulb belongs to a known group",
          RoomConfig.bulbs.allSatisfy { RoomConfig.lightGroupIDs.contains($0.group) })
    check("bulb ids are unique", Set(RoomConfig.bulbs.map(\.id)).count == RoomConfig.bulbs.count)
    check("bulb ips are unique", Set(RoomConfig.bulbs.map(\.ip)).count == RoomConfig.bulbs.count)

    // MARK: - Scene amendment

    section("config: scene clamping")
    let base = AcScene(power: 0, mode: 0, temp: 24, wind: 1)
    check("temp clamps to the ceiling", base.with(temp: 44).temp == RoomConfig.maxTemp)
    check("temp clamps to the floor", base.with(temp: 2).temp == RoomConfig.minTemp)
    check("an edit leaves other fields alone", base.with(temp: 21).wind == base.wind)
    check("an invalid mode falls back", base.with(mode: 99).mode == RoomConfig.acOnScene.mode)
    check("power can be forced on", base.with(temp: 21).with(power: 1).power == 1)
    check("brightness clamps low", RoomConfig.clampBrightness(0) == RoomConfig.minBrightness)
    check("brightness clamps high", RoomConfig.clampBrightness(400) == RoomConfig.maxBrightness)

    // MARK: - Presets

    section("config: light presets")
    check("fourteen presets", RoomConfig.lightPresets.count == 14)
    check("ids are unique", Set(RoomConfig.lightPresets.map(\.id)).count == RoomConfig.lightPresets.count)
    check("a pastel drives the white channel", RoomConfig.preset(id: "blush")?.pilot.w == 198)
    check("an unknown preset is nil", RoomConfig.preset(id: "chartreuse") == nil)
    check("every preset turns the bulb on", RoomConfig.lightPresets.allSatisfy { $0.pilot.state })

    // MARK: - What the widget renders

    section("widget: tile readings")
    check("unknown renders an em dash", RoomSnapshot.unknown.acReading.text == "—")
    check("unknown lights render an em dash", RoomSnapshot.unknown.lightsReading.text == "—")
    check("unknown is not tappable-as-off", RoomSnapshot.unknown.acReading.isOn == false)
    check("off renders Off", off.acReading.text == "Off")
    check("off lights render Off", off.lightsReading.text == "Off")

    var lit = RoomSnapshot.unknown
    lit.ac = AcScene(power: 1, mode: 0, temp: 22, wind: 1)
    lit.setLights(.init(isOn: true, brightness: 68), forGroups: ["left"])
    lit.setLights(.init(isOn: false), forGroups: ["right"])
    check("on renders the setpoint", lit.acReading.text == "22°")
    check("on is tappable-as-off", lit.acReading.isOn)
    check("lights average only lit groups", lit.lightsReading.text == "68%")

    var noLevel = RoomSnapshot.unknown
    noLevel.setLights(.init(isOn: true), forGroups: ["left"])
    check("lit without a level falls back", noLevel.lightsReading.text == "100%")

    // MARK: - getPilot aggregation

    section("widget: folding bulb replies")
    check("silence is nil, never off", RoomSnapshot.groupState(from: []) == nil)
    check("all dark folds to off", RoomSnapshot.groupState(from: [
      WizReading(isOn: false, brightness: nil), WizReading(isOn: false, brightness: 40),
    ])?.isOn == false)
    check("any lit folds to on", RoomSnapshot.groupState(from: [
      WizReading(isOn: false, brightness: nil), WizReading(isOn: true, brightness: 80),
    ])?.isOn == true)
    check("brightness averages lit bulbs only", RoomSnapshot.groupState(from: [
      WizReading(isOn: true, brightness: 60), WizReading(isOn: true, brightness: 80),
      WizReading(isOn: false, brightness: 10),
    ])?.brightness == 70)
    check("one reply is enough", RoomSnapshot.groupState(from: [
      WizReading(isOn: true, brightness: 50),
    ])?.isOn == true)
    check("lit without dimming reports no level", RoomSnapshot.groupState(from: [
      WizReading(isOn: true, brightness: nil),
    ])?.brightness == nil)

    print("\n\(checks - failures)/\(checks) passed")
    if failures > 0 {
      print("\(failures) FAILED")
      exit(1)
    }
  }
}
