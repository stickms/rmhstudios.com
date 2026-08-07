/**
 * Slice It — the calibration advisor. Server-only. (Feature 3.)
 *
 * The single most common way a rhythm player wastes a month: hitting
 * consistently late, reading it as a skill problem, and practising harder
 * against a setting that is wrong. The two cases look identical from inside the
 * game — notes are being missed — and are fixed by opposite actions.
 *
 * The numbers separate them cleanly, and the separation is arithmetic rather
 * than judgement:
 *
 *  - A large **mean** error with a **tight** spread is calibration. The player
 *    is accurate relative to what they hear; the sound is arriving at the wrong
 *    moment. Changing the offset fixes it in one run.
 *  - A **wide** spread is consistency, and no offset value improves it. Moving
 *    the offset here just relocates the scatter.
 *
 * So `offsetAdvice()` in `facts.ts` makes the call — comparing the mean against
 * its own standard error, which is the honest test of "is this bias real or is
 * it noise" — and the model's job is to say it in a sentence a player will act
 * on, plus name the number behind it. The verdict the UI branches on comes from
 * the arithmetic; only the wording comes from the model.
 *
 * `deriveVerdict` is exported because it is the whole feature with AI switched
 * off: the panel still says "your offset looks about 22ms out" without a
 * provider, and the model only adds the paragraph.
 */

import { SLICE_IT_CALIBRATION } from '@/lib/ai/prompts';
import type { TimingSummary } from '../integrity';
import { attempt } from './run.server';
import { calibrationAdviceSchema, type CalibrationAdvice } from './types';
import { mmss, offsetAdvice, poolTiming } from './facts';

/** One run's contribution to the calibration picture. */
export interface CalibrationRun {
  songTitle: string;
  durationSec: number;
  accuracy: number;
  timing: TimingSummary;
}

/** The arithmetic verdict, before any model is involved. */
export interface CalibrationVerdict {
  verdict: 'offset' | 'practice' | 'inconclusive';
  /** The offset setting being recommended, ms. Equals the current one when not `offset`. */
  suggestedOffsetMs: number;
  pooled: TimingSummary | null;
}

/** Offsets outside this are rejected by the store's own clamp. */
const OFFSET_LIMIT_MS = 500;

/**
 * Decide from the numbers alone. Pure, and the source of truth for the UI's
 * branching — the model never overrides it.
 */
export function deriveVerdict(
  runs: readonly CalibrationRun[],
  currentOffsetMs: number,
): CalibrationVerdict {
  const pooled = poolTiming(runs.map((r) => r.timing));
  const advice = offsetAdvice(pooled);

  if (!pooled || !advice) {
    return { verdict: 'inconclusive', suggestedOffsetMs: currentOffsetMs, pooled };
  }
  if (!advice.confident) {
    // A spread wide enough to swamp the bias is a consistency problem. Saying
    // "inconclusive" here would be wrong in a way that matters: there IS a
    // conclusion, and it is that the offset is not the issue.
    return {
      verdict: advice.spreadMs >= 30 ? 'practice' : 'inconclusive',
      suggestedOffsetMs: currentOffsetMs,
      pooled,
    };
  }

  const suggested = Math.round(currentOffsetMs + advice.suggestedDeltaMs);
  return {
    verdict: 'offset',
    suggestedOffsetMs: Math.max(-OFFSET_LIMIT_MS, Math.min(OFFSET_LIMIT_MS, suggested)),
    pooled,
  };
}

/**
 * Explain the verdict in a sentence the player will act on.
 *
 * Returns `null` when AI is unavailable — the caller still has
 * {@link deriveVerdict}, which is the actionable half.
 *
 * Note what is NOT delegated: the returned `verdict` and `suggestedOffsetMs`
 * are overwritten with the derived ones. The model is asked for them so that
 * its explanation is written against a specific recommendation rather than in
 * the abstract, but a model that disagreed with the arithmetic would be a model
 * moving a player's calibration on a hunch.
 */
export async function explainCalibration(
  runs: readonly CalibrationRun[],
  currentOffsetMs: number,
  opts: { userId?: string | null } = {},
): Promise<CalibrationAdvice | null> {
  const derived = deriveVerdict(runs, currentOffsetMs);

  const lines = [
    `current audio offset setting: ${currentOffsetMs} ms`,
    `runs analysed: ${runs.length}`,
  ];
  for (const run of runs) {
    const direction = run.timing.meanMs > 0 ? 'late' : 'early';
    lines.push(
      `  "${run.songTitle}" (${mmss(run.durationSec)}): ` +
        `${(run.accuracy * 100).toFixed(1)}% accuracy, average ` +
        `${Math.abs(Math.round(run.timing.meanMs))} ms ${direction}, ` +
        `spread ${Math.round(run.timing.stdDevMs)} ms over ${run.timing.samples} hits`,
    );
  }
  if (derived.pooled) {
    const direction = derived.pooled.meanMs > 0 ? 'late' : 'early';
    lines.push(
      `pooled across all runs: average ${Math.abs(Math.round(derived.pooled.meanMs))} ms ` +
        `${direction}, spread ${Math.round(derived.pooled.stdDevMs)} ms, ` +
        `${derived.pooled.samples} hits total`,
    );
  }
  lines.push(
    `the statistical read is "${derived.verdict}"` +
      (derived.verdict === 'offset'
        ? `, recommending an offset of ${derived.suggestedOffsetMs} ms`
        : ''),
  );

  const advice = await attempt(
    SLICE_IT_CALIBRATION,
    calibrationAdviceSchema,
    lines.join('\n'),
    opts,
  );
  if (!advice) return null;

  return {
    ...advice,
    verdict: derived.verdict,
    suggestedOffsetMs: derived.suggestedOffsetMs,
  };
}
