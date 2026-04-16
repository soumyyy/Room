export interface BulbConfig {
  id: string;
  name: string;
  ip: string;
}

export interface TuyaCloudConfig {
  infraredId: string;
  acRemoteId: string;
  backendBaseUrl: string;
}

// ── WiZ bulbs ──────────────────────────────────────────────────────────────
// Set static IPs on your router (DHCP reservations) and fill them in here.
export const BULBS: BulbConfig[] = [
  { id: 'bulb-1', name: 'Desk Lamp', ip: '192.168.1.101' },
  { id: 'bulb-2', name: 'Ceiling Light', ip: '192.168.1.102' },
];

// ── Tuya cloud-backed AC control ───────────────────────────────────────────
// The mobile app only knows public IDs plus the backend base URL.
export const TUYA_CLOUD: TuyaCloudConfig = {
  infraredId: 'd7629f91c10f8aaa6dbtaw',
  acRemoteId: 'd7c7ddecd3c98a5a00nezc',
  backendBaseUrl: 'http://192.168.29.30:8787',
};
