// WiZ UDP protocol — port 38899, JSON payloads, fire-and-forget
// react-native-udp sends raw UDP directly from the device over local Wi-Fi.

import UdpSocket from 'react-native-udp';

const WIZ_PORT = 38899;

async function send(ip: string, params: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = UdpSocket.createSocket({ type: 'udp4' });
    const payload = JSON.stringify({ method: 'setPilot', params });
    let settled = false;

    const finish = (next: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      next();
    };

    socket.bind(0, () => {
      socket.send(payload, undefined, undefined, WIZ_PORT, ip, (err?: Error) => {
        finish(() => {
          try {
            socket.close();
          } catch {
            // ignore close failures
          }

          if (err) {
            reject(err);
            return;
          }

          resolve();
        });
      });
    });

    socket.on('error', (err: Error) => {
      finish(() => {
        try {
          socket.close();
        } catch {
          // ignore close failures
        }

        reject(err);
      });
    });
  });
}

export const Wiz = {
  pilot: (ip: string, params: Record<string, unknown>) => send(ip, params),
  on: (ip: string) => send(ip, { state: true }),
  off: (ip: string) => send(ip, { state: false }),
  brightness: (ip: string, dimming: number) => send(ip, { dimming: Math.round(dimming) }),
  color: (ip: string, r: number, g: number, b: number) => send(ip, { r, g, b }),
  temp: (ip: string, temp: number) => send(ip, { temp: Math.round(temp) }),
};
