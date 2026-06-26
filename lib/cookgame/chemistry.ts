import type { BaseStockEntry, BaseId } from './types';
import { qualityValueMult, qualityYield, qualityBonusEffects, COOK_YIELD } from './production';

export const DIAL_COUNT = 3;
export const MAXDIST = Math.sqrt(DIAL_COUNT);

function euclidean(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < DIAL_COUNT; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    sum += d * d;
  }
  return Math.sqrt(sum);
}

export function cookQuality(dials: number[], target: number[]): number {
  const q = 1 - euclidean(dials, target) / MAXDIST;
  return Math.max(0, Math.min(1, q));
}

export function feedbackBand(dials: number[], target: number[]): 'hot' | 'warm' | 'cold' {
  const q = cookQuality(dials, target);
  if (q >= 0.85) return 'hot';
  if (q >= 0.6) return 'warm';
  return 'cold';
}

export function cookOutput(baseId: BaseId, quality: number): BaseStockEntry {
  return {
    baseId,
    qualityMult: qualityValueMult(quality),
    bonusEffects: qualityBonusEffects(baseId, quality),
    units: qualityYield(quality, COOK_YIELD),
  };
}
