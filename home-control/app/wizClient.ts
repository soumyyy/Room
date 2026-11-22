import { NativeModules } from 'react-native';

import type { BulbConfig } from './config';
import { applyViaHub, isHubConfigured } from './roomHub';
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
    throw new Error(
      'WiZ direct control is unavailable in this build. Reinstall a full native app build.',
    );
  }

  const direct = require('./wizDirect') as typeof import('./wizDirect');
  return direct.getWizStatuses(bulbs);
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
