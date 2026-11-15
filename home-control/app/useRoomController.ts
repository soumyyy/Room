import { useEffect, useRef, useState } from 'react';
import { Animated, AppState } from 'react-native';
import { DeviceOperations } from './deviceOperations';
import { onRoomStateChanged, performRoomScene, readSceneReport, recordNodeChange, recordBulbReadings, type SceneReport, type StoredRoomSnapshot } from './roomSnapshot';
import { BULB_GROUPS, BULBS, type BulbGroupConfig } from './config';
import {
  ALL_LIGHTS_GROUP,
  nextMode,
  nextWind,
  DEFAULT_BULB_BRIGHTNESS,
  INITIAL_SCENE,
  bulbsForGroup,
  bulbsFromSnapshot,
  clampBrightness,
  clampTemp,
  createBulbState,
  createNodeState,
  colorsFromSnapshot,
  createPreviewStatuses,
  groupIdsFor,
  isNodeConfigured,
  isTuyaConfigured,
  mergeBulbStatuses,
  modeLabel,
  windLabel,
  mergeNodeStatus,
  nodeCommands,
  normalizeStatus,
  sceneFromSnapshot,
  sceneToPayload,
  type AcScene,
  type BulbState,
  type GroupColorPreset,
  type NodeChange,
  type NodeState,
} from './roomDomain';
import {
  logAction,
  readRoomSnapshot,
  recordAcScene,
  recordLightCommand,
} from './roomSnapshot';
import {
  getAcStatus,
  getInfraredDevice,
  getNodeDevice,
  sendAcScene,
  sendNodeCommands,
} from './tuya';
import { getWizStatuses, isUsingDirectWiz, sendWizCommand } from './wizClient';
const DEV_LIGHT_UI_PREVIEW = __DEV__;

/** A WiZ command in words, for the action log. */
function describeLight(params: Record<string, unknown>) {
  if (params.state === false) return 'off';
  const parts = ['on'];
  if (typeof params.dimming === 'number') parts.push(`${params.dimming}%`);
  if (typeof params.temp === 'number') parts.push(`${params.temp}K`);
  if (typeof params.r === 'number') parts.push(`rgb(${params.r},${params.g},${params.b})`);
  return parts.join(' ');
}

/** How long the Tuya cloud takes to report a relay's new state after a command. */
const NODE_SETTLE_MS = 2000;
/** Quiet period after the last AC tap before one command goes out. */
const AC_SETTLE_MS = 600;
/** Minimum time between IR commands. The blaster and the AC drop codes that
 *  arrive back to back, and IR is one-way, so a dropped code goes unnoticed. */
const AC_COMMAND_GAP_MS = 1000;

