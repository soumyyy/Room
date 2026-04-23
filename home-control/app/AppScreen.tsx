import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
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
const BRIGHTNESS_PRESETS = [25, 50, 75, 100];

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
    id: 'rose',
    name: 'Rose',
    hex: '#ff5d73',
    ring: 'outer',
    angle: -90,
    params: { state: true, r: 255, g: 93, b: 115 },
  },
  {
    id: 'coral',
    name: 'Coral',
    hex: '#ff7a45',
    ring: 'outer',
    angle: -60,
    params: { state: true, r: 255, g: 122, b: 69 },
  },
  {
    id: 'amber',
    name: 'Amber',
    hex: '#ffb000',
    ring: 'outer',
    angle: -30,
    params: { state: true, r: 255, g: 176, b: 0 },
  },
  {
    id: 'sun',
    name: 'Sunlight',
    hex: '#ffd85a',
    ring: 'outer',
    angle: 0,
    params: { state: true, r: 255, g: 216, b: 90 },
  },
  {
    id: 'lime',
    name: 'Lime',
    hex: '#c6f432',
    ring: 'outer',
    angle: 30,
    params: { state: true, r: 198, g: 244, b: 50 },
  },
  {
    id: 'mint',
    name: 'Mint',
    hex: '#18e299',
    ring: 'outer',
    angle: 60,
    params: { state: true, r: 24, g: 226, b: 153 },
  },
  {
    id: 'aqua',
    name: 'Aqua',
    hex: '#00d9ff',
    ring: 'outer',
    angle: 90,
    params: { state: true, r: 0, g: 217, b: 255 },
  },
  {
    id: 'sky',
    name: 'Sky Blue',
    hex: '#4c8dff',
    ring: 'outer',
    angle: 120,
    params: { state: true, r: 76, g: 141, b: 255 },
  },
  {
    id: 'violet',
    name: 'Violet',
    hex: '#7269ff',
    ring: 'outer',
    angle: 150,
    params: { state: true, r: 114, g: 105, b: 255 },
  },
  {
    id: 'iris',
    name: 'Iris',
    hex: '#a259ff',
    ring: 'outer',
    angle: 180,
    params: { state: true, r: 162, g: 89, b: 255 },
  },
  {
    id: 'pink',
    name: 'Pink',
    hex: '#ff61d2',
    ring: 'outer',
    angle: 210,
    params: { state: true, r: 255, g: 97, b: 210 },
  },
  {
    id: 'peach',
    name: 'Peach',
    hex: '#ff9478',
    ring: 'outer',
    angle: 240,
    params: { state: true, r: 255, g: 148, b: 120 },
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
  const wizReady = wizDirectAvailable;
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

    const shouldTurnOn = !statuses.some((status) => status.isOn);

    await runGroupCommand(
      group,
      (current) => ({ ...current, isOn: shouldTurnOn }),
      { state: shouldTurnOn },
    );
  }

  function openColorSheet(groupId: string) {
    const group = BULB_GROUPS.find((g) => g.id === groupId);
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

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.presetRail}
          style={styles.presetScroll}
          pointerEvents={!ac.power ? 'none' : 'auto'}
        >
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
        </ScrollView>

        {/* ── Mode ──────────────────────────────────────────────────────── */}
        <View style={styles.pillCard} pointerEvents={!ac.power ? 'none' : 'auto'}>
          <View style={styles.pillCardHeader}>
            <Text style={styles.pillSectionLabel}>Mode</Text>
            <Text style={styles.pillCardValue}>{modeLabel(ac.mode)}</Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.pillRail}
          >
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
          </ScrollView>
        </View>

        {/* ── Fan speed ─────────────────────────────────────────────────── */}
        <View style={styles.pillCard} pointerEvents={!ac.power ? 'none' : 'auto'}>
          <View style={styles.pillCardHeader}>
            <Text style={styles.pillSectionLabel}>Fan</Text>
            <Text style={styles.pillCardValue}>{windLabel(ac.wind)}</Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.pillRail}
          >
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
          </ScrollView>
        </View>

        </View>{/* end acControls */}

        {/* ── Lights ────────────────────────────────────────────────────── */}
        <View style={styles.lightsSection}>
          <View style={styles.lightsSectionHeader}>
            <Text style={styles.pillSectionLabel}>Lights</Text>
            <Pressable
              style={({ pressed }) => [
                styles.allLightsBtn,
                pressed ? styles.pressed : null,
                !wizReady || bulbs.some((b) => b.busy) ? styles.disabled : null,
              ]}
              disabled={!wizReady || bulbs.some((b) => b.busy)}
              onPress={() => void Promise.all(BULB_GROUPS.map((g) => toggleGroupPower(g)))}
            >
              <Text
                style={[
                  styles.allLightsBtnText,
                  bulbs.some((b) => b.isOn) ? styles.allLightsBtnTextOn : null,
                ]}
              >
                {bulbs.some((b) => b.isOn) ? 'All Off' : 'All On'}
              </Text>
            </Pressable>
          </View>

          <View style={styles.lightGrid}>
            {BULB_GROUPS.map((group) => {
              const members = bulbsForGroup(group, bulbs);
              const anyOn = members.some((b) => b.isOn);
              const groupBusy = members.some((b) => b.busy);
              const activeColorId = selectedGroupColor[group.id] ?? 'warm-white';
              const activePreset = GROUP_COLOR_PRESETS.find((p) => p.id === activeColorId);
              const avgBrightness = members.length
                ? Math.round(members.reduce((s, b) => s + b.brightness, 0) / members.length)
                : DEFAULT_BULB_BRIGHTNESS;

              return (
                <Pressable
                  key={group.id}
                  style={({ pressed }) => [
                    styles.lightTile,
                    anyOn ? styles.lightTileOn : styles.lightTileOff,
                    pressed ? styles.lightTilePressed : null,
                    groupBusy || !wizReady ? styles.disabled : null,
                  ]}
                  onPress={() => void toggleGroupPower(group)}
                  onLongPress={() => openColorSheet(group.id)}
                  delayLongPress={380}
                  disabled={groupBusy || !wizReady}
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
                      <Text style={[styles.lightTileName, anyOn ? styles.lightTileNameOn : null]}>
                        {group.name}
                      </Text>
                      <Text style={styles.lightTileStatus}>
                        {anyOn ? `${avgBrightness}%` : 'Off'}
                      </Text>
                    </>
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>

      </ScrollView>

      {/* ── Colour sheet ──────────────────────────────────────────────── */}
      {(() => {
        const sheetGroup = BULB_GROUPS.find((g) => g.id === colorSheetGroupId) ?? null;
        if (!sheetGroup) return null;

        const sheetMembers = bulbsForGroup(sheetGroup, bulbs);
        const sheetGroupBusy = sheetMembers.some((b) => b.busy);
        const sheetActiveColorId = selectedGroupColor[sheetGroup.id] ?? 'warm-white';

        const VIVID_COLORS = GROUP_COLOR_PRESETS.filter((p) => p.ring === 'outer');
        const WHITE_COLORS = GROUP_COLOR_PRESETS.filter(
          (p) => p.ring === 'inner' && p.id.includes('white'),
        );
        const SOFT_COLORS = GROUP_COLOR_PRESETS.filter(
          (p) => p.ring === 'inner' && !p.id.includes('white'),
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
                <View style={styles.brightnessControls}>
                  <Pressable
                    onPress={() => void applyBrightness(sheetBrightness - 10)}
                    style={({ pressed }) => [
                      styles.brightnessAction,
                      pressed ? styles.pressed : null,
                      sheetGroupBusy || sheetBrightness <= 10 ? styles.disabled : null,
                    ]}
                    disabled={sheetGroupBusy || sheetBrightness <= 10}
                  >
                    <Text style={styles.brightnessActionText}>−</Text>
                  </Pressable>

                  <View style={styles.brightnessValuePill}>
                    <Text style={styles.brightnessValuePillText}>{sheetBrightness}%</Text>
                  </View>

                  <Pressable
                    onPress={() => void applyBrightness(sheetBrightness + 10)}
                    style={({ pressed }) => [
                      styles.brightnessAction,
                      pressed ? styles.pressed : null,
                      sheetGroupBusy || sheetBrightness >= 100 ? styles.disabled : null,
                    ]}
                    disabled={sheetGroupBusy || sheetBrightness >= 100}
                  >
                    <Text style={styles.brightnessActionText}>+</Text>
                  </Pressable>
                </View>

                <View style={styles.brightnessPresetRow}>
                  {BRIGHTNESS_PRESETS.map((value) => {
                    const active = sheetBrightness === value;
                    return (
                      <Pressable
                        key={value}
                        onPress={() => void applyBrightness(value)}
                        style={({ pressed }) => [
                          styles.brightnessPresetChip,
                          active ? styles.brightnessPresetChipActive : null,
                          pressed ? styles.pressed : null,
                          sheetGroupBusy ? styles.disabled : null,
                        ]}
                        disabled={sheetGroupBusy}
                      >
                        <Text
                          style={[
                            styles.brightnessPresetChipLabel,
                            active ? styles.brightnessPresetChipLabelActive : null,
                          ]}
                        >
                          {value}%
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.sheetSection}>
                <Text style={styles.sheetSectionLabel}>Colour</Text>
                <View style={styles.colorSwatchGrid}>
                  {VIVID_COLORS.map((preset) => (
                    <Pressable
                      key={preset.id}
                      onPress={() => void applyPreset(preset)}
                      style={({ pressed }) => [
                        styles.colorSwatch,
                        { backgroundColor: preset.hex },
                        sheetActiveColorId === preset.id ? styles.colorSwatchActive : null,
                        pressed ? styles.pressed : null,
                        sheetGroupBusy ? styles.disabled : null,
                      ]}
                      disabled={sheetGroupBusy}
                    />
                  ))}
                </View>
              </View>

              <View style={styles.sheetSection}>
                <Text style={styles.sheetSectionLabel}>White</Text>
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

              <View style={[styles.sheetSection, styles.sheetSectionLast]}>
                <Text style={styles.sheetSectionLabel}>Soft</Text>
                <View style={styles.colorChipRow}>
                  {SOFT_COLORS.map((preset) => (
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
  presetScroll: {
    marginHorizontal: -10,
    marginBottom: 18,
  },
  presetRail: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 10,
    gap: 10,
  },
  presetPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#111111',
    borderRadius: 16,
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#ffffff08',
    minWidth: 110,
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
    paddingTop: 16,
    paddingBottom: 18,
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
    paddingHorizontal: 18,
  },
  pill: {
    backgroundColor: '#1c1c1e',
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: '#ffffff08',
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
    flex: 1,
    justifyContent: 'flex-start',
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
  },
  lightTileNameOn: {
    color: '#ffffff',
  },
  lightTileStatus: {
    color: '#3a3a3c',
    fontSize: 13,
    fontWeight: '400',
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
  brightnessPresetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
  },
  brightnessPresetChip: {
    minWidth: 64,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: '#111214',
    borderWidth: 1,
    borderColor: '#1f2023',
    alignItems: 'center',
  },
  brightnessPresetChipActive: {
    backgroundColor: '#0a84ff',
    borderColor: '#0a84ff',
  },
  brightnessPresetChipLabel: {
    color: '#c7c7cc',
    fontSize: 13,
    fontWeight: '600',
  },
  brightnessPresetChipLabelActive: {
    color: '#ffffff',
  },
  colorSwatchGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  colorSwatch: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorSwatchActive: {
    borderColor: '#ffffff',
    transform: [{ scale: 1.1 }],
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
