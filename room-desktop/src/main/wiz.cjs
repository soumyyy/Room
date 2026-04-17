const dgram = require('node:dgram');
const { BULBS, BULB_GROUPS } = require('./config.cjs');

const WIZ_PORT = 38899;
const WIZ_TIMEOUT_MS = 1800;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function bulbsForGroup(groupId) {
  const group = BULB_GROUPS.find((entry) => entry.id === groupId);
  if (!group) {
    throw new Error(`Unknown light group "${groupId}"`);
  }

  return BULBS.filter((bulb) => group.bulbIds.includes(bulb.id));
}

function mapPilotStatus(bulb, result = {}, reachable = true) {
  return {
    id: bulb.id,
    name: bulb.name,
    ip: bulb.ip,
    reachable,
    isOn: Boolean(result.state),
    brightness: Number.isFinite(Number(result.dimming)) ? Number(result.dimming) : null,
    r: Number.isFinite(Number(result.r)) ? Number(result.r) : null,
    g: Number.isFinite(Number(result.g)) ? Number(result.g) : null,
    b: Number.isFinite(Number(result.b)) ? Number(result.b) : null,
    temp: Number.isFinite(Number(result.temp)) ? Number(result.temp) : null,
  };
}

async function sendUdpJson(ip, payload, { expectReply = false } = {}) {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4');
    const rawPayload = Buffer.from(JSON.stringify(payload));
    let settled = false;
    let timer = null;

    const finish = (next) => {
      if (settled) {
        return;
      }

      settled = true;

      if (timer) {
        clearTimeout(timer);
      }

      try {
        socket.close();
      } catch {
        // ignore close failures
      }

      next();
    };

    socket.once('error', (error) => finish(() => reject(error)));

    if (expectReply) {
      socket.on('message', (message, remote) => {
        if (remote.address !== ip) {
          return;
        }

        try {
          finish(() => resolve(JSON.parse(message.toString('utf8'))));
        } catch {
          finish(() => reject(new Error(`Invalid WiZ response from ${ip}`)));
        }
      });
    }

    socket.bind(0, () => {
      socket.send(rawPayload, WIZ_PORT, ip, (error) => {
        if (error) {
          finish(() => reject(error));
          return;
        }

        if (!expectReply) {
          finish(() => resolve(null));
          return;
        }

        timer = setTimeout(() => {
          finish(() => reject(new Error(`WiZ device ${ip} timed out`)));
        }, WIZ_TIMEOUT_MS);
      });
    });
  });
}

async function getPilot(ip) {
  const payload = await sendUdpJson(
    ip,
    {
      method: 'getPilot',
      params: {},
    },
    { expectReply: true },
  );

  if (payload && typeof payload === 'object' && payload.error) {
    throw new Error(payload.error.message ?? `WiZ device ${ip} rejected the request`);
  }

  return payload?.result ?? {};
}

async function setPilot(ip, params) {
  const payload = {
    method: 'setPilot',
    params,
  };

  await sendUdpJson(ip, payload);
  await sleep(75);
  await sendUdpJson(ip, payload);
}

async function readBulbStatuses(bulbs = BULBS) {
  const results = await Promise.allSettled(
    bulbs.map(async (bulb) => mapPilotStatus(bulb, await getPilot(bulb.ip), true)),
  );

  const reachableCount = results.filter((entry) => entry.status === 'fulfilled').length;
  if (reachableCount === 0) {
    throw new Error('Unable to reach any WiZ lights');
  }

  return results.map((entry, index) =>
    entry.status === 'fulfilled' ? entry.value : mapPilotStatus(bulbs[index], {}, false),
  );
}

async function readAllBulbStatuses() {
  return readBulbStatuses(BULBS);
}

async function applyPilotToBulbs(bulbs, params) {
  const results = await Promise.allSettled(bulbs.map((bulb) => setPilot(bulb.ip, params)));
  const successfulCount = results.filter((entry) => entry.status === 'fulfilled').length;

  if (successfulCount === 0) {
    throw new Error('WiZ command failed for the selected lights');
  }

  await sleep(150);

  return {
    bulbs: await readAllBulbStatuses(),
  };
}

async function setGroupPower(groupId, isOn) {
  return applyPilotToBulbs(bulbsForGroup(groupId), { state: Boolean(isOn) });
}

async function setAllGroupsPower(isOn) {
  return applyPilotToBulbs(BULBS, { state: Boolean(isOn) });
}

async function toggleGroup(groupId) {
  const bulbs = bulbsForGroup(groupId);
  const currentStatuses = await readBulbStatuses(bulbs);
  const reachableStatuses = currentStatuses.filter((entry) => entry.reachable);

  if (reachableStatuses.length === 0) {
    throw new Error(`Unable to verify "${groupId}" light status`);
  }

  const shouldTurnOn = !reachableStatuses.some((entry) => entry.isOn);
  const response = await setGroupPower(groupId, shouldTurnOn);

  return {
    toggledOn: shouldTurnOn,
    bulbs: response.bulbs,
  };
}

async function applyGroupPreset(groupId, params) {
  return applyPilotToBulbs(bulbsForGroup(groupId), params);
}

async function setGroupBrightness(groupId, dimming) {
  const level = Math.max(10, Math.min(100, Math.round(Number(dimming))));
  return applyGroupToBulbsWithState(groupId, { dimming: level });
}

async function applyGroupToBulbsWithState(groupId, extraParams) {
  return applyPilotToBulbs(bulbsForGroup(groupId), {
    state: true,
    ...extraParams,
  });
}

module.exports = {
  readAllBulbStatuses,
  toggleGroup,
  setGroupPower,
  setAllGroupsPower,
  applyGroupPreset,
  setGroupBrightness,
};
