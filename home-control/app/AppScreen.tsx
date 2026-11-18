import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import React from 'react';
import { ActivityIndicator, Animated, Linking, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import ColorSheet from './components/ColorSheet';
import DiagnosticsSheet from './components/DiagnosticsSheet';
import SchedulesSheet from './components/SchedulesSheet';
import { consumeScheduleNotification } from './schedules';
import { CycleButton, FanGlyph, MergeButton, PowerButton, Segmented, StepButton, Temperature, Tile, TubeGlyph, ui } from './components/RoomUi';
import { applyFont } from './fonts';
import { clamp, theme } from './theme';
import { BULB_GROUPS } from './config';
import { ALL_LIGHTS_GROUP, MODE_CYCLE, WIND_CYCLE, PRESETS, bulbsForGroup, combinedColorId, cyclePosition, lightPanel, mixHex, modeLabel, presetForTemp, windLabel, type LightPanel } from './roomDomain';
import { styles } from './styles';
import { useRoomController } from './useRoomController';

export default function AppScreen() {
  const controller = useRoomController();
  const {
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
  } = controller;
  const insets = useSafeAreaInsets();
  const [diagnosticsOpen, setDiagnosticsOpen] = React.useState(false);
  const [schedulesOpen, setSchedulesOpen] = React.useState(false);
  React.useEffect(() => {
    let active = true;
    const openScheduleURL = (url: string | null) => {
      if (active && url?.startsWith('homecontrol://schedules')) setSchedulesOpen(true);
    };
    void Linking.getInitialURL().then(openScheduleURL).catch(() => {});
    void consumeScheduleNotification().then((value) => { if (active && value) setSchedulesOpen(true); }).catch(() => {});
    const listener = Linking.addEventListener('url', ({ url }) => openScheduleURL(url));
    return () => { active = false; listener.remove(); };
  }, []);
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();

  const roomActionLabel = controller.sceneFailures.length
    ? (controller.scenePhase === 'leaving' ? 'Retry Leave' : 'Retry Enter')
    : (inRoom ? 'Leave room' : 'Enter room');
  const shown = draft ?? ac;
  const acOff = !shown.power || acAvailable === false;
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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Schedules and alerts"
          accessibilityHint="Long press to open schedules."
          accessibilityActions={[{ name: 'activate', label: 'Open schedules' }, { name: 'longpress', label: 'Open schedules' }]}
          onAccessibilityAction={() => setSchedulesOpen(true)}
          onLongPress={() => setSchedulesOpen(true)}
          delayLongPress={600}
          style={screen.scheduleButton}
        >
          <View accessible={false} style={screen.clockFace}>
            <View style={screen.clockHour} />
            <View style={screen.clockMinute} />
          </View>
        </Pressable>
        <PowerButton
          on={!!shown.power}
          available={acAvailable}
          busy={acBusy}
          disabled={acDisabled}
          onPress={controller.toggleAcPower}
        />
        {acAvailable === false ? <Text style={screen.acUnavailable}>IR hub offline</Text> : null}

        <View
          style={[screen.tempRow, { paddingVertical: tempAir, paddingHorizontal: tempInset }]}
        >
          <View style={acOff ? ui.dimmed : null}>
            <StepButton
              label="−"
              disabled={acDisabled || shown.temp <= 16}
              onPress={() => controller.stepTemperature(-1)}
            />
          </View>
          {/* Long press re-sends the full scene; IR cannot tell us if the AC missed one. */}
          <Pressable
            disabled={acDisabled}
            onLongPress={() => void controller.resendAc()}
            accessibilityRole="button"
            accessibilityLabel={`${shown.temp} degrees`}
            accessibilityHint="Long press to send the current settings to the AC again"
          >
            <Temperature value={shown.temp} size={tempSize} dimmed={acOff} />
          </Pressable>
          <View style={acOff ? ui.dimmed : null}>
            <StepButton
              label="+"
              disabled={acDisabled || shown.temp >= 30}
              onPress={() => controller.stepTemperature(1)}
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
            void controller.changeAc(preset.scene);
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
          disabled={!nodeReady || roomBusy}
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
          disabled={!nodeReady || roomBusy}
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
              disabled: !wizReady || roomBusy,
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
            disabled: !wizReady || roomBusy,
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
        accessibilityLabel={roomActionLabel}
        accessibilityState={{ busy: roomBusy, disabled: roomBusy }}
        disabled={roomBusy}
        onPress={() => (inRoom ? leaveRoom() : enterRoom())}
        // Hidden on purpose: a long press opens the action log.
        onLongPress={() => setDiagnosticsOpen(true)}
        delayLongPress={800}
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
            {roomActionLabel}
          </Text>
        )}
      </Pressable>

      <ColorSheet
        group={sheetGroup}
        busy={sheetGroupBusy || roomBusy}
        activeColorId={sheetActiveColorId}
        brightness={sheetBrightness}
        onBrightnessPreview={setSheetBrightness}
        onApplyBrightness={applySheetBrightness}
        onApplyPreset={applySheetPreset}
        onClose={() => setColorSheetGroupId(null)}
      />

      <SchedulesSheet visible={schedulesOpen} onClose={() => setSchedulesOpen(false)} onDiagnostics={() => { setSchedulesOpen(false); setTimeout(() => setDiagnosticsOpen(true), 350); }} />

      <DiagnosticsSheet visible={diagnosticsOpen} onClose={() => setDiagnosticsOpen(false)} />

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
  scheduleButton: { position: 'absolute', right: 0, top: 0, width: 44, height: 44, justifyContent: 'center', alignItems: 'center', zIndex: 1 },
  clockFace: { width: 17, height: 17, borderRadius: 9, borderWidth: 1.3, borderColor: theme.mute },
  clockHour: { position: 'absolute', left: 7, top: 3, width: 1.3, height: 5, backgroundColor: theme.mute },
  clockMinute: { position: 'absolute', left: 7, top: 7, width: 4, height: 1.3, backgroundColor: theme.mute },
  acUnavailable: {
    position: 'absolute',
    right: 2,
    top: 45,
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
