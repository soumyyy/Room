const { createHash, createHmac, randomUUID } = require('node:crypto');
const { TUYA } = require('./config.cjs');

const tokenCache = {
  value: '',
  expiresAt: 0,
};

function sha256(input) {
  return createHash('sha256').update(input).digest('hex');
}

function hmacSha256(input, secret) {
  return createHmac('sha256', secret).update(input).digest('hex').toUpperCase();
}

function buildQueryString(query = {}) {
  const entries = Object.entries(query)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([left], [right]) => left.localeCompare(right));

  if (!entries.length) {
    return '';
  }

  const params = new URLSearchParams();
  for (const [key, value] of entries) {
    params.append(key, String(value));
  }

  return `?${params.toString()}`;
}

function buildRequestPath(path, query) {
  return `${path}${buildQueryString(query)}`;
}

function buildSignedHeaders({ method, requestPath, body = '', accessToken = '' }) {
  const timestamp = Date.now().toString();
  const nonce = randomUUID().replace(/-/g, '');
  const stringToSign = [method.toUpperCase(), sha256(body), '', requestPath].join('\n');
  const signPayload = `${TUYA.clientId}${accessToken}${timestamp}${nonce}${stringToSign}`;
  const sign = hmacSha256(signPayload, TUYA.clientSecret);

  return {
    client_id: TUYA.clientId,
    t: timestamp,
    nonce,
    sign_method: 'HMAC-SHA256',
    sign,
    ...(accessToken ? { access_token: accessToken } : {}),
  };
}

async function getAccessToken(forceRefresh = false) {
  if (!forceRefresh && tokenCache.value && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.value;
  }

  const requestPath = buildRequestPath('/v1.0/token', { grant_type: 1 });
  const response = await fetch(`${TUYA.apiBaseUrl}${requestPath}`, {
    method: 'GET',
    headers: buildSignedHeaders({
      method: 'GET',
      requestPath,
    }),
  });

  const payload = await response.json();

  if (!response.ok || !payload.success) {
    throw new Error(payload.msg || `Tuya token request failed with HTTP ${response.status}`);
  }

  tokenCache.value = payload.result.access_token;
  tokenCache.expiresAt = Date.now() + Number(payload.result.expire_time || 3600) * 1000;
  return tokenCache.value;
}

async function tuyaRequest({ method, path, query, body }) {
  const bodyString = body ? JSON.stringify(body) : '';

  const run = async (forceRefresh = false) => {
    const accessToken = await getAccessToken(forceRefresh);
    const requestPath = buildRequestPath(path, query);
    const headers = {
      ...buildSignedHeaders({
        method,
        requestPath,
        body: bodyString,
        accessToken,
      }),
      ...(bodyString ? { 'Content-Type': 'application/json' } : {}),
    };

    const response = await fetch(`${TUYA.apiBaseUrl}${requestPath}`, {
      method,
      headers,
      ...(bodyString ? { body: bodyString } : {}),
    });

    const payload = await response.json();

    if (!response.ok || !payload.success) {
      const error = new Error(payload.msg || `Tuya request failed with HTTP ${response.status}`);
      error.code = payload.code;
      throw error;
    }

    return payload.result;
  };

  try {
    return await run(false);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error) {
      const code = String(error.code);
      if (code === '1010' || code === '1011') {
        tokenCache.value = '';
        tokenCache.expiresAt = 0;
        return run(true);
      }
    }

    throw error;
  }
}

function normalizeScenePayload(input) {
  const scene = {
    power: Number(input.power),
    mode: Number(input.mode),
    temp: Number(input.temp),
    wind: Number(input.wind),
  };

  if (![0, 1].includes(scene.power)) {
    throw new Error('power must be 0 or 1');
  }

  if (![0, 1, 2, 3, 4].includes(scene.mode)) {
    throw new Error('mode must be 0, 1, 2, 3, or 4');
  }

  if (!Number.isInteger(scene.temp) || scene.temp < 16 || scene.temp > 30) {
    throw new Error('temp must be between 16 and 30');
  }

  if (![0, 1, 2, 3].includes(scene.wind)) {
    throw new Error('wind must be 0, 1, 2, or 3');
  }

  return scene;
}

function normalizeAcStatus(status) {
  const rawPower = status.power_open !== undefined
    ? (status.power_open ? 1 : 0)
    : Number(status.power || 0);

  return {
    power: rawPower === 1 ? 1 : 0,
    mode: Number.isFinite(Number(status.mode)) ? Number(status.mode) : 0,
    temp: Number.isFinite(Number(status.temperature ?? status.temp))
      ? Number(status.temperature ?? status.temp)
      : 24,
    wind: Number.isFinite(Number(status.fan ?? status.wind)) ? Number(status.fan ?? status.wind) : 1,
  };
}

async function getAcStatus() {
  const status = await tuyaRequest({
    method: 'GET',
    path: `/v2.0/infrareds/${TUYA.infraredId}/remotes/${TUYA.acRemoteId}/ac/status`,
  });

  return normalizeAcStatus(status);
}

async function sendAcScene(scene) {
  await tuyaRequest({
    method: 'POST',
    path: `/v2.0/infrareds/${TUYA.infraredId}/air-conditioners/${TUYA.acRemoteId}/scenes/command`,
    body: normalizeScenePayload(scene),
  });

  return getAcStatus();
}

module.exports = {
  getAcStatus,
  sendAcScene,
};
