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
  isNodeConfigured,
  MODE_CYCLE,
  WIND_CYCLE,
  combinedColorId,
  cyclePosition,
  lightPanel,
  mixHex,
  nextMode,
  nextWind,
  parseAwayState,
  presetForTemp,
  revertNodeChange,
  isTuyaConfigured,
  createNodeState,
  mergeNodeStatus,
  nodeCommands,
  mergeBulbStatuses,
  modeLabel,
  normalizeStatus,
  sceneEquals,
  windLabel,
} from './roomDomain';
import { BULBS, BULB_GROUPS } from './config';
import { applyFont, familyFor } from './fonts';

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
  assert.equal(scene.temp, 27);
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

// ── Switchboard node ────────────────────────────────────────────────────────

test('node: starts unobserved, never claiming a device is off or reachable', () => {
  const node = createNodeState();
  assert.equal(node.available, null);
  assert.equal(node.busy, false);
});

test('node: switch_1 is the tube light and switch_2 is the fan', () => {
  const node = mergeNodeStatus(createNodeState(), {
    online: true,
    status: [
      { code: 'switch_1', value: true },
      { code: 'switch_2', value: false },
      { code: 'countdown_1', value: 0 },
    ],
  });
  assert.equal(node.available, true);
  assert.equal(node.tube, true);
  assert.equal(node.fan, false);
});

test('node: offline is unavailable, and a status missing a switch keeps the old value', () => {
  const seeded = { ...createNodeState(), tube: true, fan: true };
  const node = mergeNodeStatus(seeded, { online: false, status: [{ code: 'switch_2', value: false }] });
  assert.equal(node.available, false);
  assert.equal(node.tube, true);
  assert.equal(node.fan, false);
});

test('node: commands carry only what changed, mapped to switch codes', () => {
  assert.deepEqual(nodeCommands({ tube: true }), [{ code: 'switch_1', value: true }]);
  assert.deepEqual(nodeCommands({ fan: false }), [{ code: 'switch_2', value: false }]);
  assert.deepEqual(nodeCommands({ tube: false, fan: false }), [
    { code: 'switch_1', value: false },
    { code: 'switch_2', value: false },
  ]);
  assert.deepEqual(nodeCommands({}), []);
});

test('node: is configured only with the Tuya credentials and a device id', () => {
  assert.equal(typeof isNodeConfigured(), 'boolean');
});

// ── Cycling buttons, scenes and the tinted lights panel ─────────────────────

test('cycle: mode steps Cool, Auto, Fan, Dry and wraps', () => {
  assert.deepEqual(MODE_CYCLE, [0, 2, 3, 4]);
  assert.equal(nextMode(0), 2);
  assert.equal(nextMode(2), 3);
  assert.equal(nextMode(3), 4);
  assert.equal(nextMode(4), 0);
});

test('cycle: a mode outside the list (Heat) re-enters at Cool', () => {
  assert.equal(nextMode(1), 0);
});

test('cycle: airflow steps Auto, Low, Medium, High and wraps', () => {
  assert.deepEqual(WIND_CYCLE, [0, 1, 2, 3]);
  assert.equal(nextWind(0), 1);
  assert.equal(nextWind(2), 3);
  assert.equal(nextWind(3), 0);
  assert.equal(windLabel(2), 'Medium');
});

test('cycle: the dots show position, defaulting to the first', () => {
  assert.equal(cyclePosition(MODE_CYCLE, 3), 2);
  assert.equal(cyclePosition(MODE_CYCLE, 1), 0);
});

test('scenes: Ice, Day and Night are recognised by their temperature', () => {
  assert.equal(presetForTemp(21)?.id, 'ice');
  assert.equal(presetForTemp(24)?.id, 'daytime');
  assert.equal(presetForTemp(27)?.id, 'night');
  assert.equal(presetForTemp(25), null);
});

test('tint: blends a colour toward a base by a ratio', () => {
  assert.equal(mixHex('#ff0000', '#000000', 0.5), '#800000');
  assert.equal(mixHex('#ff0000', '#000000', 0), '#000000');
  assert.equal(mixHex('#ff0000', '#000000', 1), '#ff0000');
});

test('lights panel: takes the chosen colour and the average brightness of lit bulbs', () => {
  const bulbs = BULBS.map(createBulbState).map((bulb, index) => ({
    ...bulb,
    available: true,
    isOn: index < 2,
    brightness: index === 0 ? 100 : 60,
  }));
  const left = BULB_GROUPS[0];
  const panel = lightPanel(bulbsForGroup(left, bulbs), 'blue');
  assert.equal(panel.on, true);
  assert.equal(panel.brightness, 80);
  assert.equal(panel.hex, '#0a84ff');
  assert.equal(panel.colorName, 'Blue');
});

test('lights panel: off, unreachable and colourless fall back honestly', () => {
  const bulbs = BULBS.map(createBulbState);
  const off = lightPanel(bulbs, undefined);
  assert.equal(off.on, false);
  assert.equal(off.colorName, 'Warm White');
  const gone = lightPanel(bulbs.map((bulb) => ({ ...bulb, available: false })), 'red');
  assert.equal(gone.on, false);
  assert.equal(gone.unavailable, true);
});

