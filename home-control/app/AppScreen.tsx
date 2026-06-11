import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  GestureResponderEvent,
  LayoutChangeEvent,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar as RNStatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  BULB_GROUPS,
  BULBS,
  TUYA_CLOUD,
  type BulbConfig,
  type BulbGroupConfig,
} from './config';
import { getAcStatus, sendAcScene, type AcScenePayload, type AcStatus } from './tuya';
import {
  getWizStatuses,
  isUsingDirectWiz,
  sendWizCommand,
  type WizPilotStatus,
} from './wizClient';

type ModeValue = 0 | 1 | 2 | 3 | 4;
type WindValue = 0 | 1 | 2 | 3;

type AcScene = {
  power: 0 | 1;
  mode: ModeValue;
  temp: number;
  wind: WindValue;
};

type Preset = {
  id: string;
  name: string;
  accent: string;
  scene: AcScene;
};

type BulbState = BulbConfig & {
  available: boolean | null;
  isOn: boolean;
  brightness: number;
  busy: boolean;
};

type GroupColorPreset = {
  id: string;
  hex: string;
  name: string;
  ring: 'outer' | 'inner';
  angle: number;
  params: Record<string, unknown>;
};

const INITIAL_SCENE: AcScene = {
  power: 0,
  mode: 0,
  temp: 24,
  wind: 1,
};

const DEFAULT_BULB_BRIGHTNESS = 68;
const DEV_LIGHT_UI_PREVIEW = __DEV__;

const MODE_OPTIONS: Array<{ value: ModeValue; label: string }> = [
  { value: 0, label: 'Cool' },
  // { value: 1, label: 'Heat' },
  { value: 2, label: 'Auto' },
  { value: 3, label: 'Fan' },
  { value: 4, label: 'Dry' },
];

const FAN_OPTIONS: Array<{ value: WindValue; label: string }> = [
  { value: 0, label: 'Auto' },
  { value: 1, label: 'Low' },
  { value: 2, label: 'Mid' },
  { value: 3, label: 'High' },
];

const ALL_LIGHTS_GROUP: BulbGroupConfig = {
  id: 'all',
  name: 'Lights',
  bulbIds: BULBS.map((bulb) => bulb.id),
};

const PRESETS: Preset[] = [
  {
    id: 'ice',
    name: 'Ice',
    accent: '#8bcff2',
    scene: { power: 1, mode: 0, temp: 21, wind: 3 },
  },
  {
    id: 'daytime',
    name: 'Day',
    accent: '#ffbe8a',
    scene: { power: 1, mode: 0, temp: 24, wind: 1 },
  },
  {
    id: 'night',
    name: 'Night',
    accent: '#b6bdfc',
    scene: { power: 1, mode: 0, temp: 27, wind: 0 },
  },
];

const COLOR_BOARD_SIZE = 232;
const POWER_CORE_SIZE = 104;
const COLOR_SWATCH_SIZE = 32;
const OUTER_COLOR_RADIUS = 94;
const INNER_COLOR_RADIUS = 58;

const GROUP_COLOR_PRESETS: GroupColorPreset[] = [
  {
    id: 'red',
    name: 'Red',
    hex: '#ff3b30',
    ring: 'outer',
    angle: -90,
    params: { state: true, r: 255, g: 59, b: 48 },
  },
  {
    id: 'orange',
    name: 'Orange',
    hex: '#ff9500',
    ring: 'outer',
    angle: -60,
    params: { state: true, r: 255, g: 149, b: 0 },
  },
  {
    id: 'yellow',
    name: 'Yellow',
    hex: '#ffd60a',
    ring: 'outer',
    angle: -30,
    params: { state: true, r: 255, g: 214, b: 10 },
  },
  {
    id: 'green',
    name: 'Green',
    hex: '#30d158',
    ring: 'outer',
    angle: 0,
    params: { state: true, r: 48, g: 209, b: 88 },
  },
  {
    id: 'cyan',
    name: 'Cyan',
    hex: '#00c7be',
    ring: 'outer',
    angle: 30,
    params: { state: true, r: 0, g: 199, b: 190 },
  },
  {
    id: 'blue',
    name: 'Blue',
    hex: '#0a84ff',
    ring: 'outer',
    angle: 60,
    params: { state: true, r: 10, g: 132, b: 255 },
  },
  {
    id: 'purple',
    name: 'Purple',
    hex: '#bf5af2',
    ring: 'outer',
    angle: 90,
    params: { state: true, r: 191, g: 90, b: 242 },
  },
  {
    id: 'pink',
    name: 'Pink',
    hex: '#ff2d55',
    ring: 'outer',
    angle: 120,
    params: { state: true, r: 255, g: 45, b: 85 },
  },
  {
    id: 'warm-white',
    name: 'Warm White',
    hex: '#ffd6a1',
    ring: 'inner',
    angle: -90,
    params: { state: true, temp: 2700 },
  },
  {
    id: 'neutral-white',
    name: 'Neutral',
    hex: '#fff0d6',
    ring: 'inner',
    angle: -18,
    params: { state: true, temp: 4200 },
  },
  {
    id: 'cool-white',
    name: 'Cool White',
    hex: '#e9f6ff',
    ring: 'inner',
    angle: 54,
    params: { state: true, temp: 6500 },
  },
  {
    id: 'seafoam',
    name: 'Seafoam',
    hex: '#a7f0d2',
    ring: 'inner',
    angle: 126,
    params: { state: true, r: 167, g: 240, b: 210 },
  },
  {
    id: 'lavender',
    name: 'Lavender',
    hex: '#d2c8ff',
    ring: 'inner',
    angle: 198,
    params: { state: true, r: 210, g: 200, b: 255 },
  },
  {
    id: 'blush',
    name: 'Blush',
    hex: '#ffc6d8',
    ring: 'inner',
    angle: 270,
    params: { state: true, r: 255, g: 198, b: 216 },
  },
];

