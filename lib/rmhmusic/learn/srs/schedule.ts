/**
 * Spaced-repetition scheduler for note cards ("FSRS-lite").
 *
 * A deliberately small model with three numbers per card. It borrows the idea
 * of separate stability and difficulty from FSRS but none of its fitted
 * constants: the numbers below are hand-picked, simple to reason about, and
 * only meant to space a handful of staff-reading cards sensibly.
 *
 *   stability   S, in days. Roughly "how long until I would likely forget this
 *               card". It is also the interval the card is next shown after.
 *               0 means never successfully reviewed.
 *   difficulty  D, in [1, 10], starting at 5. How hard this card is for this
 *               learner. It moves a little on every review (again +1,
 *               hard +0.4, good -0.2, easy -0.5) and damps or boosts growth.
 *
 * On a review with grade g at time `now`:
 *
 *   again  The learner missed it. S falls to 30% of its old value (so it is
 *          no larger; equal only at S = 0), the card comes back after
 *          MIN_INTERVAL_DAYS (~15 minutes), and it counts as a lapse only if
 *          the card had been successfully reviewed (S > 0): a card that was
 *          never remembered has nothing to forget, however many times it was
 *          missed. (A missed card keeps S > 0 afterwards, so missing a
 *          remembered card twice in a row is two lapses.)
 *   others S grows: S' = base * (1 + (F_g - 1) * k_D * k_t), where
 *            base = max(S, 1 day) (so a lapsed or brand-new card restarts
 *                   from a one-day footing, not from minutes),
 *            F_g  = grade factor: hard 1.2, good 2.2, easy 3.5,
 *            k_D  = 1 - 0.05 * (D - 5), in [0.75, 1.2]: harder cards grow
 *                   less, easier ones more (uses D before this review),
 *            k_t  = elapsed / base clamped to [0.5, 1.5]: reviewing early
 *                   earns less growth, reviewing late a little more. Fixed
 *                   at 1 for a card with no prior review.
 *          Because (F_g - 1) > 0 and k_D, k_t > 0, S' > base for every
 *          non-again grade, and easy > good > hard from the same state.
 *
 * The interval used for `due` is clamp(S', MIN_INTERVAL_DAYS, MAX_INTERVAL_DAYS)
 * days after `now`, and S' itself is capped at MAX_INTERVAL_DAYS.
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
/** About 15 minutes: when a missed card comes back. */
export const MIN_INTERVAL_DAYS = 0.01;
export const MAX_INTERVAL_DAYS = 365;
/** A review this far ahead of `now` means the clock was wrong when it was written. */
export const CLOCK_SKEW_TOLERANCE_MS = DAY_MS;

const GRADE_FACTOR = { hard: 1.2, good: 2.2, easy: 3.5 } as const;
const DIFFICULTY_DELTA: Record<Grade, number> = {
  again: 1,
  hard: 0.4,
  good: -0.2,
  easy: -0.5,
};
const DEFAULT_DIFFICULTY = 5;
const MIN_DIFFICULTY = 1;
const MAX_DIFFICULTY = 10;
/** Weight of (difficulty - 5) in the growth damping. */
const DIFFICULTY_WEIGHT = 0.05;
/** What a lapse leaves of the old stability. */
const LAPSE_KEEP = 0.3;
/** Growth starts from at least a day, so relearned cards do not crawl. */
const BASE_STABILITY_DAYS = 1;
const TIMING_MIN = 0.5;
const TIMING_MAX = 1.5;

/** Clamp that maps NaN to `fallback` (so every output is a real number). */
// eslint-disable-next-line no-restricted-syntax -- clamp with a NaN fallback argument
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
    difficulty: fin(s.difficulty)
      ? clamp(s.difficulty, MIN_DIFFICULTY, MAX_DIFFICULTY)
      : DEFAULT_DIFFICULTY,
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
  return { due: now, stability: 0, difficulty: DEFAULT_DIFFICULTY, reps: 0, lapses: 0, last: null };
}

export function review(s: CardState, grade: Grade, now: number): CardState {
  assertNow(now);
  if (!Object.prototype.hasOwnProperty.call(DIFFICULTY_DELTA, grade)) {
    throw new RangeError(`unknown grade ${String(grade)}`);
  }
  const c = sanitize(s);
  const difficulty = clamp(
    c.difficulty + DIFFICULTY_DELTA[grade],
    MIN_DIFFICULTY,
    MAX_DIFFICULTY,
    DEFAULT_DIFFICULTY,
  );
  const reps = c.reps + 1;

  let stability: number;
  let lapses = c.lapses;
  if (grade === 'again') {
    stability = c.stability * LAPSE_KEEP;
    if (c.stability > 0) lapses += 1;
  } else {
    const base = Math.max(c.stability, BASE_STABILITY_DAYS);
    // `now - last` can be Infinity or negative for wild clocks; clamp handles both.
    const elapsedDays = c.last === null ? 0 : Math.max(0, now - c.last) / DAY_MS;
    const timing = c.last === null ? 1 : clamp(elapsedDays / base, TIMING_MIN, TIMING_MAX, 1);
    const difficultyTerm = 1 - DIFFICULTY_WEIGHT * (c.difficulty - DEFAULT_DIFFICULTY);
    stability = clamp(
      base * (1 + (GRADE_FACTOR[grade] - 1) * difficultyTerm * timing),
      0,
      MAX_INTERVAL_DAYS,
    );
  }

  const intervalDays = clamp(stability, MIN_INTERVAL_DAYS, MAX_INTERVAL_DAYS);
  const reviewed = grade === 'again' ? MIN_INTERVAL_DAYS : intervalDays;
  return {
    due: now + reviewed * DAY_MS,
    stability,
    difficulty,
    reps,
    lapses,
    last: now,
  };
}

export function isDue(s: CardState, now: number): boolean {
  assertNow(now);
  return effectiveDue(s, now) <= now;
}

/**
 * The cards due at `now`, most overdue first (new cards count as zero overdue,
 * so they follow the genuinely overdue ones, in input order), at most `limit`.
 */
export function dueCards<T extends { state: CardState }>(
  cards: T[],
  now: number,
  limit: number,
): T[] {
  assertNow(now);
  const max = Number.isNaN(limit) ? 0 : Math.floor(Math.max(0, limit));
  if (max === 0) return [];
  return cards
    .map((card, index) => ({ card, index, due: effectiveDue(card.state, now) }))
    .filter((e) => e.due <= now)
    .sort((a, b) => a.due - b.due || a.index - b.index)
    .slice(0, max)
    .map((e) => e.card);
}
