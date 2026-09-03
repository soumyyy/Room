# Room

Controls one room: four WiZ bulbs over UDP on the local network, and an air
conditioner through a Tuya IR blaster in the cloud. Ships as an Expo app, a
WidgetKit widget, and a set of Siri shortcuts that all drive the same intents.

## Setup

```sh
npm install                 # also generates config — see below
npx pod-install
open ios/homecontrol.xcworkspace
```

**Open the `.xcworkspace`, never `homecontrol.xcodeproj`.** CocoaPods puts the
Pods project in the workspace; the bare project builds without it and fails with
`no such module 'Expo'`.

## Configuration

Two files feed a generator, so nothing is pasted into four projects by hand:

| File | Tracked | Holds |
| --- | --- | --- |
| `secrets.json` | no | Tuya client id, secret, IR blaster and remote ids |
| `devices.json` | yes | bulb ids, names, IPs and their groups |

`npm run secrets` regenerates the per-platform files; `npm install` does it too,
via `postinstall`. The generated files are gitignored. Copy
`secrets.example.json` to `secrets.json` to get started — with values missing the
generator warns and emits empty strings, and the app reports itself unconfigured
rather than failing to build.

EAS builds from a clean checkout and will not have `secrets.json`, so the
generator reads the environment first. Before a cloud build:

```sh
eas secret:create --name ROOM_TUYA_CLIENT_ID     --value ...
eas secret:create --name ROOM_TUYA_CLIENT_SECRET --value ...
eas secret:create --name ROOM_TUYA_API_BASE_URL  --value ...
eas secret:create --name ROOM_TUYA_INFRARED_ID   --value ...
eas secret:create --name ROOM_TUYA_AC_REMOTE_ID  --value ...
```

## Bulb addressing

`devices.json` holds each bulb's IP, and those addresses are static — nothing
discovers them at runtime. If DHCP moves one, the app shows "Lights unavailable"
and recovering means editing `devices.json` *and rebuilding*, because the values
are compiled into the JS bundle and the widget binary.

**Reserve the four addresses on the router.** That makes the static config
correct permanently and costs nothing at runtime. In the router's admin page,
find DHCP / address reservation and bind each MAC to the address below.

| Bulb | Address to reserve | MAC |
| --- | --- | --- |
| `left-1`  | 192.168.29.131 | `98:77:D5:AF:66:DE` |
| `left-2`  | 192.168.29.180 | `98:77:D5:0D:46:32` |
| `right-1` | 192.168.29.116 | run `npm run bulbs` with the right lights powered |
| `right-2` | 192.168.29.151 | run `npm run bulbs` with the right lights powered |

```sh
npm run bulbs
```

It sweeps the subnet rather than trusting `devices.json`, so it finds a bulb
whose address has already moved, prints every MAC, and exits non-zero if what
answered does not match what is configured. Run it after making the reservations
to confirm they took.

A bulb only answers when it has power at the wall switch — silence there means
the switch is off, not that the bulb is broken.

## Do not run `expo prebuild`

`ios/` is a committed bare-workflow project. The widget target, both App Group
entitlements files and the `RoomSnapshotBridge` native module were all added by
hand, and `app.json` has no config plugin describing any of them.

`expo prebuild --clean` regenerates `ios/` and deletes the lot, silently — the
app still builds, it just loses the widget, Siri and the shared state. If it
happens: `git checkout -- home-control/ios`.

`npm test` asserts all of that wiring is still in place, so the damage surfaces
on the next test run rather than at submission.

## Tests

```sh
npm test          # typecheck + native wiring + domain assertions
npm run typecheck
npm run check:native
```

The domain assertions compile `RoomConfig` and `RoomSnapshot` natively — they
have no UIKit or WidgetKit dependency — and run in about a second.

## Layout

```
app/                     React Native screen, WiZ and Tuya clients
ios/RoomWidgetShared/    Swift shared by the app, the widget and Siri
ios/RoomWidgetExtension/ the WidgetKit views
ios/homecontrol/         AppDelegate and the snapshot bridge
scripts/                 config generation, tests, native wiring check
```

State is shared between the app, the widget and Siri through the App Group
`group.org.name.homecontrol`. A room nobody has observed reports `nil` rather
than `false`, so the widget can show "unknown" instead of claiming a device is
off when it has simply never looked.