function isTuyaConfigured() {
  return (
    !TUYA_CLOUD.clientId.startsWith('YOUR_') &&
    !TUYA_CLOUD.clientSecret.startsWith('YOUR_') &&
    !TUYA_CLOUD.infraredId.startsWith('YOUR_') &&
    !TUYA_CLOUD.acRemoteId.startsWith('YOUR_')
  );
}

function parseNumber(value: string | number | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampMode(value: number): ModeValue {
  return [0, 1, 2, 3, 4].includes(value) ? (value as ModeValue) : INITIAL_SCENE.mode;
}

function clampWind(value: number): WindValue {
  return [0, 1, 2, 3].includes(value) ? (value as WindValue) : INITIAL_SCENE.wind;
}

function clampTemp(value: number) {
  return Math.max(16, Math.min(30, Math.round(value)));
}

function normalizeStatus(status: AcStatus): AcScene {
  const rawPower =
    status.power_open !== undefined
      ? status.power_open
        ? 1
        : 0
      : parseNumber(status.power, INITIAL_SCENE.power);

  return {
    power: rawPower === 1 ? 1 : 0,
    mode: clampMode(parseNumber(status.mode, INITIAL_SCENE.mode)),
    temp: clampTemp(parseNumber(status.temperature ?? status.temp, INITIAL_SCENE.temp)),
    wind: clampWind(parseNumber(status.fan ?? status.wind, INITIAL_SCENE.wind)),
  };
}

function modeLabel(mode: ModeValue) {
  return MODE_OPTIONS.find((option) => option.value === mode)?.label ?? 'Cool';
}

function windLabel(wind: WindValue) {
  return FAN_OPTIONS.find((option) => option.value === wind)?.label ?? 'Low';
}

function sceneEquals(left: AcScene, right: AcScene) {
  return (
    left.power === right.power &&
    left.mode === right.mode &&
    left.temp === right.temp &&
    left.wind === right.wind
  );
}

function sceneToPayload(scene: AcScene): AcScenePayload {
  return {
    power: scene.power,
    mode: scene.mode,
    temp: scene.temp,
    wind: scene.wind,
  };
}

function createBulbState(bulb: BulbConfig): BulbState {
  return {
    ...bulb,
    available: null,
    isOn: false,
    brightness: DEFAULT_BULB_BRIGHTNESS,
    busy: false,
  };
}

function clampBrightness(value: number) {
  return Math.max(10, Math.min(100, Math.round(value)));
}

function mergeBulbStatuses(current: BulbState[], statuses: WizPilotStatus[]) {
  const statusById = new Map(statuses.map((status) => [status.id, status]));

  return current.map((bulb) => {
    const status = statusById.get(bulb.id);

    if (!status) {
      return { ...bulb, busy: false };
    }

    return {
      ...bulb,
      available: status.available,
      isOn: status.isOn,
      brightness:
        status.brightness === null ? bulb.brightness : clampBrightness(status.brightness),
      busy: false,
    };
  });
}

function bulbsForGroup<T extends BulbConfig>(group: BulbGroupConfig, bulbs: T[]): T[] {
  return bulbs.filter((bulb) => group.bulbIds.includes(bulb.id));
}

function createPreviewStatuses(bulbs: BulbState[]): WizPilotStatus[] {
  return bulbs.map((bulb) => ({
    id: bulb.id,
    ip: bulb.ip,
    available: true,
    isOn: bulb.isOn,
    brightness: bulb.brightness,
    r: null,
    g: null,
    b: null,
    temp: null,
  }));
}

function BrightnessSlider({
  value,
  disabled,
  onPreview,
  onCommit,
}: {
  value: number;
  disabled: boolean;
  onPreview: (value: number) => void;
  onCommit: (value: number) => void;
}) {
  const [trackWidth, setTrackWidth] = useState(1);
  const fillPercent = ((clampBrightness(value) - 10) / 90) * 100;

  function valueFromEvent(event: GestureResponderEvent) {
    const x = Math.max(0, Math.min(trackWidth, event.nativeEvent.locationX));
    return clampBrightness(10 + (x / trackWidth) * 90);
  }

  function handleLayout(event: LayoutChangeEvent) {
    setTrackWidth(Math.max(1, event.nativeEvent.layout.width));
  }

  function handleMove(event: GestureResponderEvent) {
    if (!disabled) {
      onPreview(valueFromEvent(event));
    }
  }

  function handleRelease(event: GestureResponderEvent) {
    if (!disabled) {
      onCommit(valueFromEvent(event));
    }
  }

  return (
    <View
      style={[styles.brightnessSlider, disabled ? styles.disabled : null]}
      onLayout={handleLayout}
      onStartShouldSetResponder={() => !disabled}
      onMoveShouldSetResponder={() => !disabled}
      onResponderGrant={handleMove}
      onResponderMove={handleMove}
      onResponderRelease={handleRelease}
      onResponderTerminate={handleRelease}
    >
      <View style={[styles.brightnessSliderFill, { width: `${fillPercent}%` }]} />
    </View>
  );
}

function getColorNodePosition(preset: GroupColorPreset) {
  const radius = preset.ring === 'outer' ? OUTER_COLOR_RADIUS : INNER_COLOR_RADIUS;
  const angle = (preset.angle * Math.PI) / 180;
  const center = COLOR_BOARD_SIZE / 2;

  return {
    left: center + Math.cos(angle) * radius - COLOR_SWATCH_SIZE / 2,
    top: center + Math.sin(angle) * radius - COLOR_SWATCH_SIZE / 2,
  };
}

export default function AppScreen() {
  const [ac, setAc] = useState<AcScene>(INITIAL_SCENE);
  const [acBusy, setAcBusy] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [bulbs, setBulbs] = useState<BulbState[]>(() => BULBS.map(createBulbState));
  const [selectedGroupColor, setSelectedGroupColor] = useState<Record<string, string>>(() =>
    Object.fromEntries(BULB_GROUPS.map((group) => [group.id, 'warm-white'])),
  );
  const [lightsSeparated, setLightsSeparated] = useState(false);
  const [inRoom, setInRoom] = useState(true);
  const [roomBusy, setRoomBusy] = useState(false);
  const savedRoomState = useRef<{ ac: AcScene; activeGroupIds: string[] } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showSplash, setShowSplash] = useState(true);
  const [colorSheetGroupId, setColorSheetGroupId] = useState<string | null>(null);
  const [sheetBrightness, setSheetBrightness] = useState(DEFAULT_BULB_BRIGHTNESS);
  const splashOpacity = useRef(new Animated.Value(1)).current;
  const splashTranslate = useRef(new Animated.Value(0)).current;
  const acTempAnim = useRef(new Animated.Value(INITIAL_SCENE.power ? 1 : 0)).current;
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tuyaReady = isTuyaConfigured();
  const wizDirectAvailable = isUsingDirectWiz();
  const wizReady = wizDirectAvailable || DEV_LIGHT_UI_PREVIEW;
  const acDisabled = !tuyaReady || acBusy || loadingStatus;

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

  async function loadStatus(options?: { showLoader?: boolean }) {
    if (!tuyaReady) {
      showErrorToast('Fill in your Tuya credentials in app/config.ts.');
      setLoadingStatus(false);
      return;
    }

    if (options?.showLoader ?? true) {
      setLoadingStatus(true);
    }

    try {
      const status = await getAcStatus();
      setAc(normalizeStatus(status));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to reach Tuya Cloud';
      showErrorToast(message);
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

  async function submitAcScene(nextScene: AcScene) {
    const previous = ac;

    if (sceneEquals(previous, nextScene)) {
      return;
    }

    setAc(nextScene);
    setAcBusy(true);

    try {
      const accepted = await sendAcScene(sceneToPayload(nextScene));

      if (!accepted) {
        throw new Error('AC command not confirmed.');
      }

      try {
        const status = await getAcStatus();
        setAc(normalizeStatus(status));
      } catch {
        setAc(nextScene);
      }
    } catch (error) {
      setAc(previous);
      const message = error instanceof Error ? error.message : 'AC command failed';
      showErrorToast(message);
    } finally {
      setAcBusy(false);
    }
  }

  async function runGroupCommand(
    group: BulbGroupConfig,
    optimisticUpdate: (bulb: BulbState) => BulbState,
    params: Record<string, unknown>,
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
      const statuses = await sendWizCommand(
        snapshot.map(({ id, name, ip }) => ({ id, name, ip })),
        params,
      );
      setBulbs((current) => mergeBulbStatuses(current, statuses));
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
      showErrorToast(message);
      return false;
    }
  }

  async function toggleGroupPower(group: BulbGroupConfig) {
    const statuses = await syncGroupStatus(group);

    if (!statuses) {
      return;
    }

    const availableStatuses = statuses.filter((status) => status.available);

    if (!availableStatuses.length) {
      showErrorToast(`${group.name} unavailable`);
      return;
    }

    const availableIds = new Set(availableStatuses.map((status) => status.id));
    const availableGroup = {
      ...group,
      bulbIds: group.bulbIds.filter((id) => availableIds.has(id)),
    };
    const shouldTurnOn = !availableStatuses.some((status) => status.isOn);

    await runGroupCommand(
      availableGroup,
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
      const statuses = await getWizStatuses(BULBS);
      setBulbs((current) => mergeBulbStatuses(current, statuses));

      const availableStatuses = statuses.filter((status) => status.available);

      if (!availableStatuses.length) {
        showErrorToast('Lights unavailable');
        return;
      }

      const availableIds = new Set(availableStatuses.map((status) => status.id));
      const shouldTurnOn = !availableStatuses.some((status) => status.isOn);

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

  async function leaveRoom() {
    setRoomBusy(true);
    savedRoomState.current = {
      ac,
      activeGroupIds: BULB_GROUPS
        .filter((g) => bulbsForGroup(g, bulbs).some((b) => b.isOn))
        .map((g) => g.id),
    };
    await Promise.all([
      ac.power ? submitAcScene({ ...ac, power: 0 }) : Promise.resolve(),
      ...BULB_GROUPS.map((g) =>
        runGroupCommand(g, (b) => ({ ...b, isOn: false }), { state: false }),
      ),
    ]);
    setInRoom(false);
    setRoomBusy(false);
  }

  async function enterRoom() {
    setRoomBusy(true);
    setInRoom(true);
    const saved = savedRoomState.current;
    if (saved) {
      await Promise.all([
        saved.ac.power ? submitAcScene(saved.ac) : Promise.resolve(),
        ...BULB_GROUPS
          .filter((g) => saved.activeGroupIds.includes(g.id))
          .map((g) => runGroupCommand(g, (b) => ({ ...b, isOn: true }), { state: true })),
      ]);
    }
    setRoomBusy(false);
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

    async function boot() {
      await Promise.allSettled([
        loadStatus({ showLoader: true }),
        loadBulbStatus(),
        new Promise((resolve) => setTimeout(resolve, 1100)),
      ]);

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
    };
  }, []);


  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      {toast ? (
        <View style={styles.toastWrap} pointerEvents="none">
          <View style={styles.toast}>
            <Text style={styles.toastText}>{toast}</Text>
          </View>
        </View>
      ) : null}

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Room toggle ───────────────────────────────────────────────── */}
        <Pressable
          style={({ pressed }) => [
            styles.roomBtn,
            inRoom ? styles.roomBtnIn : styles.roomBtnOut,
            pressed ? styles.pressed : null,
            roomBusy ? styles.disabled : null,
          ]}
          disabled={roomBusy}
          onPress={() => (inRoom ? leaveRoom() : enterRoom())}
        >
          {roomBusy ? (
            <ActivityIndicator size="small" color={inRoom ? '#636366' : '#000000'} />
          ) : (
            <Text style={[styles.roomBtnText, inRoom ? styles.roomBtnTextIn : styles.roomBtnTextOut]}>
              {inRoom ? 'Leave Room' : 'Enter Room'}
            </Text>
          )}
        </Pressable>

        {/* ── AC Hero ─────────────────────────────────────────────────── */}
        <View style={styles.acHero}>
          <Pressable
            style={({ pressed }) => [
              styles.powerBtn,
              ac.power ? styles.powerBtnOn : styles.powerBtnOff,
              pressed ? styles.pressed : null,
              acDisabled ? styles.disabled : null,
            ]}
            disabled={acDisabled}
            onPress={() => submitAcScene({ ...ac, power: ac.power ? 0 : 1 })}
          >
            {acBusy ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <View style={styles.powerGlyph}>
                <View style={styles.powerGlyphRing} />
                <View
                  style={[
                    styles.powerGlyphCutout,
                    ac.power ? styles.powerGlyphCutoutOn : styles.powerGlyphCutoutOff,
                  ]}
                />
                <View style={styles.powerGlyphStem} />
              </View>
            )}
          </Pressable>

          <Animated.View
            pointerEvents={ac.power ? 'auto' : 'none'}
            style={[
              styles.acTempRow,
              {
                opacity: acTempAnim,
                transform: [
                  {
                    translateY: acTempAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [14, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <Pressable
              style={({ pressed }) => [
                styles.stepBtn,
                pressed ? styles.pressed : null,
                acDisabled || ac.temp <= 16 ? styles.disabled : null,
              ]}
              disabled={acDisabled || ac.temp <= 16}
              onPress={() => submitAcScene({ ...ac, power: 1, temp: clampTemp(ac.temp - 1) })}
            >
              <Text style={styles.stepBtnText}>−</Text>
            </Pressable>

            <View style={styles.acTempCenter}>
              <Text style={styles.acTempValue}>{ac.temp}°</Text>
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.stepBtn,
                pressed ? styles.pressed : null,
                acDisabled || ac.temp >= 30 ? styles.disabled : null,
              ]}
              disabled={acDisabled || ac.temp >= 30}
              onPress={() => submitAcScene({ ...ac, power: 1, temp: clampTemp(ac.temp + 1) })}
            >
              <Text style={styles.stepBtnText}>+</Text>
            </Pressable>
          </Animated.View>
        </View>

        {/* ── Presets / Mode / Fan — dimmed when AC is off ─────────────── */}
        <View style={[styles.acControls, !ac.power ? styles.acControlsOff : null]}>

        <View style={styles.presetRail} pointerEvents={!ac.power ? 'none' : 'auto'}>
          {PRESETS.map((preset) => (
            <Pressable
              key={preset.id}
              style={({ pressed }) => [
                styles.presetPill,
                pressed ? styles.pressed : null,
                acDisabled ? styles.disabled : null,
              ]}
              disabled={acDisabled}
              onPress={() => submitAcScene(preset.scene)}
            >
              <View style={[styles.presetDot, { backgroundColor: preset.accent }]} />
              <View>
                <Text style={styles.presetName}>{preset.name}</Text>
                <Text style={styles.presetMeta}>
                  {preset.scene.temp}° · {modeLabel(preset.scene.mode)}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>

        {/* ── Mode ───────────────────────────────────────────────────────── */}
        <View style={styles.pillCard} pointerEvents={!ac.power ? 'none' : 'auto'}>
          <View style={[styles.pillRail, styles.pillRow, styles.pillRowLast]}>
            {MODE_OPTIONS.map((opt) => {
              const active = ac.mode === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  style={({ pressed }) => [
                    styles.pill,
                    active ? styles.pillActive : null,
                    pressed ? styles.pressed : null,
                    acDisabled ? styles.disabled : null,
                  ]}
                  disabled={acDisabled}
                  onPress={() => submitAcScene({ ...ac, power: 1, mode: opt.value })}
                >
                  <Text style={[styles.pillText, active ? styles.pillTextActive : null]}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* ── Fan speed ─────────────────────────────────────────────────── */}
        <View style={styles.pillCard} pointerEvents={!ac.power ? 'none' : 'auto'}>
          <View style={[styles.pillRail, styles.pillRow, styles.pillRowLast]}>
            {FAN_OPTIONS.map((opt) => {
              const active = ac.wind === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  style={({ pressed }) => [
                    styles.pill,
                    active ? styles.pillActive : null,
                    pressed ? styles.pressed : null,
                    acDisabled ? styles.disabled : null,
                  ]}
                  disabled={acDisabled}
                  onPress={() => submitAcScene({ ...ac, power: 1, wind: opt.value })}
                >
                  <Text style={[styles.pillText, active ? styles.pillTextActive : null]}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        </View>{/* end acControls */}

        {/* ── Lights ────────────────────────────────────────────────────── */}
        <View style={styles.lightsSection}>
          <View style={styles.lightsSectionHeader}>
            <Text style={styles.pillSectionLabel}>Lights</Text>
            <Pressable
              style={({ pressed }) => [
                styles.allLightsBtn,
                styles.lightSplitBtn,
                pressed ? styles.pressed : null,
              ]}
              accessibilityLabel={lightsSeparated ? 'Combine lights' : 'Separate lights'}
              onPress={() => setLightsSeparated((current) => !current)}
            >
              <View style={styles.lightSplitIcon}>
                <View
                  style={[
                    styles.lightSplitIconLine,
                    styles.lightSplitIconStem,
                    lightsSeparated ? styles.lightSplitIconLineActive : null,
                  ]}
                />
                <View
                  style={[
                    styles.lightSplitIconLine,
                    styles.lightSplitIconLeft,
                    lightsSeparated ? styles.lightSplitIconLineActive : null,
                  ]}
                />
                <View
                  style={[
                    styles.lightSplitIconLine,
                    styles.lightSplitIconRight,
                    lightsSeparated ? styles.lightSplitIconLineActive : null,
                  ]}
                />
                <View
                  style={[
                    styles.lightSplitIconDot,
                    styles.lightSplitIconDotRoot,
                    lightsSeparated ? styles.lightSplitIconDotActive : null,
                  ]}
                />
                <View
                  style={[
                    styles.lightSplitIconDot,
                    styles.lightSplitIconDotLeft,
                    lightsSeparated ? styles.lightSplitIconDotActive : null,
                  ]}
                />
                <View
                  style={[
                    styles.lightSplitIconDot,
                    styles.lightSplitIconDotRight,
                    lightsSeparated ? styles.lightSplitIconDotActive : null,
                  ]}
                />
              </View>
            </Pressable>
          </View>

          {lightsSeparated ? (
            <View style={styles.lightGrid}>
              {BULB_GROUPS.map((group) => {
                const members = bulbsForGroup(group, bulbs);
                const anyOn = members.some((b) => b.isOn);
                const groupBusy = members.some((b) => b.busy);
                const groupUnavailable =
                  members.length > 0 && members.every((b) => b.available === false);
                const activeColorId = selectedGroupColor[group.id] ?? 'warm-white';
                const activePreset = GROUP_COLOR_PRESETS.find((p) => p.id === activeColorId);
                const availableMembers = members.filter((b) => b.available !== false);
                const avgBrightness = availableMembers.length
                  ? Math.round(
                      availableMembers.reduce((s, b) => s + b.brightness, 0) /
                        availableMembers.length,
                    )
                  : DEFAULT_BULB_BRIGHTNESS;

                return (
                  <Pressable
                    key={group.id}
                    style={({ pressed }) => [
                      styles.lightTile,
                      anyOn ? styles.lightTileOn : styles.lightTileOff,
                      pressed ? styles.lightTilePressed : null,
                      groupBusy || groupUnavailable || !wizReady ? styles.disabled : null,
                    ]}
                    onPress={() => void toggleGroupPower(group)}
                    onLongPress={() => openColorSheet(group.id)}
                    delayLongPress={380}
                    disabled={groupBusy || groupUnavailable || !wizReady}
                  >
                    {groupBusy ? (
                      <ActivityIndicator
                        size="small"
                        color={anyOn ? '#ff9f0a' : '#48484a'}
                        style={styles.lightTileSpinner}
                      />
                    ) : (
                      <>
                        <View style={styles.lightTileTop}>
                          <View
                            style={[
                              styles.lightTileDot,
                              anyOn
                                ? {
                                    backgroundColor: activePreset?.hex ?? '#ffcc70',
                                    shadowColor: activePreset?.hex ?? '#ffcc70',
                                    shadowOpacity: 0.85,
                                    shadowRadius: 14,
                                    shadowOffset: { width: 0, height: 0 },
                                  }
                                : styles.lightTileDotOff,
                            ]}
                          />
                        </View>
                        <Text
                          style={[styles.lightTileName, anyOn ? styles.lightTileNameOn : null]}
                        >
                          {group.name}
                        </Text>
                        <Text style={styles.lightTileStatus}>
                          {groupUnavailable ? `${group.name} unavailable` : anyOn ? `${avgBrightness}%` : 'Off'}
                        </Text>
                      </>
                    )}
                  </Pressable>
                );
              })}
            </View>
          ) : (
            (() => {
              const anyOn = bulbs.some((b) => b.isOn);
              const lightsBusy = bulbs.some((b) => b.busy);
              const unavailableGroups = BULB_GROUPS.filter((group) => {
                const members = bulbsForGroup(group, bulbs);
                return members.length > 0 && members.every((b) => b.available === false);
              });
              const allUnavailable =
                bulbs.length > 0 && bulbs.every((b) => b.available === false);
              const activeGroup =
                BULB_GROUPS.find((group) => bulbsForGroup(group, bulbs).some((b) => b.isOn)) ??
                BULB_GROUPS[0];
              const activeColorId = selectedGroupColor[activeGroup.id] ?? 'warm-white';
              const activePreset = GROUP_COLOR_PRESETS.find((p) => p.id === activeColorId);
              const availableBulbs = bulbs.filter((b) => b.available !== false);
              const avgBrightness = availableBulbs.length
                ? Math.round(
                    availableBulbs.reduce((s, b) => s + b.brightness, 0) / availableBulbs.length,
                  )
                : DEFAULT_BULB_BRIGHTNESS;
              const unavailableText = unavailableGroups
                .map((group) => `${group.name} unavailable`)
                .join(' · ');

              return (
                <Pressable
                  style={({ pressed }) => [
                    styles.lightTile,
                    styles.lightTileCombined,
                    anyOn ? styles.lightTileOn : styles.lightTileOff,
                    pressed ? styles.lightTilePressed : null,
                    lightsBusy || allUnavailable || !wizReady ? styles.disabled : null,
                  ]}
                  onPress={() => void toggleAllLightsPower()}
                  onLongPress={() => openColorSheet(ALL_LIGHTS_GROUP.id)}
                  delayLongPress={380}
                  disabled={lightsBusy || allUnavailable || !wizReady}
                >
                  {lightsBusy ? (
                    <ActivityIndicator
                      size="small"
                      color={anyOn ? '#ff9f0a' : '#48484a'}
                      style={styles.lightTileSpinner}
                    />
                  ) : (
                    <>
                      <View style={styles.lightTileTop}>
                        <View
                          style={[
                            styles.lightTileDot,
                            anyOn
                              ? {
                                  backgroundColor: activePreset?.hex ?? '#ffcc70',
                                  shadowColor: activePreset?.hex ?? '#ffcc70',
                                  shadowOpacity: 0.85,
                                  shadowRadius: 14,
                                  shadowOffset: { width: 0, height: 0 },
                                }
                              : styles.lightTileDotOff,
                          ]}
                        />
                      </View>
                      <Text style={[styles.lightTileName, anyOn ? styles.lightTileNameOn : null]}>
                        Lights
                      </Text>
                      <Text style={styles.lightTileStatus}>
                        {unavailableText || (anyOn ? `${avgBrightness}%` : 'Off')}
                      </Text>
                    </>
                  )}
                </Pressable>
              );
            })()
          )}
        </View>

      </ScrollView>

      {!inRoom && !roomBusy ? (
        <Pressable
          style={styles.enterRoomTapLayer}
          accessibilityLabel="Enter room"
          onPress={() => void enterRoom()}
        />
      ) : null}

      {/* ── Colour sheet ──────────────────────────────────────────────── */}
      {(() => {
        const sheetGroup =
          colorSheetGroupId === ALL_LIGHTS_GROUP.id
            ? ALL_LIGHTS_GROUP
            : BULB_GROUPS.find((g) => g.id === colorSheetGroupId) ?? null;
        if (!sheetGroup) return null;

        const sheetMembers = bulbsForGroup(sheetGroup, bulbs);
        const sheetGroupBusy = sheetMembers.some((b) => b.busy);
        const sheetActiveColorId = selectedGroupColor[sheetGroup.id] ?? 'warm-white';

        const VIVID_COLORS = GROUP_COLOR_PRESETS.filter((p) => p.ring === 'outer');
        const COLOR_PALETTES = [VIVID_COLORS.slice(0, 4), VIVID_COLORS.slice(4, 8)];
        const WHITE_COLORS = GROUP_COLOR_PRESETS.filter(
          (p) => p.ring === 'inner' && p.id.includes('white'),
        );

        async function applyPreset(preset: GroupColorPreset) {
          const ok = await runGroupCommand(
            sheetGroup!,
            (b) => ({ ...b, isOn: true }),
            { dimming: clampBrightness(sheetBrightness), ...preset.params },
          );
          if (ok) {
            setSelectedGroupColor((c) => ({ ...c, [sheetGroup!.id]: preset.id }));
          }
        }

        async function applyBrightness(nextValue: number) {
          const brightness = clampBrightness(nextValue);
          const previousBrightness = sheetBrightness;
          setSheetBrightness(brightness);

          const ok = await runGroupCommand(
            sheetGroup!,
            (b) => ({ ...b, isOn: true, brightness }),
            { state: true, dimming: brightness },
          );

          if (!ok) {
            setSheetBrightness(previousBrightness);
          }
        }

        return (
          <Modal
            visible={colorSheetGroupId !== null}
            transparent
            animationType="slide"
            onRequestClose={() => setColorSheetGroupId(null)}
          >
            <Pressable
              style={styles.sheetOverlay}
              onPress={() => setColorSheetGroupId(null)}
            />
            <View style={styles.sheet}>
              <View style={styles.sheetHandle} />

              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>{sheetGroup.name}</Text>
                <Pressable
                  onPress={() => setColorSheetGroupId(null)}
                  style={styles.sheetClose}
                  hitSlop={12}
                >
                  <Text style={styles.sheetCloseText}>Done</Text>
                </Pressable>
              </View>

              <View style={styles.sheetSection}>
                <View style={styles.sheetSectionHeader}>
                  <Text style={styles.sheetSectionLabel}>Brightness</Text>
                  <Text style={styles.sheetBrightnessValue}>{sheetBrightness}%</Text>
                </View>
                <BrightnessSlider
                  value={sheetBrightness}
                  disabled={sheetGroupBusy}
                  onPreview={setSheetBrightness}
                  onCommit={(value) => void applyBrightness(value)}
                />
              </View>

              <View style={styles.sheetSection}>
                <View style={styles.colorChipRow}>
                  {WHITE_COLORS.map((preset) => (
                    <Pressable
                      key={preset.id}
                      onPress={() => void applyPreset(preset)}
                      style={({ pressed }) => [
                        styles.colorChip,
                        sheetActiveColorId === preset.id ? styles.colorChipActive : null,
                        pressed ? styles.pressed : null,
                        sheetGroupBusy ? styles.disabled : null,
                      ]}
                      disabled={sheetGroupBusy}
                    >
                      <View style={[styles.colorChipDot, { backgroundColor: preset.hex }]} />
                      <Text
                        style={[
                          styles.colorChipLabel,
                          sheetActiveColorId === preset.id ? styles.colorChipLabelActive : null,
                        ]}
                      >
                        {preset.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.sheetSection}>
                <View style={styles.colorPaletteStack}>
                  {COLOR_PALETTES.map((palette, index) => (
                    <View key={index} style={styles.colorPaletteRow}>
                      {palette.map((preset) => (
                        <Pressable
                          key={preset.id}
                          onPress={() => void applyPreset(preset)}
                          style={({ pressed }) => [
                            styles.colorPaletteTile,
                            { backgroundColor: preset.hex },
                            sheetActiveColorId === preset.id
                              ? styles.colorPaletteTileActive
                              : null,
                            pressed ? styles.pressed : null,
                            sheetGroupBusy ? styles.disabled : null,
                          ]}
                          disabled={sheetGroupBusy}
                        >
                          <View
                            style={[
                              styles.colorPaletteTileInner,
                              sheetActiveColorId === preset.id
                                ? styles.colorPaletteTileInnerActive
                                : null,
                            ]}
                          />
                        </Pressable>
                      ))}
                    </View>
                  ))}
                </View>
              </View>
            </View>
          </Modal>
        );
      })()}

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

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
    paddingTop: Platform.OS === 'ios' ? 54 : (RNStatusBar.currentHeight ?? 0),
  },

  // ── Room button ───────────────────────────────────────────────────────────
  roomBtn: {
    borderRadius: 16,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  roomBtnIn: {
    backgroundColor: '#1c1c1e',
    borderWidth: 1,
    borderColor: '#ffffff0a',
  },
  roomBtnOut: {
    backgroundColor: '#ffffff',
  },
  roomBtnText: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  roomBtnTextIn: {
    color: '#ffffff',
  },
  roomBtnTextOut: {
    color: '#000000',
  },

  // ── Toast ──────────────────────────────────────────────────────────────────
  toastWrap: {
    position: 'absolute',
    top: 60,
    left: 20,
    right: 20,
    zIndex: 20,
    alignItems: 'center',
  },
  toast: {
    backgroundColor: '#1c1c1e',
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: '#ffffff14',
  },
  toastText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },

  // ── Scroll content ─────────────────────────────────────────────────────────
  scroll: {
    paddingHorizontal: 10,
    paddingTop: 12,
    paddingBottom: 0,
  },
  enterRoomTapLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 8,
  },

  // ── Header ────────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 40,
    marginTop: 4,
  },
  headerLabel: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  connDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#2c2c2e',
  },
  connDotOnline: {
    backgroundColor: '#30d158',
  },

  // ── AC Hero ───────────────────────────────────────────────────────────────
  acHero: {
    alignItems: 'center',
    paddingBottom: 36,
  },
  powerBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    marginBottom: 24,
  },
  powerBtnOff: {
    backgroundColor: '#ff3b30',
    borderColor: '#ff3b30',
    shadowColor: '#ff3b30',
    shadowOpacity: 0.4,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
  },
  powerBtnOn: {
    backgroundColor: '#0a84ff',
    borderColor: '#0a84ff',
    shadowColor: '#0a84ff',
    shadowOpacity: 0.55,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
  },
  powerGlyph: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  powerGlyphRing: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2.4,
    borderColor: '#ffffff',
  },
  powerGlyphCutout: {
    position: 'absolute',
    top: -1,
    width: 12,
    height: 9,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
  },
  powerGlyphCutoutOn: {
    backgroundColor: '#0a84ff',
  },
  powerGlyphCutoutOff: {
    backgroundColor: '#ff3b30',
  },
  powerGlyphStem: {
    position: 'absolute',
    top: -1,
    width: 3.2,
    height: 12,
    borderRadius: 999,
    backgroundColor: '#ffffff',
  },
  acTempRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    width: 300,
    maxWidth: '90%',
    minHeight: 84,
  },
  stepBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2c2c2e',
  },
  stepBtnText: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '200',
    lineHeight: 28,
    marginTop: -2,
  },
  acTempCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acTempValue: {
    color: '#ffffff',
    fontSize: 72,
    fontWeight: Platform.OS === 'ios' ? '700' : '700',
    letterSpacing: Platform.OS === 'ios' ? -3 : -1,
    lineHeight: 82,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },

  // ── AC controls wrapper ───────────────────────────────────────────────────
  acControls: {
    opacity: 1,
  },
  acControlsOff: {
    opacity: 0.3,
  },

  // ── Presets ───────────────────────────────────────────────────────────────
  presetRail: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 18,
  },
  presetPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#111111',
    borderRadius: 16,
    paddingVertical: 13,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#ffffff08',
  },
  presetDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  presetName: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  presetMeta: {
    color: '#48484a',
    fontSize: 12,
    fontWeight: '400',
    marginTop: 2,
  },

  // ── Pill sections ─────────────────────────────────────────────────────────
  pillCard: {
    backgroundColor: '#0d0d0d',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ffffff08',
    paddingVertical: 14,
    marginBottom: 12,
  },
  pillCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    marginBottom: 14,
  },
  pillSectionLabel: {
    color: '#48484a',
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.4,
  },
  pillCardValue: {
    color: '#636366',
    fontSize: 13,
    fontWeight: '500',
  },
  pillRail: {
    gap: 8,
    paddingHorizontal: 14,
  },
  pillRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  pillRowLast: {
    marginBottom: 0,
  },
  pill: {
    flex: 1,
    backgroundColor: '#1c1c1e',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 0,
    borderWidth: 1,
    borderColor: '#ffffff08',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillActive: {
    backgroundColor: '#ffffff',
    borderColor: '#ffffff',
  },
  pillText: {
    color: '#636366',
    fontSize: 14,
    fontWeight: '600',
  },
  pillTextActive: {
    color: '#000000',
    fontWeight: '700',
  },

  // ── Lights ────────────────────────────────────────────────────────────────
  lightsSection: {
    marginTop: 4,
  },
  lightsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  allLightsBtn: {
    backgroundColor: '#111111',
    borderRadius: 14,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#ffffff08',
  },
  allLightsBtnText: {
    color: '#48484a',
    fontSize: 12,
    fontWeight: '600',
  },
  allLightsBtnTextOn: {
    color: '#ff9f0a',
  },
  lightSplitBtn: {
    width: 38,
    height: 32,
    paddingVertical: 0,
    paddingHorizontal: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightSplitIcon: {
    width: 20,
    height: 20,
  },
  lightSplitIconLine: {
    position: 'absolute',
    width: 2,
    borderRadius: 999,
    backgroundColor: '#48484a',
  },
  lightSplitIconLineActive: {
    backgroundColor: '#ff9f0a',
  },
  lightSplitIconStem: {
    left: 9,
    top: 10,
    height: 8,
  },
  lightSplitIconLeft: {
    left: 6,
    top: 3,
    height: 12,
    transform: [{ rotate: '36deg' }],
  },
  lightSplitIconRight: {
    right: 6,
    top: 3,
    height: 12,
    transform: [{ rotate: '-36deg' }],
  },
  lightSplitIconDot: {
    position: 'absolute',
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#48484a',
  },
  lightSplitIconDotActive: {
    backgroundColor: '#ff9f0a',
  },
  lightSplitIconDotRoot: {
    left: 7.5,
    bottom: 0,
  },
  lightSplitIconDotLeft: {
    left: 1,
    top: 1,
  },
  lightSplitIconDotRight: {
    right: 1,
    top: 1,
  },
  lightGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  lightTile: {
    flex: 1,
    borderRadius: 22,
    padding: 18,
    paddingBottom: 22,
    minHeight: 148,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightTileCombined: {
    width: '100%',
  },
  lightTileOff: {
    backgroundColor: '#0d0d0d',
    borderWidth: 1,
    borderColor: '#ffffff08',
  },
  lightTileOn: {
    backgroundColor: '#141200',
    borderWidth: 1,
    borderColor: '#ffffff10',
  },
  lightTilePressed: {
    opacity: 0.72,
    transform: [{ scale: 0.96 }],
  },
  lightTileSpinner: {
    marginTop: 32,
  },
  lightTileTop: {
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  lightTileDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  lightTileDotOff: {
    backgroundColor: '#1c1c1e',
  },
  lightTileName: {
    color: '#3a3a3c',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: -0.1,
    marginBottom: 3,
    textAlign: 'center',
  },
  lightTileNameOn: {
    color: '#ffffff',
  },
  lightTileStatus: {
    color: '#3a3a3c',
    fontSize: 13,
    fontWeight: '400',
    textAlign: 'center',
  },

  // ── Colour sheet ──────────────────────────────────────────────────────────
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  sheet: {
    backgroundColor: '#141414',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: 44,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: '#ffffff10',
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#3a3a3c',
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 6,
  },
  sheetTitle: {
    flex: 1,
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '600',
    letterSpacing: -0.4,
  },
  sheetClose: {
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  sheetCloseText: {
    color: '#0a84ff',
    fontSize: 16,
    fontWeight: '600',
  },
  sheetSection: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  sheetSectionLast: {
    paddingBottom: 4,
  },
  sheetSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sheetSectionLabel: {
    color: '#48484a',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1.6,
    marginBottom: 12,
  },
  sheetBrightnessValue: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  brightnessSlider: {
    height: 34,
    borderRadius: 17,
    backgroundColor: '#111214',
    borderWidth: 1,
    borderColor: '#1f2023',
    justifyContent: 'center',
  },
  brightnessSliderFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 17,
    backgroundColor: '#ffffff',
  },
  brightnessControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brightnessAction: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#111214',
    borderWidth: 1,
    borderColor: '#1f2023',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brightnessActionText: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '500',
    marginTop: -1,
  },
  brightnessValuePill: {
    flex: 1,
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: '#111214',
    borderWidth: 1,
    borderColor: '#1f2023',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brightnessValuePillText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  colorPaletteStack: {
    gap: 8,
  },
  colorPaletteRow: {
    flexDirection: 'row',
    gap: 8,
  },
  colorPaletteTile: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#ffffff12',
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorPaletteTileActive: {
    borderColor: '#ffffff',
    transform: [{ scale: 1.02 }],
  },
  colorPaletteTileInner: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: 'transparent',
  },
  colorPaletteTileInnerActive: {
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: '#000000',
  },
  colorChipRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  colorChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#1c1c1e',
    borderRadius: 20,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  colorChipActive: {
    borderColor: '#ffffff22',
    backgroundColor: '#2c2c2e',
  },
  colorChipDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  colorChipLabel: {
    color: '#636366',
    fontSize: 13,
    fontWeight: '600',
  },
  colorChipLabelActive: {
    color: '#ffffff',
  },

  // ── Splash ────────────────────────────────────────────────────────────────
  splash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashEyebrow: {
    color: '#2c2c2e',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 3.5,
    textTransform: 'uppercase',
    marginBottom: 14,
  },
  splashTitle: {
    color: '#ffffff',
    fontSize: 52,
    fontWeight: Platform.OS === 'ios' ? '200' : '300',
    letterSpacing: Platform.OS === 'ios' ? -2.5 : -1,
  },
  splashSpinner: {
    marginTop: 28,
  },

  pressed: {
    opacity: 0.68,
    transform: [{ scale: 0.97 }],
  },
  disabled: {
    opacity: 0.32,
  },
});
