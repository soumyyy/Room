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
};

async function send(ip: string, payload: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = UdpSocket.createSocket({ type: 'udp4' });
    const body = JSON.stringify(payload);
    let settled = false;

    const finish = (next: () => void) => {
      if (settled) {
        return;
      }

      settled = true;

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
    let timeout: ReturnType<typeof setTimeout> | null = null;

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
        finish(() => resolve(JSON.parse(message.toString('utf8'))));
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

        timeout = setTimeout(() => {
          finish(() => reject(new Error(`WiZ device ${ip} timed out`)));
        }, RESPONSE_TIMEOUT_MS);
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
  };
}

async function getPilot(ip: string): Promise<WizPilotResult> {
  const payload = await request(ip);

  if (payload && typeof payload === 'object' && payload.error) {
    const error = payload.error as { message?: string };
    throw new Error(error.message ?? `WiZ device ${ip} rejected the request`);
  }

  return toPilotResult((payload.result as Record<string, unknown>) ?? {});
}

export const Wiz = {
  pilot: (ip: string, params: Record<string, unknown>) =>
    send(ip, { method: 'setPilot', params }),
  on: (ip: string) => send(ip, { method: 'setPilot', params: { state: true } }),
  off: (ip: string) => send(ip, { method: 'setPilot', params: { state: false } }),
  getPilot,
};
