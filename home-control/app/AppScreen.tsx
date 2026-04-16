import Slider from '@react-native-community/slider';
import { StatusBar } from 'expo-status-bar';
import React, { startTransition, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { TUYA_CLOUD } from './config';
import { getAcStatus, sendAcScene, type AcScenePayload, type AcStatus } from './tuyaCloud';

type NoticeTone = 'info' | 'success' | 'error';

type Notice = {
  tone: NoticeTone;
  text: string;
};

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

const INITIAL_SCENE: AcScene = {
  power: 0,
  mode: 0,
  temp: 24,
  wind: 1,
};

const MODE_OPTIONS: Array<{ value: ModeValue; label: string; hint: string }> = [
  { value: 0, label: 'Cool', hint: 'Fast chill' },
  { value: 1, label: 'Heat', hint: 'Warm room' },
  { value: 2, label: 'Auto', hint: 'Balanced' },
  { value: 3, label: 'Fan', hint: 'Air only' },
  { value: 4, label: 'Dry', hint: 'Humidity cut' },
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
    name: 'Ice Breaker',
    accent: '#8bcff2',
    scene: { power: 1, mode: 0, temp: 21, wind: 3 },
  },
  {
    id: 'evening',
    name: 'Evening Drift',
    accent: '#ffbe8a',
    scene: { power: 1, mode: 0, temp: 24, wind: 1 },
  },
  {
    id: 'sleep',
    name: 'Sleep Air',
    accent: '#b6bdfc',
    scene: { power: 1, mode: 0, temp: 26, wind: 0 },
  },
];

function isTuyaConfigured() {
  return (
    !TUYA_CLOUD.infraredId.startsWith('YOUR_') &&
    !TUYA_CLOUD.acRemoteId.startsWith('YOUR_') &&
    TUYA_CLOUD.backendBaseUrl.startsWith('http')
  );
}

