import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  AppState,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';

import BrightnessSlider from './components/BrightnessSlider';
import { BULB_GROUPS, BULBS, type BulbConfig, type BulbGroupConfig } from './config';
import {
  ALL_LIGHTS_GROUP,
  COLOR_ROWS,
  COLOR_ROW_SIZE,
  DEFAULT_BULB_BRIGHTNESS,
  FAN_OPTIONS,
  GROUP_COLOR_PRESETS,
  INITIAL_SCENE,
  MODE_OPTIONS,
  PRESETS,
  WHITE_PRESETS,
  bulbsForGroup,
  clampBrightness,
  clampTemp,
  createBulbState,
  createPreviewStatuses,
  groupIdsFor,
  isTuyaConfigured,
  mergeBulbStatuses,
  modeLabel,
  normalizeStatus,
  sceneEquals,
  sceneToPayload,
  type AcScene,
  type BulbState,
  type GroupColorPreset,
} from './roomDomain';
import { recordAcScene, recordLightCommand } from './roomSnapshot';
import { getAcStatus, sendAcScene } from './tuya';
import { getWizStatuses, isUsingDirectWiz, sendWizCommand, type WizPilotStatus } from './wizClient';
import { styles } from './styles';

const DEV_LIGHT_UI_PREVIEW = __DEV__;

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

  const insets = useSafeAreaInsets();
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
      showErrorToast('AC control is not configured.');
      setLoadingStatus(false);
      return;
    }

    if (options?.showLoader ?? true) {
      setLoadingStatus(true);
    }

    try {
      const status = await getAcStatus();
      const scene = normalizeStatus(status);
      setAc(scene);
      recordAcScene(scene);
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
        const confirmed = normalizeStatus(status);
        setAc(confirmed);
        recordAcScene(confirmed);
      } catch {
        setAc(nextScene);
        recordAcScene(nextScene);
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
    options?: { presetId?: string },
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
      showErrorToast(message);
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

  useEffect(() => {
    // Siri, the widget and the physical remote can all change the room while
    // this screen is backgrounded. Without this the app would show whatever it
    // last rendered and happily send those stale values back.
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') {
        return;
      }

      void loadStatus({ showLoader: false });
      void loadBulbStatus();
    });

    return () => subscription.remove();
  }, []);


  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <StatusBar style="light" />

      {toast ? (
        <View style={styles.toastWrap} pointerEvents="none">
          <View style={styles.toast}>
            <Text style={styles.toastText}>{toast}</Text>
          </View>
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 8 }]}
        showsVerticalScrollIndicator={false}
      >

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

      {/* ── Colour sheet ──────────────────────────────────────────────── */}
      {(() => {
        const sheetGroup =
          colorSheetGroupId === ALL_LIGHTS_GROUP.id
            ? ALL_LIGHTS_GROUP
            : BULB_GROUPS.find((g) => g.id === colorSheetGroupId) ?? null;
        if (!sheetGroup) return null;

        const sheetMembers = bulbsForGroup(sheetGroup, bulbs);
        const sheetGroupBusy = sheetMembers.some((b) => b.busy);
        // With 'all' open, only highlight a chip when every group agrees.
        const sheetColorIds = groupIdsFor(sheetGroup).map(
          (id) => selectedGroupColor[id] ?? 'warm-white',
        );
        const sheetActiveColorId = sheetColorIds.every((id) => id === sheetColorIds[0])
          ? sheetColorIds[0]
          : null;

        async function applyPreset(preset: GroupColorPreset) {
          const ok = await runGroupCommand(
            sheetGroup!,
            (b) => ({ ...b, isOn: true }),
            { dimming: clampBrightness(sheetBrightness), ...preset.params },
            { presetId: preset.id },
          );
          if (ok) {
            setSelectedGroupColor((current) => ({
              ...current,
              ...Object.fromEntries(groupIdsFor(sheetGroup!).map((id) => [id, preset.id])),
            }));
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
                  {WHITE_PRESETS.map((preset) => (
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
                  {COLOR_ROWS.map((row) => (
                    <View key={row[0].id} style={styles.colorPaletteRow}>
                      {row.map((preset) => (
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
                      {Array.from({ length: COLOR_ROW_SIZE - row.length }, (_, index) => (
                        <View key={`pad-${index}`} style={styles.colorPaletteTilePad} />
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
