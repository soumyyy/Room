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
