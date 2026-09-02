#!/usr/bin/env bash
# Everything that can be checked without a device.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "── typecheck ──"
npx tsc --noEmit
echo "typescript: ok"

echo
echo "── native wiring ──"
node scripts/check-native.mjs

echo
echo "── domain assertions ──"
out="$(mktemp -d)"
trap 'rm -rf "$out"' EXIT
swiftc -O -o "$out/roomtests" \
  ios/RoomWidgetShared/RoomGenerated.swift \
  ios/RoomWidgetShared/RoomConfig.swift \
  ios/RoomWidgetShared/RoomSnapshot.swift \
  scripts/tests/RoomDomainTests.swift
"$out/roomtests"
