# Room Widget Mac

Native macOS SwiftUI host app plus WidgetKit extension for two quick actions:

- `Leave Room`
- `Enter Room`

This project is intentionally separate from:

- `home-control/` for Expo, iOS, and Android
- `room-desktop/` for Electron

## What It Does

The widget actions are direct:

- `Leave Room`: turns the AC off and switches all WiZ lights off
- `Enter Room`: applies a default AC scene and turns all WiZ lights on

## Generate The Xcode Project

```bash
cd room-widget-mac
xcodegen generate
open RoomWidgetMac.xcodeproj
```

## Notes

- Requires macOS 14 or later for interactive widgets using `AppIntent`
- The first widget launch may trigger local network permission for the WiZ bulbs
- Tuya cloud credentials and WiZ bulb IPs are embedded for this one-user setup
