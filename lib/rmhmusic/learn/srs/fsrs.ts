/**
 * FSRS-6 — the memory model under every RMH Music drill (staff cards, Sprint, ear training).
 *
 * A pure port of the published algorithm (open-spaced-repetition, FSRS-6 with its default
 * weights; no optimizer, no fuzz). Each item has two numbers:
 *
 *   stability S   days until the chance of recall falls to 90%. Grows with every successful
 *                 review, more when the review came late (the item was harder to recall) and less
 *                 for easy items; falls after a miss.
 *   difficulty D  1 (easy) … 10 (hard), pulled a little by every grade and back toward the
 *                 "easy" starting point, so one bad day does not brand a card for life.
 *
 * and the curve that ties them to time, retrievability R(t, S) = (1 + F·t/S)^-decay: the chance
 * the learner recalls the item `t` days after the last review. The next review is scheduled for
 * the day R falls to the desired retention (90%), which is `interval(S)`.
 *
 * `schedule.ts` wraps this in the stored card state (clock repair, clamps, due dates). Nothing here
 * reads a clock. Every function is total: a non-finite input is repaired, never thrown on, except a
 * grade outside the four, which is a programming error.
 */

export type Rating = 1 | 2 | 3 | 4;

export const AGAIN: Rating = 1;
export const HARD: Rating = 2;
export const GOOD: Rating = 3;
export const EASY: Rating = 4;

/** The review the learner wants to hit: the chance of recall on the day a card comes back. */
export const DESIRED_RETENTION = 0.9;

export const S_MIN = 0.001;
export const S_MAX = 36_500;

/** FSRS-6 default weights (w0–w3 initial stability, w4–w7 difficulty, … w20 the curve's decay). */
export const WEIGHTS: readonly number[] = [
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835,
  0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542,
];

const W = WEIGHTS as readonly [
  number, number, number, number, number, number, number, number, number, number, number,
  number, number, number, number, number, number, number, number, number, number,
];

const DECAY = -W[20];
const FACTOR = Math.exp(Math.log(0.9) / DECAY) - 1;

// eslint-disable-next-line no-restricted-syntax -- clamp with a NaN fallback argument (the stored state may be corrupt)
function clamp(n: number, lo: number, hi: number, fallback = lo): number {
  if (Number.isNaN(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
}

function assertRating(g: number): asserts g is Rating {
  if (g !== 1 && g !== 2 && g !== 3 && g !== 4) {
    throw new RangeError(`unknown rating ${String(g)}`);
  }
}

/** The chance of recalling an item `days` after its last review (1 right after, falling). */
export function retrievability(days: number, stability: number): number {
  const t = Number.isFinite(days) ? Math.max(0, days) : 0;
  const s = clamp(stability, S_MIN, S_MAX, S_MIN);
  return Math.pow(1 + (FACTOR * t) / s, DECAY);
}

/** Days until retrievability falls to `retention` (the interval to schedule). */
export function intervalFor(stability: number, retention = DESIRED_RETENTION): number {
  const s = clamp(stability, S_MIN, S_MAX, S_MIN);
  const r = clamp(retention, 0.01, 0.99, DESIRED_RETENTION);
  return (s / FACTOR) * (Math.pow(r, 1 / DECAY) - 1);
}

/** Stability after the very first review of an item. */
export function initStability(g: Rating): number {
  assertRating(g);
  return Math.max(W[g - 1]!, 0.1);
}

/** Difficulty after the very first review of an item. */
export function initDifficulty(g: Rating): number {
  return clamp(rawInitDifficulty(g), 1, 10);
}

/** The unclamped D0(g): mean reversion pulls toward the raw "easy" value, as the reference does. */
function rawInitDifficulty(g: Rating): number {
  assertRating(g);
  return W[4] - Math.exp((g - 1) * W[5]) + 1;
}

/** Difficulty after a review (linear damping near 10, mean reversion toward "easy"). */
export function nextDifficulty(d: number, g: Rating): number {
  assertRating(g);
  const cur = clamp(d, 1, 10, 5);
  const delta = -W[6] * (g - 3);
  const damped = cur + (delta * (10 - cur)) / 9;
  return clamp(W[7] * rawInitDifficulty(EASY) + (1 - W[7]) * damped, 1, 10);
}

/** Stability after a successful recall (hard, good or easy) at retrievability `r`. */
export function nextRecallStability(d: number, s: number, r: number, g: Rating): number {
  assertRating(g);
  const hardPenalty = g === HARD ? W[15] : 1;
  const easyBonus = g === EASY ? W[16] : 1;
  const out =
    s *
    (1 +
      Math.exp(W[8]) *
        (11 - d) *
        Math.pow(s, -W[9]) *
        (Math.exp((1 - r) * W[10]) - 1) *
        hardPenalty *
        easyBonus);
  return clamp(out, S_MIN, S_MAX, s);
}

/** Stability after a lapse (again) at retrievability `r`: lower than before, never above it. */
export function nextForgetStability(d: number, s: number, r: number): number {
  const afterFail = clamp(
    W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp((1 - r) * W[14]),
    S_MIN,
    S_MAX,
    S_MIN,
  );
  const floor = s / Math.exp(W[17] * W[18]);
  return clamp(floor, S_MIN, Math.max(S_MIN, afterFail), S_MIN);
}

/** Stability after a second review inside the same day (FSRS-6's short-term formula). */
export function nextShortTermStability(s: number, g: Rating): number {
  assertRating(g);
  const sinc = Math.pow(s, -W[19]) * Math.exp(W[17] * (g - 3 + W[18]));
  const masked = g >= HARD ? Math.max(sinc, 1) : sinc;
  return clamp(s * masked, S_MIN, S_MAX, s);
}

export interface Memory {
  stability: number;
  difficulty: number;
}

/**
 * The memory after a review: `prev` is null for an item never reviewed, `elapsedDays` the time
 * since its last review (0 if unknown). Returns the new stability and difficulty.
 */
export function nextMemory(prev: Memory | null, elapsedDays: number, g: Rating): Memory {
  assertRating(g);
  if (prev === null || !(prev.stability > 0)) {
    return { stability: initStability(g), difficulty: initDifficulty(g) };
  }
  const d = clamp(prev.difficulty, 1, 10, 5);
  const s = clamp(prev.stability, S_MIN, S_MAX, S_MIN);
  const t = Number.isFinite(elapsedDays) ? Math.max(0, elapsedDays) : 0;
  const r = retrievability(t, s);
  let stability: number;
  if (t < 1) stability = nextShortTermStability(s, g);
  else if (g === AGAIN) stability = nextForgetStability(d, s, r);
  else stability = nextRecallStability(d, s, r, g);
  return { stability, difficulty: nextDifficulty(d, g) };
}
