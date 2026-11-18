import { DatabaseSync } from "node:sqlite";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { nextOccurrence } from "./recurrence.mjs";

const actions = {
  acOff: "AC off",
  acOn: "AC on",
  fanOff: "Fan off",
  fanOn: "Fan on",
  tubeOff: "Tube light off",
  tubeOn: "Tube light on",
  enter: "Enter Room",
  leave: "Leave Room",
  reminder: "Reminder",
};
const fail = (message, status = 400) =>
  Object.assign(new Error(message), { status });
export function createService({
  dbPath,
  token,
  devices,
  notifier = { configured: false },
  now = Date.now,
  graceMs = 300000,
  retryDelayMs = 1000,
}) {
  if (!token || token.length < 24)
    throw new Error("ROOM_SCHEDULER_TOKEN must contain at least 24 characters");
  const db = new DatabaseSync(dbPath);
  db.exec(
    "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS schedules(id TEXT PRIMARY KEY, requestId TEXT UNIQUE NOT NULL, body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS state(key TEXT PRIMARY KEY, body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS push(token TEXT PRIMARY KEY, environment TEXT NOT NULL); CREATE TABLE IF NOT EXISTS notices(scheduleId TEXT NOT NULL, token TEXT NOT NULL, sent INTEGER NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(scheduleId,token));",
  );
  let busy = false,
    lastTick = null;
  const load = (id) => {
    const row = db.prepare("SELECT body FROM schedules WHERE id=?").get(id);
    return row ? JSON.parse(row.body) : null;
  };
  const save = (s) =>
    db
      .prepare("UPDATE schedules SET body=? WHERE id=?")
      .run(JSON.stringify(s), s.id);
  const state = () =>
    JSON.parse(
      db.prepare("SELECT body FROM state WHERE key='scene'").get()?.body ||
        "{}",
    );
  const saveState = (s) =>
    db
      .prepare(
        "INSERT INTO state(key,body) VALUES('scene',?) ON CONFLICT(key) DO UPDATE SET body=excluded.body",
      )
      .run(JSON.stringify(s));
  const all = () =>
    db
      .prepare("SELECT body FROM schedules ORDER BY rowid DESC")
      .all()
      .map((r) => JSON.parse(r.body));
  const list = () => {
    const rows = all();
    return [
      ...rows.filter((s) => ["scheduled", "running"].includes(s.status)),
      ...rows
        .filter((s) => !["scheduled", "running"].includes(s.status))
        .slice(0, 100),
    ];
  };
  // A crashed in-flight command can safely retry an explicit state command. Completed steps remain durable.
  for (const s of all())
    if (s.status === "running") {
      s.status = "scheduled";
      save(s);
    }
  async function execute(s) {
    s.results ||= [];
    const isScene = ["enter", "leave"].includes(s.action);
    let restore;
    if (isScene) {
      const cloud = state();
      if (s.action === "leave") {
        // Preserve the prior restore plan across repeated Leave operations.
        if (!cloud.away) {
          let fresh = {};
          try {
            fresh = await devices.read();
          } catch {}
          cloud.restore = { ...(cloud.snapshot || s.restore || {}), ...fresh };
          cloud.away = true;
          cloud.revision = (cloud.revision || 0) + 1;
          saveState(cloud);
        }
        restore = cloud.restore;
      } else restore = cloud.restore || s.restore;
    }
    const targets = isScene
      ? ["ac", "fan", "tube"]
      : s.action === "reminder"
        ? []
        : [
            s.action.startsWith("ac")
              ? "ac"
              : s.action.startsWith("fan")
                ? "fan"
                : "tube",
          ];
    for (const device of targets) {
      if (
        s.results.some(
          (r) => r.device === device && r.status === "command_sent",
        )
      )
        continue;
      s.results = s.results.filter((r) => r.device !== device);
      const on = isScene ? s.action === "enter" : s.action.endsWith("On");
      const restored =
        device === "ac"
          ? restore?.ac?.power === undefined
            ? undefined
            : restore.ac.power === 1
          : restore?.node?.[device];
      if (s.action === "enter" && restored === undefined) {
        s.results.push({
          device,
          status: "unavailable",
          error: "Saved restore state unavailable",
        });
        save(s);
        continue;
      }
      if (s.action === "enter" && restored === false) {
        s.results.push({
          device,
          status: "command_sent",
          detail: "Not enabled in saved restore plan; no command required",
        });
        save(s);
        continue;
      }
      let error;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await devices.set(
            device,
            on,
            s.action === "enter" ? restore : undefined,
          );
          error = null;
          break;
        } catch (e) {
          error = e;
          if (attempt < 2)
            await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        }
      }
      s.results.push(
        error
          ? { device, status: "failed", error: error.message }
          : { device, status: "command_sent" },
      );
      save(s);
    }
    if (isScene && !s.results.some((r) => r.device === "bulbs"))
      s.results.push({
        device: "bulbs",
        status: "unavailable",
        error:
          "WiZ bulbs require a local connection; no cloud adapter is configured",
      });
    const failed = s.results.filter((r) => r.status !== "command_sent").length;
    s.status = failed
      ? s.results.some((r) => r.status === "command_sent")
        ? "partial"
        : "failed"
      : "completed";
    s.finishedAt = new Date(now()).toISOString();
    save(s);
    if (
      s.action === "enter" &&
      s.results
        .filter((r) => r.device !== "bulbs")
        .every((r) => r.status === "command_sent")
    ) {
      const cloud = state();
      cloud.away = false;
      cloud.restore = null;
      saveState(cloud);
    }
  }
  async function notify(s) {
    for (const p of db.prepare("SELECT * FROM push").all()) {
      db.prepare(
        "INSERT OR IGNORE INTO notices(scheduleId,token) VALUES(?,?)",
      ).run(s.id, p.token);
      const n = db
        .prepare("SELECT * FROM notices WHERE scheduleId=? AND token=?")
        .get(s.id, p.token);
      if (n.sent || n.attempts >= 5) continue;
      db.prepare(
        "UPDATE notices SET attempts=attempts+1 WHERE scheduleId=? AND token=?",
      ).run(s.id, p.token);
      try {
        await notifier.send(p, s);
        db.prepare(
          "UPDATE notices SET sent=1 WHERE scheduleId=? AND token=?",
        ).run(s.id, p.token);
        s.notificationStatus = "sent";
      } catch {
        s.notificationStatus = "failed";
      }
      save(s);
    }
    if (
      !notifier.configured ||
      !db.prepare("SELECT token FROM push LIMIT 1").get()
    ) {
      s.notificationStatus = "unavailable";
      save(s);
    }
  }
  async function tick() {
    if (busy) return;
    busy = true;
    try {
      for (const s of all()
        .filter((s) => s.status === "scheduled" && Date.parse(s.runAt) <= now())
        .sort((a, b) => a.runAt.localeCompare(b.runAt))) {
        if (now() - Date.parse(s.runAt) > graceMs) {
          s.status = "missed";
          s.finishedAt = new Date(now()).toISOString();
          save(s);
        } else {
          s.status = "running";
          save(s);
          try {
            await execute(s);
          } catch {
            s.status = "failed";
            s.results = [
              ...(s.results || []),
              {
                device: "restore",
                status: "failed",
                error: "Could not read or save scene state",
              },
            ];
            save(s);
          }
        }
      }
      // Recover this step after a crash between completing an occurrence and creating its successor.
      for (const previous of all().filter(
        (s) =>
          s.recurrence &&
          s.recurrence !== "none" &&
          ["completed", "partial", "failed", "missed"].includes(s.status) &&
          !s.nextId,
      )) {
        const requestId = `${previous.id}:next`;
        const existing = db
          .prepare("SELECT body FROM schedules WHERE requestId=?")
          .get(requestId);
        let next = existing ? JSON.parse(existing.body) : null;
        if (!next) {
          const runAt = nextOccurrence(
            previous.runAt,
            previous.timeZone,
            previous.recurrence,
            now(),
          );
          next = {
            id: randomUUID(),
            requestId,
            action: previous.action,
            title: previous.title,
            runAt,
            timeZone: previous.timeZone,
            recurrence: previous.recurrence,
            status: "scheduled",
            revision: 1,
            createdAt: new Date(now()).toISOString(),
            seriesId: previous.seriesId || previous.id,
            ...(previous.message ? { message: previous.message } : {}),
            ...(previous.restore ? { restore: previous.restore } : {}),
          };
          db.prepare("INSERT INTO schedules VALUES(?,?,?)").run(
            next.id,
            requestId,
            JSON.stringify(next),
          );
        }
        previous.nextId = next.id;
        save(previous);
      }
      for (const s of all().filter(
        (s) =>
          ["partial", "failed", "missed"].includes(s.status) ||
          (s.action === "reminder" && s.status === "completed"),
      ))
        await notify(s);
      lastTick = new Date(now()).toISOString();
    } finally {
      busy = false;
    }
  }
  async function readBody(req) {
    let text = "";
    for await (const chunk of req) {
      text += chunk;
      if (text.length > 65536) throw fail("Request too large", 413);
    }
    try {
      return JSON.parse(text || "{}");
    } catch {
      throw fail("Invalid JSON");
    }
  }
  function authorized(req) {
    const supplied = Buffer.from(req.headers.authorization || "");
    const expected = Buffer.from(`Bearer ${token}`);
    return (
      supplied.length === expected.length && timingSafeEqual(supplied, expected)
    );
  }
  const server = createServer(async (req, res) => {
    const send = (status, body) => {
      res.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(body));
    };
    try {
      if (!authorized(req)) return send(401, { error: "Unauthorized" });
      const path = new URL(req.url, "http://localhost").pathname;
      if (req.method === "GET" && path === "/health")
        return send(200, { ok: true, lastTick, busy });
      if (req.method === "GET" && path === "/v1/schedules")
        return send(200, {
          schedules: list(),
          capabilities: {
            cloudDevices: true,
            bulbs: false,
            pushConfigured: notifier.configured,
          },
        });
      if (req.method === "POST" && path === "/v1/schedules") {
        const b = await readBody(req),
          requestId = b.requestId || req.headers["idempotency-key"];
        if (
          typeof requestId !== "string" ||
          requestId.length < 8 ||
          requestId.length > 128
        )
          throw fail("A stable requestId is required");
        const old = db
          .prepare("SELECT body FROM schedules WHERE requestId=?")
          .get(requestId);
        if (old) return send(200, JSON.parse(old.body));
        if (!Object.hasOwn(actions, b.action)) throw fail("Unsupported action");
        if (
          b.recurrence &&
          !["none", "daily", "weekdays"].includes(b.recurrence)
        )
          throw fail("Unsupported recurrence");
        const due = Date.parse(b.runAt);
        if (
          !Number.isFinite(due) ||
          due <= now() ||
          due > now() + 366 * 86400000
        )
          throw fail("runAt must be a future ISO date within one year");
        try {
          new Intl.DateTimeFormat("en", { timeZone: b.timeZone }).format();
        } catch {
          throw fail("Invalid timeZone");
        }
        if (typeof b.timeZone !== "string") throw fail("timeZone is required");
        if (
          ["enter", "leave"].includes(b.action) &&
          b.acknowledgePartialScene !== true
        )
          throw fail(
            "Acknowledge unavailable bulb actions before scheduling a room scene",
          );
        if (
          b.message &&
          (typeof b.message !== "string" || b.message.length > 300)
        )
          throw fail("Reminder message is too long");
        const s = {
          id: randomUUID(),
          requestId,
          action: b.action,
          title: actions[b.action],
          runAt: new Date(due).toISOString(),
          timeZone: b.timeZone,
          status: "scheduled",
          revision: 1,
          createdAt: new Date(now()).toISOString(),
          ...(b.recurrence && b.recurrence !== "none"
            ? { recurrence: b.recurrence }
            : {}),
          ...(b.restore ? { restore: b.restore } : {}),
          ...(b.message ? { message: b.message } : {}),
        };
        db.prepare("INSERT INTO schedules VALUES(?,?,?)").run(
          s.id,
          requestId,
          JSON.stringify(s),
        );
        return send(201, s);
      }
      if (
        req.method === "POST" &&
        /^\/v1\/schedules\/[^/]+\/retry$/.test(path)
      ) {
        const original = load(path.split("/")[3]);
        if (!original) throw fail("Schedule not found", 404);
        const b = await readBody(req);
        if (
          typeof b.requestId !== "string" ||
          b.requestId.length < 8 ||
          b.requestId.length > 128
        )
          throw fail("A stable requestId is required");
        const previous = db
          .prepare("SELECT body FROM schedules WHERE requestId=?")
          .get(b.requestId);
        if (previous) return send(200, JSON.parse(previous.body));
        if (!["partial", "failed"].includes(original.status))
          throw fail("Only failed or partial actions can be retried", 409);
        const retry = {
          id: randomUUID(),
          requestId: b.requestId,
          title: original.title,
          action: original.action,
          runAt: new Date(now() + 1000).toISOString(),
          timeZone: original.timeZone,
          status: "scheduled",
          revision: 1,
          createdAt: new Date(now()).toISOString(),
          retryOf: original.id,
          results: (original.results || []).filter(
            (r) => r.status === "command_sent",
          ),
          ...(original.restore ? { restore: original.restore } : {}),
        };
        db.prepare("INSERT INTO schedules VALUES(?,?,?)").run(
          retry.id,
          retry.requestId,
          JSON.stringify(retry),
        );
        return send(201, retry);
      }
      if (req.method === "PATCH" && path.startsWith("/v1/schedules/")) {
        const s = load(path.split("/").pop());
        if (!s) throw fail("Schedule not found", 404);
        const b = await readBody(req);
        if (s.status !== "scheduled")
          throw fail("Only pending schedules can be edited", 409);
        if (b.revision !== s.revision)
          throw fail("Schedule changed; refresh before editing", 409);
        const due = Date.parse(b.runAt);
        if (
          !Number.isFinite(due) ||
          due <= now() ||
          due > now() + 366 * 86400000
        )
          throw fail("runAt must be a future ISO date within one year");
        if (
          b.recurrence !== undefined &&
          !["none", "daily", "weekdays"].includes(b.recurrence)
        )
          throw fail("Unsupported recurrence");
        if (b.recurrence !== undefined) s.recurrence = b.recurrence;
        s.runAt = new Date(due).toISOString();
        s.revision += 1;
        save(s);
        return send(200, s);
      }
      if (req.method === "DELETE" && path.startsWith("/v1/schedules/")) {
        const s = load(path.split("/").pop());
        if (!s) throw fail("Schedule not found", 404);
        if (s.status === "running")
          throw fail("Action is already running", 409);
        if (s.status !== "scheduled" && s.status !== "cancelled")
          throw fail("Action has already finished", 409);
        s.status = "cancelled";
        save(s);
        return send(200, s);
      }
      if (req.method === "PUT" && path === "/v1/push-tokens") {
        const b = await readBody(req);
        if (
          !/^[a-fA-F0-9]{64,200}$/.test(b.token) ||
          !["sandbox", "production"].includes(b.environment)
        )
          throw fail("Invalid push registration");
        db.prepare(
          "INSERT INTO push VALUES(?,?) ON CONFLICT(token) DO UPDATE SET environment=excluded.environment",
        ).run(b.token, b.environment);
        return send(200, { ok: true });
      }
      if (req.method === "PUT" && path === "/v1/scene-state") {
        const b = await readBody(req),
          cloud = state();
        if (b.revision !== undefined && b.revision !== cloud.revision)
          throw fail("Scene state changed; refresh before updating", 409);
        // A phone observation updates the current snapshot, never overwrites a scheduled Leave's saved restore.
        cloud.snapshot = b.snapshot;
        if (!cloud.away && b.restore) cloud.restore = b.restore;
        cloud.revision = (cloud.revision || 0) + 1;
        saveState(cloud);
        return send(200, { revision: cloud.revision });
      }
      throw fail("Not found", 404);
    } catch (e) {
      send(e.status || 500, {
        error: e.status ? e.message : "Schedule service failed",
      });
    }
  });
  return { server, tick, list, close: () => db.close() };
}
