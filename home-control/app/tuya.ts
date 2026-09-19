import CryptoJS from 'crypto-js';
import { NODE, TUYA_CLOUD } from './config';

export type AcScenePayload = {
  power: 0 | 1;
  mode: 0 | 1 | 2 | 3 | 4;
  temp: number;
  wind: 0 | 1 | 2 | 3;
};

export type AcStatus = {
  power_open?: boolean;
  power_name?: string;
  power?: string | number;
  mode?: number;
  temp?: string | number;
  mode_name?: string;
  temperature?: string | number;
  temperature_name?: string;
  fan?: number;
  wind?: string | number;
  fan_name?: string;
};

const tokenCache = {
  value: '',
  expiresAt: 0,
};

const TUYA_REQUEST_TIMEOUT_MS = 8_000;

function normalizeNetworkError(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') {
    return new Error('Tuya Cloud timed out.');
  }

  if (error instanceof TypeError) {
    return new Error(fallback);
  }

  return error instanceof Error ? error : new Error(fallback);
}

async function fetchTuya(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TUYA_REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function readPayload(response: Response, fallback: string): Promise<Record<string, unknown>> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    throw new Error(response.ok ? 'Tuya Cloud returned an invalid response.' : fallback);
  }
}

function errorMessage(payload: Record<string, unknown>, fallback: string) {
  if (String(payload.code ?? '') === '30003') {
    return 'Device is offline.';
  }

  return typeof payload.msg === 'string' && payload.msg ? payload.msg : fallback;
}

function sha256(input: string): string {
  return CryptoJS.SHA256(input).toString(CryptoJS.enc.Hex);
}

function hmacSha256(input: string, secret: string): string {
  return CryptoJS.HmacSHA256(input, secret).toString(CryptoJS.enc.Hex).toUpperCase();
}

function uuidV4(): string {
  return 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const rand = (Math.random() * 16) | 0;
    return (char === 'x' ? rand : (rand & 0x3) | 0x8).toString(16);
  });
}

function buildQueryString(query: Record<string, unknown> = {}) {
  const entries = Object.entries(query)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([left], [right]) => left.localeCompare(right));

  if (!entries.length) {
    return '';
  }

  return `?${new URLSearchParams(entries.map(([key, value]) => [key, String(value)])).toString()}`;
}

function buildSignedHeaders({
  method,
  requestPath,
  body = '',
  accessToken = '',
}: {
  method: string;
  requestPath: string;
  body?: string;
  accessToken?: string;
}) {
  const { clientId, clientSecret } = TUYA_CLOUD;
  const timestamp = Date.now().toString();
  const nonce = uuidV4();
  const stringToSign = [method.toUpperCase(), sha256(body), '', requestPath].join('\n');
  const signPayload = `${clientId}${accessToken}${timestamp}${nonce}${stringToSign}`;
  const sign = hmacSha256(signPayload, clientSecret);

  return {
    client_id: clientId,
    t: timestamp,
    nonce,
    sign_method: 'HMAC-SHA256',
    sign,
    ...(accessToken ? { access_token: accessToken } : {}),
  };
}

async function getAccessToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && tokenCache.value && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.value;
  }

  const requestPath = '/v1.0/token?grant_type=1';
  const headers = buildSignedHeaders({ method: 'GET', requestPath });

  let response: Response;
  try {
    response = await fetchTuya(`${TUYA_CLOUD.apiBaseUrl}${requestPath}`, {
      method: 'GET',
      headers,
    });
  } catch (error) {
    throw normalizeNetworkError(error, 'Unable to reach Tuya Cloud.');
  }

  const payload = await readPayload(response, 'Tuya token request failed');

  if (!response.ok || !payload.success) {
    throw new Error(errorMessage(payload, 'Tuya token request failed'));
  }

  const result = payload.result as Record<string, unknown>;
  tokenCache.value = result.access_token as string;
  tokenCache.expiresAt = Date.now() + Number(result.expire_time ?? 3600) * 1000;
  return tokenCache.value;
}

async function tuyaRequest<T>({
  method,
  path,
  query,
  body,
}: {
  method: string;
  path: string;
  query?: Record<string, unknown>;
  body?: object;
}): Promise<T> {
  const requestPath = `${path}${buildQueryString(query)}`;
  const bodyString = body ? JSON.stringify(body) : '';

  const run = async (forceRefresh = false) => {
    const accessToken = await getAccessToken(forceRefresh);
    const headers = {
      ...buildSignedHeaders({ method, requestPath, body: bodyString, accessToken }),
      ...(bodyString ? { 'Content-Type': 'application/json' } : {}),
    };

    let response: Response;
    try {
      response = await fetchTuya(`${TUYA_CLOUD.apiBaseUrl}${requestPath}`, {
        method,
        headers,
        ...(bodyString ? { body: bodyString } : {}),
      });
    } catch (error) {
      throw normalizeNetworkError(error, 'Unable to reach Tuya Cloud.');
    }

    const payload = await readPayload(response, 'Tuya request failed');

    if (!response.ok || !payload.success) {
      const error = new Error(errorMessage(payload, 'Tuya request failed')) as Error & {
        code?: unknown;
      };
      error.code = payload.code;
      throw error;
    }

    return payload.result as T;
  };

  try {
    return await run(false);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error) {
      const code = String((error as { code: unknown }).code);
      if (code === '1010' || code === '1011') {
        tokenCache.value = '';
        tokenCache.expiresAt = 0;
        return run(true);
      }
    }

    throw error;
  }
}

export async function getAcStatus(): Promise<AcStatus> {
  const { infraredId, acRemoteId } = TUYA_CLOUD;

  return tuyaRequest<AcStatus>({
    method: 'GET',
    path: `/v2.0/infrareds/${infraredId}/remotes/${acRemoteId}/ac/status`,
  });
}

export async function getInfraredDevice(): Promise<{ online: boolean }> {
  return tuyaRequest({
    method: 'GET',
    path: `/v1.0/devices/${TUYA_CLOUD.infraredId}`,
  });
}

export async function sendAcScene(scene: AcScenePayload): Promise<boolean> {
  const { infraredId, acRemoteId } = TUYA_CLOUD;

  return tuyaRequest<boolean>({
    method: 'POST',
    path: `/v2.0/infrareds/${infraredId}/air-conditioners/${acRemoteId}/scenes/command`,
    body: scene,
  });
}

export async function getNodeDevice(): Promise<{
  online: boolean;
  status: Array<{ code: string; value: unknown }>;
}> {
  return tuyaRequest({ method: 'GET', path: `/v1.0/devices/${NODE.id}` });
}

export async function sendNodeCommands(
  commands: Array<{ code: string; value: boolean }>,
): Promise<boolean> {
  return tuyaRequest<boolean>({
    method: 'POST',
    path: `/v1.0/devices/${NODE.id}/commands`,
    body: { commands },
  });
}
