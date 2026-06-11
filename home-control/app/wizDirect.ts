import type { BulbConfig } from './config';
import { Wiz, type WizPilotResult } from './wiz';

export type WizPilotStatus = {
  id: string;
  ip: string;
  available: boolean;
  isOn: boolean;
  brightness: number | null;
  r: number | null;
  g: number | null;
  b: number | null;
  temp: number | null;
};

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function toStatus(bulb: BulbConfig, result: WizPilotResult): WizPilotStatus {
  return {
    id: bulb.id,
    ip: bulb.ip,
    available: true,
    ...result,
  };
}

export async function getWizStatuses(bulbs: BulbConfig[]): Promise<WizPilotStatus[]> {
  return Promise.all(
    bulbs.map(async (bulb) => {
      try {
        return toStatus(bulb, await Wiz.getPilot(bulb.ip));
      } catch {
        return {
          id: bulb.id,
          ip: bulb.ip,
          available: false,
          isOn: false,
          brightness: null,
          r: null,
          g: null,
          b: null,
          temp: null,
        };
      }
    }),
  );
}

export async function sendWizCommand(
  bulbs: BulbConfig[],
  params: Record<string, unknown>,
): Promise<WizPilotStatus[]> {
  await Promise.allSettled(bulbs.map((bulb) => Wiz.pilot(bulb.ip, params)));
  await sleep(150);
  return getWizStatuses(bulbs);
}
