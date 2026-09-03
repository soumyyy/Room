import React from 'react';
import { Modal, Pressable, Text, View } from 'react-native';

import BrightnessSlider from './BrightnessSlider';
import {
  COLOR_ROWS,
  COLOR_ROW_SIZE,
  WHITE_PRESETS,
  type BulbGroupConfig,
  type GroupColorPreset,
} from '../roomDomain';
import { styles } from '../styles';

/**
 * The colour and brightness sheet for one light group.
 *
 * Presentation and intent only — it reports what was tapped and never talks to
 * a bulb, which is what lets the screen keep every device decision in one place.
 * `activeColorId` is null when the addressed groups disagree about their colour,
 * and no chip is highlighted rather than an arbitrary one.
 */
export default function ColorSheet({
  group,
  busy,
  activeColorId,
  brightness,
  onBrightnessPreview,
  onApplyBrightness,
  onApplyPreset,
  onClose,
}: {
  group: BulbGroupConfig | null;
  busy: boolean;
  activeColorId: string | null;
  brightness: number;
  onBrightnessPreview: (value: number) => void;
  onApplyBrightness: (value: number) => void;
  onApplyPreset: (preset: GroupColorPreset) => void;
  onClose: () => void;
}) {
  if (!group) {
    return null;
  }

  return (
          <Modal
            visible
            transparent
            animationType="slide"
            onRequestClose={onClose}
          >
            <Pressable
              style={styles.sheetOverlay}
              onPress={onClose}
            />
            <View style={styles.sheet}>
              <View style={styles.sheetHandle} />

              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>{group.name}</Text>
                <Pressable
                  onPress={onClose}
                  style={styles.sheetClose}
                  hitSlop={12}
                >
                  <Text style={styles.sheetCloseText}>Done</Text>
                </Pressable>
              </View>

              <View style={styles.sheetSection}>
                <View style={styles.sheetSectionHeader}>
                  <Text style={styles.sheetSectionLabel}>Brightness</Text>
                  <Text style={styles.sheetBrightnessValue}>{brightness}%</Text>
                </View>
                <BrightnessSlider
                  value={brightness}
                  disabled={busy}
                  onPreview={onBrightnessPreview}
                  onCommit={(value) => void onApplyBrightness(value)}
                />
              </View>

              <View style={styles.sheetSection}>
                <View style={styles.colorChipRow}>
                  {WHITE_PRESETS.map((preset) => (
                    <Pressable
                      key={preset.id}
                      onPress={() => void onApplyPreset(preset)}
                      style={({ pressed }) => [
                        styles.colorChip,
                        activeColorId === preset.id ? styles.colorChipActive : null,
                        pressed ? styles.pressed : null,
                        busy ? styles.disabled : null,
                      ]}
                      disabled={busy}
                    >
                      <View style={[styles.colorChipDot, { backgroundColor: preset.hex }]} />
                      <Text
                        style={[
                          styles.colorChipLabel,
                          activeColorId === preset.id ? styles.colorChipLabelActive : null,
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
                          onPress={() => void onApplyPreset(preset)}
                          style={({ pressed }) => [
                            styles.colorPaletteTile,
                            { backgroundColor: preset.hex },
                            activeColorId === preset.id
                              ? styles.colorPaletteTileActive
                              : null,
                            pressed ? styles.pressed : null,
                            busy ? styles.disabled : null,
                          ]}
                          disabled={busy}
                        >
                          <View
                            style={[
                              styles.colorPaletteTileInner,
                              activeColorId === preset.id
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
}
