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
  'RoomWidgetShared/RoomScheduleClient.swift',
  'RoomWidgetShared/RoomScheduleIntents.swift',
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
check('schedule client compiles into the app only', count('RoomScheduleClient.swift in Sources */,') === 1);
check('schedule intents compile into the app only', count('RoomScheduleIntents.swift in Sources */,') === 1);
check('native bridge compiles into the app', count('RoomSnapshotBridge.m in Sources */,') === 1);
check('RoomGenerated.swift compiles into both targets', count('RoomGenerated.swift in Sources */,') === 2);

// React Native rejects nullable NSNumber bridge arguments and coerces the
// missing value to zero, which is a silent data bug rather than a crash.
const bridgeExports = readFileSync(join(ios, 'homecontrol/RoomSnapshotBridge.m'), 'utf8');
check(
  'no nullable NSNumber arguments in the bridge',
  !/nullable\s+NSNumber/.test(bridgeExports),
);

check(
  'the bridge exports what the screen calls',
  ['recordObservation:', 'performScene:', 'readScene:', 'logAction:', 'readScheduleSettings:', 'listSchedules:', 'createSchedule:', 'cancelSchedule:', 'editSchedule:', 'retrySchedule:', 'requestScheduleNotifications:', 'consumeScheduleNotification:'].every((name) => bridgeExports.includes(name)),
);

// Siri, widget and Control Center actions must never ask for Face ID; only the
// Lock Screen door does, so a pocket tap can't fire it. Every intent declares
// its policy explicitly rather than trusting the system default.
for (const file of ['RoomWidgetShared/RoomIntents.swift', 'RoomWidgetShared/RoomScheduleIntents.swift', 'RoomWidgetExtension/RoomControls.swift']) {
  const source = readFileSync(join(ios, file), 'utf8');
  const intents = [...source.matchAll(/struct (\w+): (?:AppIntent|SetValueIntent) \{([\s\S]*?)\n\}/g)];
  for (const [, name, body] of intents) {
    const policy = /authenticationPolicy: IntentAuthenticationPolicy \{ \.(\w+) \}/.exec(body)?.[1];
    const expected = (name.startsWith('LockScreen') || name === 'ManageRoomSchedulesIntent') ? 'requiresAuthentication' : 'alwaysAllowed';
    check(`${name} uses .${expected}`, policy === expected);
  }
  check(`${file} declares intents`, intents.length > 0);
}

if (failures.length) {
  console.error('\nnative wiring check FAILED:');
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error('\nIf you just ran `expo prebuild`, it regenerated ios/ and dropped the widget.');
  console.error('Recover with: git checkout -- home-control/ios\n');
  process.exit(1);
}

console.log(`native wiring: ${failures.length === 0 ? 'ok' : 'failed'}`);