function parseNumber(value: string | number | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampMode(value: number): ModeValue {
  if ([0, 1, 2, 3, 4].includes(value)) {
    return value as ModeValue;
  }

  return INITIAL_SCENE.mode;
}

function clampWind(value: number): WindValue {
  if ([0, 1, 2, 3].includes(value)) {
    return value as WindValue;
  }

  return INITIAL_SCENE.wind;
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
    temp: Math.min(30, Math.max(16, parseNumber(status.temperature ?? status.temp, INITIAL_SCENE.temp))),
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

export default function AppScreen() {
  const [notice, setNotice] = useState<Notice>({
    tone: 'info',
    text: 'Connecting...',
  });
  const [draft, setDraft] = useState<AcScene>(INITIAL_SCENE);
  const [applied, setApplied] = useState<AcScene>(INITIAL_SCENE);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const splashOpacity = useRef(new Animated.Value(1)).current;
  const splashTranslate = useRef(new Animated.Value(0)).current;

  const tuyaReady = isTuyaConfigured();
  const controlsDisabled = !tuyaReady || submitting || loadingStatus;

  function postNotice(tone: NoticeTone, text: string) {
    startTransition(() => {
      setNotice({ tone, text });
    });
  }

  async function loadStatus(options?: {
    announce?: boolean;
    syncDraft?: boolean;
    showLoader?: boolean;
  }) {
    const announce = options?.announce ?? true;
    const syncDraft = options?.syncDraft ?? true;
    const showLoader = options?.showLoader ?? true;

    if (!tuyaReady) {
      postNotice('error', 'Set app/config.ts with the backend URL and Tuya IDs first.');
      setLoadingStatus(false);
      return;
    }

    if (showLoader) {
      setLoadingStatus(true);
    }

    try {
      const status = await getAcStatus(TUYA_CLOUD.backendBaseUrl);
      const normalized = normalizeStatus(status);
      setApplied(normalized);

      if (syncDraft) {
        setDraft(normalized);
      }

      if (announce) {
        postNotice(
          'success',
          normalized.power
            ? `${normalized.temp}° • ${modeLabel(normalized.mode)} • ${windLabel(normalized.wind)}`
            : 'AC off',
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to reach the backend';
      postNotice('error', message);
    } finally {
      if (showLoader) {
        setLoadingStatus(false);
      }
    }
  }

  async function submitScene(nextScene: AcScene, successText: string) {
    const previousDraft = draft;
    const previousApplied = applied;

    setDraft(nextScene);
    setSubmitting(true);

    try {
      const accepted = await sendAcScene(TUYA_CLOUD.backendBaseUrl, sceneToPayload(nextScene));

      if (!accepted) {
        throw new Error('Tuya did not confirm the AC command.');
      }

      setApplied(nextScene);
      setDraft(nextScene);
      postNotice('success', successText);

      try {
        const status = await getAcStatus(TUYA_CLOUD.backendBaseUrl);
        const normalized = normalizeStatus(status);
        setApplied(normalized);
        setDraft(normalized);
      } catch {
        // If status refresh lags, keep the optimistic scene.
      }
    } catch (error) {
      setDraft(previousDraft);
      setApplied(previousApplied);
      const message = error instanceof Error ? error.message : 'AC command failed';
      postNotice('error', message);
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    let disposed = false;

    async function boot() {
      await Promise.allSettled([
        loadStatus({ announce: false }),
        new Promise((resolve) => setTimeout(resolve, 1400)),
      ]);

      if (disposed) {
        return;
      }

      Animated.parallel([
        Animated.timing(splashOpacity, {
          toValue: 0,
          duration: 420,
          useNativeDriver: true,
        }),
        Animated.timing(splashTranslate, {
          toValue: -18,
          duration: 420,
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
    };
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />

      <View pointerEvents="none" style={styles.backgroundArt}>
        <View style={[styles.aurora, styles.auroraBlue]} />
        <View style={[styles.aurora, styles.auroraPeach]} />
        <View style={[styles.aurora, styles.auroraMint]} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>ROOM</Text>
          <Text style={styles.title}>Room AC</Text>
        </View>

        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <View style={styles.heroTextWrap}>
              <Text style={styles.heroLabel}>Now</Text>
              <Text style={styles.heroValue}>
                {applied.power ? `${applied.temp}°` : 'Standby'}
              </Text>
              <Text style={styles.heroSubValue}>
                {applied.power ? `${modeLabel(applied.mode)} • ${windLabel(applied.wind)}` : 'AC off'}
              </Text>
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.powerOrb,
                applied.power ? styles.powerOrbOn : styles.powerOrbOff,
                pressed ? styles.pressed : null,
                controlsDisabled ? styles.disabled : null,
              ]}
              disabled={controlsDisabled}
              onPress={() =>
                submitScene(
                  { ...draft, power: applied.power ? 0 : 1 },
                  applied.power ? 'AC turned off.' : 'AC turned on.',
                )
              }
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#fff8ef" />
              ) : (
                <>
                  <Text style={styles.powerOrbIcon}>{applied.power ? '◎' : '◌'}</Text>
                  <Text style={styles.powerOrbLabel}>{applied.power ? 'Turn Off' : 'Turn On'}</Text>
                </>
              )}
            </Pressable>
          </View>

          <View style={styles.metricsRow}>
            <StatPill label="Power" value={applied.power ? 'On' : 'Off'} />
            <StatPill label="Mode" value={modeLabel(applied.mode)} />
            <StatPill label="Fan" value={windLabel(applied.wind)} />
          </View>
        </View>

        <NoticeBanner tone={notice.tone} text={notice.text} />

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Presets</Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.presetRail}
        >
          {PRESETS.map((preset) => (
            <Pressable
              key={preset.id}
              style={({ pressed }) => [
                styles.presetCard,
                { borderColor: preset.accent },
                pressed ? styles.pressed : null,
                controlsDisabled ? styles.disabled : null,
              ]}
              disabled={controlsDisabled}
              onPress={() => submitScene(preset.scene, `${preset.name} sent to the AC.`)}
            >
              <View style={[styles.presetAccent, { backgroundColor: preset.accent }]} />
              <Text style={styles.presetTitle}>{preset.name}</Text>
              <Text style={styles.presetMeta}>
                {preset.scene.temp}° • {modeLabel(preset.scene.mode)} • {windLabel(preset.scene.wind)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Controls</Text>
        </View>

        <View style={styles.controlCard}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Temperature</Text>
            <Text style={styles.cardValue}>{draft.temp}°C</Text>
          </View>
          <Slider
            minimumValue={16}
            maximumValue={30}
            step={1}
            value={draft.temp}
            minimumTrackTintColor="#ff9b6a"
            maximumTrackTintColor="#e4d8cb"
            thumbTintColor="#fff9f0"
            disabled={controlsDisabled}
            onValueChange={(value) =>
              setDraft((current) => ({
                ...current,
                temp: Math.round(value),
              }))
            }
            onSlidingComplete={(value) => {
              const nextScene = {
                ...draft,
                power: 1,
                temp: Math.round(value),
              };

              if (sceneEquals(nextScene, applied)) {
                return;
              }

              submitScene(nextScene, `${nextScene.temp}° sent.`);
            }}
          />
          <View style={styles.sliderLabels}>
            <Text style={styles.sliderLabel}>16°</Text>
            <Text style={styles.sliderLabel}>30°</Text>
          </View>
        </View>

        <View style={styles.controlCard}>
          <Text style={styles.cardTitle}>Mode</Text>
          <View style={styles.chipGrid}>
            {MODE_OPTIONS.map((option) => {
              const active = draft.mode === option.value;

              return (
                <Pressable
                  key={option.value}
                  style={({ pressed }) => [
                    styles.modeChip,
                    active ? styles.modeChipActive : null,
                    pressed ? styles.pressed : null,
                    controlsDisabled ? styles.disabled : null,
                  ]}
                  disabled={controlsDisabled}
                  onPress={() => {
                    const nextScene = {
                      ...draft,
                      power: 1,
                      mode: option.value,
                    };

                    if (sceneEquals(nextScene, applied)) {
                      return;
                    }

                    submitScene(nextScene, `${option.label} mode.`);
                  }}
                >
                  <Text style={[styles.modeChipLabel, active ? styles.modeChipLabelActive : null]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.controlCard}>
          <Text style={styles.cardTitle}>Fan speed</Text>
          <View style={styles.fanRow}>
            {FAN_OPTIONS.map((option) => {
              const active = draft.wind === option.value;

              return (
                <Pressable
                  key={option.value}
                  style={({ pressed }) => [
                    styles.fanChip,
                    active ? styles.fanChipActive : null,
                    pressed ? styles.pressed : null,
                    controlsDisabled ? styles.disabled : null,
                  ]}
                  disabled={controlsDisabled}
                  onPress={() => {
                    const nextScene = {
                      ...draft,
                      power: 1,
                      wind: option.value,
                    };

                    if (sceneEquals(nextScene, applied)) {
                      return;
                    }

                    submitScene(nextScene, `${option.label} fan.`);
                  }}
                >
                  <Text style={[styles.fanChipLabel, active ? styles.fanChipLabelActive : null]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </ScrollView>

      {showSplash ? (
        <Animated.View
          style={[
            styles.splashScreen,
            {
              opacity: splashOpacity,
              transform: [{ translateY: splashTranslate }],
            },
          ]}
        >
          <View style={styles.splashHalo} />
          <View style={styles.splashCore}>
            <Text style={styles.splashEyebrow}>ROOM</Text>
            <Text style={styles.splashTitle}>Climate Deck</Text>
            <ActivityIndicator size="small" color="#19334a" />
          </View>
        </Animated.View>
      ) : null}
    </SafeAreaView>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statPill}>
      <Text style={styles.statPillLabel}>{label}</Text>
      <Text style={styles.statPillValue}>{value}</Text>
    </View>
  );
}

function NoticeBanner({ tone, text }: Notice) {
  return (
    <View
      style={[
        styles.noticeBanner,
        tone === 'success'
          ? styles.noticeSuccess
          : tone === 'error'
            ? styles.noticeError
            : styles.noticeInfo,
      ]}
    >
      <Text style={styles.noticeText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f6eee2',
  },
  backgroundArt: {
    ...StyleSheet.absoluteFillObject,
  },
  aurora: {
    position: 'absolute',
    borderRadius: 999,
    opacity: 0.72,
  },
  auroraBlue: {
    width: 280,
    height: 280,
    top: -60,
    right: -80,
    backgroundColor: '#b9ddf4',
  },
  auroraPeach: {
    width: 250,
    height: 250,
    left: -90,
    top: 180,
    backgroundColor: '#ffd2af',
  },
  auroraMint: {
    width: 240,
    height: 240,
    right: -100,
    bottom: 110,
    backgroundColor: '#cfe8d8',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 36,
  },
  header: {
    marginBottom: 18,
  },
  eyebrow: {
    color: '#607271',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2.1,
    marginBottom: 10,
  },
  title: {
    color: '#172935',
    fontSize: 40,
    fontWeight: '900',
    letterSpacing: -1.4,
  },
  subtitle: {
    color: '#506163',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
    maxWidth: 340,
  },
  heroCard: {
    backgroundColor: '#fff8ef',
    borderRadius: 30,
    padding: 20,
    borderWidth: 1,
    borderColor: '#f0dfcd',
    shadowColor: '#c99c73',
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 5,
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
  },
  heroTextWrap: {
    flex: 1,
  },
  heroLabel: {
    color: '#7c8475',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.3,
  },
  heroValue: {
    color: '#162834',
    fontSize: 46,
    fontWeight: '900',
    letterSpacing: -1.6,
    marginTop: 4,
  },
  heroSubValue: {
    color: '#536265',
    fontSize: 15,
    lineHeight: 21,
    marginTop: 6,
    maxWidth: 190,
  },
  powerOrb: {
    width: 126,
    height: 126,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  powerOrbOn: {
    backgroundColor: '#152f3d',
  },
  powerOrbOff: {
    backgroundColor: '#e6dbcf',
  },
  powerOrbIcon: {
    color: '#fff7ee',
    fontSize: 34,
    fontWeight: '300',
    marginBottom: 4,
  },
  powerOrbLabel: {
    color: '#fff7ee',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  statPill: {
    flex: 1,
    backgroundColor: '#f3eadf',
    borderRadius: 18,
    paddingVertical: 13,
    paddingHorizontal: 12,
  },
  statPillLabel: {
    color: '#7a8479',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  statPillValue: {
    color: '#1a2f39',
    fontSize: 18,
    fontWeight: '800',
    marginTop: 5,
  },
  noticeBanner: {
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginTop: 16,
  },
  noticeInfo: {
    backgroundColor: '#e2e8e4',
  },
  noticeSuccess: {
    backgroundColor: '#ddebd6',
  },
  noticeError: {
    backgroundColor: '#f3d4c6',
  },
  noticeText: {
    color: '#20363f',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  sectionHeader: {
    marginTop: 24,
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#162834',
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.7,
  },
  sectionSubtitle: {
    color: '#5a6a6d',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 5,
  },
  presetRail: {
    gap: 12,
    paddingRight: 4,
  },
  presetCard: {
    width: 188,
    backgroundColor: '#fff8ef',
    borderRadius: 24,
    borderWidth: 1,
    padding: 16,
  },
  presetAccent: {
    width: 54,
    height: 10,
    borderRadius: 999,
    marginBottom: 14,
  },
  presetTitle: {
    color: '#172935',
    fontSize: 19,
    fontWeight: '900',
  },
  presetCaption: {
    color: '#59696b',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 7,
  },
  presetMeta: {
    color: '#233946',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 12,
  },
  controlCard: {
    backgroundColor: '#fff8ef',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#f0dfcd',
    padding: 18,
    marginBottom: 14,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  cardTitle: {
    color: '#172935',
    fontSize: 20,
    fontWeight: '900',
  },
  cardValue: {
    color: '#ff8650',
    fontSize: 20,
    fontWeight: '900',
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  sliderLabel: {
    color: '#74827c',
    fontSize: 12,
    fontWeight: '700',
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
  },
  modeChip: {
    width: '48%',
    backgroundColor: '#f5ecdf',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  modeChipActive: {
    backgroundColor: '#19334a',
  },
  modeChipLabel: {
    color: '#193242',
    fontSize: 16,
    fontWeight: '800',
  },
  modeChipLabelActive: {
    color: '#fff7ef',
  },
  modeChipHint: {
    color: '#66767b',
    fontSize: 12,
    marginTop: 4,
  },
  modeChipHintActive: {
    color: '#bfd2de',
  },
  fanRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  fanChip: {
    flex: 1,
    backgroundColor: '#f5ecdf',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fanChipActive: {
    backgroundColor: '#ffb17b',
  },
  fanChipLabel: {
    color: '#1e3540',
    fontSize: 14,
    fontWeight: '800',
  },
  fanChipLabelActive: {
    color: '#532c14',
  },
  actionPanel: {
    backgroundColor: '#152f3d',
    borderRadius: 26,
    padding: 18,
    marginTop: 4,
  },
  actionCopy: {
    marginBottom: 16,
  },
  actionTitle: {
    color: '#fff8ef',
    fontSize: 22,
    fontWeight: '900',
  },
  actionSubtitle: {
    color: '#c6d7da',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: '#274657',
    borderRadius: 18,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: '#d7ebeb',
    fontSize: 15,
    fontWeight: '800',
  },
  primaryButton: {
    flex: 1.4,
    backgroundColor: '#ff9b6a',
    borderRadius: 18,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#fff8ef',
    fontSize: 15,
    fontWeight: '900',
  },
  linkedCard: {
    backgroundColor: '#fff8ef',
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: '#f0dfcd',
    marginTop: 16,
  },
  linkedTitle: {
    color: '#182b34',
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 8,
  },
  linkedMeta: {
    color: '#607072',
    fontSize: 13,
    lineHeight: 20,
  },
  splashScreen: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#f6eee2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashHalo: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 999,
    backgroundColor: '#ffd2af',
    opacity: 0.9,
  },
  splashCore: {
    width: 280,
    paddingVertical: 30,
    paddingHorizontal: 24,
    borderRadius: 32,
    backgroundColor: '#fff7ed',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#edd7c0',
    shadowColor: '#d0a178',
    shadowOpacity: 0.16,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  splashEyebrow: {
    color: '#6d7d78',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2.3,
    marginBottom: 10,
  },
  splashTitle: {
    color: '#152f3d',
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -1,
  },
  splashSubtitle: {
    color: '#617173',
    fontSize: 14,
    marginTop: 8,
    marginBottom: 18,
  },
  pressed: {
    opacity: 0.82,
  },
  disabled: {
    opacity: 0.45,
  },
});
