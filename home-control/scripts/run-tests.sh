#!/usr/bin/env bash
# Everything that can be checked without a device.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "── typecheck ──"
npx tsc --noEmit
echo "typescript: ok"

echo
echo "── domain assertions (typescript) ──"
# The app source imports without file extensions, which Node's ESM resolver
# will not follow, so compile to CommonJS in a temp dir rather than contort the
# imports for the sake of the tests.
ts_out="$(mktemp -d)"
trap 'rm -rf "$ts_out"' EXIT
npx tsc app/roomDomain.test.ts --outDir "$ts_out" \
  --module commonjs --target es2022 --moduleResolution node \
  --skipLibCheck --esModuleInterop
node --test "$ts_out/roomDomain.test.js"

echo
echo "── native wiring ──"
node scripts/check-native.mjs

echo
echo "── domain assertions (swift) ──"
out="$(mktemp -d)"
trap 'rm -rf "$out" "$ts_out"' EXIT
swiftc -O -o "$out/roomtests" \
  ios/RoomWidgetShared/RoomGenerated.swift \
  ios/RoomWidgetShared/RoomConfig.swift \
  ios/RoomWidgetShared/RoomSnapshot.swift \
  scripts/tests/RoomDomainTests.swift
"$out/roomtests"
