import {
  BULBS_GENERATED,
  BULB_GROUPS_GENERATED,
  TUYA_SECRETS,
} from './config.generated';

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
export const BULBS: BulbConfig[] = BULBS_GENERATED;

export const BULB_GROUPS: BulbGroupConfig[] = BULB_GROUPS_GENERATED;

// ── Tuya cloud AC control on-device ────────────────────────────────────────
export const TUYA_CLOUD: TuyaCloudConfig = {
  infraredId: TUYA_SECRETS.infraredId,
  acRemoteId: TUYA_SECRETS.acRemoteId,
  clientId: TUYA_SECRETS.clientId,
  clientSecret: TUYA_SECRETS.clientSecret,
  apiBaseUrl: TUYA_SECRETS.apiBaseUrl,
};
