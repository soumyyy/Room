import test from "node:test";
import assert from "node:assert/strict";
import { createTuya } from "../src/tuya.mjs";
const env = {
  ROOM_TUYA_CLIENT_ID: "test-id",
  ROOM_TUYA_CLIENT_SECRET: "test-secret",
  ROOM_TUYA_API_BASE_URL: "https://tuya.test",
  ROOM_TUYA_INFRARED_ID: "ir",
  ROOM_TUYA_AC_REMOTE_ID: "remote",
  ROOM_TUYA_NODE_ID: "node",
};
test("AC off reads current settings, signs requests, preserves scene; fan uses switch_2", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push({ url, options });
    const result = url.includes("/token?")
      ? { access_token: "token", expire_time: 3600 }
      : url.endsWith("/ac/status")
        ? { power: 1, mode: 4, temperature: 23, fan: 2 }
        : url.endsWith("/devices/node")
          ? { online: true, status: [{ code: "switch_2", value: true }] }
          : true;
    return { ok: true, json: async () => ({ success: true, result }) };
  });
  const client = createTuya(env);
  await client.set("ac", false);
  await client.set("fan", false);
  const ac = calls.find((c) => c.url.endsWith("/scenes/command"));
  assert.deepEqual(JSON.parse(ac.options.body), {
    power: 0,
    mode: 4,
    temp: 23,
    wind: 2,
  });
  assert.match(ac.options.headers.sign, /^[A-F0-9]{64}$/);
  assert.equal(ac.options.headers.access_token, "token");
  assert.deepEqual(JSON.parse(calls.at(-1).options.body), {
    commands: [{ code: "switch_2", value: false }],
  });
});
test("partial cloud observation keeps AC when node read fails", async (t) => {
  t.mock.method(globalThis, "fetch", async (url) => ({
    ok: !url.endsWith("/devices/node"),
    json: async () =>
      url.includes("/token?")
        ? {
            success: true,
            result: { access_token: "token", expire_time: 3600 },
          }
        : url.endsWith("/ac/status")
          ? { success: true, result: { power: 1, mode: 0, temp: 25, wind: 1 } }
          : { success: false, msg: "offline" },
  }));
  const value = await createTuya(env).read();
  assert.equal(value.ac.temp, 25);
  assert.equal(value.node, undefined);
});
