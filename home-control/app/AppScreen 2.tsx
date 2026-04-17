import Slider from '@react-native-community/slider';
import { StatusBar } from 'expo-status-bar';
import React, { startTransition, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import { BULBS, TUYA_CLOUD, type BulbConfig } from './config';
import { Wiz } from './wiz';

type NoticeTone = 'info' | 'success' | 'error';

type Notice = {
  tone: NoticeTone;
  text: string;
};

type Scene = {
  id: string;
  name: string;
  caption: string;
  accent: string;
  brightness: number;
  temperature?: number;
  color?: {
    r: number;
    g: number;
    b: number;
  };
};

type BulbState = BulbConfig & {
  isOn: boolean;
  brightness: number;
  temperature: number;
  accent: string;
  busy: boolean;
  lastAction: string;
};

const DEFAULT_BRIGHTNESS = 68;
const DEFAULT_TEMPERATURE = 3000;

const ROOM_SCENES: Scene[] = [
  {
    id: 'warm',
    name: 'Warm',
    caption: 'Amber light for evenings',
    accent: '#e98b2a',
    brightness: 70,
    temperature: 2700,
  },
  {
    id: 'focus',
    name: 'Focus',
    caption: 'Bright neutral light for work',
    accent: '#4ab0d9',
    brightness: 100,
    temperature: 5000,
  },
  {
    id: 'coast',
    name: 'Coast',
    caption: 'Cool cyan accent wash',
    accent: '#1398a7',
    brightness: 62,
    color: { r: 50, g: 210, b: 220 },
  },
  {
    id: 'sunset',
    name: 'Sunset',
    caption: 'Low coral glow for wind-down',
    accent: '#d7633f',
    brightness: 36,
    color: { r: 255, g: 118, b: 73 },
  },
];

const BULB_QUICK_ACTIONS = [ROOM_SCENES[0], ROOM_SCENES[1], ROOM_SCENES[3]];

function createInitialBulbState(bulb: BulbConfig): BulbState {
  return {
    ...bulb,
    isOn: false,
    brightness: DEFAULT_BRIGHTNESS,
    temperature: DEFAULT_TEMPERATURE,
    accent: ROOM_SCENES[0].accent,
    busy: false,
    lastAction: 'Idle',
  };
}

function getScenePilot(scene: Scene) {
  return {
    state: true,
    dimming: scene.brightness,
    ...(scene.temperature ? { temp: scene.temperature } : {}),
    ...(scene.color ?? {}),
  };
}

function getSceneState(scene: Scene, bulb: BulbState): Partial<BulbState> {
  return {
    isOn: true,
    brightness: scene.brightness,
    temperature: scene.temperature ?? bulb.temperature,
    accent: scene.accent,
  };
}

function isTuyaConfigured() {
  return (
    !TUYA_CLOUD.infraredId.startsWith('YOUR_') &&
    !TUYA_CLOUD.acRemoteId.startsWith('YOUR_') &&
    TUYA_CLOUD.backendBaseUrl.startsWith('http')
  );
}

export default function AppScreen() {
  const [bulbs, setBulbs] = useState<BulbState[]>(() => BULBS.map(createInitialBulbState));
  const [notice, setNotice] = useState<Notice>({
    tone: 'info',
    text: 'Ready to send local Wi-Fi commands.',
  });
  const [roomBrightness, setRoomBrightness] = useState(DEFAULT_BRIGHTNESS);

  const activeLights = bulbs.filter((bulb) => bulb.isOn).length;
  const busyLights = bulbs.filter((bulb) => bulb.busy).length;
  const tuyaReady = isTuyaConfigured();
  const roomControlsDisabled = !bulbs.length || busyLights > 0;

  function postNotice(tone: NoticeTone, text: string) {
    startTransition(() => {
      setNotice({ tone, text });
    });
  }

  async function runBulbCommand(
    bulbId: string,
    actionLabel: string,
    optimisticUpdate: (bulb: BulbState) => BulbState,
    command: (bulb: BulbState) => Promise<void>,
  ) {
    const previousBulb = bulbs.find((bulb) => bulb.id === bulbId);

    if (!previousBulb) {
      return;
    }

    setBulbs((current) =>
      current.map((bulb) =>
        bulb.id === bulbId ? { ...optimisticUpdate(bulb), busy: true } : bulb,
      ),
    );

    try {
      await command(previousBulb);

      setBulbs((current) =>
        current.map((bulb) =>
          bulb.id === bulbId ? { ...bulb, busy: false, lastAction: actionLabel } : bulb,
        ),
      );

      postNotice('success', `${previousBulb.name}: ${actionLabel.toLowerCase()}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown transport error';

      setBulbs((current) =>
        current.map((bulb) =>
          bulb.id === bulbId
            ? { ...previousBulb, busy: false, lastAction: 'Retry needed' }
            : bulb,
        ),
      );

      postNotice('error', `${previousBulb.name}: ${message}`);
    }
  }

  async function runRoomCommand(
    actionLabel: string,
    optimisticUpdate: (bulb: BulbState) => BulbState,
    command: (bulb: BulbState) => Promise<void>,
  ) {
    if (!bulbs.length) {
      postNotice('info', 'Add a bulb in app/config.ts to start controlling the room.');
      return;
    }

    const snapshot = bulbs;

    setBulbs((current) => current.map((bulb) => ({ ...optimisticUpdate(bulb), busy: true })));

    const results = await Promise.allSettled(snapshot.map((bulb) => command(bulb)));
    const failures = results.filter((result) => result.status === 'rejected').length;

    setBulbs((current) =>
      current.map((bulb) => {
        const index = snapshot.findIndex((entry) => entry.id === bulb.id);
        const result = results[index];

        if (!result || result.status === 'fulfilled') {
          return { ...bulb, busy: false, lastAction: actionLabel };
        }

        return { ...snapshot[index], busy: false, lastAction: 'Retry needed' };
      }),
    );

    if (failures === 0) {
      postNotice('success', `Room: ${actionLabel.toLowerCase()}.`);
      return;
    }

    postNotice('error', `Room: ${failures}/${snapshot.length} commands failed.`);
  }

  async function toggleBulbPower(bulb: BulbState, nextValue: boolean) {
    await runBulbCommand(
      bulb.id,
      nextValue ? 'Powered on' : 'Powered off',
      (current) => ({ ...current, isOn: nextValue }),
      (current) => (nextValue ? Wiz.on(current.ip) : Wiz.off(current.ip)),
    );
  }

  async function applySceneToBulb(bulb: BulbState, scene: Scene) {
    await runBulbCommand(
      bulb.id,
      `${scene.name} scene`,
      (current) => ({ ...current, ...getSceneState(scene, current) }),
      (current) => Wiz.pilot(current.ip, getScenePilot(scene)),
    );
  }

  async function setBulbBrightness(bulb: BulbState, value: number) {
    const rounded = Math.round(value);

    await runBulbCommand(
      bulb.id,
      `Brightness ${rounded}%`,
      (current) => ({
        ...current,
        isOn: true,
        brightness: rounded,
      }),
      (current) => Wiz.pilot(current.ip, { state: true, dimming: rounded }),
    );
  }

  async function setRoomPower(nextValue: boolean) {
    await runRoomCommand(
      nextValue ? 'Room powered on' : 'Room powered off',
      (bulb) => ({ ...bulb, isOn: nextValue }),
      (bulb) => (nextValue ? Wiz.on(bulb.ip) : Wiz.off(bulb.ip)),
    );
  }

  async function setRoomBrightnessForAll(value: number) {
    const rounded = Math.round(value);
    setRoomBrightness(rounded);

    await runRoomCommand(
      `Room brightness ${rounded}%`,
      (bulb) => ({ ...bulb, isOn: true, brightness: rounded }),
      (bulb) => Wiz.pilot(bulb.ip, { state: true, dimming: rounded }),
    );
  }

  async function applySceneToRoom(scene: Scene) {
    await runRoomCommand(
      `${scene.name} scene`,
      (bulb) => ({ ...bulb, ...getSceneState(scene, bulb) }),
      (bulb) => Wiz.pilot(bulb.ip, getScenePilot(scene)),
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View pointerEvents="none" style={styles.backgroundArt}>
        <View style={[styles.glow, styles.glowAmber]} />
        <View style={[styles.glow, styles.glowTeal]} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.eyebrow}>LOCAL FIRST CONTROL</Text>
          <Text style={styles.title}>Room</Text>
          <Text style={styles.subtitle}>
            A control deck for Wi-Fi lights today, with the Tuya IR bridge staged next.
          </Text>
        </View>

        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <View>
              <Text style={styles.heroLabel}>Session</Text>
              <Text style={styles.heroValue}>{activeLights}/{bulbs.length} lights live</Text>
            </View>
            <View style={styles.heroBadge}>
              <Text style={styles.heroBadgeText}>LAN only</Text>
            </View>
          </View>

          <View style={styles.metricRow}>
            <MetricCard label="Configured" value={`${bulbs.length}`} />
            <MetricCard label="Busy" value={`${busyLights}`} />
            <MetricCard label="IR bridge" value={tuyaReady ? 'Ready' : 'Setup'} />
          </View>

          <View style={styles.actionsRow}>
            <ActionButton
              label="All on"
              accent="#e98b2a"
              onPress={() => setRoomPower(true)}
              disabled={roomControlsDisabled}
            />
            <ActionButton
              label="All off"
              accent="#254451"
              onPress={() => setRoomPower(false)}
              disabled={roomControlsDisabled}
            />
          </View>

          <Text style={styles.sliderTitle}>Whole-room brightness {roomBrightness}%</Text>
          <Slider
            minimumValue={5}
            maximumValue={100}
            step={1}
            value={roomBrightness}
            onValueChange={(value) => setRoomBrightness(Math.round(value))}
            onSlidingComplete={setRoomBrightnessForAll}
            minimumTrackTintColor="#e98b2a"
            maximumTrackTintColor="#385662"
            thumbTintColor="#fff6e8"
            disabled={roomControlsDisabled}
          />
          <Text style={styles.helperText}>
            Send commands from a dev build on the same Wi-Fi as the bulbs.
          </Text>
        </View>

        <NoticeBanner tone={notice.tone} text={notice.text} />

        <SectionHeading
          title="Scene Deck"
          subtitle="One-tap looks sent to every configured light."
        />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.sceneRail}
        >
          {ROOM_SCENES.map((scene) => (
            <SceneCard
              key={scene.id}
              scene={scene}
              onPress={() => applySceneToRoom(scene)}
              disabled={roomControlsDisabled}
            />
          ))}
        </ScrollView>

        <SectionHeading
          title="Lights"
          subtitle="Each bulb keeps its own power state, brightness and quick presets."
        />

        {bulbs.length ? (
          bulbs.map((bulb) => (
            <View key={bulb.id} style={styles.bulbCard}>
              <View style={styles.bulbHeader}>
                <View style={styles.bulbTitleWrap}>
                  <Text style={styles.bulbName}>{bulb.name}</Text>
                  <Text style={styles.bulbIp}>{bulb.ip}</Text>
                </View>

                <View style={styles.bulbControls}>
                  {bulb.busy ? (
                    <ActivityIndicator size="small" color="#e98b2a" />
                  ) : (
                    <View
                      style={[
                        styles.powerPill,
                        bulb.isOn ? styles.powerPillOn : styles.powerPillOff,
                      ]}
                    >
                      <Text
                        style={[
                          styles.powerPillText,
                          bulb.isOn ? styles.powerPillTextOn : styles.powerPillTextOff,
                        ]}
                      >
                        {bulb.isOn ? 'On' : 'Off'}
                      </Text>
                    </View>
                  )}
                  <Switch
                    value={bulb.isOn}
                    onValueChange={(value) => toggleBulbPower(bulb, value)}
                    disabled={bulb.busy}
                    trackColor={{ false: '#425c66', true: '#d47a2f' }}
                    thumbColor="#fff7eb"
                  />
                </View>
              </View>

              <Text style={styles.lastAction}>Last action: {bulb.lastAction}</Text>

              <View style={styles.bulbSliderHeader}>
                <Text style={styles.cardLabel}>Brightness</Text>
                <Text style={styles.cardValue}>{bulb.brightness}%</Text>
              </View>
              <Slider
                minimumValue={5}
                maximumValue={100}
                step={1}
                value={bulb.brightness}
                onSlidingComplete={(value) => setBulbBrightness(bulb, value)}
                minimumTrackTintColor={bulb.accent}
                maximumTrackTintColor="#2b4048"
                thumbTintColor="#fff7eb"
                disabled={bulb.busy}
              />

              <View style={styles.quickActions}>
                {BULB_QUICK_ACTIONS.map((scene) => (
                  <MiniSceneButton
                    key={`${bulb.id}-${scene.id}`}
                    label={scene.name}
                    accent={scene.accent}
                    onPress={() => applySceneToBulb(bulb, scene)}
                    disabled={bulb.busy}
                  />
                ))}
              </View>
            </View>
          ))
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No bulbs configured</Text>
            <Text style={styles.emptyText}>
              Add one or more entries to app/config.ts and this screen will populate automatically.
            </Text>
          </View>
        )}

        <SectionHeading
          title="IR Bridge"
          subtitle="The Tuya device config exists; the transport layer is the next build step."
        />

        <View style={styles.tuyaCard}>
          <View style={styles.tuyaHeader}>
            <View>
              <Text style={styles.tuyaTitle}>Tuya IR blaster</Text>
              <Text style={styles.tuyaMeta}>Backend {TUYA_CLOUD.backendBaseUrl}</Text>
            </View>
            <View
              style={[
                styles.tuyaBadge,
                tuyaReady ? styles.tuyaBadgeReady : styles.tuyaBadgeWaiting,
              ]}
            >
              <Text
                style={[
                  styles.tuyaBadgeText,
                  tuyaReady ? styles.tuyaBadgeTextReady : styles.tuyaBadgeTextWaiting,
                ]}
              >
                {tuyaReady ? 'Configured' : 'Needs keys'}
              </Text>
            </View>
          </View>

          <Text style={styles.tuyaText}>
            {tuyaReady
              ? `The backend will control IR blaster ${TUYA_CLOUD.infraredId} and AC remote ${TUYA_CLOUD.acRemoteId}. Start the local server with npm run backend after creating backend/.env.`
              : 'Fill in infraredId, acRemoteId, and backendBaseUrl in app/config.ts, then create backend/.env with your Tuya client credentials.'}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function ActionButton({
  label,
  accent,
  disabled,
  onPress,
}: {
  label: string;
  accent: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.actionButton,
        { backgroundColor: accent },
        pressed && !disabled ? styles.pressed : null,
        disabled ? styles.disabled : null,
      ]}
    >
      <Text style={styles.actionButtonText}>{label}</Text>
    </Pressable>
  );
}

function SceneCard({
  scene,
  disabled,
  onPress,
}: {
  scene: Scene;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.sceneCard,
        { borderColor: scene.accent },
        pressed && !disabled ? styles.pressed : null,
        disabled ? styles.disabled : null,
      ]}
    >
      <View style={[styles.sceneSwatch, { backgroundColor: scene.accent }]} />
      <Text style={styles.sceneTitle}>{scene.name}</Text>
      <Text style={styles.sceneCaption}>{scene.caption}</Text>
    </Pressable>
  );
}

function MiniSceneButton({
  label,
  accent,
  disabled,
  onPress,
}: {
  label: string;
  accent: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.miniButton,
        { borderColor: accent },
        pressed && !disabled ? styles.pressed : null,
        disabled ? styles.disabled : null,
      ]}
    >
      <Text style={[styles.miniButtonText, { color: accent }]}>{label}</Text>
    </Pressable>
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

function SectionHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionSubtitle}>{subtitle}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#efe8dc',
  },
  backgroundArt: {
    ...StyleSheet.absoluteFillObject,
  },
  glow: {
    position: 'absolute',
    borderRadius: 999,
    opacity: 0.7,
  },
  glowAmber: {
    width: 240,
    height: 240,
    top: -40,
    right: -50,
    backgroundColor: '#f6b65c',
  },
  glowTeal: {
    width: 220,
    height: 220,
    bottom: 160,
    left: -90,
    backgroundColor: '#79c8c5',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 18,
  },
  eyebrow: {
    color: '#4f635f',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2.2,
    marginBottom: 8,
  },
  title: {
    color: '#12232b',
    fontSize: 38,
    fontWeight: '800',
    letterSpacing: -1.2,
  },
  subtitle: {
    color: '#425864',
    fontSize: 16,
    lineHeight: 23,
    marginTop: 8,
    maxWidth: 320,
  },
  heroCard: {
    backgroundColor: '#152730',
    borderRadius: 28,
    padding: 20,
    shadowColor: '#0e1a20',
    shadowOpacity: 0.2,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroLabel: {
    color: '#83a1aa',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  heroValue: {
    color: '#f8f2e8',
    fontSize: 26,
    fontWeight: '800',
    marginTop: 4,
  },
  heroBadge: {
    backgroundColor: '#233944',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  heroBadgeText: {
    color: '#cfe0df',
    fontSize: 12,
    fontWeight: '700',
  },
  metricRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#20343e',
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  metricLabel: {
    color: '#8daab0',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  metricValue: {
    color: '#fff5e5',
    fontSize: 20,
    fontWeight: '800',
    marginTop: 5,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
  },
  actionButton: {
    flex: 1,
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonText: {
    color: '#fff8ec',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  sliderTitle: {
    color: '#f8f2e8',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 18,
    marginBottom: 4,
  },
  helperText: {
    color: '#87a0a7',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 8,
  },
  noticeBanner: {
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginTop: 16,
  },
  noticeInfo: {
    backgroundColor: '#d8e2df',
  },
  noticeSuccess: {
    backgroundColor: '#d7e8cf',
  },
  noticeError: {
    backgroundColor: '#f1d4c7',
  },
  noticeText: {
    color: '#22353d',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  sectionHeader: {
    marginTop: 24,
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#152730',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  sectionSubtitle: {
    color: '#4e615f',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
  },
  sceneRail: {
    gap: 12,
    paddingRight: 4,
  },
  sceneCard: {
    width: 172,
    backgroundColor: '#fff7ed',
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
  },
  sceneSwatch: {
    width: 48,
    height: 48,
    borderRadius: 16,
    marginBottom: 14,
  },
  sceneTitle: {
    color: '#152730',
    fontSize: 18,
    fontWeight: '800',
  },
  sceneCaption: {
    color: '#506461',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 8,
  },
  bulbCard: {
    backgroundColor: '#152730',
    borderRadius: 24,
    padding: 18,
    marginBottom: 14,
  },
  bulbHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  bulbTitleWrap: {
    flex: 1,
  },
  bulbName: {
    color: '#fff5e8',
    fontSize: 21,
    fontWeight: '800',
  },
  bulbIp: {
    color: '#8da4ac',
    fontSize: 13,
    marginTop: 4,
  },
  bulbControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  powerPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  powerPillOn: {
    backgroundColor: '#2f4a39',
  },
  powerPillOff: {
    backgroundColor: '#2c3c45',
  },
  powerPillText: {
    fontSize: 12,
    fontWeight: '800',
  },
  powerPillTextOn: {
    color: '#cbf2cb',
  },
  powerPillTextOff: {
    color: '#c7d3d8',
  },
  lastAction: {
    color: '#8ca3ab',
    fontSize: 13,
    marginTop: 12,
  },
  bulbSliderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  cardLabel: {
    color: '#d0e1e1',
    fontSize: 14,
    fontWeight: '700',
  },
  cardValue: {
    color: '#fff3e0',
    fontSize: 14,
    fontWeight: '800',
  },
  quickActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  miniButton: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#102029',
  },
  miniButtonText: {
    fontSize: 13,
    fontWeight: '800',
  },
  emptyCard: {
    backgroundColor: '#fff7ed',
    borderRadius: 22,
    padding: 18,
  },
  emptyTitle: {
    color: '#152730',
    fontSize: 20,
    fontWeight: '800',
  },
  emptyText: {
    color: '#4f6464',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
  },
  tuyaCard: {
    backgroundColor: '#fff7ed',
    borderRadius: 24,
    padding: 18,
  },
  tuyaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  tuyaTitle: {
    color: '#152730',
    fontSize: 21,
    fontWeight: '800',
  },
  tuyaMeta: {
    color: '#556969',
    fontSize: 13,
    marginTop: 4,
  },
  tuyaBadge: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  tuyaBadgeReady: {
    backgroundColor: '#d4e8d2',
  },
  tuyaBadgeWaiting: {
    backgroundColor: '#ead7c5',
  },
  tuyaBadgeText: {
    fontSize: 12,
    fontWeight: '800',
  },
  tuyaBadgeTextReady: {
    color: '#275137',
  },
  tuyaBadgeTextWaiting: {
    color: '#7b4e23',
  },
  tuyaText: {
    color: '#4f6365',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 14,
  },
  pressed: {
    opacity: 0.8,
  },
  disabled: {
    opacity: 0.45,
  },
});