export function useRoomController() {
  const operations = useRef(new DeviceOperations()).current;
  const mounted = useRef(true);
  const roomBusyRef = useRef(false);
  const refreshRef = useRef<Promise<void> | null>(null);
  const [ac, setAc] = useState<AcScene>(INITIAL_SCENE);
  const [acAvailable, setAcAvailable] = useState<boolean | null>(null);
  const [acBusy, setAcBusy] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [bulbs, setBulbs] = useState<BulbState[]>(() => BULBS.map(createBulbState));
  const bulbsRef = useRef(bulbs);
  const confirmedBulbs = useRef(bulbs);
  function updateBulbs(update: (current: BulbState[]) => BulbState[]) {
    bulbsRef.current = update(bulbsRef.current);
    if (mounted.current) setBulbs(bulbsRef.current);
  }
  const [selectedGroupColor, setSelectedGroupColor] = useState<Record<string, string>>(() =>
    Object.fromEntries(BULB_GROUPS.map((group) => [group.id, 'warm-white'])),
  );
  const [lightsSeparated, setLightsSeparated] = useState(false);
  const [inRoom, setInRoom] = useState(true);
  const [roomBusy, setRoomBusy] = useState(false);
  const [scenePhase, setScenePhase] = useState<SceneReport['phase']>(null);
  const [sceneFailures, setSceneFailures] = useState<string[]>([]);
  const [node, setNode] = useState<NodeState>(createNodeState);
  // The ref is the truth for taps and commands; state mirrors it for rendering.
  // Reading state inside a handler is one render behind a fast second tap.
  const nodeRef = useRef<NodeState>(node);
  const confirmedNode = useRef(node);
  const nodeQuietUntilRef = useRef(0);
  const nodeVerifyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Temperature, Mode and Airflow change on each tap. The display moves at once
  // (`draft`) and one command goes out after the taps stop, so a quick run of
  // taps never sends the values it passed through.
  const [draft, setDraft] = useState<AcScene | null>(null);
  const draftRef = useRef<AcScene | null>(null);
  const cycleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const acRef = useRef(ac);
  const confirmedAc = useRef(ac);
  const acQuietUntil = useRef(0);
  const acNextSendAt = useRef(0);
  const [toast, setToast] = useState<string | null>(null);
  const [showSplash, setShowSplash] = useState(true);
  const [colorSheetGroupId, setColorSheetGroupId] = useState<string | null>(null);
  const [sheetBrightness, setSheetBrightness] = useState(DEFAULT_BULB_BRIGHTNESS);
  const splashOpacity = useRef(new Animated.Value(1)).current;
  const splashTranslate = useRef(new Animated.Value(0)).current;
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tuyaReady = isTuyaConfigured();
  const wizDirectAvailable = isUsingDirectWiz();
  const wizReady = wizDirectAvailable || DEV_LIGHT_UI_PREVIEW;
  const acDisabled = !tuyaReady || roomBusy || loadingStatus;
  const nodeReady = isNodeConfigured();

  function showToast(message: string) {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }

    setToast(message);
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 2600);
  }

  async function loadStatus(options?: { showLoader?: boolean; silent?: boolean }) {
    const began = Date.now();
    const read = operations.read(['ac']);
    if (operations.isPending('ac') || draftRef.current || roomBusyRef.current || Date.now() < acQuietUntil.current) return;
    if (!tuyaReady) {
      showToast('AC control is not configured.');
      setLoadingStatus(false);
      return;
    }

    if (options?.showLoader ?? true) {
      setLoadingStatus(true);
    }

    try {
      const [statusResult, deviceResult] = await Promise.allSettled([
        getAcStatus(),
        getInfraredDevice(),
      ]);
      if (!mounted.current || !operations.canRead(read, 'ac') || draftRef.current || roomBusyRef.current) return;

      if (deviceResult.status === 'fulfilled') {
        setAcAvailable(deviceResult.value.online);

        if (!deviceResult.value.online && !options?.silent) {
          showToast('AC infrared hub is offline.');
        }
      }

      if (statusResult.status === 'rejected') {
        throw statusResult.reason;
      }
      if (deviceResult.status === 'fulfilled' && !deviceResult.value.online) return;

      const scene = normalizeStatus(statusResult.value);
      acRef.current = scene;
      confirmedAc.current = scene;
      setAc(scene);

      // Tuya's virtual AC remote can return its last remembered scene while the
      // physical IR hub is offline. Show that scene as stale context, but do not
      // refresh the widget timestamp and present it as a new observation.
      if (deviceResult.status === 'fulfilled' && deviceResult.value.online) {
        recordAcScene(scene, began);
      }
    } catch (error) {
      if (!options?.silent) {
        const message = error instanceof Error ? error.message : 'Unable to reach Tuya Cloud';
        showToast(message);
      }
    } finally {
      if (options?.showLoader ?? true) {
        setLoadingStatus(false);
      }
    }
  }

  async function loadBulbStatus() {
    const began = Date.now();
    const eligible = BULBS.filter((b) => !operations.isPending(b.id)).map((b) => b.id);
    const read = operations.read(BULBS.map((b) => b.id));
    if (!wizDirectAvailable && DEV_LIGHT_UI_PREVIEW) {
      updateBulbs((current) =>
        current.map((bulb) => ({ ...bulb, available: true, busy: false })),
      );
      return;
    }

    try {
      const statuses = await getWizStatuses(BULBS);
      if (!mounted.current || roomBusyRef.current) return;
      const fresh = statuses.filter((s) => eligible.includes(s.id) && operations.canRead(read, s.id));
      confirmedBulbs.current = mergeBulbStatuses(confirmedBulbs.current, fresh);
      updateBulbs((current) => mergeBulbStatuses(current, fresh));
      recordBulbReadings(fresh, began);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unable to reach the lights';
      showToast(message);
    }
  }

  function updateNode(update: (current: NodeState) => NodeState) {
    nodeRef.current = update(nodeRef.current);
    setNode(nodeRef.current);
  }

  /**
   * Reads the switchboard and shows what it reports, unless a command went out
   * in the last moments: the cloud still answers with the old state then, and
   * showing that undid the tap that had just worked.
   */
  async function loadNodeStatus(options?: { silent?: boolean }) {
    const began = Date.now();
    const read = operations.read(['fan', 'tube']);
    if (operations.isPending('fan') || operations.isPending('tube') || roomBusyRef.current) return;
    if (!nodeReady) {
      return;
    }

    if (Date.now() < nodeQuietUntilRef.current) {
      scheduleNodeVerify();
      return;
    }

    try {
      const device = await getNodeDevice();

      if (!mounted.current || roomBusyRef.current || !operations.canRead(read, 'fan') || !operations.canRead(read, 'tube') || Date.now() < nodeQuietUntilRef.current) {
        return;
      }

      if (!device.online) {
        updateNode((current) => ({ ...current, available: false }));
        return;
      }
      confirmedNode.current = mergeNodeStatus(confirmedNode.current, device);
      updateNode(() => confirmedNode.current);
      const observed: NodeChange = {};
      for (const [key, code] of [['tube', 'switch_1'], ['fan', 'switch_2']] as const) {
        const value = device.status.find((entry) => entry.code === code)?.value;
        if (typeof value === 'boolean') observed[key] = value;
      }
      recordNodeChange(observed, began);
    } catch (error) {
      if (!options?.silent) {
        const message = error instanceof Error ? error.message : 'Unable to reach the switchboard';
        showToast(message);
      }
    }
  }

  function scheduleNodeVerify() {
    if (nodeVerifyTimerRef.current) {
      clearTimeout(nodeVerifyTimerRef.current);
    }

    const wait = Math.max(0, nodeQuietUntilRef.current - Date.now()) + 100;
    nodeVerifyTimerRef.current = setTimeout(() => {
      nodeVerifyTimerRef.current = null;
      void loadNodeStatus({ silent: true });
    }, wait);
  }

  /**
   * The screen changes the instant you tap, and stays changed: the command is
   * queued behind any earlier one, so two quick taps reach the relay in order,
   * and a command the cloud accepted needs no second read to be believed. A
   * quiet read follows once the cloud has caught up, to catch a wall switch.
   */
  function submitNode(change: NodeChange, options?: { silent?: boolean }): Promise<boolean> {
    const keys = Object.keys(change);
    const commands = nodeCommands(change);
    if (!commands.length) return Promise.resolve(true);
    const operation = operations.issue(keys);
    updateNode((current) => ({ ...current, ...change, busy: true }));
    const label = Object.entries(change).map(([key, on]) => (key === 'fan' ? 'Fan' : 'Tube') + (on ? ' on' : ' off')).join(', ');
    return operations.run(operation, async () => {
      const began = Date.now();
      try {
        if (!await sendNodeCommands(commands)) throw new Error('Switchboard command not confirmed.');
        logAction(label, began);
        confirmedNode.current = { ...confirmedNode.current, ...change, available: true };
        updateNode((current) => ({ ...current, available: true }));
        // Only accepted values reach the widget, never later queued intentions.
        recordNodeChange(change, Date.now(), true);
        nodeQuietUntilRef.current = Date.now() + NODE_SETTLE_MS;
        return true;
      } catch (error) {
        logAction(label, began, error);
        updateNode((current) => {
          const next = { ...current };
          for (const key of keys as Array<keyof NodeChange>) {
            if (operations.isCurrent(operation, key)) next[key] = confirmedNode.current[key];
          }
          return next;
        });
        if (!options?.silent) showToast(error instanceof Error ? error.message : 'Switchboard command failed');
        return false;
      }
    }).finally(() => {
      if (!mounted.current) return;
      updateNode((current) => ({ ...current, busy: operations.isPending('fan') || operations.isPending('tube') }));
      scheduleNodeVerify();
    });
  }

  function toggleNode(key: 'tube' | 'fan') {
    if (roomBusyRef.current) return;
    void submitNode({ [key]: !nodeRef.current[key] });
  }

  async function syncGroupStatus(group: BulbGroupConfig) {
    if (group.bulbIds.some((id) => operations.isPending(id))) return null;
    const began = Date.now();
    const read = operations.read(group.bulbIds);
    if (!wizDirectAvailable && DEV_LIGHT_UI_PREVIEW) {
      const statuses = createPreviewStatuses(bulbsForGroup(group, bulbs));
      updateBulbs((current) =>
        current.map((bulb) =>
          group.bulbIds.includes(bulb.id) ? { ...bulb, available: true, busy: false } : bulb,
        ),
      );
      return statuses;
    }

    try {
      const statuses = await getWizStatuses(bulbsForGroup(group, BULBS));
      if (!mounted.current || roomBusyRef.current) return null;
      const fresh = statuses.filter((s) => operations.canRead(read, s.id));
      confirmedBulbs.current = mergeBulbStatuses(confirmedBulbs.current, fresh);
      updateBulbs((current) => mergeBulbStatuses(current, fresh));
      recordBulbReadings(fresh, began);
      return statuses;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unable to verify light status';
      showToast(message);
      return null;
    }
  }

  function cancelPendingCycle() {
    if (cycleTimerRef.current) clearTimeout(cycleTimerRef.current);
    cycleTimerRef.current = null;
    draftRef.current = null;
    setDraft(null);
  }

  function submitAcScene(nextScene: AcScene, options?: { silent?: boolean; label?: string }): Promise<boolean> {
    const label = options?.label ?? `AC ${nextScene.power ? 'on' : 'off'} · ${nextScene.temp}° ${modeLabel(nextScene.mode)}, ${windLabel(nextScene.wind)}`;
    cancelPendingCycle();
    const operation = operations.issue(['ac']);
    acRef.current = nextScene;
    setAc(nextScene);
    setAcBusy(true);
    return operations.run(operation, async () => {
      let began = Date.now();
      try {
        const wait = acNextSendAt.current - Date.now();
        if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
        began = Date.now();
        let accepted: boolean;
        try {
          accepted = await sendAcScene(sceneToPayload(nextScene));
        } finally {
          acNextSendAt.current = Date.now() + AC_COMMAND_GAP_MS;
        }
        if (!accepted) throw new Error('AC command not confirmed.');
        logAction(label, began);
        // Tuya's immediate readback can lag the accepted command. A later refresh
        // reconciles it; it must not replace the command with the old scene here.
        confirmedAc.current = nextScene;
        recordAcScene(nextScene, Date.now(), true);
        acQuietUntil.current = Date.now() + NODE_SETTLE_MS;
        if (operations.isCurrent(operation, 'ac')) setAcAvailable(true);
        return true;
      } catch (error) {
        logAction(label, began, error);
        if (operations.isCurrent(operation, 'ac')) {
          acRef.current = confirmedAc.current;
          setAc(confirmedAc.current);
          if (error && typeof error === 'object' && 'code' in error && String(error.code) === '30003') setAcAvailable(false);
        }
        if (!options?.silent) showToast(error instanceof Error ? error.message : 'AC command failed');
        return false;
      }
    }).finally(() => { if (mounted.current) setAcBusy(operations.isPending('ac')); });
  }

  function changeAc(edit: Partial<AcScene>) {
    if (roomBusyRef.current) return;
    const next = { ...(draftRef.current ?? acRef.current), ...edit };
    return submitAcScene(next);
  }

  /** Shows `next` at once and sends it once the taps stop. */
  function stageAc(next: AcScene) {
    draftRef.current = next;
    setDraft(next);
    if (cycleTimerRef.current) clearTimeout(cycleTimerRef.current);
    cycleTimerRef.current = setTimeout(() => {
      cycleTimerRef.current = null;
      const final = draftRef.current;
      if (final) void submitAcScene(final);
    }, AC_SETTLE_MS);
  }

  function stepTemperature(delta: number) {
    if (roomBusyRef.current) return;
    const base = draftRef.current ?? acRef.current;
    stageAc({ ...base, power: 1, temp: clampTemp(base.temp + delta) });
  }

  /** IR cannot report what the AC heard, so the shown scene can drift from the
   *  real one. Every command carries the full scene, so sending it again brings
   *  the AC back in line with the screen. */
  async function resendAc() {
    if (roomBusyRef.current) return false;
    const ok = await submitAcScene(draftRef.current ?? acRef.current, { label: 'AC resend' });
    if (ok) showToast('Sent the current settings to the AC again.');
    return ok;
  }

  function toggleAcPower() {
    const base = draftRef.current ?? acRef.current;
    return changeAc({ power: base.power ? 0 : 1 });
  }

  function runGroupCommand(
    group: BulbGroupConfig,
    optimisticUpdate: (bulb: BulbState) => BulbState,
    params: Record<string, unknown>,
    options?: { presetId?: string; silent?: boolean },
  ): Promise<boolean> {
    const members = bulbsForGroup(group, bulbsRef.current);
    if (!members.length) return Promise.resolve(false);
    const operation = operations.issue(members.map((b) => b.id));
    const label = `${group.name} · ${describeLight(params)}`;
    updateBulbs((current) => current.map((b) => group.bulbIds.includes(b.id) ? { ...optimisticUpdate(b), busy: true } : b));
    return operations.run(operation, async () => {
      const began = Date.now();
      try {
        if (!wizDirectAvailable && DEV_LIGHT_UI_PREVIEW) {
          updateBulbs((current) => current.map((b) => group.bulbIds.includes(b.id) ? { ...optimisticUpdate(b), available: true } : b));
          return true;
        }
        const result = await sendWizCommand(members, params);
        confirmedBulbs.current = mergeBulbStatuses(confirmedBulbs.current, result.statuses);
        recordBulbReadings(result.statuses, began);
        const fresh = result.statuses.filter((status) => operations.isCurrent(operation, status.id));
        updateBulbs((current) => mergeBulbStatuses(current, fresh).map((b) => {
          const status = fresh.find((s) => s.id === b.id);
          const confirmed = confirmedBulbs.current.find((saved) => saved.id === b.id);
          return { ...(status && !status.available && confirmed ? confirmed : b), busy: operations.isPending(b.id) };
        }));
        // Publish a group only when every member is observed, including partial
        // failures; never claim that an unobserved bulb followed its neighbour.
        for (const actualGroup of BULB_GROUPS) {
          const statuses = actualGroup.bulbIds.map((id) => result.statuses.find((s) => s.id === id));
          if (statuses.every((s) => s?.available)) {
            const lit = statuses.filter((s) => s!.isOn);
            const brightness = lit.map((s) => s!.brightness).filter((v): v is number => v !== null);
            recordLightCommand(actualGroup.id, { state: lit.length > 0, ...(brightness.length ? { dimming: Math.round(brightness.reduce((a,b) => a+b,0) / brightness.length) } : {}) }, result.confirmedIds.length === members.length ? options?.presetId : undefined, began);
          }
        }
        if (result.confirmedIds.length !== members.length) {
          const missing = members.filter((b) => !result.confirmedIds.includes(b.id)).map((b) => b.name);
          logAction(label, began, `${result.confirmedIds.length}/${members.length} confirmed; no reply from ${missing.join(', ')}`);
          if (!options?.silent) showToast(group.name + ': ' + result.confirmedIds.length + '/' + members.length + ' lights confirmed. Tap to retry.');
          return false;
        }
        logAction(label, began);
        return true;
      } catch (error) {
        logAction(label, began, error);
        updateBulbs((current) => current.map((b) => {
          const old = confirmedBulbs.current.find((saved) => saved.id === b.id);
          return old && operations.isCurrent(operation, b.id) ? { ...old, busy: true } : b;
        }));
        if (!options?.silent) showToast(error instanceof Error ? error.message : 'WiZ command failed');
        return false;
      }
    }).finally(() => {
      if (mounted.current) updateBulbs((current) => current.map((b) => ({ ...b, busy: operations.isPending(b.id) })));
    });
  }

  /// Resolves which bulbs of `group` we can act on and whether they are lit,
  /// preferring what we already know. Every command merges fresh statuses back
  /// in, so local state is current after the first read — and skipping that
  /// round trip is the difference between a tap feeling instant and feeling
  /// like it took a second.
  async function reachableBulbs(group: BulbGroupConfig): Promise<BulbState[] | null> {
    let members = bulbsForGroup(group, bulbsRef.current);
    if (members.some((b) => b.available !== true)) {
      const statuses = await syncGroupStatus(group);
      if (!statuses) return null;
      members = bulbsForGroup(group, bulbsRef.current);
    }
    return members.filter((b) => b.available === true);
  }

  async function toggleGroupPower(group: BulbGroupConfig) {
    if (roomBusyRef.current) return;
    const reachable = await reachableBulbs(group);
    if (roomBusyRef.current) return;

    if (!reachable) {
      return;
    }

    if (!reachable.length) {
      showToast(`${group.name} unavailable`);
      return;
    }

    const shouldTurnOn = !reachable.some((bulb) => bulb.isOn);

    await runGroupCommand(
      { ...group, bulbIds: reachable.map((bulb) => bulb.id) },
      (current) => ({ ...current, isOn: shouldTurnOn }),
      { state: shouldTurnOn },
    );
  }

  async function toggleAllLightsPower() {
    if (roomBusyRef.current) return;
    if (!wizDirectAvailable && DEV_LIGHT_UI_PREVIEW) {
      const availableStatuses = createPreviewStatuses(bulbs);
      const shouldTurnOn = !availableStatuses.some((status) => status.isOn);

      await Promise.all(
        BULB_GROUPS.map((group) =>
          runGroupCommand(
            group,
            (current) => ({ ...current, isOn: shouldTurnOn }),
            { state: shouldTurnOn },
          ),
        ),
      );
      return;
    }

    try {
      const reachablePerGroup = await Promise.all(BULB_GROUPS.map(reachableBulbs));
      if (roomBusyRef.current) return;

      if (reachablePerGroup.some((entry) => entry === null)) {
        return;
      }

      const reachable = reachablePerGroup.flatMap((entry) => entry ?? []);

      if (!reachable.length) {
        showToast('Lights unavailable');
        return;
      }

      const availableIds = new Set(reachable.map((bulb) => bulb.id));
      const shouldTurnOn = !reachable.some((bulb) => bulb.isOn);

      await Promise.all(
        BULB_GROUPS.map((group) => {
          const availableGroup = {
            ...group,
            bulbIds: group.bulbIds.filter((id) => availableIds.has(id)),
          };

          return availableGroup.bulbIds.length
            ? runGroupCommand(
                availableGroup,
                (current) => ({ ...current, isOn: shouldTurnOn }),
                { state: shouldTurnOn },
              )
            : Promise.resolve(false);
        }),
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unable to verify light status';
      showToast(message);
    }
  }

  function openColorSheet(groupId: string) {
    const group = groupId === ALL_LIGHTS_GROUP.id
      ? ALL_LIGHTS_GROUP
      : BULB_GROUPS.find((g) => g.id === groupId);
    if (!group) return;
    const members = bulbsForGroup(group, bulbs);
    const avg = members.length
      ? Math.round(members.reduce((s, b) => s + b.brightness, 0) / members.length)
      : DEFAULT_BULB_BRIGHTNESS;
    setSheetBrightness(avg);
    setColorSheetGroupId(groupId);
  }

  const sheetGroup =
    colorSheetGroupId === ALL_LIGHTS_GROUP.id
      ? ALL_LIGHTS_GROUP
      : BULB_GROUPS.find((group) => group.id === colorSheetGroupId) ?? null;
  const sheetGroupBusy = sheetGroup
    ? bulbsForGroup(sheetGroup, bulbs).some((bulb) => bulb.busy)
    : false;
  // With 'all' open, only highlight a chip when every group agrees.
  const sheetColorIds = sheetGroup
    ? groupIdsFor(sheetGroup).map((id) => selectedGroupColor[id] ?? 'warm-white')
    : [];
  const sheetActiveColorId =
    sheetColorIds.length > 0 && sheetColorIds.every((id) => id === sheetColorIds[0])
      ? sheetColorIds[0]
      : null;

  async function applySheetPreset(preset: GroupColorPreset) {
    if (!sheetGroup || roomBusyRef.current) {
      return;
    }

    const ok = await runGroupCommand(
      sheetGroup,
      (bulb) => ({ ...bulb, isOn: true }),
      { dimming: clampBrightness(sheetBrightness), ...preset.params },
      { presetId: preset.id },
    );

    if (ok) {
      setSelectedGroupColor((current) => ({
        ...current,
        ...Object.fromEntries(groupIdsFor(sheetGroup).map((id) => [id, preset.id])),
      }));
    }
  }

  async function applySheetBrightness(nextValue: number) {
    if (!sheetGroup || roomBusyRef.current) {
      return;
    }

    const brightness = clampBrightness(nextValue);
    const members = bulbsForGroup(sheetGroup, confirmedBulbs.current);
    const previous = members.length ? Math.round(members.reduce((sum, bulb) => sum + bulb.brightness, 0) / members.length) : DEFAULT_BULB_BRIGHTNESS;
    setSheetBrightness(brightness);

    const ok = await runGroupCommand(
      sheetGroup,
      (bulb) => ({ ...bulb, isOn: true, brightness }),
      { state: true, dimming: brightness },
    );

    if (!ok) {
      setSheetBrightness(previous);
    }
  }

  function cycleAc(field: 'mode' | 'wind') {
    if (roomBusyRef.current) return;
    const base = draftRef.current ?? acRef.current;
    stageAc({
      ...base,
      power: 1,
      ...(field === 'mode' ? { mode: nextMode(base.mode) } : { wind: nextWind(base.wind) }),
    });
  }

  function hydrate(snapshot: StoredRoomSnapshot | null) {
    const scene = sceneFromSnapshot(snapshot);
    if (scene && !operations.isPending('ac') && !draftRef.current) {
      confirmedAc.current = scene;
      acRef.current = scene;
      setAc(scene);
      setLoadingStatus(false);
    }
    if (!snapshot) return;
    const restored = bulbsFromSnapshot(bulbsRef.current, snapshot).map((bulb) => {
      const individual = snapshot.bulbs?.[bulb.id];
      return individual ? { ...bulb, isOn: individual.state, brightness: individual.dimming ?? bulb.brightness } : bulb;
    });
    confirmedBulbs.current = restored;
    updateBulbs((current) => current.map((b) => operations.isPending(b.id) ? b : restored.find((r) => r.id === b.id) ?? b));
    setSelectedGroupColor((current) => colorsFromSnapshot(current, snapshot));
    if (snapshot.node && !operations.isPending('fan') && !operations.isPending('tube')) {
      confirmedNode.current = { ...confirmedNode.current, ...snapshot.node };
      updateNode(() => confirmedNode.current);
    }
  }

  function acceptSceneReport(report: SceneReport, restoreValues = false) {
    setScenePhase(report.phase ?? null);
    setSceneFailures(report.failed);
    setInRoom(!report.phase || report.phase === 'leaving');
    if (restoreValues) hydrate(report.snapshot);
  }

  async function runScene(action: 'enter' | 'leave') {
    if (roomBusyRef.current) return;
    roomBusyRef.current = true;
    setRoomBusy(true);
    cancelPendingCycle();
    const label = action === 'leave' ? 'Leave Room' : 'Enter Room';
    let began = Date.now();
    try {
      await operations.idle();
      began = Date.now();
      const report = await performRoomScene(action);
      logAction(label, began, report.failed.length ? `needs retry: ${report.failed.join(', ')}` : undefined);
      acQuietUntil.current = Date.now() + NODE_SETTLE_MS;
      nodeQuietUntilRef.current = Date.now() + NODE_SETTLE_MS;
      acceptSceneReport(report, true);
      if (report.failed.length) showToast(report.failed.length + ' device actions need retry. Tap Retry ' + (action === 'leave' ? 'Leave' : 'Enter') + '.');
    } catch (error) {
      logAction(label, began, error);
      showToast(error instanceof Error ? error.message : 'Room action failed. Tap to retry.');
      const report = await readSceneReport().catch(() => null);
      if (report) acceptSceneReport(report, true);
    } finally {
      roomBusyRef.current = false;
      setRoomBusy(false);
      void refreshRoom();
    }
  }
  function leaveRoom() { return runScene('leave'); }
  function enterRoom() { return runScene('enter'); }

  function refreshRoom(): Promise<void> {
    if (refreshRef.current) return refreshRef.current;
    if (roomBusyRef.current) return Promise.resolve();
    refreshRef.current = (async () => {
      await Promise.allSettled([
        loadStatus({ showLoader: false, silent: true }), loadBulbStatus(), loadNodeStatus({ silent: true }),
        readSceneReport().then((report) => { if (report && mounted.current && !roomBusyRef.current) acceptSceneReport(report); }),
      ]);
    })().finally(() => { refreshRef.current = null; });
    return refreshRef.current;
  }
  const refreshLatest = useRef(refreshRoom);
  refreshLatest.current = refreshRoom;

  /// Redraws from the shared state, which Siri, the widget and Control Center
  /// write the moment they act. Local and instant; devices with a command in
  /// flight here are left alone (hydrate skips them).
  async function syncFromShared() {
    if (roomBusyRef.current) return;
    const [snapshot, scene] = await Promise.all([readRoomSnapshot(), readSceneReport().catch(() => null)]);
    if (!mounted.current || roomBusyRef.current) return;
    hydrate(snapshot);
    if (scene) acceptSceneReport(scene);
  }
  const syncLatest = useRef(syncFromShared);
  syncLatest.current = syncFromShared;

  useEffect(() => {
    mounted.current = true;
    let disposed = false;
    async function boot() {
      try {
        const [snapshot, scene] = await Promise.all([readRoomSnapshot(), readSceneReport().catch(() => null)]);
        if (disposed) return;
        hydrate(snapshot);
        if (scene) acceptSceneReport(scene);
        // All device domains start together. Cached lights and relays hydrate
        // even when no AC snapshot exists, and the shell never waits on cloud IO.
        void Promise.allSettled([loadStatus({ showLoader: !snapshot?.ac, silent: true }), loadBulbStatus(), loadNodeStatus({ silent: true })]);
      } finally {
        if (!disposed) Animated.parallel([
          Animated.timing(splashOpacity, { toValue: 0, duration: 380, useNativeDriver: true }),
          Animated.timing(splashTranslate, { toValue: -18, duration: 380, useNativeDriver: true }),
        ]).start(() => { if (!disposed) setShowSplash(false); });
      }
    }
    void boot().catch((error) => { if (!disposed) showToast(String(error)); });
    // Coming back: show what Siri or the widget already did, then ask the devices.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void syncLatest.current().finally(() => refreshLatest.current());
    });
    // While open: redraw as soon as another process changes the room. A scene
    // writes several times in a burst, so wait for it to settle.
    let syncTimer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribeShared = onRoomStateChanged(() => {
      if (syncTimer) clearTimeout(syncTimer);
      syncTimer = setTimeout(() => { syncTimer = null; void syncLatest.current(); }, 250);
    });
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') void refreshLatest.current();
    }, 30_000);
    return () => {
      disposed = true;
      mounted.current = false;
      subscription.remove();
      unsubscribeShared();
      if (syncTimer) clearTimeout(syncTimer);
      clearInterval(interval);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      if (nodeVerifyTimerRef.current) clearTimeout(nodeVerifyTimerRef.current);
      if (cycleTimerRef.current) clearTimeout(cycleTimerRef.current);
    };
  }, []);


  return {
    toggleAcPower,
    changeAc,
    stepTemperature,
    resendAc,
    scenePhase,
    sceneFailures,
    ac,
    acAvailable,
    acBusy,
    bulbs,
    selectedGroupColor,
    lightsSeparated,
    setLightsSeparated,
    inRoom,
    roomBusy,
    node,
    draft,
    toast,
    showSplash,
    setColorSheetGroupId,
    sheetBrightness,
    setSheetBrightness,
    splashOpacity,
    splashTranslate,
    acDisabled,
    nodeReady,
    wizReady,
    cycleAc,
    toggleNode,
    toggleGroupPower,
    toggleAllLightsPower,
    openColorSheet,
    sheetGroup,
    sheetGroupBusy,
    sheetActiveColorId,
    applySheetBrightness,
    applySheetPreset,
    leaveRoom,
    enterRoom,
  };
}
