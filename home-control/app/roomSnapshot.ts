import { NativeEventEmitter, NativeModules } from 'react-native';

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
  logAction?(payload: { action: string; startedAt: number; milliseconds: number; error?: string }): void;
  readActionLog?(): Promise<string>;
  clearActionLog?(): void;
};

const bridge = (NativeModules as Record<string, unknown>).RoomSnapshotBridge as
  | RoomSnapshotBridge
  | undefined;

/// The bridge is iOS-only and absent from Expo Go, so every call is optional.
/// A stale widget must never be able to break the app, which is why nothing
/// here throws or surfaces an error.

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

/**
 * Calls `listener` whenever the shared room state changes in any process:
 * Siri, the widget, Control Center or this app. Returns the unsubscribe.
 */
export function onRoomStateChanged(listener: () => void): () => void {
  if (!bridge) return () => {};
  try {
    const subscription = new NativeEventEmitter(bridge as never).addListener('roomStateChanged', listener);
    return () => subscription.remove();
  } catch {
    return () => {};
  }
}

/** Seconds between 1970 and 2001: Swift's JSONEncoder writes dates from 2001. */
const SWIFT_DATE_OFFSET_S = 978_307_200;

/**
 * When the last AC command left from any process (app, widget, Siri, Control
 * Center), in ms since 1970, or null. The IR blaster drops a code sent too
 * soon after the previous one, wherever that one came from.
 */
export async function lastSharedAcCommandAt(): Promise<number | null> {
  try {
    const json = await bridge?.read?.();
    const at = json ? (JSON.parse(json) as { commandedAt?: Record<string, number> }).commandedAt?.ac : undefined;
    return typeof at === 'number' ? (at + SWIFT_DATE_OFFSET_S) * 1000 : null;
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
  bridge?.recordObservation?.({ keys: ['ac'], observedAt, command, snapshot: { ac: scene, lights: {} } });
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
  const groups = groupId === 'all' ? BULB_GROUPS.map((group) => group.id) : [groupId];
  const brightness = typeof params.dimming === 'number' ? params.dimming : null;
  const lights = Object.fromEntries(groups.map((id) => [id, { isOn: params.state === true, ...(brightness === null ? {} : { brightness }), ...(presetId ? { presetID: presetId } : {}) }]));
  bridge?.recordObservation?.({ keys: groups.map((id) => 'lights:' + id), observedAt, snapshot: { lights } });
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

/** One entry in the log shared with the widget and Siri. `milliseconds` is
 *  null when the action never finished: its process was killed mid-action. */
export type ActionRecord = {
  id: string;
  at: number;
  action: string;
  source: string;
  milliseconds?: number | null;
  error?: string | null;
};

/** Records a finished app action. Never throws: diagnostics must not break control. */
export function logAction(action: string, startedAt: number, error?: unknown) {
  try {
    bridge?.logAction?.({
      action,
      startedAt,
      milliseconds: Date.now() - startedAt,
      ...(error === undefined ? {} : { error: error instanceof Error ? error.message : String(error) }),
    });
  } catch {
    // Diagnostics only.
  }
}

export async function readActionLog(): Promise<ActionRecord[]> {
  try {
    const json = await bridge?.readActionLog?.();
    return json ? (JSON.parse(json) as ActionRecord[]) : [];
  } catch {
    return [];
  }
}

export function clearActionLog() {
  try {
    bridge?.clearActionLog?.();
  } catch {
    // Diagnostics only.
  }
}
