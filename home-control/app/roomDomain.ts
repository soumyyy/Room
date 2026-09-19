// Types, constants and pure functions behind the room screen.
//
// Deliberately free of any react-native import so it can be exercised directly
// by `node --test` — the screen's decisions are testable, its rendering is not.

import {
  BULB_GROUPS,
  BULBS,
  NODE,
  TUYA_CLOUD,
  type BulbConfig,
  type BulbGroupConfig,
} from './config';
import type { AcScenePayload, AcStatus } from './tuya';
import type { WizPilotStatus } from './wizClient';

export type { BulbConfig, BulbGroupConfig };

export type ModeValue = 0 | 1 | 2 | 3 | 4;
export type WindValue = 0 | 1 | 2 | 3;

export type AcScene = {
  power: 0 | 1;
  mode: ModeValue;
  temp: number;
  wind: WindValue;
};

export type Preset = {
  id: string;
  name: string;
  accent: string;
  scene: AcScene;
};

export type BulbState = BulbConfig & {
  available: boolean | null;
  isOn: boolean;
  brightness: number;
  busy: boolean;
};

/** The switchboard reports each relay as a Tuya datapoint; these are its codes. */
export const NODE_SWITCH = { tube: 'switch_1', fan: 'switch_2' } as const;

export type NodeState = {
  available: boolean | null;
  tube: boolean;
  fan: boolean;
  busy: boolean;
};

export type NodeDevice = {
  online: boolean;
  status: Array<{ code: string; value: unknown }>;
};

export type NodeChange = Partial<Pick<NodeState, 'tube' | 'fan'>>;

export type GroupColorPreset = {
  id: string;
  hex: string;
  name: string;
  kind: 'white' | 'color';
  params: Record<string, unknown>;
};

export const INITIAL_SCENE: AcScene = {
  power: 0,
  mode: 0,
  temp: 27,
  wind: 1,
};

export const DEFAULT_BULB_BRIGHTNESS = 68;

export const MODE_OPTIONS: Array<{ value: ModeValue; label: string }> = [
  { value: 0, label: 'Cool' },
  // { value: 1, label: 'Heat' },
  { value: 2, label: 'Auto' },
  { value: 3, label: 'Fan' },
  { value: 4, label: 'Dry' },
];

export const FAN_OPTIONS: Array<{ value: WindValue; label: string }> = [
  { value: 0, label: 'Auto' },
  { value: 1, label: 'Low' },
  { value: 2, label: 'Medium' },
  { value: 3, label: 'High' },
];

export const ALL_LIGHTS_GROUP: BulbGroupConfig = {
  id: 'all',
  name: 'Lights',
  bulbIds: BULBS.map((bulb) => bulb.id),
};

export const PRESETS: Preset[] = [
  {
    id: 'ice',
    name: 'Ice',
    accent: '#8bcff2',
    scene: { power: 1, mode: 0, temp: 21, wind: 3 },
  },
  {
    id: 'daytime',
    name: 'Day',
    accent: '#ffbe8a',
    scene: { power: 1, mode: 0, temp: 24, wind: 1 },
  },
  {
    id: 'night',
    name: 'Night',
    accent: '#b6bdfc',
    scene: { power: 1, mode: 0, temp: 27, wind: 0 },
  },
];