test('lights panel: the combined panel follows the group that is lit', () => {
  const bulbs = BULBS.map(createBulbState).map((bulb) => ({
    ...bulb,
    isOn: bulb.id.startsWith('right'),
  }));
  const colors = { left: 'red', right: 'purple' };
  assert.equal(combinedColorId(bulbs, colors), 'purple');
  assert.equal(combinedColorId(BULBS.map(createBulbState), colors), 'red');
});

// ── A rejected switchboard command puts back only what it changed ────────────

test('revert: a failed command restores the switches it touched', () => {
  const before = { ...createNodeState(), tube: false, fan: true };
  const shown = { ...before, tube: true };
  const after = revertNodeChange(shown, { tube: true }, before);
  assert.equal(after.tube, false);
  assert.equal(after.fan, true);
});

test('revert: leaves a switch alone if something newer already moved it', () => {
  const before = { ...createNodeState(), fan: false };
  // Fan was tapped on (failed), then tapped off again: the screen now says off.
  const shown = { ...before, fan: false };
  const after = revertNodeChange({ ...shown, fan: true }, { fan: false }, { ...before, fan: true });
  assert.equal(after.fan, true);
});

test('revert: a change of both switches restores both', () => {
  const before = { ...createNodeState(), tube: true, fan: true };
  const shown = { ...before, tube: false, fan: false };
  const after = revertNodeChange(shown, { tube: false, fan: false }, before);
  assert.equal(after.tube, true);
  assert.equal(after.fan, true);
});

// ── What Enter room restores must survive a restart ─────────────────────────

test('away: a saved state round-trips through JSON', () => {
  const saved = {
    ac: { power: 1 as const, mode: 0 as const, temp: 24, wind: 1 as const },
    activeGroupIds: ['left'],
    node: { tube: true, fan: false },
  };
  assert.deepEqual(parseAwayState(JSON.stringify(saved)), saved);
});

test('away: nothing stored, or garbage, means the user is not away', () => {
  assert.equal(parseAwayState(null), null);
  assert.equal(parseAwayState(''), null);
  assert.equal(parseAwayState('not json'), null);
  assert.equal(parseAwayState('42'), null);
  assert.equal(parseAwayState('null'), null);
});

test('away: a stale file cannot widen the accepted ranges or invent groups', () => {
  const stored = JSON.stringify({
    ac: { power: 1, mode: 99, temp: 200, wind: 7 },
    activeGroupIds: ['left', 'attic', 42],
    node: { tube: 'yes', fan: true },
  });
  const away = parseAwayState(stored);
  assert.ok(away);
  assert.equal(away.ac.temp, 30);
  assert.equal(away.ac.mode, 0);
  assert.equal(away.ac.wind, 1);
  assert.deepEqual(away.activeGroupIds, ['left']);
  assert.deepEqual(away.node, { tube: false, fan: true });
});

test('away: a state missing pieces restores nothing rather than guessing', () => {
  const away = parseAwayState('{}');
  assert.ok(away);
  assert.equal(away.ac.power, 0);
  assert.deepEqual(away.activeGroupIds, []);
  assert.deepEqual(away.node, { tube: false, fan: false });
});

// ── Manrope: one file per weight, chosen from the weight a style asks for ────

test('font: each weight maps to its own Manrope file', () => {
  assert.equal(familyFor('300'), 'Manrope-Light');
  assert.equal(familyFor('400'), 'Manrope-Regular');
  assert.equal(familyFor('500'), 'Manrope-Medium');
  assert.equal(familyFor('600'), 'Manrope-SemiBold');
  assert.equal(familyFor('700'), 'Manrope-Bold');
});

test('font: unspecified and named weights resolve sensibly', () => {
  assert.equal(familyFor(undefined), 'Manrope-Regular');
  assert.equal(familyFor('normal'), 'Manrope-Regular');
  assert.equal(familyFor('bold'), 'Manrope-Bold');
  assert.equal(familyFor('200'), 'Manrope-Light');
  assert.equal(familyFor('800'), 'Manrope-Bold');
});

test('font: text styles get a family and lose fontWeight, others are untouched', () => {
  const source = {
    title: { fontSize: 20, fontWeight: '600', color: '#fff' },
    plain: { fontSize: 12 },
    box: { padding: 4, backgroundColor: '#000' },
  };
  const styled = applyFont(source) as unknown as Record<string, Record<string, unknown>>;
  assert.equal(styled.title.fontFamily, 'Manrope-SemiBold');
  assert.equal('fontWeight' in styled.title, false);
  assert.equal(styled.title.color, '#fff');
  assert.equal(styled.plain.fontFamily, 'Manrope-Regular');
  assert.deepEqual(styled.box, source.box);
  assert.equal(source.title.fontWeight, '600');
});
