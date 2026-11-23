# Room hub

A small always-on service that controls the WiZ bulbs from inside the room. It runs on
**friday**, the laptop in the room (`ssh friday`), which shares the bulbs' Wi-Fi.

It is the second line of defence for the lights. The phone (app, widget, Siri, Control
Center) still talks to the bulbs directly first. Any bulb the phone cannot confirm is
handed to the hub, which retries from a few metres away and confirms by reading the bulb
back. The hub also works when the phone is off home Wi-Fi.

The AC, fan, and tube light go through Tuya cloud and are not handled here yet; see
[Plan](#plan).

## How a light command flows

```
phone ──UDP──▶ bulbs                         first try, ~2.5 s budget
  │ unconfirmed bulbs only
  └──HTTP──▶ room-hub ──UDP──▶ bulbs         second try, ~3 s budget
               (LAN: http://192.168.29.215:8787, away: Tailscale Funnel HTTPS)
```

Both paths send `setPilot` with explicit values (never a toggle), so sending the same
command twice is harmless.

## Files

| Path | What it is |
|---|---|
| `src/server.mjs` | Entry point. Reads env and `devices.json`, starts the HTTP server and the bulb probe. |
| `src/hub.mjs` | HTTP API, bearer-token auth, per-bulb health, recent command log. |
| `src/wiz.mjs` | WiZ UDP client: burst send, read back, retry until confirmed or out of budget. One queue per bulb. |
| `test/hub.test.mjs` | End-to-end tests: real HTTP and UDP against fake bulbs on localhost. |
| `deploy/deploy.sh` | Runs the tests, copies everything to the server, installs and restarts the service. |
| `deploy/room-hub.service` | systemd **user** unit (`Restart=always`; lingering is on, so it runs without a login). |
| `deploy/server-README.md` | Copied to `~/room/README.md` on the server: the map of the server side. |
| `.env.example` | Template for `~/room/config/hub.env`. |
| `devices.json` | Not in this folder. Deploy copies `home-control/devices.json`, the single bulb inventory. |

No npm dependencies. Node 22 or newer.

## API

All routes except `/healthz` need `Authorization: Bearer <ROOM_HUB_TOKEN>`.

| Route | Purpose |
|---|---|
| `GET /healthz` | `ok`. Liveness only. |
| `GET /v1/status` | Each bulb's last probe (reachable, last seen, reading, RSSI) and the last 100 commands. |
| `GET /v1/lights` | Reads every bulb now. A bulb that does not answer is `null`. |
| `POST /v1/lights` | Body `{ "pilot": { "state": true, "dimming": 40, "temp": 2700 }, "bulbs": ["left-1"] }`. Use `group` instead of `bulbs` for a group; omit both for every bulb. Returns `{ ok, results: [{ id, confirmed, actual, attempts, ms, error? }] }` with status 200 even when some bulbs fail. |

Pilot fields: `state` (required), `dimming`, `temp`, `r`, `g`, `b`, `c`, `w`. Optional header
`X-Room-Source` (for example `widget`, `app`) labels the command in the log.

## Develop and deploy

```sh
cd room-hub
npm test                 # e2e tests, about 5 s
deploy/deploy.sh         # tests, copy to friday, restart
```

The first deploy creates `~/room/config/hub.env` with a random token. Copy that token into
`home-control/secrets.json` under `hub.token`, then run `npm run secrets` in `home-control`
and rebuild the iPhone app.

## Operate

```sh
ssh friday
systemctl --user status room-hub        # running?
journalctl --user -u room-hub -f        # one line per light command
TOKEN=$(grep ^ROOM_HUB_TOKEN ~/room/config/hub.env | cut -d= -f2)
curl -s -H "Authorization: Bearer $TOKEN" localhost:8787/v1/status | jq
```

When a bulb's IP changes, edit `home-control/devices.json`, run `npm run secrets` there, and
redeploy the hub. Better: reserve the bulbs' and friday's addresses in the router's DHCP
settings.

## Plan

Ordered by how many real failures each removes. The Diagnostics log from 20 November
shows two failure kinds: bulbs not confirming (WiZ) and Tuya rejecting every command
after the IoT Core trial expired.

1. **Done:** hub on friday; phone falls back to it for unconfirmed bulbs.
2. **Local fan and tube light.** The switchboard speaks Tuya's LAN protocol. With its local
   key (fetched once from the cloud API) the hub can switch it without Tuya cloud, so an
   expired trial or an internet outage no longer stops the fan and tube light. Same
   fallback pattern: phone tries cloud, then the hub.
3. **Scheduled Enter/Leave with bulbs.** The scheduler on Eclipse cannot reach the bulbs.
   It can call the hub for the bulb steps, closing the gap documented in
   `tasks/scheduling-plan.md`.
4. **Watchdog alerts.** The hub already probes bulbs every minute. Add a push (through
   the scheduler's APNs path) when a bulb stays unreachable, or when Tuya starts
   returning "subscription has expired", before you find out from a dead switch.
5. **Local AC.** Only if the IR blaster supports Tuya LAN control; otherwise AC stays
   cloud-only.
