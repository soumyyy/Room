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
  recordLights(
    groups: string[],
    isOn: boolean,
    brightness: number | null,
    presetId: string | null,
  ): void;
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
    bridge!.recordLights(groups, params.state === true, brightness, presetId ?? null);
  } catch {
    // Widget state is best-effort.
  }
}
