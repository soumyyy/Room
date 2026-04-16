import { createHash, createHmac, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';

const config = {
  host: process.env.HOST ?? '0.0.0.0',
  port: Number.parseInt(process.env.PORT ?? '8787', 10),
  tuyaBaseUrl: process.env.TUYA_API_BASE_URL ?? 'https://openapi.tuyain.com',
  clientId: process.env.TUYA_CLIENT_ID ?? '',
  clientSecret: process.env.TUYA_CLIENT_SECRET ?? '',
  infraredId: process.env.TUYA_INFRARED_ID ?? '',
  acRemoteId: process.env.TUYA_AC_REMOTE_ID ?? '',
};

const tokenCache = {
  value: '',
  expiresAt: 0,
};

function isConfigured() {
  return Boolean(
    config.clientId &&
      config.clientSecret &&
      config.infraredId &&
      config.acRemoteId,
  );
}

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

  const searchParams = new URLSearchParams();

  for (const [key, value] of entries) {
    searchParams.append(key, String(value));
  }

  return `?${searchParams.toString()}`;
}

function buildRequestPath(path, query) {
  return `${path}${buildQueryString(query)}`;
}

function buildSignedHeaders({ method, requestPath, body = '', accessToken = '' }) {
  const t = Date.now().toString();
  const nonce = randomUUID().replace(/-/g, '');
  const stringToSign = [
    method.toUpperCase(),
    sha256(body),
    '',
    requestPath,
  ].join('\n');
  const signPayload = `${config.clientId}${accessToken}${t}${nonce}${stringToSign}`;
  const sign = hmacSha256(signPayload, config.clientSecret);

  return {
    client_id: config.clientId,
    t,
    nonce,
    sign_method: 'HMAC-SHA256',
    sign,
    ...(accessToken ? { access_token: accessToken } : {}),
  };
}

async function readJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (!chunks.length) {
    return {};
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  return JSON.parse(raw);
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(payload, null, 2));
}

function sendNoContent(response) {
  response.writeHead(204, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  });
  response.end();
}

async function getAccessToken(forceRefresh = false) {
  if (!forceRefresh && tokenCache.value && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.value;
  }

  const requestPath = buildRequestPath('/v1.0/token', { grant_type: 1 });
  const headers = buildSignedHeaders({
    method: 'GET',
    requestPath,
  });

  const result = await fetch(`${config.tuyaBaseUrl}${requestPath}`, {
    method: 'GET',
    headers,
  });

  const payload = await result.json();

  if (!result.ok || !payload.success) {
    throw new Error(payload.msg || `Tuya token request failed with HTTP ${result.status}`);
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

    const result = await fetch(`${config.tuyaBaseUrl}${requestPath}`, {
      method,
      headers,
      ...(bodyString ? { body: bodyString } : {}),
    });

    const payload = await result.json();

    if (!result.ok || !payload.success) {
      const error = new Error(payload.msg || `Tuya request failed with HTTP ${result.status}`);
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
    throw new Error('temp must be an integer between 16 and 30');
  }

  if (![0, 1, 2, 3].includes(scene.wind)) {
    throw new Error('wind must be 0, 1, 2, or 3');
  }

  return scene;
}

async function handleRequest(request, response) {
  if (request.method === 'OPTIONS') {
    sendNoContent(response);
    return;
  }

  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);

  if (url.pathname === '/health' && request.method === 'GET') {
    sendJson(response, 200, {
      ok: true,
      configured: isConfigured(),
      infraredId: config.infraredId || null,
      acRemoteId: config.acRemoteId || null,
      tuyaBaseUrl: config.tuyaBaseUrl,
    });
    return;
  }

  if (!isConfigured()) {
    sendJson(response, 500, {
      ok: false,
      error: 'Missing backend configuration. Fill backend/.env first.',
    });
    return;
  }

  try {
    if (url.pathname === '/api/tuya/remotes' && request.method === 'GET') {
      const remotes = await tuyaRequest({
        method: 'GET',
        path: `/v2.0/infrareds/${config.infraredId}/remotes`,
      });

      sendJson(response, 200, { ok: true, remotes });
      return;
    }

    if (url.pathname === '/api/ac/status' && request.method === 'GET') {
      const status = await tuyaRequest({
        method: 'GET',
        path: `/v2.0/infrareds/${config.infraredId}/remotes/${config.acRemoteId}/ac/status`,
      });

      sendJson(response, 200, { ok: true, status });
      return;
    }

    if (url.pathname === '/api/ac/scene' && request.method === 'POST') {
      const input = await readJsonBody(request);
      const scene = normalizeScenePayload(input);
      const result = await tuyaRequest({
        method: 'POST',
        path: `/v2.0/infrareds/${config.infraredId}/air-conditioners/${config.acRemoteId}/scenes/command`,
        body: scene,
      });

      sendJson(response, 200, { ok: true, result });
      return;
    }

    sendJson(response, 404, {
      ok: false,
      error: `No route for ${request.method} ${url.pathname}`,
    });
  } catch (error) {
    sendJson(response, 500, {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown backend error',
    });
  }
}

const server = createServer((request, response) => {
  handleRequest(request, response).catch((error) => {
    sendJson(response, 500, {
      ok: false,
      error: error instanceof Error ? error.message : 'Unexpected server error',
    });
  });
});

server.listen(config.port, config.host, () => {
  console.log(`Home Control backend listening on http://${config.host}:${config.port}`);
});
