import type { BaseId, EffectId } from './types';
import { BASES } from './content';

export const BONUS_THRESHOLD = 0.8;
export const GROW_YIELD = { min: 3, max: 9 } as const;
export const COOK_YIELD = { min: 2, max: 6 } as const;

const clamp01 = (q: number) => Math.max(0, Math.min(1, q));

export function qualityValueMult(q: number): number {
  return 0.7 + 0.6 * clamp01(q);
}

export function qualityYield(q: number, range: { min: number; max: number }): number {
  return Math.round(range.min + clamp01(q) * (range.max - range.min));
}

export function qualityBonusEffects(baseId: BaseId, q: number): EffectId[] {
  const bonus = BASES[baseId].bonusEffect;
  return q >= BONUS_THRESHOLD && bonus ? [bonus] : [];
}
