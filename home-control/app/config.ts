import { TUYA_SECRETS } from './config.secrets';

export interface BulbConfig {
  id: string;
  name: string;
  ip: string;
}

export interface BulbGroupConfig {
  id: string;
  name: string;
  bulbIds: string[];
}

export interface TuyaCloudConfig {
  infraredId: string;
  acRemoteId: string;
  clientId: string;
  clientSecret: string;
  apiBaseUrl: string;
}

// ── WiZ bulbs ──────────────────────────────────────────────────────────────
export const BULBS: BulbConfig[] = [
  { id: 'left-1', name: 'Left Light 1', ip: '192.168.29.131' },
  { id: 'left-2', name: 'Left Light 2', ip: '192.168.29.180' },
  { id: 'right-1', name: 'Right Light 1', ip: '192.168.29.116' },
  { id: 'right-2', name: 'Right Light 2', ip: '192.168.29.151' },
];

export const BULB_GROUPS: BulbGroupConfig[] = [
  {
    id: 'left',
    name: 'Left Lights',
    bulbIds: ['left-1', 'left-2'],
  },
  {
    id: 'right',
    name: 'Right Lights',
    bulbIds: ['right-1', 'right-2'],
  },
];

// ── Tuya cloud AC control on-device ────────────────────────────────────────
export const TUYA_CLOUD: TuyaCloudConfig = {
  infraredId: TUYA_SECRETS.infraredId,
  acRemoteId: TUYA_SECRETS.acRemoteId,
  clientId: TUYA_SECRETS.clientId,
  clientSecret: TUYA_SECRETS.clientSecret,
  apiBaseUrl: TUYA_SECRETS.apiBaseUrl,
};
