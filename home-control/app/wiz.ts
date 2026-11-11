import UdpSocket from 'react-native-udp';

const WIZ_PORT = 38899;
const RESPONSE_TIMEOUT_MS = 1200;

export type WizPilotResult = {
  isOn: boolean;
  brightness: number | null;
  r: number | null;
  g: number | null;
  b: number | null;
  temp: number | null;
  c?: number | null;
  w?: number | null;
};

async function send(ip: string, payload: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = UdpSocket.createSocket({ type: 'udp4' });
    const body = JSON.stringify(payload);
    let settled = false;
    const timeout = setTimeout(() => finish(() => reject(new Error(`WiZ device ${ip} timed out`))), RESPONSE_TIMEOUT_MS);

    const finish = (next: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);

      try {
        socket.close();
      } catch {
        // ignore close failures
      }

      next();
    };

    socket.on('error', (error: Error) => finish(() => reject(error)));
    socket.bind(0, () => {
      socket.send(body, undefined, undefined, WIZ_PORT, ip, (error?: Error) => {
        if (error) {
          finish(() => reject(error));
          return;
        }

        finish(() => resolve());
      });
    });
  });
}

async function request(ip: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const socket = UdpSocket.createSocket({ type: 'udp4' });
    const body = JSON.stringify({ method: 'getPilot', params: {} });
    let settled = false;
    const timeout = setTimeout(() => finish(() => reject(new Error(`WiZ device ${ip} timed out`))), RESPONSE_TIMEOUT_MS);

    const finish = (next: () => void) => {
      if (settled) {
        return;
      }

      settled = true;

      if (timeout) {
        clearTimeout(timeout);
      }

      try {
        socket.close();
      } catch {
        // ignore close failures
      }

      next();
    };

    socket.on('message', (message: Buffer, remote: { address?: string }) => {
      if (remote.address !== ip) {
        return;
      }

      try {
        const payload: unknown = JSON.parse(message.toString('utf8'));
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
          throw new Error('Invalid WiZ response');
        }
        finish(() => resolve(payload as Record<string, unknown>));
      } catch {
        finish(() => reject(new Error(`Invalid WiZ response from ${ip}`)));
      }
    });

    socket.on('error', (error: Error) => finish(() => reject(error)));

    socket.bind(0, () => {
      socket.send(body, undefined, undefined, WIZ_PORT, ip, (error?: Error) => {
        if (error) {
          finish(() => reject(error));
          return;
        }

      });
    });
  });
}

function toPilotResult(result: Record<string, unknown>): WizPilotResult {
  return {
    isOn: Boolean(result.state),
    brightness: Number.isFinite(Number(result.dimming)) ? Number(result.dimming) : null,
    r: Number.isFinite(Number(result.r)) ? Number(result.r) : null,
    g: Number.isFinite(Number(result.g)) ? Number(result.g) : null,
    b: Number.isFinite(Number(result.b)) ? Number(result.b) : null,
    temp: Number.isFinite(Number(result.temp)) ? Number(result.temp) : null,
    c: result.c != null && Number.isFinite(Number(result.c)) ? Number(result.c) : null,
    w: result.w != null && Number.isFinite(Number(result.w)) ? Number(result.w) : null,
  };
}

async function getPilot(ip: string): Promise<WizPilotResult> {
  const payload = await request(ip);

  if (payload && typeof payload === 'object' && payload.error) {
    const error = payload.error as { message?: string };
    throw new Error(error.message ?? `WiZ device ${ip} rejected the request`);
  }

  const result = payload.result as Record<string, unknown> | undefined;
  if (!result || typeof result.state !== 'boolean') {
    throw new Error(`WiZ device ${ip} returned no valid state`);
  }
  return toPilotResult(result);
}

export const Wiz = {
  pilot: (ip: string, params: Record<string, unknown>) =>
    send(ip, { method: 'setPilot', params }),
  on: (ip: string) => send(ip, { method: 'setPilot', params: { state: true } }),
  off: (ip: string) => send(ip, { method: 'setPilot', params: { state: false } }),
  getPilot,
};
