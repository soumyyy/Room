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
