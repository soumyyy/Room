import { NativeModules } from 'react-native';

import { BULB_GROUPS } from './config';

export type StoredRoomSnapshot = {
  ac?: { power: number; mode: number; temp: number; wind: number } | null;
  lights?: Record<
    string,
    { isOn: boolean; brightness?: number | null; presetID?: string | null }
  >;
  updatedAt?: string | null;
};

type RoomSnapshotBridge = {
  read(): Promise<string | null>;
  recordAC(power: number, mode: number, temp: number, wind: number): void;
  readAway(): Promise<unknown>;
  saveAway(json: string | null): void;
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
}) {
  if (!available()) {
    return;
  }

  try {
    bridge!.recordAC(scene.power, scene.mode, scene.temp, scene.wind);
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
) {
  if (!available()) {
    return;
  }

  const groups = groupId === 'all' ? BULB_GROUPS.map((group) => group.id) : [groupId];
  const brightness = typeof params.dimming === 'number' ? params.dimming : null;

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
