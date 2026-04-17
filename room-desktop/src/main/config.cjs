const BULBS = [
  { id: 'left-1', name: 'Left Light 1', ip: '192.168.29.131' },
  { id: 'left-2', name: 'Left Light 2', ip: '192.168.29.180' },
  { id: 'right-1', name: 'Right Light 1', ip: '192.168.29.116' },
  { id: 'right-2', name: 'Right Light 2', ip: '192.168.29.151' },
];

const BULB_GROUPS = [
  { id: 'left', name: 'Left Lights', bulbIds: ['left-1', 'left-2'] },
  { id: 'right', name: 'Right Lights', bulbIds: ['right-1', 'right-2'] },
];

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

const TUYA = {
  clientId: 'wcumxxy4hrjaurwdd8dg',
  clientSecret: 'f74fbd3a47a94dd29ce478335ac26362',
  apiBaseUrl: 'https://openapi.tuyain.com',
  infraredId: 'd7629f91c10f8aaa6dbtaw',
  acRemoteId: 'd7c7ddecd3c98a5a00nezc',
};

module.exports = {
  APP_NAME: 'Room',
  BULBS,
  BULB_GROUPS,
  AC_PRESETS,
  LIGHT_PRESETS,
  TUYA,
};
