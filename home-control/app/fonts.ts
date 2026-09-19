// Manrope ships as one file per weight, because React Native on iOS ignores
// `fontWeight` for a custom family. Rather than hand-edit every style, this maps
// the weight a style already asks for onto the matching file.
//
// Pure on purpose: nothing here imports react-native, so it can be tested.

const BY_WEIGHT: Record<string, string> = {
  '100': 'Manrope-Light',
  '200': 'Manrope-Light',
  '300': 'Manrope-Light',
  '400': 'Manrope-Regular',
  normal: 'Manrope-Regular',
  '500': 'Manrope-Medium',
  '600': 'Manrope-SemiBold',
  '700': 'Manrope-Bold',
  bold: 'Manrope-Bold',
  '800': 'Manrope-Bold',
  '900': 'Manrope-Bold',
};

export function familyFor(weight?: string | number): string {
  return BY_WEIGHT[String(weight ?? '400')] ?? 'Manrope-Regular';
}

/**
 * Gives every text style (one with a fontSize or fontWeight) its Manrope file and
 * drops the fontWeight it replaces. View styles pass through unchanged, and the
 * input is not mutated.
 */
export function applyFont<T extends Record<string, object>>(styles: T): T {
  const out: Record<string, object> = {};

  for (const [name, style] of Object.entries(styles)) {
    const entry = style as Record<string, unknown>;

    if ('fontSize' in entry || 'fontWeight' in entry) {
      const { fontWeight, ...rest } = entry;
      out[name] = { ...rest, fontFamily: familyFor(fontWeight as string | undefined) };
    } else {
      out[name] = style;
    }
  }

  return out as T;
}
