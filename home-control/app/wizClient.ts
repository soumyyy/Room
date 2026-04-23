import { NativeModules } from 'react-native';

import type { BulbConfig } from './config';
import type { WizPilotStatus } from './wizDirect';

export type { WizPilotStatus } from './wizDirect';

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
): Promise<WizPilotStatus[]> {
  if (!hasDirectWizSupport()) {
    throw new Error(
      'WiZ direct control is unavailable in this build. Reinstall a full native app build.',
    );
  }

  const direct = require('./wizDirect') as typeof import('./wizDirect');
  return direct.sendWizCommand(bulbs, params);
}
