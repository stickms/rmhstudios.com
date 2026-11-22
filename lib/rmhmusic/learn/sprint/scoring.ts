/**
 * Sprint scoring — pure. A prompt scores 100 at or under its par, falling linearly to 0 at
 * `ZERO_AT_PAR` × par; a wrong answer scores 0 (the prompt ends: a speed game must not reward
 * guessing until right). A run's score is the mean of the prompts played (a chord skipped for the
 * microphone is not played), its stars the lessons' `starsFor`.
 */
import { scoreFromPoints, starsFor, type Stars } from '../scoring/stars';
import { ZERO_AT_PAR, parMs, type SprintKind, type SprintLevelId } from './levels';

export function promptPoints(kind: SprintKind, ms: number, correct: boolean, noteCount = 1): number {
  if (!correct || !Number.isFinite(ms) || ms < 0) return 0;
  const par = parMs(kind, noteCount);
  if (ms <= par) return 100;
  const zero = par * ZERO_AT_PAR;
  if (ms >= zero) return 0;
  return Math.round((100 * (zero - ms)) / (zero - par));
}

/** One prompt's outcome. */
export interface PromptResult {
  level: SprintLevelId;
  kind: SprintKind;
  correct: boolean;
  /** From the prompt being drawn to the answer being complete; null when skipped. */
  ms: number | null;
  /** Each note's time from the one before (the first from the prompt being drawn). */
  noteMs: readonly number[];
  points: number;
  /** A chord on the microphone: not asked, not scored, never wrong. */
  skipped: boolean;
}

export interface RunSummary {
  /** 0..100, the mean of the played prompts' points. */
  score: number;
  stars: Stars;
  correct: number;
  /** Prompts played (not skipped). */
  played: number;
  skipped: number;
  /** Mean time of the right answers, rounded ms; null when none was right. */
  avgMs: number | null;
}

export function summarizeRun(results: readonly PromptResult[]): RunSummary {
  const played = results.filter((r) => !r.skipped);
  const score = scoreFromPoints(played.map((r) => r.points));
  const right = played.filter((r) => r.correct && r.ms !== null && Number.isFinite(r.ms));
  const avgMs = right.length === 0 ? null : Math.round(right.reduce((sum, r) => sum + (r.ms ?? 0), 0) / right.length);
  return {
    score,
    stars: starsFor(score),
    correct: right.length,
    played: played.length,
    skipped: results.length - played.length,
    avgMs,
  };
}
