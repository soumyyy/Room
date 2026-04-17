# Room Desktop

Standalone macOS Electron app for Room.

This package is intentionally separate from `home-control/` so Electron dependencies do not affect Expo, iOS, or Android builds.

## Structure

- `src/main/`: Electron main process, Tuya, and WiZ integrations
- `src/renderer/`: Desktop UI
- `dist/`: Built macOS artifacts

## Commands

```bash
cd room-desktop
npm install
npm run dev
npm run dist:mac
```

## Output

The macOS DMG is written to:

`dist/Room-1.0.0-arm64.dmg`

## Mobile Isolation

Keep mobile work inside `home-control/`.

- Android/iOS/Expo commands should be run from `home-control/`
- Electron commands should be run from `room-desktop/`

That split keeps desktop packaging out of the mobile app.
