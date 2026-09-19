import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  AppState,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import ColorSheet from './components/ColorSheet';
import {
  CycleButton,
  FanGlyph,
  MergeButton,
  PowerButton,
  Segmented,
  StepButton,
  Temperature,
  Tile,
  TubeGlyph,
  ui,
} from './components/RoomUi';
import { applyFont } from './fonts';
import { clamp, theme } from './theme';
import { BULB_GROUPS, BULBS, type BulbConfig, type BulbGroupConfig } from './config';
import {
  ALL_LIGHTS_GROUP,
  MODE_CYCLE,
  WIND_CYCLE,
  combinedColorId,
  cyclePosition,
  lightPanel,
  mixHex,
  nextMode,
  nextWind,
  parseAwayState,
  revertNodeChange,
  presetForTemp,
  windLabel,
  COLOR_ROWS,
  COLOR_ROW_SIZE,
  DEFAULT_BULB_BRIGHTNESS,
  GROUP_COLOR_PRESETS,
  INITIAL_SCENE,
  PRESETS,
  WHITE_PRESETS,
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
  mergeNodeStatus,
  modeLabel,
  nodeCommands,
  normalizeStatus,
  sceneEquals,
  sceneFromSnapshot,
  sceneToPayload,
  type AcScene,
  type AwayState,
  type BulbState,
  type GroupColorPreset,
  type LightPanel,
  type NodeChange,
  type NodeState,
} from './roomDomain';
import {
  readAwayState,
  readRoomSnapshot,
  recordAcScene,
  recordNodeState,
  recordLightCommand,
  saveAwayState,
} from './roomSnapshot';
import {
  getAcStatus,
  getInfraredDevice,
  getNodeDevice,
  sendAcScene,
  sendNodeCommands,
} from './tuya';
import { getWizStatuses, isUsingDirectWiz, sendWizCommand, type WizPilotStatus } from './wizClient';
import { styles } from './styles';

const DEV_LIGHT_UI_PREVIEW = __DEV__;

/** How long the Tuya cloud takes to report a relay's new state after a command. */
const NODE_SETTLE_MS = 2000;

/** The switches in `state` that are on, as a change setting them all to `value`. */
function switchedOn(state: NodeChange, value: boolean): NodeChange {
  return {
    ...(state.tube ? { tube: value } : {}),
    ...(state.fan ? { fan: value } : {}),
  };
}

