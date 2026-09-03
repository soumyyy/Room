import { Platform, StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
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
  },

  // ── Header ────────────────────────────────────────────────────────────────

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
  pillSectionLabel: {
    color: '#48484a',
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.4,
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
  colorPaletteTilePad: {
    flex: 1,
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
