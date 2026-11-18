import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createService } from "./service.mjs";
import { createTuya } from "./tuya.mjs";
import { createAPNs } from "./apns.mjs";
const dbPath = process.env.ROOM_SCHEDULER_DB || "./data/schedules.sqlite";
mkdirSync(dirname(dbPath), { recursive: true, mode: 0o700 });
const service = createService({
  dbPath,
  token: process.env.ROOM_SCHEDULER_TOKEN,
  devices: createTuya(),
  notifier: createAPNs(),
});
const timer = setInterval(
  () => service.tick().catch(() => console.error("Scheduler tick failed")),
  1000,
);
service.server.listen(
  Number(process.env.PORT || 8080),
  process.env.HOST || "127.0.0.1",
  () => console.log("Room scheduling service listening"),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    clearInterval(timer);
    service.server.close(() => process.exit(0));
  });
