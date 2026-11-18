import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createService } from "../src/service.mjs";
const token = "a-long-private-test-token-for-room";
async function fixture(t, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), "room-scheduler-"));
  let time = Date.parse("2026-11-18T00:00:00Z");
  const calls = [],
    pushes = [];
  let fanOn = true;
  const opts = {
    dbPath: join(dir, "db.sqlite"),
    token,
    now: () => time,
    retryDelayMs: 0,
    devices: {
      read: async () => {
        if (options.readFails) throw new Error("Snapshot unavailable");
        return {
          ac: { power: 1, temp: 25, mode: 0, wind: 1 },
          node: { fan: fanOn, tube: false },
        };
      },
      set: async (...args) => {
        calls.push(args);
        if (options.fail === args[0]) throw new Error("Device offline");
      },
    },
    notifier: { configured: true, send: async (...args) => pushes.push(args) },
  };
  let s = createService(opts);
  await new Promise((r) => s.server.listen(0, "127.0.0.1", r));
  let url = `http://127.0.0.1:${s.server.address().port}`;
  t.after(async () => {
    await new Promise((r) => s.server.close(r));
    s.close();
    rmSync(dir, { recursive: true, force: true });
  });
  async function request(path, method = "GET", body) {
    const r = await fetch(url + path, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: r.status, body: await r.json() };
  }
  return {
    get s() {
      return s;
    },
    calls,
    pushes,
    setFanState: (value) => (fanOn = value),
    request,
    advance: (ms) => (time += ms),
    create: (action = "acOff", extra = {}) =>
      request("/v1/schedules", "POST", {
        requestId: crypto.randomUUID(),
        action,
        runAt: new Date(time + 1000).toISOString(),
        timeZone: "Asia/Kolkata",
        ...extra,
      }),
    restart: async () => {
      await new Promise((r) => s.server.close(r));
      s.close();
      s = createService(opts);
      await new Promise((r) => s.server.listen(0, "127.0.0.1", r));
      url = `http://127.0.0.1:${s.server.address().port}`;
    },
  };
}
test("HTTP create is durable and idempotent; restarted worker executes once", async (t) => {
  const f = await fixture(t);
  const body = {
    requestId: "stable-request-id",
    action: "acOff",
    runAt: "2026-11-18T00:00:01Z",
    timeZone: "Asia/Kolkata",
  };
  const a = await f.request("/v1/schedules", "POST", body),
    b = await f.request("/v1/schedules", "POST", body);
  assert.equal(a.status, 201);
  assert.equal(a.body.id, b.body.id);
  await f.restart();
  f.advance(1001);
  await f.s.tick();
  await f.s.tick();
  assert.equal(f.calls.length, 1);
  assert.equal(f.s.list()[0].status, "completed");
});
test("cancelled schedule never commands device", async (t) => {
  const f = await fixture(t);
  const a = await f.create();
  assert.equal(
    (await f.request(`/v1/schedules/${a.body.id}`, "DELETE")).status,
    200,
  );
  f.advance(2000);
  await f.s.tick();
  assert.equal(f.calls.length, 0);
});
test("scene attempts reachable steps, retains partial outcome and pushes failure", async (t) => {
  const f = await fixture(t, { fail: "tube" });
  await f.request("/v1/push-tokens", "PUT", {
    token: "a".repeat(64),
    environment: "sandbox",
  });
  assert.equal((await f.create("leave")).status, 400);
  await f.create("leave", { acknowledgePartialScene: true });
  f.advance(2000);
  await f.s.tick();
  const s = f.s.list()[0];
  assert.equal(s.status, "partial");
  assert.equal(
    s.results.find((r) => r.device === "bulbs").status,
    "unavailable",
  );
  assert.equal(f.calls.filter((c) => c[0] === "tube").length, 3);
  assert.equal(f.pushes.length, 1);
  await f.s.tick();
  assert.equal(f.pushes.length, 1);
});
test("saved restore survives repeated leave and Enter restores only previously on devices", async (t) => {
  const f = await fixture(t);
  await f.create("leave", { acknowledgePartialScene: true });
  f.advance(2000);
  await f.s.tick();
  await f.create("leave", { acknowledgePartialScene: true });
  f.advance(2000);
  await f.s.tick();
  const before = f.calls.length;
  await f.create("enter", { acknowledgePartialScene: true });
  f.advance(2000);
  await f.s.tick();
  assert.deepEqual(
    f.calls.slice(before).map((c) => [c[0], c[1]]),
    [
      ["ac", true],
      ["fan", true],
    ],
  );
});
test("missed schedules are recorded without delayed commands", async (t) => {
  const f = await fixture(t);
  await f.create("fanOff");
  f.advance(400000);
  await f.s.tick();
  assert.equal(f.calls.length, 0);
  assert.equal(f.s.list()[0].status, "missed");
});
test("invalid action/date/timezone rejected; API protected", async (t) => {
  const f = await fixture(t);
  assert.equal((await f.create("toggle")).status, 400);
  assert.equal(
    (await f.create("fanOff", { timeZone: "Nowhere/Test" })).status,
    400,
  );
  assert.equal((await f.create("fanOff", { runAt: "2020-01-01" })).status, 400);
});
test("worker executes due schedules older than API history page", async (t) => {
  const f = await fixture(t);
  for (let i = 0; i < 105; i++) await f.create("fanOff");
  f.advance(2000);
  await f.s.tick();
  assert.equal(f.calls.length, 105);
});
test("missing AC restore is unavailable, not successful Enter", async (t) => {
  const f = await fixture(t);
  await f.create("enter", { acknowledgePartialScene: true });
  f.advance(2000);
  await f.s.tick();
  assert.equal(
    f.s.list()[0].results.find((r) => r.device === "ac").status,
    "unavailable",
  );
  assert.equal(f.calls.length, 0);
});
test("failed scene read still attempts all explicit Leave commands", async (t) => {
  const f = await fixture(t, { readFails: true });
  await f.create("leave", { acknowledgePartialScene: true });
  f.advance(2000);
  await f.s.tick();
  assert.equal(f.calls.length, 3);
});
test("editing pending schedule requires current revision and changes execution time", async (t) => {
  const f = await fixture(t);
  const { body: s } = await f.create();
  assert.equal(
    (
      await f.request(`/v1/schedules/${s.id}`, "PATCH", {
        runAt: "2026-11-18T00:00:10Z",
        revision: 1,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await f.request(`/v1/schedules/${s.id}`, "PATCH", {
        runAt: "2026-11-18T00:00:20Z",
        revision: 1,
      })
    ).status,
    409,
  );
  f.advance(2000);
  await f.s.tick();
  assert.equal(f.calls.length, 0);
  f.advance(9000);
  await f.s.tick();
  assert.equal(f.calls.length, 1);
});
test("daily recurrence preserves completed history and creates a cancellable successor", async (t) => {
  const f = await fixture(t);
  const { body: s } = await f.create("fanOff", { recurrence: "daily" });
  f.advance(2000);
  await f.s.tick();
  const rows = f.s.list();
  assert.equal(rows.length, 2);
  const next = rows.find((r) => r.status === "scheduled");
  assert.equal(next.runAt, "2026-11-19T00:00:01.000Z");
  assert.equal(next.seriesId, s.id);
  await f.s.tick();
  assert.equal(f.s.list().length, 2);
  await f.request(`/v1/schedules/${next.id}`, "DELETE");
  f.advance(86400000);
  await f.s.tick();
  assert.equal(f.calls.length, 1);
  assert.equal(f.s.list().length, 2);
});
test("successful cloud Enter with unavailable bulbs allows next Leave to capture a new restore state", async (t) => {
  const f = await fixture(t);
  for (const action of ["leave", "enter"]) {
    await f.create(action, { acknowledgePartialScene: true });
    f.advance(2000);
    await f.s.tick();
  }
  f.setFanState(false);
  await f.create("leave", { acknowledgePartialScene: true });
  f.advance(2000);
  await f.s.tick();
  const before = f.calls.length;
  await f.create("enter", { acknowledgePartialScene: true });
  f.advance(2000);
  await f.s.tick();
  assert.deepEqual(
    f.calls.slice(before).map((c) => c[0]),
    ["ac"],
  );
});
test("explicit retry keeps successful steps and attempts only failed devices", async (t) => {
  const f = await fixture(t, { fail: "tube" });
  await f.create("leave", { acknowledgePartialScene: true });
  f.advance(2000);
  await f.s.tick();
  const original = f.s.list()[0],
    before = f.calls.length;
  const payload = { requestId: "stable-retry-request" };
  const result = await f.request(
    `/v1/schedules/${original.id}/retry`,
    "POST",
    payload,
  );
  assert.equal(result.status, 201);
  assert.equal(
    (await f.request(`/v1/schedules/${original.id}/retry`, "POST", payload))
      .body.id,
    result.body.id,
  );
  f.advance(2000);
  await f.s.tick();
  assert.deepEqual(
    f.calls.slice(before).map((c) => c[0]),
    ["tube", "tube", "tube"],
  );
});