export default function AppScreen() {
  const [ac, setAc] = useState<AcScene>(INITIAL_SCENE);
  const [acAvailable, setAcAvailable] = useState<boolean | null>(null);
  const [acBusy, setAcBusy] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [bulbs, setBulbs] = useState<BulbState[]>(() => BULBS.map(createBulbState));
  const [selectedGroupColor, setSelectedGroupColor] = useState<Record<string, string>>(() =>
    Object.fromEntries(BULB_GROUPS.map((group) => [group.id, 'warm-white'])),
  );
  const [lightsSeparated, setLightsSeparated] = useState(false);
  const [inRoom, setInRoom] = useState(true);
  const [roomBusy, setRoomBusy] = useState(false);
  const [node, setNode] = useState<NodeState>(createNodeState);
  // The ref is the truth for taps and commands; state mirrors it for rendering.
  // Reading state inside a handler is one render behind a fast second tap.
  const nodeRef = useRef<NodeState>(node);
  const nodeQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const nodeQuietUntilRef = useRef(0);
  const nodeVerifyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedRoomState = useRef<AwayState | null>(null);
  // Mode and Airflow step through a list on each tap. The display moves at once
  // (`draft`) and one command goes out after the taps stop, so a quick double
  // tap never sends the value it passed through.
  const [draft, setDraft] = useState<AcScene | null>(null);
  const draftRef = useRef<AcScene | null>(null);
  const cycleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const acRef = useRef(ac);
  acRef.current = ac;
  const [toast, setToast] = useState<string | null>(null);
  const [showSplash, setShowSplash] = useState(true);
  const [colorSheetGroupId, setColorSheetGroupId] = useState<string | null>(null);
  const [sheetBrightness, setSheetBrightness] = useState(DEFAULT_BULB_BRIGHTNESS);
  const splashOpacity = useRef(new Animated.Value(1)).current;
  const splashTranslate = useRef(new Animated.Value(0)).current;
  const acTempAnim = useRef(new Animated.Value(INITIAL_SCENE.power ? 1 : 0)).current;
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const insets = useSafeAreaInsets();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const tuyaReady = isTuyaConfigured();
  const wizDirectAvailable = isUsingDirectWiz();
  const wizReady = wizDirectAvailable || DEV_LIGHT_UI_PREVIEW;
  const acDisabled = !tuyaReady || acBusy || loadingStatus;
  const nodeReady = isNodeConfigured();

  function showErrorToast(message: string) {
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
    if (!tuyaReady) {
      showErrorToast('AC control is not configured.');
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

      if (deviceResult.status === 'fulfilled') {
        setAcAvailable(deviceResult.value.online);

        if (!deviceResult.value.online && !options?.silent) {
          showErrorToast('AC infrared hub is offline.');
        }
      }

      if (statusResult.status === 'rejected') {
        throw statusResult.reason;
      }

      const scene = normalizeStatus(statusResult.value);
      acRef.current = scene;
      setAc(scene);

      // Tuya's virtual AC remote can return its last remembered scene while the
      // physical IR hub is offline. Show that scene as stale context, but do not
      // refresh the widget timestamp and present it as a new observation.
      if (deviceResult.status !== 'fulfilled' || deviceResult.value.online) {
        recordAcScene(scene);
      }
    } catch (error) {
      if (!options?.silent) {
        const message = error instanceof Error ? error.message : 'Unable to reach Tuya Cloud';
        showErrorToast(message);
      }
    } finally {
      if (options?.showLoader ?? true) {
        setLoadingStatus(false);
      }
    }
  }

  async function loadBulbStatus() {
    if (!wizDirectAvailable && DEV_LIGHT_UI_PREVIEW) {
      setBulbs((current) =>
        current.map((bulb) => ({ ...bulb, available: true, busy: false })),
      );
      return;
    }

    try {
      const statuses = await getWizStatuses(BULBS);
      setBulbs((current) => mergeBulbStatuses(current, statuses));
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unable to reach the lights';
      showErrorToast(message);
    }
  }

  function updateNode(update: (current: NodeState) => NodeState) {
    nodeRef.current = update(nodeRef.current);
    setNode(nodeRef.current);

    // The widget draws the relays from the shared snapshot, so keep it current.
    // Only when the node is known to be reachable: an offline node's last state
    // is not something to show as fact.
    const { available, tube, fan } = nodeRef.current;
    if (available === true) {
      recordNodeState(tube, fan);
    }
  }

  /**
   * Reads the switchboard and shows what it reports, unless a command went out
   * in the last moments: the cloud still answers with the old state then, and
   * showing that undid the tap that had just worked.
   */
  async function loadNodeStatus(options?: { silent?: boolean }) {
    if (!nodeReady) {
      return;
    }

    if (Date.now() < nodeQuietUntilRef.current) {
      scheduleNodeVerify();
      return;
    }

    try {
      const device = await getNodeDevice();

      if (Date.now() < nodeQuietUntilRef.current) {
        return;
      }

      updateNode((current) => mergeNodeStatus(current, device));
    } catch (error) {
      if (!options?.silent) {
        const message = error instanceof Error ? error.message : 'Unable to reach the switchboard';
        showErrorToast(message);
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
    const commands = nodeCommands(change);
    if (!commands.length) {
      return Promise.resolve(true);
    }

    const previous = nodeRef.current;
    updateNode((current) => ({ ...current, ...change }));
    nodeQuietUntilRef.current = Date.now() + NODE_SETTLE_MS;

    const run = async () => {
      try {
        const accepted = await sendNodeCommands(commands);

        if (!accepted) {
          throw new Error('Switchboard command not confirmed.');
        }

        updateNode((current) => ({ ...current, available: true }));
        nodeQuietUntilRef.current = Date.now() + NODE_SETTLE_MS;
        scheduleNodeVerify();
        return true;
      } catch (error) {
        updateNode((current) => revertNodeChange(current, change, previous));

        if (error && typeof error === 'object' && 'code' in error && String(error.code) === '30003') {
          updateNode((current) => ({ ...current, available: false }));
        }

        if (!options?.silent) {
          const message = error instanceof Error ? error.message : 'Switchboard command failed';
          showErrorToast(message);
        }

        return false;
      }
    };

    const result = nodeQueueRef.current.then(run);
    nodeQueueRef.current = result;
    return result;
  }

  function toggleNode(key: 'tube' | 'fan') {
    void submitNode({ [key]: !nodeRef.current[key] });
  }

  async function syncGroupStatus(group: BulbGroupConfig) {
    if (!wizDirectAvailable && DEV_LIGHT_UI_PREVIEW) {
      const statuses = createPreviewStatuses(bulbsForGroup(group, bulbs));
      setBulbs((current) =>
        current.map((bulb) =>
          group.bulbIds.includes(bulb.id) ? { ...bulb, available: true, busy: false } : bulb,
        ),
      );
      return statuses;
    }

    try {
      const statuses = await getWizStatuses(bulbsForGroup(group, BULBS));
      setBulbs((current) => mergeBulbStatuses(current, statuses));
      return statuses;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unable to verify light status';
      showErrorToast(message);
      return null;
    }
  }

  async function submitAcScene(nextScene: AcScene, options?: { silent?: boolean }): Promise<boolean> {
    const previous = acRef.current;

    if (sceneEquals(previous, nextScene)) {
      return true;
    }

    acRef.current = nextScene;
    setAc(nextScene);
    setAcBusy(true);

    try {
      const accepted = await sendAcScene(sceneToPayload(nextScene));

      if (!accepted) {
        throw new Error('AC command not confirmed.');
      }

      setAcAvailable(true);

      try {
        const status = await getAcStatus();
        const confirmed = normalizeStatus(status);
        acRef.current = confirmed;
        setAc(confirmed);
        recordAcScene(confirmed);
      } catch {
        acRef.current = nextScene;
        setAc(nextScene);
        recordAcScene(nextScene);
      }

      return true;
    } catch (error) {
      acRef.current = previous;
      setAc(previous);

      if (error && typeof error === 'object' && 'code' in error && String(error.code) === '30003') {
        setAcAvailable(false);
      }

      if (!options?.silent) {
        const message = error instanceof Error ? error.message : 'AC command failed';
        showErrorToast(message);
      }

      return false;
    } finally {
      setAcBusy(false);
    }
  }

  async function runGroupCommand(
    group: BulbGroupConfig,
    optimisticUpdate: (bulb: BulbState) => BulbState,
    params: Record<string, unknown>,
    options?: { presetId?: string; silent?: boolean },
  ) {
    const snapshot = bulbs.filter((bulb) => group.bulbIds.includes(bulb.id));

    if (!snapshot.length) {
      return false;
    }

    setBulbs((current) =>
      current.map((bulb) =>
        group.bulbIds.includes(bulb.id) ? { ...optimisticUpdate(bulb), busy: true } : bulb,
      ),
    );

    if (!wizDirectAvailable && DEV_LIGHT_UI_PREVIEW) {
      setBulbs((current) =>
        current.map((bulb) =>
          group.bulbIds.includes(bulb.id)
            ? { ...optimisticUpdate(bulb), available: true, busy: false }
            : bulb,
        ),
      );
      return true;
    }

    try {
      const result = await sendWizCommand(
        snapshot.map(({ id, name, ip }) => ({ id, name, ip })),
        params,
      );
      setBulbs((current) => mergeBulbStatuses(current, result.statuses));

      if (result.confirmedIds.length !== snapshot.length) {
        if (!options?.silent) {
          showErrorToast(
            result.confirmedIds.length
              ? `${group.name}: ${result.confirmedIds.length}/${snapshot.length} lights confirmed.`
              : `${group.name} did not confirm the command.`,
          );
        }
        return false;
      }

      recordLightCommand(group.id, params, options?.presetId);
      return true;
    } catch (error) {
      setBulbs((current) =>
        current.map((bulb) => {
          const original = snapshot.find((entry) => entry.id === bulb.id);
          return original ? { ...original, busy: false } : bulb;
        }),
      );
      const message =
        error instanceof Error
          ? error.message
          : 'WiZ group command failed';
      if (!options?.silent) {
        showErrorToast(message);
      }
      return false;
    }
  }

  /// Resolves which bulbs of `group` we can act on and whether they are lit,
  /// preferring what we already know. Every command merges fresh statuses back
  /// in, so local state is current after the first read — and skipping that
  /// round trip is the difference between a tap feeling instant and feeling
  /// like it took a second.
  async function reachableBulbs(group: BulbGroupConfig): Promise<BulbState[] | null> {
    const members = bulbsForGroup(group, bulbs);

    if (members.some((bulb) => bulb.available !== null)) {
      return members.filter((bulb) => bulb.available !== false);
    }

    const statuses = await syncGroupStatus(group);

    if (!statuses) {
      return null;
    }

    return statuses
      .filter((status) => status.available)
      .flatMap((status) => {
        const member = members.find((bulb) => bulb.id === status.id);
        return member ? [{ ...member, isOn: status.isOn, available: true }] : [];
      });
  }

  async function toggleGroupPower(group: BulbGroupConfig) {
    const reachable = await reachableBulbs(group);

    if (!reachable) {
      return;
    }

    if (!reachable.length) {
      showErrorToast(`${group.name} unavailable`);
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

      if (reachablePerGroup.some((entry) => entry === null)) {
        return;
      }

      const reachable = reachablePerGroup.flatMap((entry) => entry ?? []);

      if (!reachable.length) {
        showErrorToast('Lights unavailable');
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
      showErrorToast(message);
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
    if (!sheetGroup) {
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
    if (!sheetGroup) {
      return;
    }

    const brightness = clampBrightness(nextValue);
    const previous = sheetBrightness;
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

  /**
   * Sends a Mode/Airflow change that is still waiting out its 0.6 s pause. Leave
   * room must do this first: left alone, the timer would fire after the room
   * was switched off and turn the AC straight back on.
   */
  async function flushPendingCycle() {
    if (!cycleTimerRef.current) {
      return;
    }

    clearTimeout(cycleTimerRef.current);
    cycleTimerRef.current = null;
    const final = draftRef.current;

    if (final) {
      await submitAcScene(final);
    }

    draftRef.current = null;
    setDraft(null);
  }

  function cycleAc(field: 'mode' | 'wind') {
    const base = draftRef.current ?? acRef.current;
    const next: AcScene = {
      ...base,
      power: 1,
      ...(field === 'mode' ? { mode: nextMode(base.mode) } : { wind: nextWind(base.wind) }),
    };

    draftRef.current = next;
    setDraft(next);

    if (cycleTimerRef.current) {
      clearTimeout(cycleTimerRef.current);
    }

    cycleTimerRef.current = setTimeout(async () => {
      cycleTimerRef.current = null;
      const final = draftRef.current;

      if (final) {
        await submitAcScene(final);
      }

      draftRef.current = null;
      setDraft(null);
    }, 600);
  }

  async function leaveRoom() {
    setRoomBusy(true);

    try {
      await flushPendingCycle();

      const scene = acRef.current;
      const saved: AwayState = {
        ac: scene,
        activeGroupIds: BULB_GROUPS
          .filter((g) => bulbsForGroup(g, bulbs).some((b) => b.isOn))
          .map((g) => g.id),
        node: { tube: nodeRef.current.tube, fan: nodeRef.current.fan },
      };

      // Saved before anything is switched off, so an interruption part-way still
      // leaves Enter room knowing what to bring back.
      savedRoomState.current = saved;
      saveAwayState(JSON.stringify(saved));

      const results = await Promise.all([
        scene.power
          ? submitAcScene({ ...scene, power: 0 }, { silent: true })
          : Promise.resolve(true),
        submitNode(switchedOn(nodeRef.current, false), { silent: true }),
        ...BULB_GROUPS.map((g) =>
          runGroupCommand(
            g,
            (b) => ({ ...b, isOn: false }),
            { state: false },
            { silent: true },
          ),
        ),
      ]);

      setInRoom(false);

      if (results.some((ok) => !ok)) {
        showErrorToast('Room left, but some devices could not be confirmed off.');
      }
    } finally {
      setRoomBusy(false);
    }
  }

  async function enterRoom() {
    setRoomBusy(true);

    try {
      const saved = savedRoomState.current;
      const results = saved
        ? await Promise.all([
            saved.ac.power ? submitAcScene(saved.ac, { silent: true }) : Promise.resolve(true),
            submitNode(switchedOn(saved.node, true), { silent: true }),
            ...BULB_GROUPS
              .filter((g) => saved.activeGroupIds.includes(g.id))
              .map((g) =>
                runGroupCommand(
                  g,
                  (b) => ({ ...b, isOn: true }),
                  { state: true },
                  { silent: true },
                ),
              ),
          ])
        : [true];

      if (results.every(Boolean)) {
        savedRoomState.current = null;
        saveAwayState(null);
        setInRoom(true);
      } else {
        showErrorToast('Some devices were not restored. Tap Enter room to retry.');
      }
    } finally {
      setRoomBusy(false);
    }
  }

  useEffect(() => {
    Animated.timing(acTempAnim, {
      toValue: ac.power ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [ac.power]);

  useEffect(() => {
    let disposed = false;

    // The splash used to wait on Promise.allSettled of the Tuya call, the WiZ
    // call and a hard 1100ms floor, so a cold start cost the slowest of them.
    // A sleeping bulb alone pinned it at the full 1200ms WiZ timeout, and a
    // cold Tuya token means two sequential round trips before anything renders.
    //
    // The room's last known state is already in the App Group, so show that
    // immediately and let the network correct it in place. Only a device we
    // have never observed still waits, because inventing a temperature would
    // be worse than a moment of splash.
    async function boot() {
      const [snapshot, awayJson] = await Promise.all([readRoomSnapshot(), readAwayState()]);

      if (disposed) {
        return;
      }

      // Closed while out of the room: come back still out, and still knowing
      // what Enter room should turn on.
      const away = parseAwayState(awayJson);
      if (away) {
        savedRoomState.current = away;
        setInRoom(false);
      }

      const storedScene = sceneFromSnapshot(snapshot);

      if (storedScene) {
        setAc(storedScene);
        setBulbs((current) => bulbsFromSnapshot(current, snapshot));
        setSelectedGroupColor((current) => colorsFromSnapshot(current, snapshot));
        setLoadingStatus(false);
        void loadStatus({ showLoader: false, silent: true });
      } else {
        await loadStatus({ showLoader: true });
      }

      void loadBulbStatus();
      void loadNodeStatus();

      if (disposed) {
        return;
      }

      Animated.parallel([
        Animated.timing(splashOpacity, {
          toValue: 0,
          duration: 380,
          useNativeDriver: true,
        }),
        Animated.timing(splashTranslate, {
          toValue: -18,
          duration: 380,
          useNativeDriver: true,
        }),
      ]).start(() => {
        if (!disposed) {
          setShowSplash(false);
        }
      });
    }

    boot();

    return () => {
      disposed = true;

      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }

      if (nodeVerifyTimerRef.current) {
        clearTimeout(nodeVerifyTimerRef.current);
      }

      if (cycleTimerRef.current) {
        clearTimeout(cycleTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    // Siri, the widget and the physical remote can all change the room while
    // this screen is backgrounded. Without this the app would show whatever it
    // last rendered and happily send those stale values back.
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') {
        return;
      }

      void loadStatus({ showLoader: false, silent: true });
      void loadBulbStatus();
      void loadNodeStatus();
    });

    return () => subscription.remove();
  }, []);


  const shown = draft ?? ac;
  const acOff = !ac.power || acAvailable === false;
  const tempSize = clamp(windowHeight * 0.095, 54, 84);
  const rowHeight = clamp(windowHeight * 0.19, 120, 190);
  const segmentHeight = clamp(windowHeight * 0.07, 50, 60);
  const cycleHeight = clamp(windowHeight * 0.07, 48, 60);
  const tempAir = clamp(windowHeight * 0.016, 8, 16);
  const tempInset = clamp(windowWidth * 0.06, 16, 30);
  const nodeStatus = node.available === false ? 'Unavailable' : null;

  function renderLightTile({
    key,
    title,
    panel,
    stacked,
    busy,
    disabled,
    onPress,
    onLongPress,
    corner,
  }: {
    key: string;
    title: string;
    panel: LightPanel;
    stacked: boolean;
    busy: boolean;
    disabled: boolean;
    onPress: () => void;
    onLongPress: () => void;
    corner?: React.ReactNode;
  }) {
    return (
      <Tile
        key={key}
        tint={panel.on ? panel.hex : null}
        accessibilityLabel={`${title}, ${panel.unavailable ? 'unavailable' : panel.on ? `${panel.colorName}, ${panel.brightness} percent` : 'off'}`}
        accessibilityHint="Double tap to toggle. Long press to adjust color and brightness."
        checked={panel.on}
        disabled={disabled}
        busy={busy}
        onPress={onPress}
        onLongPress={onLongPress}
        style={screen.lightTile}
      >
        <View
          style={[
            screen.lightDot,
            panel.on
              ? {
                  backgroundColor: panel.hex,
                  shadowColor: panel.hex,
                  shadowOpacity: 0.85,
                  shadowRadius: 10,
                  shadowOffset: { width: 0, height: 0 },
                }
              : null,
          ]}
        />
        {corner}
        {panel.on ? (
          <Text
            style={[
              screen.lightPercent,
              stacked ? screen.lightPercentStacked : screen.lightPercentRight,
              { fontSize: clamp(windowHeight * (stacked ? 0.046 : 0.055), 30, 50) },
            ]}
          >
            {panel.brightness}%
          </Text>
        ) : null}
        <Text style={[screen.lightTitle, panel.on ? screen.lightTitleOn : null]}>{title}</Text>
        <Text
          style={[
            screen.lightSub,
            panel.on ? { color: mixHex(panel.hex, '#ffffff', 0.7) } : null,
          ]}
        >
          {panel.unavailable ? 'Unavailable' : panel.on ? panel.colorName : 'Off'}
        </Text>
      </Tile>
    );
  }

  const combinedPanel = lightPanel(bulbs, combinedColorId(bulbs, selectedGroupColor));
  const combinedBusy = bulbs.some((bulb) => bulb.busy);

  return (
    <View
      style={[
        screen.root,
        { paddingTop: insets.top + 6, paddingBottom: Math.max(insets.bottom - 16, 10) },
      ]}
    >
      <StatusBar style="light" />

      {toast ? (
        <View style={styles.toastWrap} pointerEvents="none">
          <View style={styles.toast}>
            <Text style={styles.toastText}>{toast}</Text>
          </View>
        </View>
      ) : null}

      {/* ── AC: power, temperature, scene, mode and airflow ───────────── */}
      <View style={screen.acBlock}>
        <PowerButton
          on={!!ac.power}
          available={acAvailable}
          busy={acBusy}
          disabled={acDisabled}
          onPress={() => submitAcScene({ ...ac, power: ac.power ? 0 : 1 })}
        />
        {acAvailable === false ? <Text style={screen.acUnavailable}>IR hub offline</Text> : null}

        <View
          style={[screen.tempRow, { paddingVertical: tempAir, paddingHorizontal: tempInset }]}
        >
          <View style={acOff ? ui.dimmed : null}>
            <StepButton
              label="−"
              disabled={acDisabled || shown.temp <= 16}
              onPress={() => submitAcScene({ ...ac, power: 1, temp: clampTemp(ac.temp - 1) })}
            />
          </View>
          <Temperature value={shown.temp} size={tempSize} dimmed={acOff} />
          <View style={acOff ? ui.dimmed : null}>
            <StepButton
              label="+"
              disabled={acDisabled || shown.temp >= 30}
              onPress={() => submitAcScene({ ...ac, power: 1, temp: clampTemp(ac.temp + 1) })}
            />
          </View>
        </View>
      </View>

      <Segmented
        items={PRESETS.map((preset) => ({
          id: preset.id,
          label: preset.name,
          sub: `${preset.scene.temp}°`,
        }))}
        selectedId={presetForTemp(shown.temp)?.id ?? null}
        dimmed={acOff}
        disabled={acDisabled}
        height={segmentHeight}
        onSelect={(id) => {
          const preset = PRESETS.find((entry) => entry.id === id);
          if (preset) {
            void submitAcScene(preset.scene);
          }
        }}
      />

      <View style={screen.pair}>
        <CycleButton
          label="Mode"
          value={modeLabel(shown.mode)}
          position={cyclePosition(MODE_CYCLE, shown.mode)}
          count={MODE_CYCLE.length}
          height={cycleHeight}
          dimmed={acOff}
          disabled={acDisabled}
          onPress={() => cycleAc('mode')}
        />
        <CycleButton
          label="Airflow"
          value={windLabel(shown.wind)}
          position={cyclePosition(WIND_CYCLE, shown.wind)}
          count={WIND_CYCLE.length}
          height={cycleHeight}
          dimmed={acOff}
          disabled={acDisabled}
          onPress={() => cycleAc('wind')}
        />
      </View>

      {/* ── Fan and tube light: the switchboard relays ────────────────── */}
      <View style={[screen.pair, { height: rowHeight }]}>
        <Tile
          tint={node.fan ? theme.sand : null}
          accessibilityLabel={`Fan, ${nodeStatus ?? (node.fan ? 'on' : 'off')}`}
          checked={node.fan}
          disabled={!nodeReady}
          onPress={() => toggleNode('fan')}
          style={screen.fanTile}
        >
          <FanGlyph
            color={node.fan ? theme.sand : theme.dim}
            backdrop={node.fan ? mixHex(theme.sand, theme.panelDeep, 0.16) : theme.panel}
          />
          <View>
            <Text style={[screen.deviceName, node.fan ? screen.deviceNameOn : null]}>Fan</Text>
            <Text style={[screen.deviceSub, node.fan ? { color: theme.sand } : null]}>
              {nodeStatus ?? (node.fan ? 'On' : 'Off')}
            </Text>
          </View>
        </Tile>

        <Tile
          tint={node.tube ? theme.tube : null}
          accessibilityLabel={`Tube light, ${nodeStatus ?? (node.tube ? 'on' : 'off')}`}
          checked={node.tube}
          disabled={!nodeReady}
          onPress={() => toggleNode('tube')}
          style={screen.tubeTile}
        >
          <TubeGlyph on={node.tube} />
          <Text style={[screen.deviceLabelSmall, node.tube ? screen.deviceNameOn : null]}>Tube</Text>
        </Tile>
      </View>

      {/* ── Lights: combined, or one panel per side ───────────────────── */}
      {lightsSeparated ? (
        <View style={screen.lightsRow}>
          {BULB_GROUPS.map((group) => {
            const members = bulbsForGroup(group, bulbs);

            return renderLightTile({
              key: group.id,
              title: group.name.replace(/ lights$/i, ''),
              panel: lightPanel(members, selectedGroupColor[group.id]),
              stacked: true,
              busy: members.some((bulb) => bulb.busy),
              disabled: !wizReady,
              onPress: () => void toggleGroupPower(group),
              onLongPress: () => openColorSheet(group.id),
            });
          })}

          <MergeButton
            merged={false}
            onPress={() => setLightsSeparated(false)}
            style={screen.mergeSeam}
          />
        </View>
      ) : (
        <View style={screen.lightsRow}>
          {renderLightTile({
            key: 'all',
            title: 'Lights',
            panel: combinedPanel,
            stacked: false,
            busy: combinedBusy,
            disabled: !wizReady,
            onPress: () => void toggleAllLightsPower(),
            onLongPress: () => openColorSheet(ALL_LIGHTS_GROUP.id),
            corner: (
              <MergeButton
                merged
                onPress={() => setLightsSeparated(true)}
                style={screen.mergeCorner}
              />
            ),
          })}
        </View>
      )}

      {/* ── Room ──────────────────────────────────────────────────────── */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={inRoom ? 'Leave room' : 'Enter room'}
        accessibilityState={{ busy: roomBusy, disabled: roomBusy }}
        disabled={roomBusy}
        onPress={() => (inRoom ? leaveRoom() : enterRoom())}
        style={({ pressed }) => [
          screen.roomButton,
          inRoom ? null : screen.roomButtonEnter,
          pressed ? ui.tilePressed : null,
          roomBusy ? ui.disabled : null,
        ]}
      >
        {roomBusy ? (
          <ActivityIndicator size="small" color={theme.strong} />
        ) : (
          <Text style={[screen.roomText, inRoom ? null : screen.roomTextEnter]}>
            {inRoom ? 'Leave room' : 'Enter room'}
          </Text>
        )}
      </Pressable>

      <ColorSheet
        group={sheetGroup}
        busy={sheetGroupBusy}
        activeColorId={sheetActiveColorId}
        brightness={sheetBrightness}
        onBrightnessPreview={setSheetBrightness}
        onApplyBrightness={applySheetBrightness}
        onApplyPreset={applySheetPreset}
        onClose={() => setColorSheetGroupId(null)}
      />

      {/* ── Splash ────────────────────────────────────────────────────── */}
      {showSplash ? (
        <Animated.View
          style={[
            styles.splash,
            { opacity: splashOpacity, transform: [{ translateY: splashTranslate }] },
          ]}
        >
          <Text style={styles.splashEyebrow}>ROOM</Text>
          <Text style={styles.splashTitle}>Home</Text>
          <ActivityIndicator size="small" color="#3a3a3c" style={styles.splashSpinner} />
        </Animated.View>
      ) : null}
    </View>
  );
}

const screen = applyFont(StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.bg,
    paddingHorizontal: theme.padding,
    gap: theme.gap,
  },
  acBlock: {
    alignItems: 'center',
    gap: theme.gap,
    position: 'relative',
  },
  acUnavailable: {
    position: 'absolute',
    right: 2,
    top: 27,
    color: theme.dim,
    fontSize: 11,
    fontWeight: '600',
  },
  tempRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
  },
  pair: {
    flexDirection: 'row',
    gap: theme.gap,
  },
  fanTile: {
    flex: 1,
    padding: 16,
    justifyContent: 'space-between',
  },
  tubeTile: {
    width: 84,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 14,
    paddingBottom: 12,
  },
  deviceName: {
    color: theme.mute,
    fontSize: 16,
    fontWeight: '600',
  },
  deviceNameOn: {
    color: theme.strong,
  },
  deviceSub: {
    color: theme.dim,
    fontSize: 12,
    marginTop: 1,
  },
  deviceLabelSmall: {
    color: theme.mute,
    fontSize: 13,
    fontWeight: '600',
  },
  lightsRow: {
    flex: 1,
    flexDirection: 'row',
    gap: theme.gap,
  },
  lightTile: {
    flex: 1,
  },
  lightDot: {
    position: 'absolute',
    left: 16,
    top: 16,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#2a2a2a',
  },
  lightTitle: {
    position: 'absolute',
    left: 16,
    bottom: 36,
    color: theme.dim,
    fontSize: 17,
    fontWeight: '600',
  },
  lightTitleOn: {
    color: '#ffffff',
  },
  lightSub: {
    position: 'absolute',
    left: 16,
    bottom: 15,
    color: theme.dim,
    fontSize: 13,
  },
  lightPercent: {
    position: 'absolute',
    color: '#ffffff',
    fontWeight: '300',
    letterSpacing: -1.5,
  },
  lightPercentRight: {
    right: 16,
    bottom: 12,
  },
  lightPercentStacked: {
    left: 16,
    bottom: 62,
  },
  mergeCorner: {
    position: 'absolute',
    top: 10,
    right: 12,
  },
  mergeSeam: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    marginLeft: -20,
    marginTop: -20,
  },
  roomButton: {
    height: 63,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: theme.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roomButtonEnter: {
    backgroundColor: theme.fade,
    borderColor: theme.fade,
  },
  roomText: {
    color: theme.text,
    fontSize: 14,
    fontWeight: '600',
  },
  roomTextEnter: {
    color: '#0d0d0d',
    fontWeight: '700',
  },
}));
