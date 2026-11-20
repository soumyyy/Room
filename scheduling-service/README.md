# Room scheduling service

Runs AC, fan, tube light, Enter/Leave, and reminder schedules through Tuya cloud. The iPhone submits jobs; the server fires them on time even when the app is closed.

No Docker, no cloud accounts, no nonsense — just a plain Node.js process on your server.

## Requirements

- Node 22.13+
- Your server reachable from your phone (Tailscale works great)

## Setup

```sh
# On your server
git clone … && cd scheduling-service
cp .env.example .env
# Edit .env with your Tuya credentials and a random token
nano .env

# Install the systemd user service
cp room-scheduler.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now room-scheduler.service

# Check it's running
systemctl --user status room-scheduler.service
```

## Environment variables

| Variable | Description |
|---|---|
| `ROOM_SCHEDULER_TOKEN` | Secret bearer token (≥24 chars). Use `openssl rand -base64 32`. |
| `ROOM_SCHEDULER_DB` | Path to SQLite file (auto-created). |
| `HOST` | Bind address. Bind to `127.0.0.1` behind the HTTPS proxy. |
| `PORT` | Port (default 8899). |
| `ROOM_TUYA_CLIENT_ID` | Tuya project client ID. |
| `ROOM_TUYA_CLIENT_SECRET` | Tuya project client secret. |
| `ROOM_TUYA_API_BASE_URL` | e.g. `https://openapi.tuyain.com` |
| `ROOM_TUYA_INFRARED_ID` | IR hub device ID. |
| `ROOM_TUYA_AC_REMOTE_ID` | AC remote device ID. |
| `ROOM_TUYA_NODE_ID` | Switchboard device ID (fan/tube). |
| `ROOM_APNS_KEY_FILE` | *(Optional)* Path to `.p8` key for push alerts. |
| `ROOM_APNS_KEY_ID` | *(Optional)* APNs key ID. |
| `ROOM_APNS_TEAM_ID` | *(Optional)* Apple Team ID. |
| `ROOM_APNS_TOPIC` | *(Optional)* Bundle ID, e.g. `org.name.homecontrol`. |

APNs is optional — schedules run fine without it, you just won't get push alerts on failure.

## Configure the app

On Eclipse, publish loopback port 8899 through Tailscale Funnel on HTTPS port
10000. Funnel runs on the server. The iPhone connects directly over Wi-Fi or
cellular. The scheduler requires a bearer token on every request. Set `scheduler.url` and
`scheduler.token` in the ignored `home-control/secrets.json` before generating
the app configuration with `npm run secrets` from `home-control`. The personal
build connects automatically. Keep the build private because it contains the
scheduler credential.

## Siri

Room registers its immediate device controls as App Shortcuts. To schedule
through Siri, create a personal shortcut with Room’s **Manage Room Schedules**
action and give it a distinctive name, such as **Room Voice**. Say that name
to start the shortcut. Use the app’s clock menu to schedule without Siri.

## Run tests

```sh
npm test
```

23 tests covering the full execution lifecycle, recurrence, DST, retries, and push delivery.
