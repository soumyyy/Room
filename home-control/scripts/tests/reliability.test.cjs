const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '../..');
function load(file, mocks = {}, globals = {}) {
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, {
    exports, Buffer, AbortController, URLSearchParams, setTimeout, clearTimeout,
    require: (name) => { if (name in mocks) return mocks[name]; throw new Error('Unexpected dependency: ' + name); },
    ...globals,
  }, { filename: file });
  return exports;
}
const flush = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}
function fakeClock() {
  let id = 0;
  const timers = new Map();
  return {
    setTimeout: (callback) => { timers.set(++id, callback); return id; },
    clearTimeout: (key) => timers.delete(key),
    fire: () => { const pending = [...timers.values()]; timers.clear(); pending.forEach((callback) => callback()); },
    timers,
  };
}

test('malformed UDP response rejects and closes instead of hanging', async () => {
  const clock = fakeClock();
  const events = {};
  let closes = 0;
  const socket = { on: (name, callback) => { events[name] = callback; }, bind: (_, callback) => callback(), send: (...args) => args.at(-1)(), close: () => closes++ };
  const { Wiz } = load('app/wiz.ts', { 'react-native-udp': { default: { createSocket: () => socket } } }, clock);
  const result = Wiz.getPilot('192.0.2.1');
  events.message(Buffer.from('{malformed'), { address: '192.0.2.1' });
  await assert.rejects(result, /Invalid WiZ response/);
  assert.equal(closes, 1);
  assert.equal(clock.timers.size, 0);
});

test('UDP timeout also covers a bind that never completes', async () => {
  const clock = fakeClock();
  let closes = 0;
  const socket = { on() {}, bind() {}, close() { closes++; } };
  const { Wiz } = load('app/wiz.ts', { 'react-native-udp': { default: { createSocket: () => socket } } }, clock);
  const result = Wiz.pilot('192.0.2.1', { state: false });
  clock.fire();
  await assert.rejects(result, /timed out/);
  assert.equal(closes, 1);
});

test('device operations serialize overlapping writes and retain newer ownership', async () => {
  const { DeviceOperations } = load('app/deviceOperations.ts');
  const operations = new DeviceOperations();
  const first = operations.issue(['fan']);
  const gate = deferred();
  const a = operations.run(first, () => gate.promise);
  const second = operations.issue(['fan']);
  let secondStarted = false;
  const b = operations.run(second, async () => { secondStarted = true; });
  const independent = operations.issue(['left']);
  await operations.run(independent, async () => {});
  assert.equal(operations.isPending('fan'), true);
  assert.equal(operations.isCurrent(first, 'fan'), false);
  assert.equal(secondStarted, false);
  gate.resolve();
  await Promise.all([a, b]);
  assert.equal(secondStarted, true);
  assert.equal(operations.isPending('fan'), false);
});

test('reads begun before a command cannot replace its result', async () => {
  const { DeviceOperations } = load('app/deviceOperations.ts');
  const operations = new DeviceOperations();
  const oldRead = operations.read(['left']);
  const write = operations.issue(['left']);
  assert.equal(operations.canRead(oldRead, 'left'), false);
  await operations.run(write, async () => {});
  assert.equal(operations.canRead(oldRead, 'left'), false);
  assert.equal(operations.canRead(operations.read(['left']), 'left'), true);
});

