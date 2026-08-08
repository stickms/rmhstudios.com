/**
 * Is a player's timing bias real, and which way should the offset move?
 *
 * This is arithmetic, not an AI feature. It lived in `lib/slice-it/ai/facts.ts`
 * only because the AI wave factored it out of `GameOver` on its way past, and
 * it outlived that wave: the one-tap offset suggestion on the results card is a
 * plain feature of the game and it needs exactly this rule.
 *
 * The distinction it draws is the point. A *consistent* mean error is a
 * calibration problem — the player is accurate relative to what they hear, and
 * the sound is arriving at the wrong time. A *wide* spread is a skill problem,
 * and no offset change fixes it. Telling one to adjust their offset when the
 * real issue is the other is how a player ends up chasing a setting for a week.
 *
 * Returns `null` when the sample is too small to say anything, which is the
 * honest answer far more often than a recommendation is.
 */

import type { TimingSummary } from './integrity';

export function offsetAdvice(timing: TimingSummary | null | undefined): {
  /** Milliseconds to ADD to the current audio offset. */
  suggestedDeltaMs: number;
  /** True when the bias is large relative to the spread — i.e. real. */
  confident: boolean;
  spreadMs: number;
} | null {
  if (!timing || timing.samples < 30) return null;
  if (!Number.isFinite(timing.meanMs) || !Number.isFinite(timing.stdDevMs)) return null;

  // The standard error of the mean. A bias only means something when it is
  // large compared to the uncertainty in measuring it — with a wide spread and
  // few samples, a 10ms mean is noise.
  const standardError = timing.stdDevMs / Math.sqrt(timing.samples);
  const confident = Math.abs(timing.meanMs) > 2 * standardError && Math.abs(timing.meanMs) >= 8;

  return {
    // A player hitting consistently LATE (positive mean) is hearing the audio
    // early relative to the visuals, so the offset moves the other way.
    suggestedDeltaMs: -Math.round(timing.meanMs),
    confident,
    spreadMs: Math.round(timing.stdDevMs),
  };
}
