import React, { useState } from 'react';
import {
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from 'react-native';

import { clampBrightness } from '../roomDomain';
import { styles } from '../styles';

export default function BrightnessSlider({
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

  function adjust(direction: -1 | 1) {
    if (!disabled) {
      const next = clampBrightness(value + direction * 5);
      onPreview(next);
      onCommit(next);
    }
  }

  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Brightness"
      accessibilityState={{ disabled }}
      accessibilityValue={{ min: 10, max: 100, now: clampBrightness(value), text: `${value}%` }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'increment') adjust(1);
        if (event.nativeEvent.actionName === 'decrement') adjust(-1);
      }}
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
