import { NativeModules } from 'react-native';

import { TUYA_CLOUD, type BulbConfig } from './config';
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
  if (hasDirectWizSupport()) {
    const direct = require('./wizDirect') as typeof import('./wizDirect');
    return direct.getWizStatuses(bulbs);
  }

  if (!TUYA_CLOUD.backendBaseUrl.startsWith('http')) {
    throw new Error('WiZ backend URL is not configured.');
  }

  const cloud = require('./wizCloud') as typeof import('./wizCloud');
  return cloud.getWizStatuses(TUYA_CLOUD.backendBaseUrl, bulbs);
}

export async function sendWizCommand(
  bulbs: BulbConfig[],
  params: Record<string, unknown>,
): Promise<WizPilotStatus[]> {
  if (hasDirectWizSupport()) {
    const direct = require('./wizDirect') as typeof import('./wizDirect');
    return direct.sendWizCommand(bulbs, params);
  }

  if (!TUYA_CLOUD.backendBaseUrl.startsWith('http')) {
    throw new Error('WiZ backend URL is not configured.');
  }

  const cloud = require('./wizCloud') as typeof import('./wizCloud');
  return cloud.sendWizCommand(TUYA_CLOUD.backendBaseUrl, { bulbs, params });
}
