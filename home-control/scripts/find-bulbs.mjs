#!/usr/bin/env node
// Finds every WiZ bulb on the local subnet and prints its MAC and current IP.
//
// Two uses:
//   1. Collecting MACs to create DHCP reservations on the router.
//   2. Answering "where did the bulb go" — it sweeps by address rather than
//      trusting devices.json, so it still finds a bulb whose IP has moved.

import dgram from 'node:dgram';
import { networkInterfaces } from 'node:os';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const configured = JSON.parse(readFileSync(join(root, 'devices.json'), 'utf8')).bulbs;

const local = Object.values(networkInterfaces())
  .flat()
  .find((entry) => entry?.family === 'IPv4' && !entry.internal);

if (!local) {
  console.error('No IPv4 network interface. Join the Wi-Fi the bulbs are on.');
  process.exit(1);
}

const subnet = local.address.split('.').slice(0, 3).join('.');
console.log(`\nSweeping ${subnet}.0/24 from ${local.address} …`);

const socket = dgram.createSocket('udp4');
const payload = Buffer.from(JSON.stringify({ method: 'getPilot', params: {} }));
const found = new Map();

socket.on('message', (message, from) => {
  try {
    const result = JSON.parse(message.toString()).result;
    if (result?.mac) found.set(from.address, result);
  } catch {
    // Not a WiZ bulb.
  }
});

socket.bind(0, () => {
  for (let host = 2; host < 255; host += 1) {
    socket.send(payload, 38899, `${subnet}.${host}`);
  }

  setTimeout(() => {
    socket.close();
    report();
  }, 4000);
});

const formatMac = (mac) => mac.replace(/(..)(?=.)/g, '$1:').toUpperCase();

function report() {
  if (found.size === 0) {
    console.log('\nNo WiZ bulbs answered on port 38899.');
    console.log('They are powered off, on another network, or this machine is on a different subnet.\n');
    process.exit(1);
  }

  console.log(`\n${found.size} bulb(s) answered:\n`);
  console.log('  ip                mac                 state       configured as');
  console.log(`  ${'-'.repeat(72)}`);

  const drifted = [];
  for (const [ip, result] of [...found].sort(([a], [b]) => a.localeCompare(b))) {
    const match = configured.find((bulb) => bulb.ip === ip);
    const state = result.state ? `on ${result.dimming ?? '?'}%` : 'off';
    if (!match) drifted.push(ip);
    console.log(
      `  ${ip.padEnd(17)} ${formatMac(result.mac).padEnd(19)} ${state.padEnd(11)} ${match?.id ?? '— not in devices.json'}`,
    );
  }

  const missing = configured.filter((bulb) => !found.has(bulb.ip));
  if (missing.length || drifted.length) {
    console.log('\nMISMATCH with devices.json:');
    for (const bulb of missing) console.log(`  ${bulb.id} was expected at ${bulb.ip} and did not answer`);
    for (const ip of drifted) console.log(`  a bulb answered at ${ip}, which is not configured`);
    console.log('\nEither create DHCP reservations for these MACs on the router,');
    console.log('or update devices.json and run `npm run secrets`.\n');
    process.exit(1);
  }

  console.log('\nEvery configured bulb answered at its expected address.\n');
}
