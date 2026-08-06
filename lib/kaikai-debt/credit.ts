/**
 * RMH Capital's credit assessment of Kaikai — the arithmetic.
 *
 * Client-safe and pure, for the same reason `debt.ts` is: the score has to tick
 * in the browser and render a stable number during SSR, which only works if both
 * sides run the same function over the same inputs.
 *
 * ## It is derived, not stored
 *
 * There is no score column and no scoring job. The score is a pure function of
 * the debt, and the debt is already a pure function of the basis and the clock —
 * so the client can draw a live rating with no extra request, no second stream,
 * and no chance of the two numbers disagreeing. A score that came down its own
 * pipe could contradict the counter directly above it; this one cannot.
 *
 * ## Why the log
 *
 * ```
 *   score = 850 − 60 · log₁₀(1 + dollars)
 * ```
 *
 * Every **tenfold** increase in what he owes costs a fixed 60 points. That is the
 * only mapping that behaves at both ends of a debt designed to become absurd:
 * the first $100 and the first $100,000 are each worth two grades, so the rating
 * still moves when the pile is large instead of pinning at the floor in year one.
 *
 * It also makes the fall **linear in time**, which is a nicer property than it
 * looks. The debt compounds continuously, so `log₁₀(debt)` climbs at a constant
 * rate — meaning that with nobody adding anything, the score drops by the same
 * ~33 points every year, forever. The rating degrades like a clock, and reaching
 * the floor from a clean start takes about seventeen years of interest alone.
 * Anyone adding to his tab is what makes it happen sooner.
 *
 * ## The two ends
 *
 * `850` at zero debt: he has never owed anything, and the mapping says so
 * without a special case — `log₁₀(1 + 0)` is 0. `300` is a hard floor rather
 * than an asymptote, because a rating that reads `287.4` is a made-up scale and
 * the whole joke depends on it being the familiar one.
 */

import { debtVelocityCentsPerSecond, projectDebtCents } from './debt';

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

/** A clean borrower. What the score reads when the ledger is empty. */
export const CREDIT_SCORE_MAX = 850;

/**
 * The floor. Clamped, not asymptotic — see the module note: the scale is only
 * borrowed if it keeps the range everyone already knows.
 */
export const CREDIT_SCORE_MIN = 300;

/**
 * Points surrendered per tenfold increase in the debt.
 *
 * 60 is chosen so the interesting range is the interesting range: he passes out
 * of investment grade somewhere around $10k and hits the floor near $10^9. A
 * larger penalty pins the score at 300 while the counter is still funny; a
 * smaller one leaves him prime while owing a house.
 */
export const CREDIT_DECADE_PENALTY = 60;

/**
 * The rating bands, high to low, each keyed by the letter grade an agency would
 * print and a `tier` the UI translates.
 *
 * Letter grades are deliberately NOT translated — `AAA` is `AAA` in every
 * market, and localising it would invent a scale that does not exist. The
 * descriptor beside it is what gets translated.
 */
export const CREDIT_BANDS = [
  { min: 800, grade: 'AAA', tier: 'prime' },
  { min: 760, grade: 'AA', tier: 'prime' },
  { min: 720, grade: 'A', tier: 'prime' },
  { min: 680, grade: 'BBB', tier: 'investment' },
  { min: 640, grade: 'BB', tier: 'speculative' },
  { min: 580, grade: 'B', tier: 'speculative' },
  { min: 520, grade: 'CCC', tier: 'distressed' },
  { min: 460, grade: 'CC', tier: 'distressed' },
  { min: 400, grade: 'C', tier: 'distressed' },
  { min: -Infinity, grade: 'D', tier: 'default' },
] as const;

export type CreditTier = (typeof CREDIT_BANDS)[number]['tier'];

/* -------------------------------------------------------------------------- */
/* The arithmetic                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The score at a given total debt, as a float.
 *
 * Kept unrounded because the display shows a fractional tail — rounding here
 * would freeze the number between whole-point crossings, which on a rating that
 * moves ~33 points a year means a "live" readout that changes eleven times a
 * year.
 *
 * A negative total cannot happen (the counter only grows) but is floored anyway:
 * the alternative is `log₁₀` of a negative returning `NaN` and painting the
 * whole readout as garbage.
 */
export function creditScore(totalCents: number): number {
  if (!Number.isFinite(totalCents)) return CREDIT_SCORE_MAX;
  const dollars = Math.max(0, totalCents) / 100;
  const raw = CREDIT_SCORE_MAX - CREDIT_DECADE_PENALTY * Math.log10(1 + dollars);
  return Math.min(CREDIT_SCORE_MAX, Math.max(CREDIT_SCORE_MIN, raw));
}

