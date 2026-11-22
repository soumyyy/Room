// The always-on laptop in the room (room-hub/ in the repo). The phone tries the
// bulbs directly first; any bulb it cannot confirm is handed to the hub, which
// sits on the bulbs' Wi-Fi and confirms by reading the bulb back.

import { HUB_CONFIG } from './config.generated';
import type { WizPilotStatus } from './wizDirect';

type HubResult = {
  id: string;
  confirmed: boolean;
  actual: { state: boolean; dimming?: number; temp?: number; r?: number; g?: number; b?: number; c?: number; w?: number } | null;
  error?: string;
};

const PILOT_KEYS = ['state', 'dimming', 'temp', 'r', 'g', 'b', 'c', 'w'] as const;
const LAN_PROBE_MS = 800;
const REQUEST_MS = 5000;

export function isHubConfigured() {
  return Boolean(HUB_CONFIG.token && (HUB_CONFIG.lanUrl || HUB_CONFIG.url));
}

async function fetchWithin(url: string, init: RequestInit, ms: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** The LAN address when it answers quickly, otherwise the HTTPS address. */
async function hubBase(): Promise<string | null> {
  if (HUB_CONFIG.lanUrl) {
    try {
      const response = await fetchWithin(HUB_CONFIG.lanUrl + '/healthz', {}, LAN_PROBE_MS);
      if (response.ok) return HUB_CONFIG.lanUrl;
    } catch {}
  }
  return HUB_CONFIG.url || null;
}

function toPilot(params: Record<string, unknown>) {
  const pilot: Record<string, boolean | number> = {};
  for (const key of PILOT_KEYS) {
    const value = params[key];
    if (key === 'state' && typeof value === 'boolean') pilot.state = value;
    else if (key !== 'state' && typeof value === 'number' && Number.isFinite(value)) pilot[key] = Math.round(value);
  }
  return pilot;
}

/** Statuses for the bulbs the hub reached, or null when the hub is unreachable. */
export async function applyViaHub(
  bulbs: { id: string; ip: string }[],
  params: Record<string, unknown>,
): Promise<{ statuses: WizPilotStatus[]; confirmedIds: string[] } | null> {
  const pilot = toPilot(params);
  if (!isHubConfigured() || typeof pilot.state !== 'boolean' || !bulbs.length) return null;
  const base = await hubBase();
  if (!base) return null;
  try {
    const response = await fetchWithin(
      base + '/v1/lights',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + HUB_CONFIG.token,
          'Content-Type': 'application/json',
          'X-Room-Source': 'app',
        },
        body: JSON.stringify({ pilot, bulbs: bulbs.map((bulb) => bulb.id) }),
      },
      REQUEST_MS,
    );
    if (!response.ok) return null;
    const { results } = (await response.json()) as { results: HubResult[] };
    const statuses = results.flatMap((result): WizPilotStatus[] => {
      const bulb = bulbs.find((candidate) => candidate.id === result.id);
      if (!bulb || !result.actual) return [];
      const a = result.actual;
      return [{
        id: bulb.id,
        ip: bulb.ip,
        available: true,
        isOn: a.state,
        brightness: a.dimming ?? null,
        temp: a.temp ?? null,
        r: a.r ?? null,
        g: a.g ?? null,
        b: a.b ?? null,
        c: a.c ?? null,
        w: a.w ?? null,
      }];
    });
    return { statuses, confirmedIds: results.filter((result) => result.confirmed).map((result) => result.id) };
  } catch {
    return null;
  }
}
