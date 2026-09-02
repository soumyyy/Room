#!/usr/bin/env node
// Guards the hand-built native wiring.
//
// ios/ is a committed bare-workflow project with a widget target, App Group
// entitlements and a native module that were all added by hand. app.json has no
// config plugin describing any of it, so `expo prebuild --clean` regenerates
// ios/ and silently deletes the lot. Nothing else in the repo would notice, so
// these assertions do.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ios = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'ios');
const pbxproj = readFileSync(join(ios, 'homecontrol.xcodeproj/project.pbxproj'), 'utf8');

const failures = [];
const check = (label, ok) => { if (!ok) failures.push(label); };
const count = (needle) => pbxproj.split(needle).length - 1;

check('widget target present in the Xcode project', pbxproj.includes('/* RoomWidgets */'));
check('widget is embedded in the app', pbxproj.includes('RoomWidgets.appex in Embed Foundation Extensions'));

for (const file of [
  'homecontrol/Room.entitlements',
  'RoomWidgetConfig/RoomWidgets.entitlements',
  'RoomWidgetConfig/RoomWidgetInfo.plist',
  'homecontrol/RoomSnapshotBridge.swift',
  'homecontrol/RoomSnapshotBridge.m',
  'RoomWidgetShared/RoomSnapshot.swift',
  'RoomWidgetShared/RoomShortcuts.swift',
]) {
  check(`${file} exists`, existsSync(join(ios, file)));
}

for (const target of ['homecontrol/Room.entitlements', 'RoomWidgetConfig/RoomWidgets.entitlements']) {
  const path = join(ios, target);
  const body = existsSync(path) ? readFileSync(path, 'utf8') : '';
  check(`${target} declares the App Group`, body.includes('group.org.name.homecontrol'));
  check(`${target} is wired into a build config`, pbxproj.includes(`CODE_SIGN_ENTITLEMENTS = ${target}`));
}

const widgetPlist = join(ios, 'RoomWidgetConfig/RoomWidgetInfo.plist');
check(
  'widget declares NSLocalNetworkUsageDescription',
  existsSync(widgetPlist) && readFileSync(widgetPlist, 'utf8').includes('NSLocalNetworkUsageDescription'),
);

// An app registers exactly one AppShortcutsProvider. Compiling RoomShortcuts
// into the extension as well made both bundles claim the same Siri phrases.
check(
  'RoomShortcuts.swift compiles into exactly one target',
  count('RoomShortcuts.swift in Sources */,') === 1,
);
check('native bridge compiles into the app', count('RoomSnapshotBridge.m in Sources */,') === 1);
check('RoomGenerated.swift compiles into both targets', count('RoomGenerated.swift in Sources */,') === 2);

if (failures.length) {
  console.error('\nnative wiring check FAILED:');
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error('\nIf you just ran `expo prebuild`, it regenerated ios/ and dropped the widget.');
  console.error('Recover with: git checkout -- home-control/ios\n');
  process.exit(1);
}

console.log(`native wiring: ${failures.length === 0 ? 'ok' : 'failed'}`);
