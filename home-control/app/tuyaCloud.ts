export type AcScenePayload = {
  power: 0 | 1;
  mode: 0 | 1 | 2 | 3 | 4;
  temp: number;
  wind: 0 | 1 | 2 | 3;
};

export type AcStatus = {
  power_open?: boolean;
  power_name?: string;
  mode?: number;
  mode_name?: string;
  temperature?: string | number;
  temperature_name?: string;
  fan?: number;
  fan_name?: string;
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

export async function getAcStatus(baseUrl: string): Promise<AcStatus> {
  const response = await fetch(buildUrl(baseUrl, '/api/ac/status'));
  const payload = await readJson<{ ok: true; status: AcStatus }>(response);
  return payload.status;
}

export async function sendAcScene(baseUrl: string, scene: AcScenePayload): Promise<boolean> {
  const response = await fetch(buildUrl(baseUrl, '/api/ac/scene'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(scene),
  });
  const payload = await readJson<{ ok: true; result: boolean }>(response);
  return payload.result;
}
