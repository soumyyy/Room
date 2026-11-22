// WiZ bulbs over local UDP (port 38899), from a machine that sits on the same
// Wi-Fi as the bulbs. Same protocol and confirmation rules as the phone's
// WiZClient.swift: send setPilot in a short burst, read the bulb back with
// getPilot, repeat until the reading matches or the budget runs out.

import dgram from "node:dgram";

export const WIZ_PORT = 38899;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Fields a pilot may set. Anything else in a request is ignored. */
const PILOT_FIELDS = ["state", "dimming", "temp", "r", "g", "b", "c", "w"];

export function cleanPilot(input) {
  if (!input || typeof input.state !== "boolean")
    throw new Error("pilot.state must be true or false");
  const pilot = { state: input.state };
  for (const key of PILOT_FIELDS.slice(1)) {
    const value = input[key];
    if (value === undefined || value === null) continue;
    if (!Number.isInteger(value) || value < 0 || value > 10000)
      throw new Error(`pilot.${key} must be a whole number`);
    pilot[key] = value;
  }
  return pilot;
}

/** Same rule as WizPilot.matches: off only needs state; on needs every
 *  requested value within ±1 of what the bulb reports. */
export function matches(pilot, actual) {
  if (!actual || pilot.state !== actual.state) return false;
  if (!pilot.state) return true;
  return PILOT_FIELDS.slice(1).every((key) => {
    if (pilot[key] === undefined) return true;
    return typeof actual[key] === "number" && Math.abs(actual[key] - pilot[key]) <= 1;
  });
}

export function createWiz({
  budgetMs = 3000,
  burstCount = 3,
  burstGapMs = 100,
  confirmTimeoutMs = 600,
  settleMs = 150,
} = {}) {
  // One queue per bulb, so two commands for the same bulb never interleave.
  const queues = new Map();

  function exchange(bulb, message, { expectReply, timeoutMs }) {
    return new Promise((resolve, reject) => {
      const socket = dgram.createSocket("udp4");
      const timer = setTimeout(() => finish(new Error(`${bulb.ip} did not answer in time`)), timeoutMs);
      function finish(error, value) {
        clearTimeout(timer);
        socket.close();
        error ? reject(error) : resolve(value);
      }
      socket.on("error", (error) => finish(error));
      if (expectReply)
        socket.on("message", (data) => {
          try {
            finish(null, JSON.parse(data.toString("utf8")));
          } catch (error) {
            finish(error);
          }
        });
      socket.send(Buffer.from(JSON.stringify(message)), bulb.port ?? WIZ_PORT, bulb.ip, (error) => {
        if (error) finish(error);
        else if (!expectReply) finish(null);
      });
    });
  }

  async function read(bulb, timeoutMs = confirmTimeoutMs) {
    const reply = await exchange(bulb, { method: "getPilot", params: {} }, { expectReply: true, timeoutMs });
    const r = reply?.result;
    if (!r || typeof r.state !== "boolean") throw new Error(`${bulb.ip} returned no pilot state`);
    const reading = { state: r.state };
    for (const key of PILOT_FIELDS.slice(1)) if (typeof r[key] === "number") reading[key] = r[key];
    if (typeof r.rssi === "number") reading.rssi = r.rssi;
    return reading;
  }

  async function applyNow(bulb, pilot) {
    const began = Date.now();
    const remaining = () => budgetMs - (Date.now() - began);
    let attempts = 0;
    let lastReading = null;
    let lastError = null;

    while (remaining() > 50) {
      attempts += 1;
      let sent = false;
      for (let i = 0; i < burstCount && remaining() > 50; i++) {
        if (i > 0) await sleep(burstGapMs);
        try {
          await exchange(bulb, { method: "setPilot", params: pilot }, { expectReply: false, timeoutMs: 500 });
          sent = true;
        } catch (error) {
          lastError = error;
        }
      }
      if (!sent) {
        await sleep(Math.min(300, Math.max(0, remaining())));
        continue;
      }
      await sleep(Math.min(settleMs, Math.max(0, remaining())));
      if (remaining() <= 50) break;
      try {
        lastReading = await read(bulb, Math.min(confirmTimeoutMs, remaining()));
        if (matches(pilot, lastReading))
          return { id: bulb.id, confirmed: true, actual: lastReading, attempts, ms: Date.now() - began };
      } catch (error) {
        lastError = error;
      }
    }
    return {
      id: bulb.id,
      confirmed: false,
      actual: lastReading,
      attempts,
      ms: Date.now() - began,
      error: lastReading ? `${bulb.ip} reports a different state` : (lastError?.message ?? `${bulb.ip} did not confirm`),
    };
  }

  /** Applies `pilot` to one bulb, after any command already queued for it. */
  function apply(bulb, pilot) {
    const previous = queues.get(bulb.id) ?? Promise.resolve();
    const run = previous.catch(() => {}).then(() => applyNow(bulb, pilot));
    queues.set(bulb.id, run);
    run.finally(() => {
      if (queues.get(bulb.id) === run) queues.delete(bulb.id);
    });
    return run;
  }

  return { apply, read };
}