function controllerHarness(overrides = {}) {
  const clock = fakeClock();
  const config = {
    BULBS: [{ id: 'left', name: 'Left', ip: '192.0.2.1' }, { id: 'right', name: 'Right', ip: '192.0.2.2' }],
    BULB_GROUPS: [{ id: 'left', name: 'Left', bulbIds: ['left'] }, { id: 'right', name: 'Right', bulbIds: ['right'] }],
    NODE: { id: 'test' }, TUYA_CLOUD: { clientId: 'test', clientSecret: 'test', infraredId: 'test', acRemoteId: 'test', apiBaseUrl: 'test' },
  };
  const domain = load('app/roomDomain.ts', { './config': config });
  let cursor = 0;
  const cells = [];
  const react = {
    useEffect() {},
    useRef(value) { const i = cursor++; return cells[i] ??= { current: value }; },
    useState(initial) {
      const i = cursor++;
      if (!(i in cells)) cells[i] = typeof initial === 'function' ? initial() : initial;
      return [cells[i], (value) => { cells[i] = typeof value === 'function' ? value(cells[i]) : value; }];
    },
  };
  const sent = [], nodeSent = [], records = [];
  const snapshot = {
    readRoomSnapshot: async () => null, readSceneReport: async () => null,
    recordAcScene: (scene) => records.push(scene), recordNodeChange() {}, recordBulbReadings() {}, recordLightCommand() {},
    ...overrides.snapshot,
  };
  const tuya = {
    sendAcScene: async (scene) => { sent.push(scene); return true; },
    sendNodeCommands: async (commands) => { nodeSent.push(commands); return true; },
    getAcStatus: async () => ({ power: 0, temp: 27 }),
    getInfraredDevice: async () => ({ online: true }),
    getNodeDevice: async () => ({ online: true, status: [] }),
    ...overrides.tuya,
  };
  const wiz = { isUsingDirectWiz: () => true, getWizStatuses: async () => [], ...overrides.wiz };
  const { useRoomController } = load('app/useRoomController.ts', {
    react, 'react-native': { Animated: { Value: class { constructor(value) { this.value = value; } } }, AppState: {} },
    './deviceOperations': load('app/deviceOperations.ts'), './config': config, './roomDomain': domain,
    './roomSnapshot': snapshot, './tuya': tuya, './wizClient': wiz,
  }, { ...clock, __DEV__: false });
  return { render() { cursor = 0; return useRoomController(); }, clock, sent, nodeSent, records, domain, config };
}

/** Runs fake timers (debounce, command spacing) until the controller goes quiet. */
async function settle(h, pending) {
  for (let i = 0; i < 20; i++) {
    await flush();
    if (!h.clock.timers.size) break;
    h.clock.fire();
  }
  return pending;
}

test('AC power off cancels pending mode change; temperature preserves a pending mode', async () => {
  const h = controllerHarness();
  let controller = h.render();
  await settle(h, controller.changeAc({ power: 1 }));
  controller.cycleAc('mode');
  await settle(h, controller.changeAc({ power: 0 }));
  assert.equal(h.sent.at(-1).power, 0);
  assert.equal(h.sent.length, 2);
  controller = h.render();
  controller.cycleAc('mode');
  controller.stepTemperature(1);
  await settle(h);
  assert.equal(h.sent.length, 3);
  assert.equal(h.sent.at(-1).mode, h.domain.nextMode(h.sent.at(-2).mode));
  assert.equal(h.sent.at(-1).temp, 28);
});

test('rapid temperature taps send one command with the final value', async () => {
  const h = controllerHarness();
  const start = h.render().ac.temp;
  h.render().stepTemperature(1);
  h.render().stepTemperature(1);
  h.render().stepTemperature(1);
  assert.equal(h.sent.length, 0);
  assert.equal(h.render().draft.temp, start + 3);
  await settle(h);
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0].temp, start + 3);
  assert.equal(h.sent[0].power, 1);
});

test('AC commands wait for the gap after the previous one', async () => {
  const h = controllerHarness();
  await settle(h, h.render().changeAc({ power: 1 }));
  const second = h.render().changeAc({ power: 0 });
  await flush();
  assert.equal(h.sent.length, 1);
  assert.equal(h.clock.timers.size, 1);
  await settle(h, second);
  assert.equal(h.sent.length, 2);
});

test('resend transmits the current scene unchanged', async () => {
  const h = controllerHarness();
  await settle(h, h.render().changeAc({ power: 1, temp: 24 }));
  const pending = h.render().resendAc();
  await flush();
  h.clock.fire(); // the command gap; the toast's dismiss timer is not set yet
  const ok = await pending;
  assert.equal(ok, true);
  assert.equal(h.sent.length, 2);
  assert.deepEqual(h.sent[1], h.sent[0]);
  assert.match(h.render().toast, /again/);
});

test('failed first fan request cannot roll back a later on/off/on sequence', async () => {
  const gates = [deferred(), deferred(), deferred()];
  let index = 0;
  const h = controllerHarness({ tuya: { sendNodeCommands: () => gates[index++].promise } });
  const controller = h.render();
  controller.toggleNode('fan'); controller.toggleNode('fan'); controller.toggleNode('fan');
  await flush();
  gates[0].reject(new Error('offline'));
  await flush();
  assert.equal(h.render().node.fan, true);
  gates[1].resolve(true); await flush();
  gates[2].resolve(true); await flush();
  assert.equal(h.render().node.fan, true);
  assert.equal(h.render().node.busy, false);
});

