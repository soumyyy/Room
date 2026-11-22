// Entry point. Reads configuration from the environment (see .env.example)
// and devices.json, then serves the API in hub.mjs.

import { readFileSync } from "node:fs";
import { createHub } from "./hub.mjs";
import { createWiz } from "./wiz.mjs";

const devicesPath = process.env.ROOM_HUB_DEVICES || new URL("../devices.json", import.meta.url);
const devices = JSON.parse(readFileSync(devicesPath, "utf8"));

const hub = createHub({
  token: process.env.ROOM_HUB_TOKEN,
  devices,
  wiz: createWiz({ budgetMs: Number(process.env.ROOM_HUB_WIZ_BUDGET_MS || 3000) }),
  probeIntervalMs: Number(process.env.ROOM_HUB_PROBE_MS || 60_000),
});

const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 8787);
hub.server.listen(port, host, () => {
  console.log(`Room hub listening on ${host}:${port} with ${devices.bulbs.length} bulbs`);
  hub.startProbing();
});

for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    hub.stop();
    hub.server.close(() => process.exit(0));
  });
