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
  backendBaseUrl: string;
}

// ── WiZ bulbs ──────────────────────────────────────────────────────────────
// Set static IPs on your router (DHCP reservations) and fill them in here.
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

// ── Tuya cloud-backed AC control ───────────────────────────────────────────
// The mobile app only knows public IDs plus the backend base URL.
export const TUYA_CLOUD: TuyaCloudConfig = {
  infraredId: 'd7629f91c10f8aaa6dbtaw',
  acRemoteId: 'd7c7ddecd3c98a5a00nezc',
  backendBaseUrl: 'http://192.168.29.30:8787',
};
