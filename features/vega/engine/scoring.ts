/**
 * Project Vega's score: waves cleared, times multipliers. Pure and shared by the client (to show it), the score
 * route (to bound a submission) and the tests (to derive the catalog ceilings).
 *
 *   wave w cleared  ->  round(PER_WAVE * w * map * (perfect ? PERFECT_MUL : 1) * (early ? EARLY_MUL : 1))
 *   containment     ->  + round(INTEGRITY_BONUS * integrity left * map), once, when wave GOAL is cleared
 */
import { ECONOMY, MAPS, SCORE, WAVES, type MapId } from './data';

export function waveScore(wave: number, map: MapId, perfect: boolean, early: boolean): number {
  return Math.round(
    SCORE.PER_WAVE * wave * MAPS[map].scoreMul * (perfect ? SCORE.PERFECT_MUL : 1) * (early ? SCORE.EARLY_MUL : 1),
  );
}

export function containmentBonus(integrity: number, map: MapId): number {
  return Math.round(SCORE.INTEGRITY_BONUS * Math.max(0, integrity) * MAPS[map].scoreMul);
}

/** The most score a run that has cleared `waves` waves on `map` can hold (every wave perfect and early). */
export function maxScoreThrough(waves: number, map: MapId): number {
  let total = 0;
  for (let w = 1; w <= waves; w++) total += waveScore(w, map, true, w > 1);
  if (waves >= WAVES.GOAL) total += containmentBonus(ECONOMY.START_INTEGRITY, map);
  return total;
}

/** The most score any run on any map can hold: the catalog `maxScore` must be at least this. */
export function scoreCeiling(): number {
  return Math.max(...(Object.keys(MAPS) as MapId[]).map((m) => maxScoreThrough(WAVES.CAP, m)));
}
