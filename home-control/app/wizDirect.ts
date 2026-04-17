import type { BulbConfig } from './config';
import { Wiz, type WizPilotResult } from './wiz';

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

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function toStatus(bulb: BulbConfig, result: WizPilotResult): WizPilotStatus {
  return {
    id: bulb.id,
    ip: bulb.ip,
    ...result,
  };
}

export async function getWizStatuses(bulbs: BulbConfig[]): Promise<WizPilotStatus[]> {
  return Promise.all(bulbs.map(async (bulb) => toStatus(bulb, await Wiz.getPilot(bulb.ip))));
}

export async function sendWizCommand(
  bulbs: BulbConfig[],
  params: Record<string, unknown>,
): Promise<WizPilotStatus[]> {
  await Promise.all(bulbs.map((bulb) => Wiz.pilot(bulb.ip, params)));
  await sleep(150);
  return getWizStatuses(bulbs);
}