/** The score implied by a basis at a moment — the form the live readout uses. */
export function projectCreditScore(basisCents: number, atMs: number): number {
  return creditScore(projectDebtCents(basisCents, atMs));
}

/**
 * How fast the rating is falling, in points per second (negative, or zero).
 *
 * Differentiating the mapping through the debt:
 *
 * ```
 *   d(score)/dt = −(P / ln 10) · (dD/dt) / (1 + D)
 * ```
 *
 * with `D` in dollars. Derived from {@link debtVelocityCentsPerSecond} rather
 * than re-deriving the growth rate, so the rating and the counter can never
 * quote inconsistent speeds.
 *
 * Returns **zero once the score is pinned at the floor**. The number has stopped
 * moving at that point, and prose still claiming "−33 points a year" beside a
 * readout frozen at 300 is a lie the page would tell forever.
 */
export function creditVelocityPointsPerSecond(basisCents: number, atMs: number): number {
  const totalCents = projectDebtCents(basisCents, atMs);
  if (!Number.isFinite(totalCents) || totalCents <= 0) return 0;
  if (creditScore(totalCents) <= CREDIT_SCORE_MIN) return 0;

  const dollars = totalCents / 100;
  const dollarsPerSecond = debtVelocityCentsPerSecond(basisCents, atMs) / 100;
  if (!Number.isFinite(dollarsPerSecond) || dollarsPerSecond <= 0) return 0;

  return -(CREDIT_DECADE_PENALTY / Math.LN10) * (dollarsPerSecond / (1 + dollars));
}

/** Mean Gregorian year in seconds. Only used to quote the rate per year. */
const SECONDS_PER_YEAR = 365.2425 * 24 * 60 * 60;

/**
 * The fall quoted per year — the one window that works at every scale.
 *
 * The debt's velocity readout has to widen its window from seconds to days
 * because the rate spans orders of magnitude. This one does not: the fall is
 * asymptotically constant (that is the point of the log), so a year is readable
 * whether he owes twelve dollars or twelve million. Returned positive, because
 * the string beside it already says the direction.
 */
export function creditPointsPerYear(basisCents: number, atMs: number): number {
  // `Math.abs` rather than a negation: the velocity is never positive, and
  // negating a zero yields `-0`, which formats as "-0.0" — a rate quoted with a
  // sign on a rating that is not moving at all.
  return Math.abs(creditVelocityPointsPerSecond(basisCents, atMs)) * SECONDS_PER_YEAR;
}

/** The band a score falls in. Never undefined — the last band's floor is `-Infinity`. */
export function creditBand(score: number): { grade: string; tier: CreditTier } {
  const band = CREDIT_BANDS.find((b) => score >= b.min) ?? CREDIT_BANDS[CREDIT_BANDS.length - 1];
  return { grade: band.grade, tier: band.tier };
}

/**
 * Fractional digits the rating shows, beyond the whole point.
 *
 * The same idea as `odometerDecimals` in `debt.ts` and for the same reason —
 * enough precision that the last digit turns a few times a second, so the
 * readout reads as *live* rather than as a static figure someone typed in. The
 * arithmetic differs, though: the debt accelerates, so its precision shrinks
 * over time, while the rating falls at a near-constant ~1e-6 points a second and
 * therefore sits at the cap essentially always.
 *
 * That cap is what makes this honest rather than absurd. Six columns is already
 * past the point of meaning anything about creditworthiness; the digits are
 * there to show the number is being computed, not to be read, which is exactly
 * how the sub-cent digits on the counter above work.
 *
 * Returns 0 when nothing is moving — a frozen `731.000000` claims a precision
 * the number does not have.
 */
export function creditScoreDecimals(basisCents: number, atMs: number): number {
  const speed = Math.abs(creditVelocityPointsPerSecond(basisCents, atMs));
  if (!Number.isFinite(speed) || speed <= 0) return 0;
  const needed = Math.ceil(Math.log10(TARGET_TICKS_PER_SECOND / speed));
  return Math.min(MAX_CREDIT_DECIMALS, Math.max(0, needed));
}

/** How often the last displayed digit should turn over, in Hz. Matches the counter's. */
const TARGET_TICKS_PER_SECOND = 4;

/** Six columns is the most that still reads as a number rather than as a hash. */
const MAX_CREDIT_DECIMALS = 6;

/**
 * `731.4829` → `"731"`. The whole points, which is the part anyone reads.
 *
 * Locale-independent for the same reason `formatDebt` is: this is a fixed-width
 * odometer, and a locale that groups or separates digits differently changes its
 * width mid-tick.
 */
export function formatCreditScore(score: number): string {
  return String(Math.floor(score));
}
