/** Optional user adjustments to the game's own attachment position and particle scale. */
import type { EffectPlacement, ItemSlot } from './catalog-types';

/** Zero means the MDL attachment/PCF-authored position, with its original Source-unit size. */
export function defaultPlacement(_slot: ItemSlot | 'cosmetic'): Required<EffectPlacement> {
  return { x: 0, y: 0, z: 0, s: 1 };
}
const clamp = (v: unknown, lo: number, hi: number, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
export function resolvePlacement(
  saved: EffectPlacement | undefined,
  slot: ItemSlot | 'cosmetic',
): Required<EffectPlacement> {
  const d = defaultPlacement(slot);
  return {
    x: clamp(saved?.x, -2, 2, d.x),
    y: clamp(saved?.y, -2, 2, d.y),
    z: clamp(saved?.z, -2, 2, d.z),
    s: clamp(saved?.s, 0.25, 4, d.s),
  };
}
export function compactPlacement(
  p: Required<EffectPlacement>,
  slot: ItemSlot | 'cosmetic',
): EffectPlacement | undefined {
  const d = defaultPlacement(slot),
    out: EffectPlacement = {};
  for (const k of ['x', 'y', 'z', 's'] as const) {
    if (Math.abs(p[k] - d[k]) > 1e-3) out[k] = Math.round(p[k] * 1000) / 1000;
  }
  return Object.keys(out).length ? out : undefined;
}
export const WEAR_NAMES = [
  'Factory New',
  'Minimal Wear',
  'Field-Tested',
  'Well-Worn',
  'Battle Scarred',
] as const;
