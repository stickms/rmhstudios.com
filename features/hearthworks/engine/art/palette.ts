/**
 * Hearthworks' one palette: light pastel blues and teals (owner, 2026-11-04) with sparing warm
 * accents. Every model colour is a key here, never a raw hex, so nothing drifts off-scheme.
 */
export const PALETTE = {
  sky: '#DFF3F8',
  powder: '#BFE3F2',
  water: '#8FCBE3',
  aqua: '#9ADBD6',
  teal: '#5FB8B2',
  leaf: '#7FCFB2',
  leafDeep: '#4FA896',
  stone: '#B8D4DC',
  sand: '#EDE5C8',
  cream: '#F7FBFC',
  ink: '#1F6A74',
  deepTeal: '#2E7F86',
  wood: '#C9B79C',
  butter: '#FFE7A8',
  blush: '#FFC9C0',
} as const;

export type PaletteKey = keyof typeof PALETTE;
export const PALETTE_KEYS = Object.keys(PALETTE) as PaletteKey[];
export const isPaletteKey = (v: unknown): v is PaletteKey =>
  typeof v === 'string' && Object.hasOwn(PALETTE, v);

/** The warm accents may colour small details only (see checkStyle). */
export const ACCENT_KEYS: readonly PaletteKey[] = ['butter', 'blush'];
