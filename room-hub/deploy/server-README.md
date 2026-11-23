# ~/room — Room services on omarchy

This laptop stays on in the room and acts as the backup controller for the Room app.
Source lives in the Room repo on the Mac (`room-hub/`). Change it there and run
`room-hub/deploy/deploy.sh`. Anything under `~/room/hub` is overwritten by the next deploy.

## Layout

```
~/room/
├── README.md                this file (copied from room-hub/deploy/server-README.md)
├── config/                  secrets; 700, never copied anywhere
│   └── hub.env              ROOM_HUB_TOKEN, HOST, PORT
└── hub/                     room-hub code, deployed from the repo
    ├── src/server.mjs       entry point
    ├── src/hub.mjs          HTTP API and bulb health
    ├── src/wiz.mjs          WiZ UDP control with read-back confirmation
    ├── devices.json         bulb inventory (copy of home-control/devices.json)
    ├── deploy/              systemd unit and deploy script
    ├── package.json
    └── README.md            full docs: API, flow, plan
~/.config/systemd/user/room-hub.service   installed by deploy.sh
```

## Running

| What | Command |
|---|---|
| Status | `systemctl --user status room-hub` |
| Live log | `journalctl --user -u room-hub -f` |
| Restart | `systemctl --user restart room-hub` |
| Health | `curl localhost:8787/healthz` |
| Bulb status | `curl -s -H "Authorization: Bearer $(grep ^ROOM_HUB_TOKEN ~/room/config/hub.env \| cut -d= -f2)" localhost:8787/v1/status` |

The service is a systemd user unit. Lingering is enabled for this user, so it starts at
boot without a login.

## Network

- LAN: `http://192.168.29.215:8787`. The firewall (ufw) allows 8787 from 192.168.29.0/24
  only. Reserve this address in the router so it does not move.
- Away from home: Tailscale Funnel serves the hub over HTTPS at
  `https://omarchy.tail3236bf.ts.net`. Every route except `/healthz` needs the token.

## Keep it on

- Lid close never suspends, on mains or battery
  (`/etc/systemd/logind.conf.d/90-devbox-lid.conf` sets `HandleLidSwitch*=ignore`).
- Keep the charger connected anyway. On battery the hub runs until the battery dies.
