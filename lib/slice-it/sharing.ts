/**
 * Slice It — what is worth sharing, and what a flag is worth (`X5`, `R7`,
 * `X4`, `H10`).
 *
 * Three policies that all answer the same shape of question — *is this run
 * special enough to do something about* — and all three get it wrong in the
 * same way if written casually: by firing on something that happens every
 * session.
 *
 * Pure and browser-safe, so the results screen and the score route agree about
 * whether a run was noteworthy without asking each other.
 */

import { DIFFICULTY_MULTIPLIERS, type Difficulty } from './constants';

/* ─── X5 — posting a run to the feed ─────────────────────────────────────── */

export interface RunContext {
  isFirstClearOfChart: boolean;
  isPerfect: boolean;
  difficulty: Difficulty;
  /** Position on the chart's board, or null when unplaced. */
  globalRank: number | null;
  /** A new personal best. Deliberately NOT part of `isNoteworthy` — see below. */
  isPersonalBest: boolean;
}

/** Automatic posts allowed per player per day. */
export const MAX_AUTO_POSTS_PER_DAY = 2;

/**
 * Whether a run is rare enough to post about without being asked.
 *
 * **Rare means rare.** Three conditions, each true a handful of times per player
 * per year. `isPersonalBest` is deliberately excluded even though it is the
 * obvious candidate: a personal best happens every session, and a feature that
 * posts every session is how a feed gets muted — which costs the player every
 * future post too, including the ones they wanted.
 *
 * The whole feature is default-off regardless. This decides what an opted-in
 * player's automatic posts look like, not whether they happen.
 */
export function isNoteworthy(run: RunContext): boolean {
  if (run.isFirstClearOfChart) return true;
  if (run.isPerfect && run.difficulty === 'expert') return true;
  return run.globalRank !== null && run.globalRank <= 10;
}

/** Why it was posted, for the post's own copy. */
export function noteworthyReason(run: RunContext): string | null {
  if (run.isFirstClearOfChart) return 'first-clear';
  if (run.isPerfect && run.difficulty === 'expert') return 'perfect-expert';
  if (run.globalRank !== null && run.globalRank <= 10) return 'top-ten';
  return null;
}

export function shouldAutoPost(
  run: RunContext,
  options: { enabled: boolean; postsToday: number },
): boolean {
  if (!options.enabled) return false;
  if (options.postsToday >= MAX_AUTO_POSTS_PER_DAY) return false;
  return isNoteworthy(run);
}

/* ─── H10 — the shareable card ───────────────────────────────────────────── */

/**
 * Whether this run gets a card written for it.
 *
 * Only new bests. A card per run means a share URL per attempt and an OG render
 * queue full of runs nobody will ever look at — and the share button on a run
 * you have already beaten points at a worse version of your own score.
 */
export function shouldWriteCard(run: { isPersonalBest: boolean }): boolean {
  return run.isPersonalBest;
}

/* ─── X4 — battle pass XP ────────────────────────────────────────────────── */

/** XP for a run before the difficulty and accuracy weights. */
export const BASE_RUN_XP = 40;

/**
 * The floor on the accuracy weight.
 *
 * An XP formula that can return zero teaches players to quit a run the moment
 * it goes badly, which is the opposite of what a progression system is for. A
 * bad run on a hard chart still pays.
 */
export const MIN_ACCURACY_WEIGHT = 0.3;

/**
 * XP for one finished run.
 *
 * Weighted by accuracy so playing WELL is worth more than playing LONG — an XP
 * formula that scales with duration alone rewards finding the longest chart in
 * the library and idling through it.
 *
 * A failed run pays the floor rather than nothing, for the same reason the
 * accuracy weight has one.
 */
export function runXp(input: {
  difficulty: Difficulty;
  accuracy: number;
  failed: boolean;
}): number {
  const difficulty = DIFFICULTY_MULTIPLIERS[input.difficulty] ?? 1;
  const accuracy = Number.isFinite(input.accuracy) ? Math.max(0, Math.min(1, input.accuracy)) : 0;
  const weight = input.failed
    ? MIN_ACCURACY_WEIGHT
    : Math.max(MIN_ACCURACY_WEIGHT, accuracy);
  return Math.max(1, Math.round(BASE_RUN_XP * difficulty * weight));
}

/* ─── R7 — escalating a pattern, never a run ─────────────────────────────── */

/**
 * Suspicion above which a run enters the review queue.
 *
 * `integrity.ts` is explicit that its statistical layer flags and never
 * rejects, because "a false positive on a legitimate record run is worse than a
 * false negative on one cheated score". This threshold inherits that: it decides
 * what a moderator LOOKS at, and nothing here decides an outcome.
 */
export const REVIEW_SUSPICION = 0.8;

/**
 * Flagged runs in the window before a player is escalated.
 *
 * **A pattern, never one run.** A single tight-timing run is a player having a
 * very good night; five in a week is a program. This number is the whole
 * difference between a review queue and an accusation machine, and it is set
 * high deliberately — the cost of missing a cheater for another week is far
 * below the cost of accusing somebody who is simply good.
 */
export const ESCALATE_AFTER = 5;
export const ESCALATE_WINDOW_DAYS = 7;

export function shouldEscalate(recentFlagged: number): boolean {
  return recentFlagged >= ESCALATE_AFTER;
}

export function isFlagged(suspicion: number | null | undefined): boolean {
  return typeof suspicion === 'number' && suspicion > REVIEW_SUSPICION;
}
