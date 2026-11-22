# Lessons

## Always open `homecontrol.xcworkspace`, never `homecontrol.xcodeproj`

**Symptom:** `error: no such module 'Expo'`, plus `module map file '.../Expo.modulemap' not found`
for every Expo/React pod.

**Why:** CocoaPods puts the `Pods` project in the *workspace*. Opening the bare `.xcodeproj` builds only
`homecontrol` and `RoomWidgets`, so `libPods-homecontrol.a` and every pod modulemap are absent. The two
files sit side by side in `home-control/ios/`, and Xcode reopens whichever was opened last.

**How to spot it fast:** the build log's target list. A good build names targets
`from project 'Pods'`; a bad one only ever says `from project 'homecontrol'`. Each entry point also gets
its own DerivedData directory, so a sudden new `homecontrol-<hash>` folder is the same tell.

**Rule:** when a build fails on missing pod modules, check which file was opened before touching any code.

## The Metro server on :8081 may belong to a different project

**Symptom:** app launches, then `Unhandled JS Exception: Property 'MessageQueue' doesn't exist`
inside `setUpDefaltReactNativeEnvironment` — i.e. React Native's own startup code, before any app code runs.

**Why:** a debug build asks for its bundle from port 8081 on the LAN host. Whatever Metro happens to own
that port answers, regardless of which project it was started in. A bundle built against another app's
React Native version blows up inside RN internals when run on this app's native binary.

**How to spot it fast:**
- Query params in the error URL that do not match this project's config. `transform.reactCompiler=true`
  and `transform.routerRoot=app` appeared here; Room has neither React Compiler nor expo-router.
- `lsof -a -p $(lsof -nP -iTCP:8081 -sTCP:LISTEN -t) -d cwd -Fn` prints the serving project's directory.
- Fetch the bundle and grep for a string only this app contains (`grep -c "Leave Room"`). Zero hits
  means it is not this app's bundle.

**Rule:** before debugging a JS startup crash, confirm which project is serving :8081.

## Tuya credentials live in one place now

`home-control/secrets.json` (untracked) is the only file to edit. `npm run secrets` — or any
`npm install`, via `postinstall` — regenerates the four consumers:

```
home-control/app/config.secrets.ts
home-control/ios/RoomWidgetShared/RoomSecrets.swift
room-widget-mac/Sources/Shared/RoomSecrets.swift
room-desktop/src/main/secrets.cjs
```

All five files are gitignored. On EAS there is no `secrets.json`, so the generator reads
`ROOM_TUYA_CLIENT_ID`, `ROOM_TUYA_CLIENT_SECRET`, `ROOM_TUYA_API_BASE_URL`, `ROOM_TUYA_INFRARED_ID`
and `ROOM_TUYA_AC_REMOTE_ID` first — set them with `eas secret:create` before the next cloud build.

With neither source present it warns and writes empty strings rather than failing the build;
`isTuyaConfigured()` then reports the app as unconfigured, which is the honest outcome.

## Building for iOS 27 with Xcode 27

Four things broke together the first time this project met Xcode 27 and an iOS 27 phone.

- **Crash on launch, exit is clean, no JS output.** The crash report's top frame is
  `UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption`. iOS 27 kills any app built with the
  iOS 27 SDK that has not adopted the UIScene lifecycle. Fix: `UIApplicationSceneManifest` in `Info.plist`
  and a `SceneDelegate` (in `AppDelegate.swift`, so `project.pbxproj` needs no new file) that creates the
  window and calls `startReactNative`. Get crash reports with
  `xcrun devicectl device copy from --device <id> --domain-type systemCrashLogs --source / --destination <dir>`.
- **"No script URL provided".** Expo's launcher normally injects the packager address; building with
  `xcodebuild` does not. Debug builds read `RoomPackagerHost` (build setting `ROOM_PACKAGER_HOST`, the Mac's
  `<LocalHostName>.local:8081`) and set `RCTBundleURLProvider.jsLocation`. Release leaves it empty.
- **`error: IPHONEOS_DEPLOYMENT_TARGET is set to 12.0`.** Xcode 27 supports 15.0 and up; a few pods still say
  12.0. The Podfile `post_install` lifts any pod target below the app's own target.
