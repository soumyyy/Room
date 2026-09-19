// Design tokens for the room screen: true black, a muted cream for text, and
// one sand tone for anything that is on.

export const theme = {
  bg: '#000000',
  panel: '#0d0d0d',
  panelDeep: '#050505',
  line: '#161616',
  text: '#E6DCC8',
  strong: '#F1E7D3',
  mute: '#8f8580',
  dim: '#4a4340',
  sand: '#D9CBAA',
  tube: '#FFEFC9',
  fade: '#D9D5CC',
  blue: '#0a84ff',
  red: '#ff3b30',
  radius: 14,
  padding: 15,
  gap: 10,
} as const;

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
