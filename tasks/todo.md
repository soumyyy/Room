# Room — iOS widget + Expo fixes

Scope: audit findings 2–5 from the 2026-09-03 audit, plus a widget redesign.

## Done

- [x] **2 · Widget could not reach the lights.** Added `NSLocalNetworkUsageDescription` to
      `ios/RoomWidgetConfig/RoomWidgetInfo.plist`. The extension sends UDP to 192.168.29.x but only the
      main app declared the usage string; extensions need it in their own plist or the sends are denied
      silently while the cloud-backed AC actions keep working.
- [x] **3 · Widget intent hung forever off Wi-Fi.** `WiZClient.send` handled only `.ready`/`.failed`, so
      `.waiting(ENETUNREACH)` stranded the continuation. Now handles `.waiting`/`.cancelled`, adds a 2 s
      deadline (`RoomConfig.wizSendTimeout`), and guards resume with a lock. Also made `apply` tolerant:
      one unreachable bulb no longer fails the whole action.
- [x] **4 · Siri phrases never registered.** `RoomIntents.swift` compiled only into the widget target, but
      `AppShortcutsProvider` has to live in the app. Added the five shared Swift files to the app target's
      sources phase and gated the intents with `@available(iOS 16.0, *)` so the app's 15.1 deployment
      target still builds.
- [x] **5 · "Leave Room" deadened the whole UI.** Removed the invisible `absoluteFillObject` Pressable in
      `AppScreen.tsx` that swallowed every tap while out of the room, plus its style.
- [x] **Widget redesign — direction A shipped.** Rewrote `RoomWidget.swift`: scenes take the top third and
      the only colour, AC and Lights become named rows with a segmented On/Off. Two accents only, mapped
      to the physical domains (amber = WiZ, cyan = AC).
- [x] **Split the shortcuts provider.** Fix 4 put `RoomIntents.swift` — provider included — into both
      targets, so app and extension each registered 6 App Shortcuts claiming the same phrases. Moved
      `RoomShortcutsProvider` to `RoomWidgetShared/RoomShortcuts.swift`, app target only. Verified:
      `Room.app` 6 shortcuts / 6 actions, `RoomWidgets.appex` 0 shortcuts / 6 actions.
- [x] **Colour sheet filter + swatch accuracy.** Replaced the dead `ring`/`angle` radial-dial fields with
      `kind: 'white' | 'color'`, so all 11 colours render instead of 8 and the 3 unreachable pastels appear.
      Corrected the three white swatches to the sRGB renderings of the temperatures they actually send
      (2700 K `#ffa757`, 4200 K `#ffd3af`, 6500 K `#fffefa` — each was about one step too cool). Pastels now
      drive the bulb's white LED for the shared component and RGB for the residual chroma. Padded the short
      final palette row so `flex: 1` tiles keep an even width. Deleted `getColorNodePosition` and the five
      geometry constants it was the only reader of.
- [x] Prototypes published: https://claude.ai/code/artifact/ae0388bd-d419-40b7-80ac-3ffdbd935350

## Done — Siri control (AC temperature + lights)

Constraint that shapes it: App Shortcut phrases can only interpolate `AppEnum`/`AppEntity` parameters,
not a bare `Int`. Spoken values therefore need enums; the Shortcuts app can still take free `Int` input.

- [x] `TuyaClient.fetchACScene()` — GET `ac/status`, with a `LooseInt` decoder because Tuya returns these
      fields as numbers on some remotes and numeric strings on others; same field precedence as app/tuya.ts
- [x] `RoomController.amendScene` — read, edit one field, send the whole scene back, forcing power on
- [x] 7 `AppEnum`s: `ACTemperature` (16–30), `ACModeOption`, `FanSpeedOption`, `LightGroup`,
      `TemperatureShift`, `BrightnessStep`, `LightColorOption` (all 14 presets)
- [x] 6 new intents: `SetACTemperature`, `AdjustACTemperature`, `SetACMode`, `SetFanSpeed`,
      `SetLightBrightness`, `SetLightColor`; `LightsOn`/`LightsOff` gained a `LightGroup` parameter