export const GROUP_COLOR_PRESETS: GroupColorPreset[] = [
  {
    id: 'warm-white',
    name: 'Warm White',
    hex: '#ffa757',
    kind: 'white',
    params: { state: true, temp: 2700 },
  },
  {
    id: 'neutral-white',
    name: 'Neutral',
    hex: '#ffd3af',
    kind: 'white',
    params: { state: true, temp: 4200 },
  },
  {
    id: 'cool-white',
    name: 'Cool White',
    hex: '#fffefa',
    kind: 'white',
    params: { state: true, temp: 6500 },
  },
  {
    id: 'red',
    name: 'Red',
    hex: '#ff3b30',
    kind: 'color',
    params: { state: true, r: 255, g: 59, b: 48 },
  },
  {
    id: 'orange',
    name: 'Orange',
    hex: '#ff9500',
    kind: 'color',
    params: { state: true, r: 255, g: 149, b: 0 },
  },
  {
    id: 'yellow',
    name: 'Yellow',
    hex: '#ffd60a',
    kind: 'color',
    params: { state: true, r: 255, g: 214, b: 10 },
  },
  {
    id: 'green',
    name: 'Green',
    hex: '#30d158',
    kind: 'color',
    params: { state: true, r: 48, g: 209, b: 88 },
  },
  {
    id: 'cyan',
    name: 'Cyan',
    hex: '#00c7be',
    kind: 'color',
    params: { state: true, r: 0, g: 199, b: 190 },
  },
  {
    id: 'blue',
    name: 'Blue',
    hex: '#0a84ff',
    kind: 'color',
    params: { state: true, r: 10, g: 132, b: 255 },
  },
  {
    id: 'purple',
    name: 'Purple',
    hex: '#bf5af2',
    kind: 'color',
    params: { state: true, r: 191, g: 90, b: 242 },
  },
  {
    id: 'pink',
    name: 'Pink',
    hex: '#ff2d55',
    kind: 'color',
    params: { state: true, r: 255, g: 45, b: 85 },
  },
  // Pastels: #a7f0d2 is 167 of neutral white plus (0, 73, 43) of chroma.
  // Sent as pure RGB the bulb lights only the colour LEDs and reads far more
  // saturated than the swatch, so the shared component goes to the white LED.
  {
    id: 'seafoam',
    name: 'Seafoam',
    hex: '#a7f0d2',
    kind: 'color',
    params: { state: true, r: 0, g: 73, b: 43, c: 167 },
  },
  {
    id: 'lavender',
    name: 'Lavender',
    hex: '#d2c8ff',
    kind: 'color',
    params: { state: true, r: 10, g: 0, b: 55, c: 200 },
  },
  {
    id: 'blush',
    name: 'Blush',
    hex: '#ffc6d8',
    kind: 'color',
    params: { state: true, r: 57, g: 0, b: 18, w: 198 },
  },
];

export const COLOR_ROW_SIZE = 4;
export const WHITE_PRESETS = GROUP_COLOR_PRESETS.filter((preset) => preset.kind === 'white');
export const COLOR_PRESETS = GROUP_COLOR_PRESETS.filter((preset) => preset.kind === 'color');
export const COLOR_ROWS = Array.from(
  { length: Math.ceil(COLOR_PRESETS.length / COLOR_ROW_SIZE) },
  (_, row) => COLOR_PRESETS.slice(row * COLOR_ROW_SIZE, (row + 1) * COLOR_ROW_SIZE),
);

export const MODE_CYCLE: ModeValue[] = MODE_OPTIONS.map((option) => option.value);
export const WIND_CYCLE: WindValue[] = FAN_OPTIONS.map((option) => option.value);

/** The value after `value`, wrapping; anything not in the list re-enters at the first. */
function step<T>(list: T[], value: T): T {
  return list[(list.indexOf(value) + 1) % list.length];
}

export function nextMode(mode: ModeValue): ModeValue {
  return step(MODE_CYCLE, mode);
}

export function nextWind(wind: WindValue): WindValue {
  return step(WIND_CYCLE, wind);
}

export function cyclePosition<T>(list: T[], value: T) {
  return Math.max(0, list.indexOf(value));
}

/** Ice, Day and Night are told apart by the temperature they set. */
export function presetForTemp(temp: number): Preset | null {
  return PRESETS.find((preset) => preset.scene.temp === temp) ?? null;
}

