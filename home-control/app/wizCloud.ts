import type { BulbConfig } from './config';

export type WizPilotStatus = {
  id: string;
  ip: string;
  isOn: boolean;
  brightness: number | null;
  r: number | null;
  g: number | null;
  b: number | null;
  temp: number | null;
};

type WizCommandPayload = {
  bulbs: BulbConfig[];
  params: Record<string, unknown>;
};

async function readJson<T>(response: Response): Promise<T> {
  const payload = await response.json();

  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error ?? `Backend request failed with HTTP ${response.status}`);
  }

  return payload as T;
}

function buildUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/+$/, '')}${path}`;
}

export async function getWizStatuses(
  baseUrl: string,
  bulbs: BulbConfig[],
): Promise<WizPilotStatus[]> {
  const response = await fetch(buildUrl(baseUrl, '/api/wiz/status'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ bulbs }),
  });

  const payload = await readJson<{ ok: true; bulbs: WizPilotStatus[] }>(response);
  return payload.bulbs;
}

export async function sendWizCommand(
  baseUrl: string,
  payload: WizCommandPayload,
): Promise<WizPilotStatus[]> {
  const response = await fetch(buildUrl(baseUrl, '/api/wiz/command'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const result = await readJson<{ ok: true; bulbs: WizPilotStatus[] }>(response);
  return result.bulbs;
}
