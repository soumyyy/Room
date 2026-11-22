import { NativeModules } from 'react-native';

import type { BulbConfig } from './config';
import { applyViaHub, isHubConfigured, readViaHub } from './roomHub';
import type { WizCommandResult, WizPilotStatus } from './wizDirect';

export type { WizCommandResult, WizPilotStatus } from './wizDirect';

function hasDirectWizSupport() {
  const udpModule = (NativeModules as Record<string, unknown>)?.UdpSockets as
    | { createSocket?: unknown }
    | undefined;

  return typeof udpModule?.createSocket === 'function';
}

export function isUsingDirectWiz() {
  return hasDirectWizSupport();
}

export async function getWizStatuses(bulbs: BulbConfig[]): Promise<WizPilotStatus[]> {
  if (!hasDirectWizSupport()) {
    const viaHub = await readViaHub(bulbs);
    if (viaHub) return bulbs.map((bulb) => viaHub.find((status) => status.id === bulb.id) ?? { id: bulb.id, ip: bulb.ip, available: false, isOn: false, brightness: null, r: null, g: null, b: null, temp: null });
    throw new Error(
      'WiZ direct control is unavailable in this build. Reinstall a full native app build.',
    );
  }

  const direct = require('./wizDirect') as typeof import('./wizDirect');
  const statuses = await direct.getWizStatuses(bulbs);
  const silent = statuses.filter((status) => !status.available);
  if (!silent.length || !isHubConfigured()) return statuses;

  // Away from home the phone cannot reach any bulb; the hub in the room can.
  const viaHub = await readViaHub(silent);
  if (!viaHub?.length) return statuses;
  const replaced = new Map(viaHub.map((status) => [status.id, status]));
  return statuses.map((status) => replaced.get(status.id) ?? status);
}

export async function sendWizCommand(
  bulbs: BulbConfig[],
  params: Record<string, unknown>,
): Promise<WizCommandResult> {
  if (!hasDirectWizSupport()) {
    const viaHub = await applyViaHub(bulbs, params);
    if (viaHub) return viaHub;
    throw new Error(
      'WiZ direct control is unavailable in this build. Reinstall a full native app build.',
    );
  }

  const direct = require('./wizDirect') as typeof import('./wizDirect');
  const result = await direct.sendWizCommand(bulbs, params);
  const missing = bulbs.filter((bulb) => !result.confirmedIds.includes(bulb.id));
  if (!missing.length || !isHubConfigured()) return result;

  // Second line of defence: the hub in the room retries only the bulbs the
  // phone could not confirm, and its readings replace the phone's.
  const viaHub = await applyViaHub(missing, params);
  if (!viaHub) return result;
  const replaced = new Map(viaHub.statuses.map((status) => [status.id, status]));
  return {
    statuses: result.statuses.map((status) => replaced.get(status.id) ?? status),
    confirmedIds: [...result.confirmedIds, ...viaHub.confirmedIds],
  };
}