/** `ratio` of `color` over `base`, as a hex string; React Native has no color-mix. */
export function mixHex(color: string, base: string, ratio: number) {
  const channels = (hex: string) =>
    [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));
  const [c, b] = [channels(color), channels(base)];
  return `#${c
    .map((value, index) =>
      Math.round(b[index] + (value - b[index]) * ratio)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

export type LightPanel = {
  on: boolean;
  unavailable: boolean;
  brightness: number;
  hex: string;
  colorName: string;
};

/** What a lights panel shows: lit state, average brightness, and the chosen colour. */
export function lightPanel(members: BulbState[], colorId: string | undefined): LightPanel {
  const preset =
    GROUP_COLOR_PRESETS.find((entry) => entry.id === (colorId ?? 'warm-white')) ??
    GROUP_COLOR_PRESETS[0];
  const reachable = members.filter((bulb) => bulb.available !== false);
  const lit = reachable.filter((bulb) => bulb.isOn);
  const basis = lit.length ? lit : reachable;

  return {
    on: lit.length > 0,
    unavailable: members.length > 0 && reachable.length === 0,
    brightness: basis.length
      ? Math.round(basis.reduce((sum, bulb) => sum + bulb.brightness, 0) / basis.length)
      : DEFAULT_BULB_BRIGHTNESS,
    hex: preset.hex,
    colorName: preset.name,
  };
}

/** The combined panel wears the colour of whichever group is lit, else the first. */
export function combinedColorId(bulbs: BulbState[], colors: Record<string, string>) {
  const active =
    BULB_GROUPS.find((group) => bulbsForGroup(group, bulbs).some((bulb) => bulb.isOn)) ??
    BULB_GROUPS[0];
  return colors[active.id] ?? 'warm-white';
}

export function isTuyaConfigured() {
  return [
    TUYA_CLOUD.clientId,
    TUYA_CLOUD.clientSecret,
    TUYA_CLOUD.infraredId,
    TUYA_CLOUD.acRemoteId,
    TUYA_CLOUD.apiBaseUrl,
  ].every((value) => value.length > 0);
}

export function isNodeConfigured() {
  return [
    TUYA_CLOUD.clientId,
    TUYA_CLOUD.clientSecret,
    TUYA_CLOUD.apiBaseUrl,
    NODE.id,
  ].every((value) => value.length > 0);
}

export function parseNumber(value: string | number | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function clampMode(value: number): ModeValue {
  return [0, 1, 2, 3, 4].includes(value) ? (value as ModeValue) : INITIAL_SCENE.mode;
}

export function clampWind(value: number): WindValue {
  return [0, 1, 2, 3].includes(value) ? (value as WindValue) : INITIAL_SCENE.wind;
}

export function clampTemp(value: number) {
  return Math.max(16, Math.min(30, Math.round(value)));
}

export function normalizeStatus(status: AcStatus): AcScene {
  const rawPower =
    status.power_open !== undefined
      ? status.power_open
        ? 1
        : 0
      : parseNumber(status.power, INITIAL_SCENE.power);

  return {
    power: rawPower === 1 ? 1 : 0,
    mode: clampMode(parseNumber(status.mode, INITIAL_SCENE.mode)),
    temp: clampTemp(parseNumber(status.temperature ?? status.temp, INITIAL_SCENE.temp)),
    wind: clampWind(parseNumber(status.fan ?? status.wind, INITIAL_SCENE.wind)),
  };
}

export function modeLabel(mode: ModeValue) {
  return MODE_OPTIONS.find((option) => option.value === mode)?.label ?? 'Cool';
}

export function windLabel(wind: WindValue) {
  return FAN_OPTIONS.find((option) => option.value === wind)?.label ?? 'Low';
}

export function sceneEquals(left: AcScene, right: AcScene) {
  return (
    left.power === right.power &&
    left.mode === right.mode &&
    left.temp === right.temp &&
    left.wind === right.wind
  );
}

export function sceneToPayload(scene: AcScene): AcScenePayload {
  return {
    power: scene.power,
    mode: scene.mode,
    temp: scene.temp,
    wind: scene.wind,
  };
}

export function createBulbState(bulb: BulbConfig): BulbState {
  return {
    ...bulb,
    available: null,
    isOn: false,
    brightness: DEFAULT_BULB_BRIGHTNESS,
    busy: false,
  };
}

export function createNodeState(): NodeState {
  return { available: null, tube: false, fan: false, busy: false };
}

/** A switch the device did not report keeps its last known value. */
export function mergeNodeStatus(current: NodeState, device: NodeDevice): NodeState {
  const read = (code: string, fallback: boolean) => {
    const value = device.status.find((entry) => entry.code === code)?.value;
    return typeof value === 'boolean' ? value : fallback;
  };

  return {
    ...current,
    available: device.online,
    tube: read(NODE_SWITCH.tube, current.tube),
    fan: read(NODE_SWITCH.fan, current.fan),
    busy: false,
  };
}

/**
 * After a rejected command: put back the switches it changed, but only those
 * still showing the value it tried to set. A newer tap that already moved a
 * switch must not be undone by an older failure.
 */
export function revertNodeChange(
  current: NodeState,
  change: NodeChange,
  previous: NodeState,
): NodeState {
  return {
    ...current,
    ...(change.tube !== undefined && current.tube === change.tube ? { tube: previous.tube } : {}),
    ...(change.fan !== undefined && current.fan === change.fan ? { fan: previous.fan } : {}),
  };
}

export function nodeCommands(change: NodeChange): Array<{ code: string; value: boolean }> {
  return (Object.keys(NODE_SWITCH) as Array<keyof typeof NODE_SWITCH>)
    .filter((key) => change[key] !== undefined)
    .map((key) => ({ code: NODE_SWITCH[key], value: change[key] as boolean }));
}

export function clampBrightness(value: number) {
  return Math.max(10, Math.min(100, Math.round(value)));
}

export function mergeBulbStatuses(current: BulbState[], statuses: WizPilotStatus[]) {
  const statusById = new Map(statuses.map((status) => [status.id, status]));

  return current.map((bulb) => {
    const status = statusById.get(bulb.id);

    if (!status) {
      return { ...bulb, busy: false };
    }

    return {
      ...bulb,
      available: status.available,
      isOn: status.isOn,
      brightness:
        status.brightness === null ? bulb.brightness : clampBrightness(status.brightness),
      busy: false,
    };
  });
}

/// The colour picker can address 'all', but colour is stored per real group so
/// every reader works off the same keys. Selecting on the combined tile used to
/// write under 'all', which nothing ever read back.
export function groupIdsFor(group: BulbGroupConfig): string[] {
  return group.id === ALL_LIGHTS_GROUP.id ? BULB_GROUPS.map((entry) => entry.id) : [group.id];
}

export function bulbsForGroup<T extends BulbConfig>(group: BulbGroupConfig, bulbs: T[]): T[] {
  return bulbs.filter((bulb) => group.bulbIds.includes(bulb.id));
}

export function createPreviewStatuses(bulbs: BulbState[]): WizPilotStatus[] {
  return bulbs.map((bulb) => ({
    id: bulb.id,
    ip: bulb.ip,
    available: true,
    isOn: bulb.isOn,
    brightness: bulb.brightness,
    r: null,
    g: null,
    b: null,
    temp: null,
  }));
}

// ── Rehydrating from the shared snapshot ────────────────────────────────────

type StoredSnapshot = {
  ac?: { power: number; mode: number; temp: number; wind: number } | null;
  lights?: Record<
    string,
    { isOn: boolean; brightness?: number | null; presetID?: string | null }
  >;
};

/** What Leave room turned off, kept so Enter room can turn exactly that back on. */
export type AwayState = {
  ac: AcScene;
  activeGroupIds: string[];
  node: NodeChange;
};

/**
 * Reads a saved away state defensively: a stale or damaged file must neither
 * crash the screen nor turn on something the user never had on. Null means the
 * user is not away.
 */
export function parseAwayState(json: string | null): AwayState | null {
  if (!json) {
    return null;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }

  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const stored = raw as {
    ac?: { power: number; mode: number; temp: number; wind: number } | null;
    activeGroupIds?: unknown;
    node?: { tube?: unknown; fan?: unknown } | null;
  };

  return {
    ac: sceneFromSnapshot({ ac: stored.ac }) ?? { ...INITIAL_SCENE, power: 0 },
    activeGroupIds: Array.isArray(stored.activeGroupIds)
      ? stored.activeGroupIds.filter(
          (id): id is string =>
            typeof id === 'string' && BULB_GROUPS.some((group) => group.id === id),
        )
      : [],
    node: { tube: stored.node?.tube === true, fan: stored.node?.fan === true },
  };
}

/** Clamps a stored scene back into range; a stale file should never widen it. */
export function sceneFromSnapshot(snapshot: StoredSnapshot | null): AcScene | null {
  const stored = snapshot?.ac;
  if (!stored) {
    return null;
  }

  return {
    power: stored.power === 1 ? 1 : 0,
    mode: clampMode(Number(stored.mode)),
    temp: clampTemp(Number(stored.temp)),
    wind: clampWind(Number(stored.wind)),
  };
}

/**
 * Applies stored per-group light state to the bulbs. `available` stays null:
 * the snapshot says what a bulb was doing, never that it is reachable now, and
 * claiming otherwise would let the UI enable controls we cannot honour.
 */
export function bulbsFromSnapshot(
  bulbs: BulbState[],
  snapshot: StoredSnapshot | null,
): BulbState[] {
  const lights = snapshot?.lights;
  if (!lights) {
    return bulbs;
  }

  return bulbs.map((bulb) => {
    const stored = lights[groupOf(bulb) ?? ''];
    if (!stored) {
      return bulb;
    }

    return {
      ...bulb,
      isOn: stored.isOn,
      brightness:
        typeof stored.brightness === 'number'
          ? clampBrightness(stored.brightness)
          : bulb.brightness,
    };
  });
}

function groupOf(bulb: BulbConfig): string | null {
  return BULB_GROUPS.find((group) => group.bulbIds.includes(bulb.id))?.id ?? null;
}

/** Per-group colour selection, keeping the default where nothing was stored. */
export function colorsFromSnapshot(
  current: Record<string, string>,
  snapshot: StoredSnapshot | null,
): Record<string, string> {
  const lights = snapshot?.lights;
  if (!lights) {
    return current;
  }

  const next = { ...current };
  for (const [groupId, stored] of Object.entries(lights)) {
    if (stored.presetID) {
      next[groupId] = stored.presetID;
    }
  }
  return next;
}
