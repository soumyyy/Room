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

export type WizCommandResult = {
  statuses: WizPilotStatus[];
  confirmedIds: string[];
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
): Promise<WizCommandResult> {
  const sends = await Promise.allSettled(bulbs.map((bulb) => Wiz.pilot(bulb.ip, params)));
  const confirmed = (statuses: WizPilotStatus[]) => {
    const statusById = new Map(statuses.map((status) => [status.id, status]));

    return bulbs.flatMap((bulb, index) => {
      const status = statusById.get(bulb.id);
      if (sends[index].status !== 'fulfilled' || !status?.available) {
        return [];
      }

      if (typeof params.state === 'boolean' && status.isOn !== params.state) {
        return [];
      }

      const expected = [
        ['dimming', status.brightness],
        ['temp', status.temp],
        ['r', status.r],
        ['g', status.g],
        ['b', status.b],
      ] as const;

      const valuesMatch = expected.every(([key, actual]) => {
        const requested = params[key];
        return typeof requested !== 'number' || (actual !== null && Math.abs(actual - requested) <= 1);
      });

      return valuesMatch ? [bulb.id] : [];
    });
  };

  await sleep(150);
  let statuses = await getWizStatuses(bulbs);
  let confirmedIds = confirmed(statuses);

  // A bulb can acknowledge the UDP send before its next getPilot reflects the
  // mutation. One bounded retry avoids treating that short propagation delay as
  // a failed command while still refusing to claim success without read-back.
  if (confirmedIds.length !== bulbs.length) {
    await sleep(250);
    statuses = await getWizStatuses(bulbs);
    confirmedIds = confirmed(statuses);
  }

  return { statuses, confirmedIds };
}
