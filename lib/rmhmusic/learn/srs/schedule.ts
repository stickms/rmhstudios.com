/**
 * Spaced-repetition scheduler for every RMH Music drill, on FSRS-6 (`fsrs.ts`).
 *
 * A card keeps the two numbers FSRS needs — stability (days until recall falls to 90%) and
 * difficulty (1–10) — plus when it was last reviewed and when it is next due. On a review with
 * grade g at time `now`:
 *
 *   elapsed  days since the last review (0 for a card never reviewed, and for a clock that went
 *            backwards), which fixes the recall chance R the learner actually had;
 *   memory   FSRS's new stability and difficulty from (D, S, R, g); a card with stability 0 has
 *            never been remembered and starts from the first-review values for g;
 *   due      `again` comes back after MIN_INTERVAL_DAYS (10 minutes); anything else after the
 *            number of whole days at which recall would fall to the learner's retention target
 *            (`retention`, 90% unless the learner chose another, `practice-settings.ts`), at least
 *            one day and at most MAX_INTERVAL_DAYS.
 *
 * Stored rows from the earlier hand-tuned scheduler ("FSRS-lite") keep the same two columns on
 * the same scales (stability in days, difficulty 1–10), so they are read as FSRS memory as they
 * are; no migration is needed, and the first review after the switch simply uses the new curve.
 * A lapse is a miss on a card whose stability had reached a day (it had graduated); a miss while
 * still learning is not one.
 *
 * Totality. Elapsed time is max(0, now - last), so a clock that went
 * backwards counts as zero elapsed and `due` is always `>= now`. `now` itself
 * must be a finite number and `grade` one of the four grades, or a RangeError
 * is thrown; everything else is repaired rather than trusted: a stored state
 * with NaN/Infinity/out-of-range fields is replaced field by field by safe
 * defaults, and a never-seen card (reps = 0) is "new" and due immediately
 * however stale its stored `due`.
 *
 * Clock that was once ahead. `due` is an absolute time, so a review written
 * while the device clock ran ahead stores a `due` that is ahead too. The
 * scheduler cannot know when the clock was corrected (it keeps no state beyond
 * the card), but it can see the symptom: `last` is later than `now`. Such a
 * card is treated as due now (so it is re-asked and re-anchored by the next
 * review) once `last` is more than CLOCK_SKEW_TOLERANCE_MS ahead of `now`;
 * within the tolerance (ordinary cross-device skew) the stored `due` is used
 * as written. What is protected: after the clock is corrected a card is
 * shown at most once early, instead of being hidden for as long as the clock
 * was ahead. What is not: a card whose clock was ahead by less than the
 * tolerance may be delayed by up to that tolerance, and a card with
 * reps > 0 but no `last` (stored state incomplete) is shown rather than
 * hidden.
 *
 * Corrupted `due`. When the stored `due` is used it is bounded to
 * `last + MAX_INTERVAL_DAYS`, the furthest `review()` ever writes, so a
 * hand-edited or corrupted row (say due = 1e15 beside a valid `last`) is
 * still shown within a year of its last review instead of never. This can
 * never shorten a legitimate interval. What it does not cover: a clock that
 * was far ahead when `last` was written, which the skew rule above handles.
 */

import { AGAIN, EASY, GOOD, HARD, intervalFor, nextMemory, retrievability, type Rating } from './fsrs';
import { DEFAULT_RETENTION, clampRetention } from './practice-settings';

export type Grade = 'again' | 'hard' | 'good' | 'easy';

export interface CardState {
  /** Epoch ms the card is next due. */
  due: number;
  /** Days. 0 until the first successful review. */
  stability: number;
  /** 1 (easy) to 10 (hard). */
  difficulty: number;
  reps: number;
  lapses: number;
  /** Epoch ms of the last review, or null for a card never reviewed. */
  last: number | null;
}

export const DAY_MS = 86_400_000;
/** 10 minutes: when a missed card comes back. */
export const MIN_INTERVAL_DAYS = 10 / 1440;
export const MAX_INTERVAL_DAYS = 365;
/** A review this far ahead of `now` means the clock was wrong when it was written. */
export const CLOCK_SKEW_TOLERANCE_MS = DAY_MS;

const RATING: Record<Grade, Rating> = {
  again: AGAIN,
  hard: HARD,
  good: GOOD,
  easy: EASY,
};
const DEFAULT_DIFFICULTY = 5;
const MIN_DIFFICULTY = 1;
const MAX_DIFFICULTY = 10;
/** A card whose stability has reached this many days has graduated: missing it is a lapse. */
const LAPSE_STABILITY_DAYS = 1;
/** A remembered card is never shown again sooner than this (FSRS rounds to whole days). */
const MIN_PASS_INTERVAL_DAYS = 1;

