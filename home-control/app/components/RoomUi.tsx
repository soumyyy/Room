import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { mixHex } from '../roomDomain';
import { theme } from '../theme';

// Presentation only. Nothing here talks to a device; the screen owns every
// decision and hands these components plain values and callbacks.

/** A panel that wears a tint of `tint` when it is on, and stays plain when off. */
export function Tile({
  tint,
  disabled,
  busy,
  accessibilityLabel,
  accessibilityHint,
  checked,
  onPress,
  onLongPress,
  style,
  children,
}: {
  tint?: string | null;
  disabled?: boolean;
  /** Ignores presses while a command is in flight, without dimming. */
  busy?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  checked?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: disabled || busy, busy, checked }}
      accessibilityActions={onLongPress ? [{ name: 'longpress', label: 'Adjust' }] : undefined}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'longpress') {
          onLongPress?.();
        }
      }}
      disabled={disabled || busy}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={380}
      style={({ pressed }) => [
        ui.tile,
        tint
          ? {
              backgroundColor: mixHex(tint, theme.panelDeep, 0.16),
              borderColor: mixHex(tint, theme.bg, 0.24),
            }
          : null,
        pressed ? ui.tilePressed : null,
        disabled ? ui.disabled : null,
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}

export function PowerButton({
  on,
  available,
  busy,
  disabled,
  onPress,
}: {
  on: boolean;
  available?: boolean | null;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const color = on ? theme.blue : theme.red;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${available === false ? 'AC infrared hub offline. Retry: ' : ''}${on ? 'Turn AC off' : 'Turn AC on'}`}
      accessibilityState={{ checked: on, busy, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        ui.power,
        {
          backgroundColor: color,
          shadowColor: color,
          shadowOpacity: on ? 0.55 : 0.4,
        },
        pressed ? ui.tilePressed : null,
        disabled ? ui.disabled : null,
      ]}
    >
      {busy ? (
        <ActivityIndicator size="small" color="#ffffff" />
      ) : (
        <View style={ui.powerGlyph}>
          <View style={ui.powerRing} />
          <View style={[ui.powerGap, { backgroundColor: color }]} />
          <View style={ui.powerStem} />
        </View>
      )}
    </Pressable>
  );
}

export function StepButton({
  label,
  disabled,
  onPress,
}: {
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label === '+' ? 'Warmer' : 'Cooler'}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [ui.step, pressed ? ui.tilePressed : null, disabled ? ui.disabled : null]}
    >
      <Text style={ui.stepText}>{label}</Text>
    </Pressable>
  );
}

/** The temperature, centred on its digits with the degree sign hanging off the right. */
export function Temperature({ value, size, dimmed }: { value: number; size: number; dimmed: boolean }) {
  return (
    <View style={ui.tempWrap}>
      <Text
        style={[
          ui.temp,
          { fontSize: size, lineHeight: size * 1.08, color: dimmed ? theme.dim : theme.text },
        ]}
      >
        {value}
      </Text>
      <Text
        style={[
          ui.degree,
          { fontSize: size * 0.5, top: size * 0.08, color: dimmed ? theme.dim : theme.text },
        ]}
      >
        °
      </Text>
    </View>
  );
}

export function Segmented({
  items,
  selectedId,
  dimmed,
  disabled,
  height,
  onSelect,
}: {
  items: Array<{ id: string; label: string; sub?: string }>;
  selectedId: string | null;
  dimmed?: boolean;
  disabled?: boolean;
  height: number;
  onSelect: (id: string) => void;
}) {
  return (
    <View style={[ui.segment, { height }, dimmed ? ui.dimmed : null]}>
      {items.map((item) => {
        const selected = item.id === selectedId;

        return (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityLabel={item.sub ? `${item.label}, ${item.sub}` : item.label}
            accessibilityState={{ selected, disabled }}
            disabled={disabled}
            onPress={() => onSelect(item.id)}
            style={({ pressed }) => [
              ui.segmentItem,
              selected ? ui.segmentSelected : null,
              pressed ? ui.tilePressed : null,
            ]}
          >
            <Text style={[ui.segmentLabel, selected ? ui.segmentLabelSelected : null]}>
              {item.label}
            </Text>
            {item.sub ? (
              <Text style={[ui.segmentSub, selected ? ui.segmentLabelSelected : null]}>
                {item.sub}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Shows one value; each tap steps to the next, and the dots show where in the cycle it is. */
export function CycleButton({
  label,
  value,
  position,
  count,
  height,
  dimmed,
  disabled,
  onPress,
}: {
  label: string;
  value: string;
  position: number;
  count: number;
  height: number;
  dimmed?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      accessibilityHint="Cycles to the next option"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        ui.cycle,
        { height },
        dimmed ? ui.dimmed : null,
        pressed ? ui.tilePressed : null,
      ]}
    >
      <Text style={ui.cycleLabel}>{label}</Text>
      <Text style={ui.cycleValue}>{value}</Text>
      <View style={ui.cycleDots}>
        {Array.from({ length: count }, (_, index) => (
          <View key={index} style={[ui.cycleDot, index === position ? ui.cycleDotActive : null]} />
        ))}
      </View>
    </Pressable>
  );
}

/**
 * Three twisted blades around a hub, the way a propeller fan is drawn. It stays
 * still: the colour says whether the fan is on. `backdrop` is the tile colour,
 * which the hub uses to leave a ring of empty space around itself.
 */
export function FanGlyph({ color, backdrop }: { color: string; backdrop: string }) {
  return (
    <View style={ui.fanGlyph}>
      {[0, 120, 240].map((angle) => (
        <View key={angle} style={[ui.fanArm, { transform: [{ rotate: `${angle}deg` }] }]}>
          <View style={[ui.fanBlade, { backgroundColor: color }]} />
        </View>
      ))}
      <View style={[ui.fanHub, { backgroundColor: color, borderColor: backdrop }]} />
    </View>
  );
}

export function TubeGlyph({ on }: { on: boolean }) {
  return (
    <View
      style={[
        ui.tube,
        on
          ? { backgroundColor: theme.tube, shadowColor: theme.tube, shadowOpacity: 0.7 }
          : null,
      ]}
    />
  );
}

/** Two overlapping circles: the lights merged into one. Filled when they are. */
export function MergeButton({
  merged,
  onPress,
  style,
}: {
  merged: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={merged ? 'Separate lights' : 'Combine lights'}
      accessibilityState={{ checked: merged }}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [
        ui.merge,
        merged ? ui.mergeOn : ui.mergeOff,
        pressed ? ui.tilePressed : null,
        style,
      ]}
    >
      <View style={ui.mergeIcon}>
        <View style={[ui.mergeCircle, { borderColor: theme.strong }]} />
        <View style={[ui.mergeCircle, ui.mergeCircleBack, { borderColor: theme.strong }]} />
      </View>
    </Pressable>
  );
}

export const ui = StyleSheet.create({
  tile: {
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.line,
    backgroundColor: theme.panel,
  },
  tilePressed: {
    opacity: 0.75,
    transform: [{ scale: 0.985 }],
  },
  disabled: {
    opacity: 0.35,
  },
  dimmed: {
    opacity: 0.32,
  },

  power: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 22,
  },
  powerGlyph: {
    width: 30,
    height: 30,
    alignItems: 'center',
  },
  powerRing: {
    position: 'absolute',
    top: 3,
    width: 27,
    height: 27,
    borderRadius: 14,
    borderWidth: 3.2,
    borderColor: '#ffffff',
  },
  powerGap: {
    position: 'absolute',
    top: 0,
    width: 11,
    height: 12,
  },
  powerStem: {
    position: 'absolute',
    top: 0,
    width: 3.2,
    height: 15,
    borderRadius: 2,
    backgroundColor: '#ffffff',
  },

  step: {
    width: 52,
    height: 52,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.line,
    backgroundColor: theme.panel,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: {
    color: theme.text,
    fontSize: 24,
    fontWeight: '300',
  },

  tempWrap: {
    alignSelf: 'center',
    position: 'relative',
  },
  temp: {
    fontWeight: '700',
    letterSpacing: -3,
    textAlign: 'center',
  },
  degree: {
    position: 'absolute',
    left: '100%',
    marginLeft: 2,
    fontWeight: '600',
  },

  segment: {
    flexDirection: 'row',
    borderRadius: theme.radius - 2,
    borderWidth: 1,
    borderColor: theme.line,
    backgroundColor: theme.panel,
    padding: 4,
  },
  segmentItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius - 6,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  segmentSelected: {
    backgroundColor: mixHex(theme.sand, theme.panel, 0.18),
    borderColor: mixHex(theme.sand, theme.bg, 0.24),
  },
  segmentLabel: {
    color: theme.mute,
    fontSize: 15,
    fontWeight: '600',
  },
  segmentSub: {
    color: theme.mute,
    fontSize: 12,
    opacity: 0.7,
  },
  segmentLabelSelected: {
    color: theme.strong,
  },

  cycle: {
    flex: 1,
    borderRadius: theme.radius - 2,
    borderWidth: 1,
    borderColor: theme.line,
    backgroundColor: theme.panel,
    paddingHorizontal: 14,
    paddingTop: 9,
  },
  cycleLabel: {
    color: theme.mute,
    fontSize: 11,
  },
  cycleValue: {
    color: theme.text,
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  cycleDots: {
    position: 'absolute',
    right: 14,
    top: 14,
    flexDirection: 'row',
    gap: 4,
  },
  cycleDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#3a3030',
  },
  cycleDotActive: {
    backgroundColor: theme.sand,
  },

  fanGlyph: {
    width: 48,
    height: 48,
  },
  fanArm: {
    position: 'absolute',
    width: 48,
    height: 48,
    alignItems: 'center',
  },
  fanBlade: {
    width: 18,
    height: 24,
    marginTop: 1,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
    borderBottomLeftRadius: 3,
    transform: [{ rotate: '-14deg' }],
  },
  fanHub: {
    position: 'absolute',
    top: 17,
    left: 17,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
  },

  tube: {
    flex: 1,
    width: 12,
    marginBottom: 10,
    borderRadius: 6,
    backgroundColor: '#222222',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 14,
    shadowOpacity: 0,
  },

  merge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mergeOn: {
    backgroundColor: '#ffffff1f',
  },
  mergeOff: {
    backgroundColor: theme.bg,
    borderWidth: 1,
    borderColor: '#222222',
  },
  mergeIcon: {
    width: 22,
    height: 14,
  },
  mergeCircle: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.8,
  },
  mergeCircleBack: {
    left: 8,
  },
});
