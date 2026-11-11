import { NativeModules } from 'react-native';

import { BULB_GROUPS } from './config';

export type StoredRoomSnapshot = {
  ac?: { power: number; mode: number; temp: number; wind: number } | null;
  lights?: Record<
    string,
    { isOn: boolean; brightness?: number | null; presetID?: string | null }
  >;
  updatedAt?: number | string | null;
  observedAt?: Record<string, number>;
  node?: { tube?: boolean; fan?: boolean } | null;
  bulbs?: Record<string, { state: boolean; dimming?: number | null; temp?: number | null; r?: number | null; g?: number | null; b?: number | null }>;
};

type RoomSnapshotBridge = {
  readScene(): Promise<string>;
  performScene(action: 'enter' | 'leave'): Promise<string>;
  recordObservation(payload: object): void;
  read(): Promise<string | null>;
  recordAC(power: number, mode: number, temp: number, wind: number): void;
  readAway(): Promise<unknown>;
  saveAway(json: string | null): void;
  recordNode(tube: boolean, fan: boolean): void;
  recordLights(payload: {
    groups: string[];
    isOn: boolean;
    brightness?: number;
    presetId?: string;
  }): void;
};

const bridge = (NativeModules as Record<string, unknown>).RoomSnapshotBridge as
  | RoomSnapshotBridge
  | undefined;

/// The bridge is iOS-only and absent from Expo Go, so every call is optional.
/// A stale widget must never be able to break the app, which is why nothing
/// here throws or surfaces an error.
function available() {
  return typeof bridge?.recordAC === 'function';
}

export function isSnapshotBridgeAvailable() {
  return available();
}

/**
 * Whatever the room was last known to be doing, or null when nothing has been
 * recorded. Reading this is a local lookup, so the first frame can show real
 * values rather than waiting on the network.
 */
export async function readRoomSnapshot(): Promise<StoredRoomSnapshot | null> {
  if (typeof bridge?.read !== 'function') {
    return null;
  }

  try {
    const json = await bridge.read();
    return json ? (JSON.parse(json) as StoredRoomSnapshot) : null;
  } catch {
    return null;
  }
}

export function recordAcScene(scene: {
  power: number;
  mode: number;
  temp: number;
  wind: number;
}, observedAt = Date.now(), command = false) {
  if (bridge?.recordObservation) {
    bridge.recordObservation({ keys: ['ac'], observedAt, command, snapshot: { ac: scene, lights: {} } });
    return;
  }
  if (!available()) {
    return;
  }

  try {
    bridge!.recordAC(scene.power, scene.mode, scene.temp, scene.wind);
  } catch {
    // Widget state is best-effort.
  }
}

/** Mirrors the switchboard's relays into the shared snapshot for the widget. */
export function recordNodeState(tube: boolean, fan: boolean, observedAt = Date.now()) {
  if (bridge?.recordObservation) { recordNodeChange({ tube, fan }, observedAt); return; }
  if (typeof bridge?.recordNode !== 'function') {
    return;
  }

  try {
    bridge.recordNode(tube, fan);
  } catch {
    // Widget state is best-effort.
  }
}

/**
 * Mirrors one WiZ command into the shared snapshot. `groupId` is a group from
 * BULB_GROUPS, or 'all' for every group.
 */
export function recordLightCommand(
  groupId: string,
  params: Record<string, unknown>,
  presetId?: string,
  observedAt = Date.now(),
) {
  if (!available()) {
    return;
  }

  const groups = groupId === 'all' ? BULB_GROUPS.map((group) => group.id) : [groupId];
  const brightness = typeof params.dimming === 'number' ? params.dimming : null;
  if (bridge?.recordObservation) {
    const lights = Object.fromEntries(groups.map((id) => [id, { isOn: params.state === true, ...(brightness === null ? {} : { brightness }), ...(presetId ? { presetID: presetId } : {}) }]));
    bridge.recordObservation({ keys: groups.map((id) => 'lights:' + id), observedAt, snapshot: { lights } });
    return;
  }

  try {
    // Omit absent values rather than sending null: React Native rejects a
    // nullable NSNumber argument and would coerce it to zero.
    bridge!.recordLights({
      groups,
      isOn: params.state === true,
      ...(brightness === null ? {} : { brightness }),
      ...(presetId ? { presetId } : {}),
    });
  } catch {
    // Widget state is best-effort.
  }
}

export function recordNodeChange(node: { tube?: boolean; fan?: boolean }, observedAt = Date.now(), command = false) {
  bridge?.recordObservation?.({ keys: Object.keys(node), observedAt, command, snapshot: { node, lights: {} } });
}

export function recordBulbReadings(statuses: import('./wizClient').WizPilotStatus[], observedAt = Date.now()) {
  const observed = statuses.filter((s) => s.available);
  const bulbs = Object.fromEntries(observed.map((s) => [s.id, { state: s.isOn, dimming: s.brightness, temp: s.temp, r: s.r, g: s.g, b: s.b, c: s.c, w: s.w }]));
  bridge?.recordObservation?.({ keys: observed.map((s) => 'bulb:' + s.id), observedAt, snapshot: { bulbs, lights: {} } });
}

export type SceneReport = { phase: 'leaving' | 'away' | 'entering' | null; failed: string[]; snapshot: StoredRoomSnapshot };
export async function readSceneReport(): Promise<SceneReport | null> {
  if (!bridge?.readScene) return null;
  const raw = await bridge.readScene();
  return JSON.parse(Array.isArray(raw) ? raw[0] : raw) as SceneReport;
}
export async function performRoomScene(action: 'enter' | 'leave'): Promise<SceneReport> {
  if (!bridge?.performScene) throw new Error('Room scenes require the updated native iOS build.');
  const raw = await bridge.performScene(action);
  return JSON.parse(Array.isArray(raw) ? raw[0] : raw) as SceneReport;
}

// ── Away state ──────────────────────────────────────────────────────────────

// Without the native bridge (Expo Go) the away state lasts for the session
// only, which is the best a JS-only build can do.
let awayInMemory: string | null = null;

/** The raw saved away state, or null when the user is not away. */
export async function readAwayState(): Promise<string | null> {
  if (typeof bridge?.readAway !== 'function') {
    return awayInMemory;
  }

  try {
    // The bridge resolves with a one-element array; unwrap it.
    const value = await bridge.readAway();
    const json = Array.isArray(value) ? value[0] : value;
    return typeof json === 'string' ? json : null;
  } catch {
    return null;
  }
}

/** Saves the away state, or clears it when given null. Never throws. */
export function saveAwayState(json: string | null) {
  awayInMemory = json;

  if (typeof bridge?.saveAway !== 'function') {
    return;
  }

  try {
    bridge.saveAway(json);
  } catch {
    // A failed save costs the restore after a restart, not the room.
  }
}
