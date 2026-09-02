const BULBS = BULBS_GENERATED;

const BULB_GROUPS = BULB_GROUPS_GENERATED;

const AC_PRESETS = [
  {
    id: 'ice',
    name: 'Ice',
    accent: '#8bcff2',
    scene: { power: 1, mode: 0, temp: 21, wind: 3 },
  },
  {
    id: 'daytime',
    name: 'Day',
    accent: '#ffbe8a',
    scene: { power: 1, mode: 0, temp: 24, wind: 1 },
  },
  {
    id: 'night',
    name: 'Night',
    accent: '#b6bdfc',
    scene: { power: 1, mode: 0, temp: 27, wind: 0 },
  },
];

const LIGHT_PRESETS = [
  {
    id: 'rose',
    name: 'Rose',
    hex: '#ff5d73',
    category: 'vivid',
    params: { state: true, r: 255, g: 93, b: 115 },
  },
  {
    id: 'coral',
    name: 'Coral',
    hex: '#ff7a45',
    category: 'vivid',
    params: { state: true, r: 255, g: 122, b: 69 },
  },
  {
    id: 'amber',
    name: 'Amber',
    hex: '#ffb000',
    category: 'vivid',
    params: { state: true, r: 255, g: 176, b: 0 },
  },
  {
    id: 'sun',
    name: 'Sunlight',
    hex: '#ffd85a',
    category: 'vivid',
    params: { state: true, r: 255, g: 216, b: 90 },
  },
  {
    id: 'lime',
    name: 'Lime',
    hex: '#c6f432',
    category: 'vivid',
    params: { state: true, r: 198, g: 244, b: 50 },
  },
  {
    id: 'mint',
    name: 'Mint',
    hex: '#18e299',
    category: 'vivid',
    params: { state: true, r: 24, g: 226, b: 153 },
  },
  {
    id: 'aqua',
    name: 'Aqua',
    hex: '#00d9ff',
    category: 'vivid',
    params: { state: true, r: 0, g: 217, b: 255 },
  },
  {
    id: 'sky',
    name: 'Sky Blue',
    hex: '#4c8dff',
    category: 'vivid',
    params: { state: true, r: 76, g: 141, b: 255 },
  },
  {
    id: 'violet',
    name: 'Violet',
    hex: '#7269ff',
    category: 'vivid',
    params: { state: true, r: 114, g: 105, b: 255 },
  },
  {
    id: 'iris',
    name: 'Iris',
    hex: '#a259ff',
    category: 'vivid',
    params: { state: true, r: 162, g: 89, b: 255 },
  },
  {
    id: 'pink',
    name: 'Pink',
    hex: '#ff61d2',
    category: 'vivid',
    params: { state: true, r: 255, g: 97, b: 210 },
  },
  {
    id: 'peach',
    name: 'Peach',
    hex: '#ff9478',
    category: 'vivid',
    params: { state: true, r: 255, g: 148, b: 120 },
  },
  {
    id: 'warm-white',
    name: 'Warm White',
    hex: '#ffd6a1',
    category: 'white',
    params: { state: true, temp: 2700 },
  },
  {
    id: 'neutral-white',
    name: 'Neutral',
    hex: '#fff0d6',
    category: 'white',
    params: { state: true, temp: 4200 },
  },
  {
    id: 'cool-white',
    name: 'Cool White',
    hex: '#e9f6ff',
    category: 'white',
    params: { state: true, temp: 6500 },
  },
  {
    id: 'seafoam',
    name: 'Seafoam',
    hex: '#a7f0d2',
    category: 'soft',
    params: { state: true, r: 167, g: 240, b: 210 },
  },
  {
    id: 'lavender',
    name: 'Lavender',
    hex: '#d2c8ff',
    category: 'soft',
    params: { state: true, r: 210, g: 200, b: 255 },
  },
  {
    id: 'blush',
    name: 'Blush',
    hex: '#ffc6d8',
    category: 'soft',
    params: { state: true, r: 255, g: 198, b: 216 },
  },
];

const {
  TUYA_SECRETS: TUYA,
  BULBS_GENERATED,
  BULB_GROUPS_GENERATED,
} = require('./generated.cjs');

module.exports = {
  APP_NAME: 'Room',
  BULBS,
  BULB_GROUPS,
  AC_PRESETS,
  LIGHT_PRESETS,
  TUYA,
};