- **`expo run:ios` fails with "Can't determine id of Simulator app".** Xcode 27 no longer ships
  Simulator.app inside Xcode, and Expo's launcher looks for it even for a device. Build with `xcodebuild`
  and install with `xcrun devicectl device install app`, then start Metro separately.

The dev build is `Room (Dev)`, bundle id `org.name.homecontrol.dev` (widgets `.dev.widgets`), so it installs
beside the real app instead of replacing it. Release keeps `org.name.homecontrol`.

## A CSS-in-a-mockup bug is a real bug

A class reused for two different things (`.row` for both the Mode/Airflow pair and the Fan/Tube row) made a
flex rule meant for one stretch the other. When a mockup looks wrong, look for shared class names before
tweaking numbers.

## Two agents in one repo break each other

Codex was committing to this repo and reinstalling `node_modules` while I worked. Symptoms: files I edited
showed as already committed, files I never touched changed, and Metro (started by the other agent before its
own reinstall) failed with `Unable to resolve .../metro-runtime/src/modules/empty-module.js`.

- Before editing, `git status` and `git log -3`, and re-read any file that reports it changed on disk.
- A "Bundling failed ... Unable to resolve <node_modules path>" right after a dependency change means the
  running Metro is stale, not that the code is wrong: restart it (`--clear`) before debugging further.
- `npm install --package-lock-only --ignore-scripts` edits the lock without touching `node_modules`, which is
  safe while Xcode or Metro is running.
- Render SwiftUI to a PNG on the Mac to check a widget when there is no Simulator: compile the widget file
  plus the shared Swift files with a small `main.swift` that uses `ImageRenderer`.

## Siri parameter prompts need explicit async branches

Swift's `??` right-hand side is an autoclosure and cannot await an App Intents
`requestValue` call. Use `if let` for the supplied parameter and an explicit
`else { try await ...requestValue(...) }` for the prompt. Typecheck against the
actual iOS SDK before relying on a Foundation-only test or Swift parse check.

## Scheduled scenes need a separate cloud restore lifecycle

A room scene can restore every cloud device successfully while local WiZ bulbs
remain unavailable. Do not let those unsupported bulb steps keep cloud state
permanently away: the next Leave must capture current cloud device settings.
Keep the partial result and failure alert while advancing the supported-device
restore lifecycle. Verify Leave → partial Enter → changed device → Leave.

## APNs environment follows signing, not build optimization

A Release build installed directly through Xcode can carry the development
push entitlement. Check the signed app with `codesign -d --entitlements :-`
and use the corresponding APNs endpoint. Keep the entitlement and the app's
registration environment driven by the same build setting, and override it to
production when signing for distribution.

## Verify existing Siri phrases before replacing App Shortcut registrations

The schedule rollout replaced the separate Lights On and Lights Off App
Shortcuts and removed the phrases for individual light groups. Keep the known
working provider as the baseline. Expose experimental scheduling actions in
Shortcuts until the new voice entry and the existing commands have both been
tested on the physical iPhone. A successful metadata build does not verify
Siri routing.

## Renewing Room’s Tuya IoT Core trial

When Soumya asks how to renew IoT Core, give the [existing Room subscription](https://platform.tuya.com/cloud/products/detail?abilityId=1442730014117204014&id=p1776359624929ykj3hf&abilityAuth=0&tab=1) and tell them to renew the existing trial period. Skip the option to start a new trial.

## On iOS 27, Apple Home claims "Turn …" phrases about lights and the AC

Siri voice commands stopped reaching Room while each shortcut still worked when tapped. The
code was not the cause: with the schedule intent and `updateAppShortcutParameters()` compiled
out, Siri still answered through Home. "Enter Room" worked, so Siri knew the app. Phrases that
open with the app name ("Room AC off", "Room fan off") worked; "Turn off Room lights" went to
Home. Fix: give every device shortcut a phrase that starts with `\(.applicationName)`.

Diagnose in this order on the phone before editing phrases: does a non-device phrase ("Enter
Room") work, and does an app-name-first phrase work? Removing the stale Room (Dev) install and
compiling out new intents both changed nothing. Debug builds are now "Room Dev" anyway, so two
installs never share a name.