- [x] `BulbConfig.group` + `RoomConfig.bulbs(inGroup:)` mirroring BULB_GROUPS
- [x] 10 spoken shortcuts (Apple's recommended ceiling). `SetACMode`/`SetFanSpeed` are intentionally not
      spoken shortcuts — still available in the Shortcuts app
- [ ] Decide the `seafoam`/`lavender`/`blush` question: expose them in the app's colour sheet, or cut them,
      — RESOLVED: filter fixed, all 14 presets reachable, so a `LightColor` enum can expose the same set

Verified from the built bundle: `Room.app` carries 10 autoShortcuts, 12 actions, 7 enums; the extension
carries 0 shortcuts but all 12 actions, so widget buttons still run in-process. Both targets build.

Still unverified: no Siri phrase has been spoken, and no Tuya `ac/status` response has been parsed against
the real remote — `LooseInt` and the field precedence are modelled on app/tuya.ts, not on a captured
response.

## Done — App Group + snapshot

- [x] `com.apple.security.application-groups` = `group.org.name.homecontrol` on both targets.
      `homecontrol/Room.entitlements` was an empty `<dict/>`; the widget had no entitlements file at all,
      so `RoomWidgetConfig/RoomWidgets.entitlements` is new and `CODE_SIGN_ENTITLEMENTS` is wired into both
      widget build configs.
- [x] `RoomSnapshot` — AC scene plus per-group light state, every field optional-by-absence so a room we
      have never observed reports `nil` rather than `false`.
- [x] `RoomSnapshotStore` — synchronous shared-container read/write with a lock around read-modify-write.
      Dropped an `isAvailable` check I first wrote: `UserDefaults(suiteName:)` returns a usable object even
      without the entitlement, so it could never have detected a missing App Group. An absent `updatedAt`
      is the honest signal.
- [x] `RoomController.record` after every successful mutation — 10 call sites, including `acStatus()`, so a
      read refreshes the widget too.
- [x] Widget reads it: entry carries the snapshot, timeline is `.after(15 min)` instead of `.never`, and the
      device rows now light the segment that reflects reality. Unknown lights neither segment.
- [x] 28 assertions over the snapshot, group resolution, scene clamping, store round-trip and presets,
      compiled and run natively — all pass.

## Done — native bridge + foreground refresh

- [x] `RoomSnapshotBridge` (Swift + `.m` via `RCT_EXTERN_MODULE`), app target only. Exposes `recordAC` and
      `recordLights`, and calls `reloadTimelines` — from the foreground app that reload is immediate and is
      not charged against the widget's refresh budget.
- [x] `app/roomSnapshot.ts` — every call guarded and swallowing errors, since a stale widget must never be
      able to break the app. Absent on Android and in Expo Go.
- [x] Wired into the three choke points in `AppScreen.tsx`: `loadStatus`, `submitAcScene` (both the
      confirmed and fallback branches) and `runGroupCommand`. `applyPreset` passes its `presetId` through a
      new optional argument.
- [x] Foreground refresh via `AppState` — audit finding 7. Without it the app would show whatever it last
      rendered and send those stale values back after any Siri or widget change.

Note: file references for the bridge needed `name` + `path = homecontrol/...` because the `homecontrol`
PBXGroup is virtual — its children carry the full relative path. A bare `path` made Xcode look in `ios/`.

## Verified since

- [x] Room's JS bundles cleanly with all the new code — served on a spare port and grepped:
      `RoomSnapshotBridge`, `recordLights`, `Seafoam`, `Warm White` and the bulb IPs all present.

- [x] App Group is live on both App IDs. Decoded from the team provisioning profiles Xcode fetched:
      `org.name.homecontrol` and `org.name.homecontrol.widgets` both carry
      `com.apple.security.application-groups = ['group.org.name.homecontrol']`. Step 01 is done.

## Done — direction C tiles

- [x] Widget rebuilt as the Live Grid: one tile per device showing its current reading, tapping toggles it.
      Four controls instead of six, because a tile that shows state needs no separate "off" twin.
- [x] `DeviceReading` lives in `RoomSnapshot`, not the view — it is domain logic, and putting it there made
      it testable natively. `unknown` / `off` / `on(value)` are three distinct cases: a fresh install shows
      an em dash rather than claiming the AC is off.
- [x] The tile picks its intent from state — lit tiles carry the Off intent, dark ones the On intent, and an
      unobserved tile offers On, which is the useful guess when we cannot know.
- [x] 37 assertions pass (28 snapshot/config + 9 tile readings). Both simulator and device SDKs build.

## Done — smaller audit findings + widget refresh

- [x] Finding 6: colour is now stored per real group id. Choosing on the combined tile wrote under `'all'`,
      which nothing read back, so the dot never changed — and the per-group sheets went stale too. With
      `'all'` open, a chip highlights only when every group agrees.
- [x] Finding 8: `toggleGroupPower` no longer pays for a status round trip before every tap. It uses what
      we already know and only reads when nothing has been observed yet; every command merges fresh
      statuses back in, so local state stays current.
- [x] 14 unused style keys removed (`AppScreen.tsx` 2045 → 1995 lines).
- [x] `UIUserInterfaceStyle` Light → Dark; the whole UI is black and system surfaces were rendering light.
- [x] `ITSAppUsesNonExemptEncryption: false` so App Store submission stops asking.
- [x] Toast no longer names `app/config.ts` at the user.
- [x] **Widget refresh.** `getTimeline` only re-rendered the stored snapshot, so the physical AC remote or
      the WiZ app left the tile wrong forever. `WiZClient.readGroupStates` adds a `getPilot` receive path
      and `RoomController.refresh()` folds both sources in. Each leg is independently optional — Tuya works
      on cellular, bulbs only on Wi-Fi — and anything that does not answer keeps its previous value, so a
      refresh can improve the snapshot but never degrade it. Tuya requests bounded to 6s (URLSession
      defaults to 60, longer than a widget refresh lives).
- [x] 43 assertions pass (28 snapshot/config + 9 readings + 6 aggregation).

## Done — dependency pass

- [x] Finding 9: `paddingTop: 54` guessed at one device — it overshot an SE's 20pt status bar and tucked
      content under a 59pt Dynamic Island. Now `insets.top + 8` via `react-native-safe-area-context`, with
      `SafeAreaProvider` added in `App.js` and `insets.bottom` on the scroll content so the last tile clears
      the home indicator.
- [x] Removed `react-native-tcp-socket` — confirmed unused (react-native-udp bundles its own buffer/events).
      Podfile.lock down one pod; verified the bundle has zero references to it.

## Done — one home for the Tuya credentials

- [x] `secrets.json` (untracked) + `scripts/gen-secrets.mjs` emit the four consumers; all generated files
      and the source are gitignored. No tracked file contains the secret any more.
- [x] Env vars win over the file, so EAS works without the untracked file — needs `eas secret:create` for
      `ROOM_TUYA_*` before the next cloud build.
- [x] Missing values warn and emit empty strings rather than breaking the build. `isTuyaConfigured()` now
      tests for non-empty instead of a `YOUR_` placeholder that no longer existed.
- [x] `RoomSecrets.swift` added to both iOS targets and both mac targets.

Note: `room-widget-mac` does not compile, and did not before this change — `RoomController.swift`
references a `RoomStateStore` that does not exist in that project, plus two type errors in its
`TuyaClient`. Verified by building the pre-change state. Its secrets wiring is consistent with the others
but could not be validated by a build.

## Done — AppScreen split + TypeScript tests

- [x] `AppScreen.tsx` 1998 → 1041 lines. Pulled out `roomDomain.ts` (types, constants, pure functions),
      `styles.ts` and `components/BrightnessSlider.tsx`.
- [x] `roomDomain.ts` imports nothing from react-native — that is the point, and it is what makes the
      screen's decisions testable at all.
- [x] 15 TypeScript assertions via `node --test`, wired into `npm test`. They compile to CommonJS in a temp
      dir because Node's ESM resolver will not follow the extensionless imports the app source uses;
      contorting app imports for the tests would have been the wrong trade.
- [x] Suite is now: tsc, 15 TS assertions, native wiring check, 49 Swift assertions.

## Verified — widget matches direction C

Checked the shipped `RoomWidget.swift` against the published Live Grid spec rather than assuming:
small is header + two device tiles + an Enter/Leave row; medium is a 122pt scene column beside the two
tiles; tiles carry name and glyph on top with the value below; scenes stay neutral so the only colour on
the canvas is device state. Type sizes, radii and the 122pt column all match the prototype.

One deliberate addition beyond the prototype: the prototype only drew on and off, while the shipped tile
has a third state — an em dash when nothing has been recorded yet.
## Done — Expo SDK 55 (branch `expo-55`)

Latest Expo is 57.0.19 (55.0.31 / 56.0.21 also stable). Went to 55 rather than straight to 57: SDK 55 is
where the old architecture is *removed*, and `react-native-udp@4.1.7` — which every light runs through —
was last published January 2023, has no `codegenConfig` and no new-arch hooks in its podspec. Taking that
cliff on its own makes any breakage attributable.

- [x] expo 54.0.33 → ^55.0.0, RN 0.81.5 → 0.83.10, React 19.1.0 → 19.2.0
- [x] New Architecture enabled in `app.json`, `Podfile.properties.json` and `Info.plist`
- [x] `AppDelegate.swift`: imports made `internal` to match Expo's generated `ExpoModulesProvider.swift`,
      which forced the class to internal too; removed the stale `bindReactNativeFactory(factory)` call that
      SDK 55 dropped
- [x] Simulator and device SDKs build; 49/49 assertions pass; JS bundles (765 modules)

**Unverified and the whole risk of this branch:** react-native-udp compiles and links under the new
architecture, but whether UDP actually works through the TurboModule interop layer can only be shown by
tapping a light on a device. If it does not, the fallback is staying on SDK 54 or replacing that module.

## Remaining — direction C (chosen)

- [ ] `TuyaClient.fetchACStatus()` + a `getPilot` receive path in `WiZClient`
- [ ] Read-after-write inside each intent's `perform()`: send, re-read the device, write the snapshot,
      return — this is the only moment the extension is genuinely alive, so it's where accuracy comes from
- [ ] `reloadAllTimelines()` from the app whenever `AppScreen.tsx` commits a change (immediate, unbudgeted)
- [ ] Real `TimelineProvider` replacing the single `.never` entry
- [ ] Refresh `AppScreen.tsx` on foreground — it loads status once on mount, so a Siri or widget change
      leaves the app showing stale numbers it will happily send back (audit finding 7)
- [ ] Verify on a real Home Screen, and the phrases with Siri *(needs a device)*

## Review

Verified by build, not by assertion: `xcodebuild -target RoomWidgets` and
`xcodebuild -workspace homecontrol.xcworkspace -scheme homecontrol` both succeed, and
`Room.app/Metadata.appintents/extract.actionsdata` now contains all six intents — proof fix 4 landed,
since that file did not exist before. `tsc --noEmit` clean.

Needs a device check: the pastel presets now send WiZ's `c`/`w` white-LED channels alongside RGB. That is
how an RGBCW bulb produces a desaturated colour, and every swatch reconstructs exactly from its params, but
I could not confirm the firmware honours those keys. If Seafoam/Lavender/Blush come out wrong, reverting is
one edit — drop `c`/`w` and restore the plain `r`/`g`/`b` triples. Worst case is three presets that were
unreachable before looking wrong.

CONFIRMED ON DEVICE (2026-09-03, iPhone 17): the widget renders and its tiles show live state; the lights
respond, so the widget's local-network fix works; the App Group is live in both directions; and cold start
is visibly faster since the splash stopped waiting on the network.

Two bugs that only hardware found, both now fixed: WidgetKit's own content margins shrank the layout and
truncated "Lights", and `recordLights` declared a nullable NSNumber, which React Native rejects — null is
what a plain on/off toggle sends, so it would have written a brightness of 10 that nobody chose.

Superseded, kept for the record: nothing has been run on a device or simulator Home Screen. Widget rendering, whether the
intents actually fire, and whether fix 2 truly unblocks the UDP sends are all unconfirmed until installed.

Left undone deliberately: audit findings 1 (Tuya client secret committed and shipped in the IPA — needs a
key rotation and a signing proxy), 6–9, and the cleanup list.

## Open

- [ ] `expo-55`: one tap on a light on device, to prove react-native-udp survives the New Architecture.
      Nothing else gates catching up to SDK 57.
- [ ] Two remaining bulb MACs, then four DHCP reservations. `npm run bulbs` reports and verifies.
- [ ] `eas secret:create` for the five `ROOM_TUYA_*` vars before the next cloud build — without them the
      build succeeds and ships unconfigured.
- [ ] CI: 71 assertions and a native-wiring guard exist, and nothing runs them on push.
- [ ] Desktop and phone disagree on light presets (21 vs 15, different names).
- [ ] A Siri phrase, and whether Seafoam/Lavender/Blush read as pastel rather than oversaturated.
