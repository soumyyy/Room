// End-to-end: real HTTP server, real UDP, fake bulbs on localhost.

import test from "node:test";
import assert from "node:assert/strict";
import dgram from "node:dgram";
import { once } from "node:events";
import { createHub } from "../src/hub.mjs";
import { createWiz, matches } from "../src/wiz.mjs";

const TOKEN = "t".repeat(32);

/** A bulb that keeps a pilot, answers getPilot, and can drop packets. */
async function fakeBulb({ dropFirstSets = 0, silent = false, ignoreSets = false } = {}) {
  const socket = dgram.createSocket("udp4");
  const bulb = { state: false, dimming: 100, rssi: -60, sets: 0 };
  socket.on("message", (data, peer) => {
    if (silent) return;
    const message = JSON.parse(data.toString());
    if (message.method === "setPilot") {
      bulb.sets += 1;
      if (bulb.sets <= dropFirstSets || ignoreSets) return;
      const { temp, r, g, b, ...rest } = message.params;
      if (temp !== undefined) Object.assign(bulb, { temp, r: undefined, g: undefined, b: undefined });
      if (r !== undefined) Object.assign(bulb, { r, g, b, temp: undefined });
      Object.assign(bulb, rest);
    }
    if (message.method === "getPilot") {
      const { sets, ...result } = bulb;
      socket.send(JSON.stringify({ method: "getPilot", result }), peer.port, peer.address);
    }
  });
  socket.bind(0, "127.0.0.1");
  await once(socket, "listening");
  return { bulb, port: socket.address().port, close: () => socket.close() };
}

async function startHub(fakes) {
  const devices = {
    bulbs: fakes.map((fake, i) => ({ id: `b${i}`, name: `Bulb ${i}`, ip: "127.0.0.1", port: fake.port, group: i < 2 ? "left" : "right" })),
  };
  const hub = createHub({ token: TOKEN, devices, wiz: createWiz({ budgetMs: 800, confirmTimeoutMs: 200 }), log: () => {} });
  hub.server.listen(0, "127.0.0.1");
  await once(hub.server, "listening");
  const base = `http://127.0.0.1:${hub.server.address().port}`;
  const call = (method, path, body, token = TOKEN) =>
    fetch(base + path, {
      method,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: body && JSON.stringify(body),
    }).then(async (response) => ({ status: response.status, body: await response.json().catch(() => null) }));
  return { call, close: () => hub.server.close() };
}

test("turns bulbs on and confirms each one", async () => {
  const fakes = await Promise.all([fakeBulb(), fakeBulb()]);
  const hub = await startHub(fakes);
  const { status, body } = await hub.call("POST", "/v1/lights", { pilot: { state: true, dimming: 40, temp: 2700 } });
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.deepEqual(body.results.map((r) => r.confirmed), [true, true]);
  assert.equal(fakes[0].bulb.dimming, 40);
  assert.equal(fakes[1].bulb.temp, 2700);
  hub.close();
  fakes.forEach((fake) => fake.close());
});

test("recovers a bulb that drops the first packets", async () => {
  const fakes = [await fakeBulb({ dropFirstSets: 4 })];
  const hub = await startHub(fakes);
  const { body } = await hub.call("POST", "/v1/lights", { pilot: { state: true } });
  assert.equal(body.ok, true);
  assert.ok(body.results[0].attempts >= 2);
  hub.close();
  fakes[0].close();
});

test("reports a silent bulb as failed without hiding the others", async () => {
  const fakes = [await fakeBulb(), await fakeBulb({ silent: true })];
  const hub = await startHub(fakes);
  const { body } = await hub.call("POST", "/v1/lights", { pilot: { state: true } });
  assert.equal(body.ok, false);
  assert.equal(body.results[0].confirmed, true);
  assert.equal(body.results[1].confirmed, false);
  assert.match(body.results[1].error, /did not answer|did not confirm/);
  const status = await hub.call("GET", "/v1/status");
  assert.deepEqual(status.body.recent[0].failed, ["b1"]);
  hub.close();
  fakes.forEach((fake) => fake.close());
});

test("addresses only the requested bulbs or group", async () => {
  const fakes = await Promise.all([fakeBulb(), fakeBulb(), fakeBulb()]);
  const hub = await startHub(fakes);
  await hub.call("POST", "/v1/lights", { pilot: { state: true }, bulbs: ["b1"] });
  assert.deepEqual(fakes.map((fake) => fake.bulb.state), [false, true, false]);
  await hub.call("POST", "/v1/lights", { pilot: { state: true }, group: "right" });
  assert.deepEqual(fakes.map((fake) => fake.bulb.state), [false, true, true]);
  const bad = await hub.call("POST", "/v1/lights", { pilot: { state: true }, bulbs: ["nope"] });
  assert.equal(bad.status, 400);
  hub.close();
  fakes.forEach((fake) => fake.close());
});

test("rejects missing or wrong tokens and bad pilots", async () => {
  const fakes = [await fakeBulb()];
  const hub = await startHub(fakes);
  assert.equal((await hub.call("GET", "/v1/lights", null, "x".repeat(32))).status, 401);
  assert.equal((await hub.call("POST", "/v1/lights", { pilot: { state: "on" } })).status, 400);
  assert.equal(fakes[0].bulb.sets, 0);
  hub.close();
  fakes[0].close();
});

test("reads every bulb", async () => {
  const fakes = [await fakeBulb(), await fakeBulb({ silent: true })];
  const hub = await startHub(fakes);
  const { body } = await hub.call("GET", "/v1/lights");
  assert.equal(body.bulbs.b0.state, false);
  assert.equal(body.bulbs.b1, null);
  hub.close();
  fakes.forEach((fake) => fake.close());
});

test("match rule mirrors the phone", () => {
  assert.equal(matches({ state: false, dimming: 50 }, { state: false, dimming: 10 }), true);
  assert.equal(matches({ state: true, dimming: 50 }, { state: true, dimming: 51 }), true);
  assert.equal(matches({ state: true, temp: 2700 }, { state: true }), false);
});