/** Clamp that maps NaN to `fallback` (so every output is a real number). */
// eslint-disable-next-line local/no-core-primitive-redefinition -- clamp with a NaN fallback argument
function clamp(n: number, lo: number, hi: number, fallback = lo): number {
  if (Number.isNaN(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
}

function assertNow(now: number): void {
  if (typeof now !== 'number' || !Number.isFinite(now)) {
    throw new RangeError(`now must be a finite number, got ${String(now)}`);
  }
}

function count(n: unknown): number {
  return typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

/** Make a stored state safe to compute with, whatever was persisted. */
function sanitize(s: CardState): CardState {
  const fin = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
  return {
    due: fin(s.due) ? s.due : 0,
    stability: fin(s.stability) ? clamp(s.stability, 0, MAX_INTERVAL_DAYS) : 0,
    difficulty: fin(s.difficulty) ? clamp(s.difficulty, MIN_DIFFICULTY, MAX_DIFFICULTY) : DEFAULT_DIFFICULTY,
    reps: count(s.reps),
    lapses: count(s.lapses),
    last: fin(s.last) ? s.last : null,
  };
}

/**
 * The due time to compare against `now`. New cards, a reviewed card that lost
 * its `last` (only corruption produces that: show it rather than hide it) and
 * a card whose review lies more than CLOCK_SKEW_TOLERANCE_MS in the future
 * (the clock was ahead when it was written, see the header) are due now.
 * Otherwise the stored `due` stands, bounded to `last + MAX_INTERVAL_DAYS`
 * (the furthest `review()` writes) so a corrupted `due` cannot hide the card.
 */
function effectiveDue(s: CardState, now: number): number {
  const c = sanitize(s);
  if (c.reps === 0 || c.last === null) return now;
  if (c.last - now > CLOCK_SKEW_TOLERANCE_MS) return now;
  return Math.min(c.due, c.last + MAX_INTERVAL_DAYS * DAY_MS);
}

export function newCard(now: number): CardState {
  assertNow(now);
  return {
    due: now,
    stability: 0,
    difficulty: DEFAULT_DIFFICULTY,
    reps: 0,
    lapses: 0,
    last: null,
  };
}

export function review(s: CardState, grade: Grade, now: number, retention: number = DEFAULT_RETENTION): CardState {
  assertNow(now);
  if (!Object.prototype.hasOwnProperty.call(RATING, grade)) {
    throw new RangeError(`unknown grade ${String(grade)}`);
  }
  const rating = RATING[grade];
  const c = sanitize(s);
  const elapsedDays = c.last === null ? 0 : Math.max(0, now - c.last) / DAY_MS;
  // A card that was never remembered (stability 0) starts the memory afresh, whatever else is stored.
  const memory = nextMemory(
    c.stability > 0 ? { stability: c.stability, difficulty: c.difficulty } : null,
    elapsedDays,
    rating,
  );
  const stability = clamp(memory.stability, 0, MAX_INTERVAL_DAYS);
  // A miss on a card that had graduated (its stability had reached a day) is a lapse; a miss while
  // still learning it is not.
  const lapses = grade === 'again' && c.stability >= LAPSE_STABILITY_DAYS ? c.lapses + 1 : c.lapses;
  const days =
    grade === 'again'
      ? MIN_INTERVAL_DAYS
      : clamp(Math.round(intervalFor(stability, clampRetention(retention))), MIN_PASS_INTERVAL_DAYS, MAX_INTERVAL_DAYS);
  return {
    due: now + days * DAY_MS,
    stability,
    difficulty: memory.difficulty,
    reps: c.reps + 1,
    lapses,
    last: now,
  };
}

/**
 * The chance the learner would recall the card at `now` (FSRS retrievability), 0–1, or null for a
 * card never remembered. Total: a clock behind the last review counts as no time elapsed.
 */
export function recallChance(s: CardState, now: number): number | null {
  assertNow(now);
  const c = sanitize(s);
  if (c.reps === 0 || c.stability <= 0 || c.last === null) return null;
  return retrievability(Math.max(0, now - c.last) / DAY_MS, c.stability);
}

export function isDue(s: CardState, now: number): boolean {
  assertNow(now);
  return effectiveDue(s, now) <= now;
}

/**
 * The cards due at `now`, most overdue first (new cards count as zero overdue,
 * so they follow the genuinely overdue ones, in input order), at most `limit`.
 */
export function dueCards<
  T extends {
    state: CardState;
  },
>(cards: T[], now: number, limit: number): T[] {
  assertNow(now);
  const max = Number.isNaN(limit) ? 0 : Math.floor(Math.max(0, limit));
  if (max === 0) return [];
  return cards
    .map((card, index) => ({
      card,
      index,
      due: effectiveDue(card.state, now),
    }))
    .filter((e) => e.due <= now)
    .sort((a, b) => a.due - b.due || a.index - b.index)
    .slice(0, max)
    .map((e) => e.card);
}
