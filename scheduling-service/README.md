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
| `HOST` | Bind address. Use your Tailscale IP to keep it private to your devices. |
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

In the Room app → Schedules & Alerts, enter:
- **URL**: `http://<tailscale-ip>:8899` (e.g. `http://100.112.237.82:8899`)
- **Token**: the value of `ROOM_SCHEDULER_TOKEN`

## Siri

Say things like:
- *"Turn off AC in 7 hours in Room"*
- *"Leave Room at 10pm"*
- *"Enter Room every day at 8am"*
- *"Room schedules"* — to list or cancel

## Run tests

```sh
npm test
```

23 tests covering the full execution lifecycle, recurrence, DST, retries, and push delivery.
