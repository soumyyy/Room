import UdpSocket from 'react-native-udp';

const WIZ_PORT = 38899;
const WIZ_TIMEOUT_MS = 1500;

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function sendOnce(ip: string, payload: object): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = UdpSocket.createSocket({ type: 'udp4' });
    const data = JSON.stringify(payload);
    let settled = false;

    const finish = (next: () => void) => {
      if (settled) return;
      settled = true;
      try { socket.close(); } catch { }
      next();
    };

    socket.bind(0, () => {
      socket.send(data, undefined, undefined, WIZ_PORT, ip, (err?: Error) => {
        finish(() => err ? reject(err) : resolve());
      });
    });

    socket.on('error', (err: Error) => finish(() => reject(err)));
  });
}

async function setPilot(ip: string, params: Record<string, unknown>): Promise<void> {
  const payload = { method: 'setPilot', params };
  await sendOnce(ip, payload);
  await sleep(75);
  await sendOnce(ip, payload);
}

export type WizPilotResult = {
  isOn: boolean;
  brightness: number | null;
  r: number | null;
  g: number | null;
  b: number | null;
  temp: number | null;
};

async function getPilot(ip: string): Promise<WizPilotResult> {
  return new Promise((resolve, reject) => {
    const socket = UdpSocket.createSocket({ type: 'udp4' });
    const payload = JSON.stringify({ method: 'getPilot', params: {} });
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const finish = (next: () => void) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      try { socket.close(); } catch { }
      next();
    };

    socket.on('message', (message: Buffer, remote: { address: string }) => {
      if (remote.address !== ip) return;
      try {
        const parsed = JSON.parse(message.toString('utf8'));
        const r = parsed?.result ?? {};
        finish(() => resolve({
          isOn: Boolean(r.state),
          brightness: Number.isFinite(Number(r.dimming)) ? Number(r.dimming) : null,
          r: Number.isFinite(Number(r.r)) ? Number(r.r) : null,
          g: Number.isFinite(Number(r.g)) ? Number(r.g) : null,
          b: Number.isFinite(Number(r.b)) ? Number(r.b) : null,
          temp: Number.isFinite(Number(r.temp)) ? Number(r.temp) : null,
        }));
      } catch {
        finish(() => reject(new Error(`Invalid WiZ response from ${ip}`)));
      }
    });

    socket.on('error', (err: Error) => finish(() => reject(err)));

    socket.bind(0, () => {
      socket.send(payload, undefined, undefined, WIZ_PORT, ip, (err?: Error) => {
        if (err) {
          finish(() => reject(err));
          return;
        }
        timer = setTimeout(() => {
          finish(() => reject(new Error(`WiZ device ${ip} timed out`)));
        }, WIZ_TIMEOUT_MS);
      });
    });
  });
}

export const Wiz = {
  pilot: (ip: string, params: Record<string, unknown>) => setPilot(ip, params),
  on: (ip: string) => setPilot(ip, { state: true }),
  off: (ip: string) => setPilot(ip, { state: false }),
  brightness: (ip: string, dimming: number) => setPilot(ip, { dimming: Math.round(dimming) }),
  color: (ip: string, r: number, g: number, b: number) => setPilot(ip, { r, g, b }),
  temp: (ip: string, temp: number) => setPilot(ip, { temp: Math.round(temp) }),
  getPilot,
};
