export const PALETTE = {
  // Terrain
  grass:     '#4a7830',
  grassDark: '#344f1e',
  water:     '#1a5c8c',
  waterDeep: '#0d3d5c',
  dirt:      '#9b7a3d',
  sand:      '#c4a84a',
  forest:    '#2d5a1a',
  forestDark:'#1a3d0e',
  // Infrastructure
  road:      '#606060',
  roadDark:  '#404040',
  powerLine: '#ffee00',
  // Zones (outline color when vacant)
  zoneR:     '#4aaa4a',
  zoneC:     '#4a6eee',
  zoneI:     '#eecc4a',
  // Buildings (fill when occupied)
  buildR:    '#228b22',
  buildC:    '#1e3fa8',
  buildI:    '#b8860b',
  // Isometric side faces
  faceDark:  'rgba(0,0,0,0.22)',
  faceLight: 'rgba(255,255,255,0.07)',
  // UI
  concrete:  '#8a8a8a',
} as const

export type PaletteKey = keyof typeof PALETTE
