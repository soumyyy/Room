# Backend

This backend keeps the Tuya cloud credentials out of the React Native bundle and exposes only the AC routes the app needs.
It also acts as the local WiZ LAN bridge, so light control runs from the Mac instead of raw UDP from the phone.

## Setup

1. Copy `backend/.env.example` to `backend/.env`.
2. Fill in:
   - `TUYA_CLIENT_ID`
   - `TUYA_CLIENT_SECRET`
3. Keep `TUYA_API_BASE_URL=https://openapi.tuyain.com` because your device is in the India data center.
4. Leave `HOST=0.0.0.0` for LAN access from your phone. Use `HOST=127.0.0.1` only for local-only testing on the Mac.
5. If the app runs on your phone, set `backendBaseUrl` in `app/config.ts` to your Mac's LAN IP, for example `http://192.168.29.30:8787`.

## Run

```bash
npm run backend
```

For watch mode:

```bash
npm run backend:dev
```

## Routes

- `GET /health`
- `GET /api/tuya/remotes`
- `GET /api/ac/status`
- `POST /api/ac/scene`
- `POST /api/wiz/status`
- `POST /api/wiz/command`

Example scene request:

```bash
curl -X POST http://localhost:8787/api/ac/scene \
  -H 'Content-Type: application/json' \
  -d '{"power":1,"mode":0,"temp":24,"wind":1}'
```

Mode values:

- `0` cool
- `1` heat
- `2` auto
- `3` fan
- `4` dry

Wind values:

- `0` auto
- `1` low
- `2` medium
- `3` high

Example WiZ status request:

```bash
curl -X POST http://localhost:8787/api/wiz/status \
  -H 'Content-Type: application/json' \
  -d '{"bulbs":[{"id":"left-1","ip":"192.168.29.131"},{"id":"left-2","ip":"192.168.29.180"}]}'
```

Example WiZ command request:

```bash
curl -X POST http://localhost:8787/api/wiz/command \
  -H 'Content-Type: application/json' \
  -d '{"bulbs":[{"id":"left-1","ip":"192.168.29.131"},{"id":"left-2","ip":"192.168.29.180"}],"params":{"state":true,"r":255,"g":0,"b":0}}'
```