test('failed bulb read keeps last observed power and unrelated pending writes', () => {
  const h = controllerHarness();
  const bulbs = h.config.BULBS.map((b) => ({ ...h.domain.createBulbState(b), isOn: true, busy: true }));
  const merged = h.domain.mergeBulbStatuses(bulbs, [{ id: 'left', available: false, isOn: false, brightness: null }]);
  assert.equal(merged[0].isOn, true);
  assert.equal(merged[1].busy, true);
});

function status(bulb, available = true, isOn = false) {
  return { ...bulb, available, isOn, brightness: 40, temp: 2700, r: null, g: null, b: null };
}

test('an unavailable bulb is probed again on the next tap and can recover', async () => {
  let probes = 0, sends = 0;
  const h = controllerHarness({ wiz: {
    getWizStatuses: async (bulbs) => { probes++; return bulbs.map((b) => status(b, probes > 1)); },
    sendWizCommand: async (bulbs, params) => { sends++; return { statuses: bulbs.map((b) => status(b, true, params.state)), confirmedIds: bulbs.map((b) => b.id) }; },
  } });
  await h.render().toggleGroupPower(h.config.BULB_GROUPS[0]);
  assert.equal(sends, 0);
  assert.equal(h.render().bulbs[0].available, false);
  await h.render().toggleGroupPower(h.config.BULB_GROUPS[0]);
  assert.equal(probes, 2);
  assert.equal(sends, 1);
  assert.equal(h.render().bulbs[0].isOn, true);
});

test('finishing left lights does not clear right lights pending command', async () => {
  const left = deferred(), right = deferred();
  const h = controllerHarness({ wiz: {
    getWizStatuses: async (bulbs) => bulbs.map((b) => status(b)),
    sendWizCommand: (bulbs) => bulbs[0].id === 'left' ? left.promise : right.promise,
  } });
  const a = h.render().toggleGroupPower(h.config.BULB_GROUPS[0]);
  const b = h.render().toggleGroupPower(h.config.BULB_GROUPS[1]);
  await flush();
  assert.equal(h.render().bulbs[1].busy, true);
  left.resolve({ statuses: [status(h.config.BULBS[0], true, true)], confirmedIds: ['left'] });
  await a;
  assert.equal(h.render().bulbs[0].busy, false);
  assert.equal(h.render().bulbs[1].busy, true);
  right.resolve({ statuses: [status(h.config.BULBS[1], true, true)], confirmedIds: ['right'] });
  await b;
  assert.equal(h.render().bulbs[1].busy, false);
});

test('parallel Tuya callers share token acquisition', async () => {
  let tokenCalls = 0;
  const gate = deferred();
  const crypto = { SHA256: () => ({ toString: () => 'hash' }), HmacSHA256: () => ({ toString: () => 'sign' }), enc: { Hex: {} } };
  const client = load('app/tuya.ts', { 'crypto-js': { default: crypto }, './config': { TUYA_CLOUD: { apiBaseUrl: 'https://example.invalid', clientId: 'test', clientSecret: 'test' }, NODE: { id: 'test' } } }, {
    fetch: async (url) => {
      if (url.includes('/token?')) { tokenCalls++; await gate.promise; return { ok: true, json: async () => ({ success: true, result: { access_token: 'token', expire_time: 3600 } }) }; }
      return { ok: true, json: async () => ({ success: true, result: { online: true, status: [] } }) };
    },
  });
  const calls = [client.getNodeDevice(), client.getInfraredDevice(), client.getAcStatus()];
  assert.equal(tokenCalls, 1);
  gate.resolve();
  await Promise.all(calls);
});

test('Tuya deadline stays active while reading the response body', async () => {
  const clock = fakeClock();
  const crypto = { SHA256: () => ({ toString: () => 'hash' }), HmacSHA256: () => ({ toString: () => 'sign' }), enc: { Hex: {} } };
  const client = load('app/tuya.ts', { 'crypto-js': { default: crypto }, './config': { TUYA_CLOUD: { apiBaseUrl: 'https://example.invalid', clientId: 'test', clientSecret: 'test' }, NODE: {} } }, {
    ...clock,
    fetch: async (_, options) => ({ ok: true, json: () => new Promise((_, reject) => options.signal.addEventListener('abort', () => { const error = new Error('aborted'); error.name = 'AbortError'; reject(error); })) }),
  });
  const result = client.getAcStatus();
  await flush();
  clock.fire();
  await assert.rejects(result, /timed out/);
});
