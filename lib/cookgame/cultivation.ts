import type { PlotState, WetBatch, BaseStockEntry, BaseId, GrowStage } from './types';
import { qualityValueMult, qualityYield, qualityBonusEffects, GROW_YIELD } from './production';

export const TEND_COOLDOWN_MS = 30_000;
export const WILT_GRACE_MS = 60_000;
export const DRY_COOLDOWN_MS = 60_000;
export const CARE_MAX = 2;
export const GROW_SEQUENCE: GrowStage[] = ['seedling', 'vegetative', 'flowering'];

export function emptyPlot(): PlotState {
  return { baseId: null, stage: 'empty', plantedAt: null, lastAdvancedAt: null, careAccum: 0 };
}

export function plantPlot(plot: PlotState, baseId: BaseId, now: number): PlotState {
  if (plot.stage !== 'empty') return plot;
  return { baseId, stage: 'seedling', plantedAt: now, lastAdvancedAt: now, careAccum: 0 };
}

const isTendable = (stage: GrowStage) => stage === 'seedling' || stage === 'vegetative';

export function canTend(plot: PlotState, now: number, cooldownMult = 1): boolean {
  if (!isTendable(plot.stage) || plot.lastAdvancedAt === null) return false;
  return now - plot.lastAdvancedAt >= TEND_COOLDOWN_MS * cooldownMult;
}

export function tendPlot(plot: PlotState, now: number, cooldownMult = 1): PlotState {
  if (!canTend(plot, now, cooldownMult)) return plot;
  const elapsed = now - (plot.lastAdvancedAt as number);
  const credit = elapsed <= TEND_COOLDOWN_MS + WILT_GRACE_MS ? 1 : 0.5;
  const idx = GROW_SEQUENCE.indexOf(plot.stage);
  const nextStage = GROW_SEQUENCE[idx + 1];
  return { ...plot, stage: nextStage, lastAdvancedAt: now, careAccum: plot.careAccum + credit };
}

export function plotQuality(plot: PlotState): number {
  return Math.max(0, Math.min(1, plot.careAccum / CARE_MAX));
}

export function harvestPlot(plot: PlotState, now: number): { wet: WetBatch; plot: PlotState } | null {
  if (plot.stage !== 'flowering' || plot.baseId === null) return null;
  const wet: WetBatch = { baseId: plot.baseId, quality: plotQuality(plot), dryStartedAt: now };
  return { wet, plot: emptyPlot() };
}

export function canCollect(batch: WetBatch, now: number, cooldownMult = 1): boolean {
  return now - batch.dryStartedAt >= DRY_COOLDOWN_MS * cooldownMult;
}

export function collectDried(batch: WetBatch): BaseStockEntry {
  return {
    baseId: batch.baseId,
    qualityMult: qualityValueMult(batch.quality),
    bonusEffects: qualityBonusEffects(batch.baseId, batch.quality),
    units: qualityYield(batch.quality, GROW_YIELD),
  };
}
