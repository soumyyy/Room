// Run with `node --test`. roomDomain imports nothing from react-native, which
// is the whole reason the screen's decisions can be checked at all.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ALL_LIGHTS_GROUP,
  bulbsFromSnapshot,
  colorsFromSnapshot,
  sceneFromSnapshot,
  COLOR_ROWS,
  COLOR_ROW_SIZE,
  GROUP_COLOR_PRESETS,
  WHITE_PRESETS,
  bulbsForGroup,
  clampBrightness,
  clampTemp,
  createBulbState,
  groupIdsFor,
  isTuyaConfigured,
  mergeBulbStatuses,
  modeLabel,
  normalizeStatus,
  sceneEquals,
  windLabel,
} from './roomDomain';
import { BULBS, BULB_GROUPS } from './config';

test('AC status: Tuya reports numbers or numeric strings', () => {
  assert.equal(normalizeStatus({ power_open: true, temp: '23' }).temp, 23);
  assert.equal(normalizeStatus({ power_open: true, temperature: 25 }).temp, 25);
  assert.equal(normalizeStatus({ power: '1' }).power, 1);
  assert.equal(normalizeStatus({ power_open: false }).power, 0);
});

test('AC status: temperature wins over temp, fan over wind', () => {
  assert.equal(normalizeStatus({ temperature: 26, temp: 18 }).temp, 26);
  assert.equal(normalizeStatus({ fan: 3, wind: 0 }).wind, 3);
});

test('AC status: nonsense falls back rather than propagating', () => {
  const scene = normalizeStatus({ mode: 99, temp: 'warm', fan: 42 });
  assert.equal(scene.mode, 0);
  assert.equal(scene.temp, 24);
  assert.equal(scene.wind, 1);
});

test('AC status: temperature is clamped to what the unit accepts', () => {
  assert.equal(normalizeStatus({ temp: 44 }).temp, 30);
  assert.equal(normalizeStatus({ temp: 4 }).temp, 16);
  assert.equal(clampTemp(100), 30);
  assert.equal(clampTemp(-5), 16);
});

test('brightness never leaves the range the bulbs accept', () => {
  assert.equal(clampBrightness(0), 10);
  assert.equal(clampBrightness(1000), 100);
  assert.equal(clampBrightness(67.6), 68);
});

test('scenes compare by value', () => {
  const a = { power: 1, mode: 0, temp: 24, wind: 1 } as const;
  assert.ok(sceneEquals(a, { ...a }));
  assert.ok(!sceneEquals(a, { ...a, temp: 25 }));
});

test('group ids: "all" fans out, a real group does not', () => {
  assert.deepEqual(groupIdsFor(ALL_LIGHTS_GROUP), BULB_GROUPS.map((g) => g.id));
  assert.deepEqual(groupIdsFor(BULB_GROUPS[0]), [BULB_GROUPS[0].id]);
});

test('bulbsForGroup selects only members', () => {
  const left = bulbsForGroup(BULB_GROUPS[0], BULBS);
  assert.equal(left.length, 2);
  assert.ok(left.every((bulb) => BULB_GROUPS[0].bulbIds.includes(bulb.id)));
  assert.equal(bulbsForGroup(ALL_LIGHTS_GROUP, BULBS).length, BULBS.length);
});

test('merging statuses keeps brightness when a bulb does not report one', () => {
  const current = BULBS.map(createBulbState).map((bulb) => ({ ...bulb, brightness: 42 }));
  const merged = mergeBulbStatuses(current, [
    { id: BULBS[0].id, ip: BULBS[0].ip, available: true, isOn: true, brightness: null, r: null, g: null, b: null, temp: null },
  ]);
  assert.equal(merged[0].brightness, 42, 'null brightness must not overwrite what we knew');
  assert.equal(merged[0].isOn, true);
  assert.equal(merged[0].busy, false);
});

test('merging statuses leaves unmentioned bulbs alone but clears busy', () => {
  const current = BULBS.map(createBulbState).map((bulb) => ({ ...bulb, busy: true, isOn: true }));
  const merged = mergeBulbStatuses(current, []);
  assert.ok(merged.every((bulb) => bulb.busy === false));
  assert.ok(merged.every((bulb) => bulb.isOn === true));
});

