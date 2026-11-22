// The hub's HTTP API. Everything except /healthz needs the bearer token.
//
//   GET  /healthz     "ok" — liveness only, safe to expose to a monitor
//   GET  /v1/status   last probe result per bulb, plus the recent command log
//   GET  /v1/lights   read every bulb now
//   POST /v1/lights   { pilot, bulbs?: [id], group?: id } → per-bulb results
//
// A light command returns 200 even when some bulbs failed: the body says which.
// The phone only asks for the bulbs it could not confirm itself.

import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { cleanPilot } from "./wiz.mjs";

const MAX_BODY = 16 * 1024;
const LOG_SIZE = 100;

export function createHub({ token, devices, wiz, probeIntervalMs = 60_000, log = console.log }) {
  if (!token || token.length < 24) throw new Error("ROOM_HUB_TOKEN must be at least 24 characters");
  const bulbs = devices.bulbs ?? [];
  if (!bulbs.length) throw new Error("devices.json lists no bulbs");

  const health = new Map(bulbs.map((bulb) => [bulb.id, { reachable: null, lastSeen: null, reading: null }]));
  const recent = [];
  const startedAt = new Date().toISOString();
  const expected = Buffer.from(`Bearer ${token}`);

  function authorized(request) {
    const given = Buffer.from(request.headers.authorization ?? "");
    return given.length === expected.length && timingSafeEqual(given, expected);
  }

  function note(reading, bulb) {
    const entry = health.get(bulb.id);
    if (reading) Object.assign(entry, { reachable: true, lastSeen: new Date().toISOString(), reading });
    else entry.reachable = false;
  }

  async function readAll() {
    const readings = await Promise.all(
      bulbs.map((bulb) => wiz.read(bulb, 1500).then((reading) => (note(reading, bulb), reading), () => (note(null, bulb), null))),
    );
    return Object.fromEntries(bulbs.map((bulb, i) => [bulb.id, readings[i]]));
  }

  function pick({ bulbs: ids, group }) {
    if (Array.isArray(ids) && ids.length) {
      const unknown = ids.filter((id) => !bulbs.some((bulb) => bulb.id === id));
      if (unknown.length) throw new Error(`Unknown bulb: ${unknown.join(", ")}`);
      return bulbs.filter((bulb) => ids.includes(bulb.id));
    }
    if (group) {
      const chosen = bulbs.filter((bulb) => bulb.group === group);
      if (!chosen.length) throw new Error(`Unknown group: ${group}`);
      return chosen;
    }
    return bulbs;
  }

  async function applyLights(body, source) {
    const pilot = cleanPilot(body.pilot);
    const chosen = pick(body);
    const began = Date.now();
    const results = await Promise.all(chosen.map((bulb) => wiz.apply(bulb, pilot)));
    for (const [i, result] of results.entries()) note(result.actual, chosen[i]);
    const ok = results.every((result) => result.confirmed);
    const entry = {
      at: new Date(began).toISOString(),
      source,
      pilot,
      ok,
      ms: Date.now() - began,
      failed: results.filter((result) => !result.confirmed).map((result) => result.id),
    };
    recent.unshift(entry);
    recent.length = Math.min(recent.length, LOG_SIZE);
    log(`lights ${JSON.stringify(entry)}`);
    return { ok, results };
  }

  function send(response, status, body) {
    const text = typeof body === "string" ? body : JSON.stringify(body);
    response.writeHead(status, {
      "content-type": typeof body === "string" ? "text/plain" : "application/json",
      "cache-control": "no-store",
    });
    response.end(text);
  }

  function readBody(request) {
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      request.on("data", (chunk) => {
        size += chunk.length;
        if (size > MAX_BODY) {
          reject(new Error("Request body too large"));
          request.destroy();
        } else chunks.push(chunk);
      });
      request.on("end", () => {
        try {
          resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
        } catch {
          reject(new Error("Body must be JSON"));
        }
      });
      request.on("error", reject);
    });
  }

  const server = createServer(async (request, response) => {
    const path = new URL(request.url, "http://hub").pathname;
    try {
      if (request.method === "GET" && path === "/healthz") return send(response, 200, "ok");
      if (!authorized(request)) return send(response, 401, { error: "Unauthorized" });

      if (request.method === "GET" && path === "/v1/status")
        return send(response, 200, {
          startedAt,
          bulbs: bulbs.map((bulb) => ({ id: bulb.id, name: bulb.name, ip: bulb.ip, group: bulb.group, ...health.get(bulb.id) })),
          recent,
        });
      if (request.method === "GET" && path === "/v1/lights") return send(response, 200, { bulbs: await readAll() });
      if (request.method === "POST" && path === "/v1/lights") {
        const body = await readBody(request);
        const source = String(request.headers["x-room-source"] ?? "unknown").slice(0, 40);
        return send(response, 200, await applyLights(body, source));
      }
      return send(response, 404, { error: "Not found" });
    } catch (error) {
      return send(response, 400, { error: error.message });
    }
  });

  let timer = null;
  function startProbing() {
    readAll().catch(() => {});
    timer = setInterval(() => readAll().catch(() => {}), probeIntervalMs);
    timer.unref();
  }

  return {
    server,
    startProbing,
    stop: () => clearInterval(timer),
  };
}
