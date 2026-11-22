/**
 * The Daily board's checks (RMH Music Phase 6, plan §1.3) — pure, client-safe; the one module the
 * thresholds live in. `sprint.server.ts` applies them when it scores a run.
 *
 * The server still cannot know which notes were played. These checks make a fabricated board run
 * take at least the wall time it claims and look human; moderation is the backstop for what slips
 * through. A run that
 * fails a check is KEPT (it counts for the learner's own streak) and is not ranked; the learner is
 * told in a plain sentence that never names a threshold.
 *
 * - **no-start:** the run's start never reached the server, so nothing bounds how long it took.
 * - **clock:** the played prompts' times add up to more than the time between the start and the
 *   save (plus `CLOCK_SLACK_MS` for the app's and the database's clocks). This caps the claimed
 *   answer times by wall time, and nothing more: a scripted run that records its start, waits out
 *   the clock and then posts fast-looking times passes it (the other checks and the review are for
 *   that).
 * - **too-fast:** `TOO_FAST_LIMIT` or more right answers under a human floor (fewer are glitches,
 *   e.g. a doubled key event). A bar's floor is its first note's reaction time, plus "most of its
 *   gaps under `MIN_BAR_GAP_MS`" (one short gap is a stall or a mic poll, not a cheat). A wrong
 *   answer is never too fast.
 * - **too-even:** with `EVEN_MIN_RIGHT` or more right answers, the spread (coefficient of
 *   variation) of `ms / par` is under `MIN_TIME_SPREAD`; human reading times vary far more.
 *
 * Skipped prompts (chords on the microphone) have no time and are ignored by every check.
 */
import { BAR_NOTES, parMs, type SprintKind } from './levels';
import type { PromptResult, RunSummary } from './scoring';

/** Allowance for the app server's and the database's clocks disagreeing. */
export const CLOCK_SLACK_MS = 5_000;

/** The fastest a right answer of each kind can humanly be (a bar: its first note). */
export const MIN_ANSWER_MS: Readonly<Record<SprintKind, number>> = {
  note: 250,
  accidental: 300,
  chord: 350,
  bar: 250,
};

/**
 * A gap between a bar's notes shorter than this is implausible (25 notes a second). One such gap
 * is not: a main-thread stall can deliver two queued note-ons a millisecond apart, and a microphone
 * hears notes on its 25 ms poll. A bar is too fast only when most of its gaps are implausible.
 */
export const MIN_BAR_GAP_MS = 40;

/** Too-fast prompts that fail a run (fewer are tolerated: a glitch, a doubled key event). */
export const TOO_FAST_LIMIT = 3;

/** Right answers the evenness check needs before it says anything. */
export const EVEN_MIN_RIGHT = 15;

/** The least coefficient of variation of `ms / par` a human run shows. */
export const MIN_TIME_SPREAD = 0.05;

/** A perfect run with a mean answer under this is looked at by a moderator. */
export const REVIEW_AVG_MS = 450;

/** A learner's ranked perfect runs within `REVIEW_WINDOW_DAYS` that ask for a look. */
export const REVIEW_PERFECT_RUNS = 3;
export const REVIEW_WINDOW_DAYS = 7;

export const UNRANKED_REASONS = ['no-start', 'clock', 'too-fast', 'too-even'] as const;
export type UnrankedReason = (typeof UNRANKED_REASONS)[number];

export function isUnrankedReason(s: unknown): s is UnrankedReason {
  return typeof s === 'string' && (UNRANKED_REASONS as readonly string[]).includes(s);
}

export type BoardVerdict =
  | {
      ranked: true;
      reason: null;
    }
  | {
      ranked: false;
      reason: UnrankedReason;
    };

const RANKED: BoardVerdict = {
  ranked: true,
  reason: null,
};

/** The played prompts' answer times added up (skipped prompts have none). */
export function sumPlayedMs(results: readonly PromptResult[]): number {
  let sum = 0;
  for (const r of results) if (!r.skipped && r.ms !== null) sum += r.ms;
  return sum;
}

function isRight(r: PromptResult): r is PromptResult & {
  ms: number;
} {
  return r.correct && !r.skipped && r.ms !== null;
}

/** Whether a right answer was faster than a human floor. */
export function tooFastPrompt(r: PromptResult): boolean {
  if (!isRight(r)) return false;
  if (r.kind === 'bar') {
    const first = r.noteMs[0] ?? r.ms;
    if (first < MIN_ANSWER_MS.bar) return true;
    const gaps = r.noteMs.slice(1);
    const implausible = gaps.filter((gap) => gap < MIN_BAR_GAP_MS).length;
    return gaps.length > 0 && implausible * 2 > gaps.length;
  }
  return r.ms < MIN_ANSWER_MS[r.kind];
}

/** The coefficient of variation of the right answers' `ms / par`; null below `EVEN_MIN_RIGHT`. */
export function timeSpread(results: readonly PromptResult[]): number | null {
  const ratios = results.filter(isRight).map((r) => r.ms / parMs(r.kind, r.kind === 'bar' ? BAR_NOTES : 1));
  if (ratios.length < EVEN_MIN_RIGHT) return null;
  const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
  if (mean <= 0) return 0;
  const variance = ratios.reduce((a, x) => a + (x - mean) ** 2, 0) / ratios.length;
  return Math.sqrt(variance) / mean;
}

/**
 * Whether a checked daily run may be ranked. `elapsedMs` is the time from the run's recorded start
 * to the save, or null when the start never reached the server.
 */
export function judgeDailyRun(results: readonly PromptResult[], elapsedMs: number | null): BoardVerdict {
  if (elapsedMs === null)
    return {
      ranked: false,
      reason: 'no-start',
    };
  if (sumPlayedMs(results) > elapsedMs + CLOCK_SLACK_MS)
    return {
      ranked: false,
      reason: 'clock',
    };
  if (results.filter(tooFastPrompt).length >= TOO_FAST_LIMIT)
    return {
      ranked: false,
      reason: 'too-fast',
    };
  const spread = timeSpread(results);
  if (spread !== null && spread < MIN_TIME_SPREAD)
    return {
      ranked: false,
      reason: 'too-even',
    };
  return RANKED;
}

/**
 * Whether a ranked run asks for a moderator's look (an `[Auto]` report; the run stays up).
 * `perfectInWindow` counts the learner's ranked 100s in the last `REVIEW_WINDOW_DAYS`, this one
 * included.
 */
export function needsReview(run: Pick<RunSummary, 'score' | 'avgMs'>, perfectInWindow: number): boolean {
  if (run.score !== 100) return false;
  if (run.avgMs !== null && run.avgMs < REVIEW_AVG_MS) return true;
  return perfectInWindow >= REVIEW_PERFECT_RUNS;
}