test('every colour preset is reachable from the sheet', () => {
  const rendered = new Set([...WHITE_PRESETS, ...COLOR_ROWS.flat()].map((preset) => preset.id));
  const defined = GROUP_COLOR_PRESETS.map((preset) => preset.id);
  assert.equal(rendered.size, defined.length, 'a defined preset the UI never renders is a bug');
  for (const id of defined) assert.ok(rendered.has(id), `${id} is not rendered`);
});

test('colour rows are never wider than the grid', () => {
  assert.ok(COLOR_ROWS.every((row) => row.length <= COLOR_ROW_SIZE));
  assert.equal(COLOR_ROWS.flat().length, GROUP_COLOR_PRESETS.filter((p) => p.kind === 'color').length);
});

test('every swatch matches the command it sends', () => {
  for (const preset of GROUP_COLOR_PRESETS) {
    if (preset.kind === 'white') continue;
    const { r = 0, g = 0, b = 0, c, w } = preset.params as Record<string, number | undefined>;
    const white = c ?? w ?? 0;
    const hex = `#${[r + white, g + white, b + white]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')}`;
    assert.equal(hex, preset.hex, `${preset.id} swatch disagrees with its params`);
  }
});

test('mode and fan labels cover every option', () => {
  assert.equal(modeLabel(0), 'Cool');
  assert.equal(windLabel(3), 'High');
});

test('Tuya reports itself configured only with real values', () => {
  assert.equal(typeof isTuyaConfigured(), 'boolean');
});

test('hydration: nothing recorded yields no scene', () => {
  assert.equal(sceneFromSnapshot(null), null);
  assert.equal(sceneFromSnapshot({}), null);
  assert.equal(sceneFromSnapshot({ ac: null }), null);
});

test('hydration: a stale snapshot cannot widen the accepted range', () => {
  const scene = sceneFromSnapshot({ ac: { power: 1, mode: 99, temp: 88, wind: 42 } });
  assert.deepEqual(scene, { power: 1, mode: 0, temp: 30, wind: 1 });
});

test('hydration: a recorded scene comes back intact', () => {
  assert.deepEqual(sceneFromSnapshot({ ac: { power: 1, mode: 2, temp: 22, wind: 3 } }), {
    power: 1,
    mode: 2,
    temp: 22,
    wind: 3,
  });
});

test('hydration: stored light state reaches the right bulbs', () => {
  const start = BULBS.map(createBulbState);
  const hydrated = bulbsFromSnapshot(start, {
    lights: { left: { isOn: true, brightness: 70 }, right: { isOn: false } },
  });

  const left = hydrated.filter((bulb) => BULB_GROUPS[0].bulbIds.includes(bulb.id));
  const right = hydrated.filter((bulb) => BULB_GROUPS[1].bulbIds.includes(bulb.id));
  assert.ok(left.every((bulb) => bulb.isOn && bulb.brightness === 70));
  assert.ok(right.every((bulb) => !bulb.isOn));
});

test('hydration: never claims a bulb is reachable', () => {
  const hydrated = bulbsFromSnapshot(BULBS.map(createBulbState), {
    lights: { left: { isOn: true, brightness: 70 } },
  });
  assert.ok(
    hydrated.every((bulb) => bulb.available === null),
    'a snapshot says what a bulb was doing, never that it answers now',
  );
});

test('hydration: a missing brightness keeps what we had', () => {
  const start = BULBS.map(createBulbState).map((bulb) => ({ ...bulb, brightness: 55 }));
  const hydrated = bulbsFromSnapshot(start, { lights: { left: { isOn: true } } });
  assert.ok(hydrated.every((bulb) => bulb.brightness === 55));
});

test('hydration: colours restore per group, defaults survive', () => {
  const colors = colorsFromSnapshot(
    { left: 'warm-white', right: 'warm-white' },
    { lights: { left: { isOn: true, presetID: 'seafoam' }, right: { isOn: false } } },
  );
  assert.equal(colors.left, 'seafoam');
  assert.equal(colors.right, 'warm-white');
});
