import type { EffectId, RecipeMeta } from './types';
import { EFFECTS } from './content';

export interface CatalogEntry {
  id: EffectId;
  name: string;
  tier: 1 | 2 | 3;
  multiplier: number;
  color: string;
  discovered: boolean;
}

/** Every effect, flagged discovered/locked, ordered by tier then name. */
export function effectCatalog(discovered: string[]): CatalogEntry[] {
  const seen = new Set(discovered);
  return Object.values(EFFECTS)
    .map((e) => ({
      id: e.id, name: e.name, tier: e.tier, multiplier: e.multiplier, color: e.color,
      discovered: seen.has(e.id),
    }))
    .sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name));
}

/** Union `current` with `effects`; returns the same reference when nothing is new. */
export function discoverEffects(current: string[], effects: EffectId[]): string[] {
  const have = new Set(current);
  const added = effects.filter((e) => !have.has(e));
  return added.length === 0 ? current : [...current, ...added];
}

/** Raise `meta[key].bestValue` to `value` if higher; same reference when no raise needed. */
export function mergeBestValue(
  meta: Record<string, RecipeMeta>,
  key: string,
  value: number,
): Record<string, RecipeMeta> {
  const prev = meta[key];
  if (prev && (prev.bestValue ?? 0) >= value) return meta;
  return { ...meta, [key]: { ...prev, bestValue: value } };
}
