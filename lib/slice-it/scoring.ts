/**
 * Slice It — scoring rules, shared by the engine and by the score endpoint.
 *
 * The engine computes a score; the API has to decide whether to believe it.
 * Both halves reading the same constants is what makes the second question
 * answerable at all — before this, `/api/slice-it/score` accepted any number
 * under a billion, which is to say it accepted anything.
 */

import {
  ACCURACY_WEIGHTS,
  BOMB_PENALTY,
  DIFFICULTY_MULTIPLIERS,
  GRADE_THRESHOLDS,
  HIT_POINTS,
  HIT_WINDOWS,
  HOLD_TICK_POINTS_PER_SECOND,
  LENIENT_TIMING_FACTOR,
  MODIFIER_BONUSES,
  SPEED_BONUS_PER_X,
  STRICT_TIMING_FACTOR,
  type Difficulty,
  type HitResult,
} from './constants';
import type { Modifiers } from './types';

/** Run-state the multiplier depends on but the modifier set cannot express. */
export interface ScoreMultiplierOptions {
  /**
   * True once the opt-in health gauge has drained to zero this run.
   *
   * Only the engine can know this, and only the engine passes it. The server
   * deliberately does **not**: its job is to compute a *ceiling*, and the
   * ceiling for a run that declared `healthGauge` is the version where the
   * gauge held. Passing the flag server-side would tighten the bound below what
   * an honest run can score and reject it.
   */
  gaugeBroken?: boolean;
}

/**
 * The multiplier a run's settings are worth.
 *
 * Difficulty multiplies; individual modifiers add. See
 * {@link MODIFIER_BONUSES} for why.
 */
export function calculateScoreMultiplier(
  modifiers: Partial<Modifiers> | null | undefined,
  options?: ScoreMultiplierOptions,
): number {
  if (!modifiers) return 1;

  const difficulty = (modifiers.difficulty ?? 'normal') as Difficulty;
  let mult = DIFFICULTY_MULTIPLIERS[difficulty] ?? DIFFICULTY_MULTIPLIERS.normal;

  if (modifiers.invisible) mult += MODIFIER_BONUSES.invisible;
  if (modifiers.bombs) mult += MODIFIER_BONUSES.bombs;
  if (modifiers.switching) mult += MODIFIER_BONUSES.switching;
  if (modifiers.spin) mult += MODIFIER_BONUSES.spin;
  if (modifiers.strictTiming) mult += MODIFIER_BONUSES.strictTiming;
  if (modifiers.oneTrack) mult += MODIFIER_BONUSES.oneTrack;
  // A broken gauge forfeits the bonus, not the run. Everything the run scored
  // before it broke keeps the higher multiplier — the points are already banked
  // — which is the same shape as a combo: you lose it going forward.
  if (modifiers.healthGauge && !options?.gaugeBroken) mult += MODIFIER_BONUSES.healthGauge;
  // M6 — no `gaugeBroken`-style forfeit here: Perfectionist doesn't have a
  // partial-failure state to fall out of. The run either holds PERFECT-or-
  // better the whole way and banks the bonus, or it ends the instant it
  // doesn't — there is no "broken but still playing" middle state to price.
  if (modifiers.perfectionist) mult += MODIFIER_BONUSES.perfectionist;
  // A9 — deliberately no `lenientTiming` branch. See the constant's own doc
  // comment in `constants.ts`: an unranked, easier window earns nothing.

  const speed =
    typeof modifiers.speed === 'number' && Number.isFinite(modifiers.speed) ? modifiers.speed : 1;
  if (speed > 1) mult += (speed - 1) * SPEED_BONUS_PER_X;

  return mult;
}

/**
 * The hit-window scale a run's settings imply, in seconds-per-second.
 *
 * A9 — Strict and Lenient are opposite ends of one knob and `applyExclusions`
 * (`modifiers.ts`) already keeps a stored modifier set from holding both, but
 * this reads the raw flags rather than trusting that upstream cleanup ran —
 * strict wins on a tie, the same call `applyExclusions` makes, so the two
 * never disagree about what a `{ strictTiming: true, lenientTiming: true }`
 * blob actually plays like.
 */
export function timingScale(
  modifiers: Pick<Modifiers, 'strictTiming' | 'lenientTiming' | 'speed'>,
): number {
  const factor = modifiers.strictTiming
    ? STRICT_TIMING_FACTOR
    : modifiers.lenientTiming
      ? LENIENT_TIMING_FACTOR
      : 1;
  const speed = Number.isFinite(modifiers.speed) && modifiers.speed > 0 ? modifiers.speed : 1;
  return factor * speed;
}

/**
 * Judge an input by how far it landed from the note, in seconds.
 *
 * Never returns `NONE` — that judgement exists only for an unresolved note's
 * initial state, not as an outcome of measuring an offset — so the return
 * type says so. `Exclude<HitResult, 'NONE'>` narrower than the callers that
 * take a full `HitResult` (`resolve`, `verify.server.ts`) is what lets a
 * caller index a `Record<Exclude<HitResult, 'NONE'>, number>` judgement
 * histogram straight off this result without an extra runtime guard.
 */
export function judge(deltaSeconds: number, scale: number): Exclude<HitResult, 'NONE'> {
  const diff = Math.abs(deltaSeconds);
  if (diff <= HIT_WINDOWS.MARVELOUS * scale) return 'MARVELOUS';
  if (diff <= HIT_WINDOWS.PERFECT * scale) return 'PERFECT';
  if (diff <= HIT_WINDOWS.GREAT * scale) return 'GREAT';
  if (diff <= HIT_WINDOWS.GOOD * scale) return 'GOOD';
  if (diff <= HIT_WINDOWS.BAD * scale) return 'BAD';
  return 'MISS';
}

/** Points a judgement is worth at a given combo and multiplier. */
export function pointsFor(result: HitResult, combo: number, multiplier: number): number {
  if (result === 'MISS' || result === 'NONE') return 0;
  const base = HIT_POINTS[result];
  return Math.floor(base * (combo > 0 ? combo : 1) * multiplier);
}

/** Accuracy weight of a judgement, out of 100. */
export function accuracyWeight(result: HitResult): number {
  return result === 'NONE' ? 0 : ACCURACY_WEIGHTS[result];
}

/** `0` when nothing has been judged yet, so a fresh run reads 0% not NaN. */
export function accuracyOf(hitPoints: number, notesResolved: number): number {
  if (notesResolved <= 0) return 0;
  return Math.max(0, Math.min(1, hitPoints / (notesResolved * 100)));
}

/** Letter grade for an accuracy in 0–1. */
export function gradeFor(accuracy: number): string {
  for (const { grade, min } of GRADE_THRESHOLDS) {
    if (accuracy >= min) return grade;
  }
  return 'F';
}

/**
 * The next grade up from an accuracy, or null once there is nothing above.
 *
 * `GRADE_THRESHOLDS.find((g) => g.min > accuracy)` is the obvious spelling and
 * it is wrong: the list is ordered highest-first, so it answers "SS" for every
 * accuracy below 1.0. What is wanted is the *lowest* threshold still out of
 * reach.
 */
export function nextGradeAbove(accuracy: number): { grade: string; min: number } | null {
  const value = Number.isFinite(accuracy) ? accuracy : 0;
  let best: { grade: string; min: number } | null = null;
  for (const tier of GRADE_THRESHOLDS) {
    if (tier.min > value && (best === null || tier.min < best.min)) best = tier;
  }
  return best;
}

/**
 * How many more notes this run may drop entirely and still land at
 * `targetAccuracy`.
 *
 * Accuracy is `hitPoints / (notes * 100)`, so with `total - resolved` notes left
 * the best still-reachable total is `hitPoints + remaining * 100`. Every MISS
 * from here costs a full 100 of that budget, so the answer is how much slack the
 * budget has over the target, in units of 100.
 *
 * Returns null when the chart's note count is unknown — a "0 misses left"
 * readout that is really "we do not know" is worse than no readout.
 */
export function missesAllowedFor(
  hitPoints: number,
  notesResolved: number,
  totalNotes: number,
  targetAccuracy: number,
): number | null {
  if (!Number.isFinite(totalNotes) || totalNotes <= 0) return null;
  const resolved = Math.max(0, Math.min(totalNotes, notesResolved));
  const best = hitPoints + (totalNotes - resolved) * 100;
  return Math.max(0, Math.floor((best - targetAccuracy * totalNotes * 100) / 100));
}

/* ─── Server-side plausibility ───────────────────────────────────────────── */

/**
 * The most notes a generated chart could hold per second of audio.
 *
 * `BeatDetector` quantises onsets to a BPM-derived grid and the Expert pass
 * roughly doubles the density of that grid. At the top of the range that lands
 * near 16 notes/second; 20 leaves headroom for a chart we have not seen without
 * making the bound meaningless.
 */
export const MAX_NOTES_PER_SECOND = 20;

/**
 * An upper bound on the score a run of this length could possibly produce.
 *
 * Not a simulation and not meant to be tight — it is the line between "an
 * exceptional run" and "a number typed into a fetch call". Score is
 * `points × combo × multiplier` summed over notes, so a flawless run's combo
 * is `1..N` and the sum is the triangular number: `250 × mult × N(N+1)/2`.
 * Everything else (hold releases, hold ticks) is smaller and folded in
 * generously.
 *
 * Callers pass the song's own duration, which the server reads from the `Song`
 * row rather than from the submission — the client does not get to declare how
 * long the song it just played was.
 */
export function maxPlausibleScore(
  durationSeconds: number,
  modifiers: Partial<Modifiers> | null | undefined,
): number {
  const duration = Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : 0;
  // A zero-duration or absent song still gets a floor, so a legitimate score on
  // a row with bad metadata is not rejected outright.
  const notes = Math.max(64, Math.ceil(duration * MAX_NOTES_PER_SECOND));
  const mult = calculateScoreMultiplier(modifiers);

  /**
   * `notes` is already a generous cap on judged instants, not just note
   * objects: `MAX_NOTES_PER_SECOND` (16-20/s) is well above what the analyser
   * or any real chart produces, specifically so the ceiling has headroom to
   * spare. G5 spends a slice of that headroom rather than needing more of
   * it — a hold's RELEASE is judged through the same `judge()`/`pointsFor()`
   * path as its head (`RELEASE_WINDOW_SCALE` in `constants.ts`), so it is
   * one more combo-scaled MARVELOUS-shaped judgement, exactly the kind this
   * chain already prices in bulk. A chart with `k` real notes and every one
   * of them a LONG note reports `notesResolved` up to `2k` — but `notes` here
   * is calibrated at 16-20 judged instants *per second*, and no chart, LONG
   * notes or not, reaches that; there is no realistic `k` for which `2k`
   * approaches `notes`. Doubling this term to cover a chart that is
   * *simultaneously* at maximum tap density *and* entirely LONG notes would be
   * bounding a shape no chart can be, not the shape G5 actually changed.
   */
  const perfectChain = HIT_POINTS.MARVELOUS * ((notes * (notes + 1)) / 2);
  // Hold ticks accrue per second of audio, so the bound is "the entire song was
  // one held note at the maximum combo". This used to be modelled per rendered
  // frame at 120 fps — which the engine really did do, and which made the whole
  // ceiling about 120x looser than it needed to be.
  const holdTicks = HOLD_TICK_POINTS_PER_SECOND * duration * notes;

  return Math.ceil((perfectChain + holdTicks) * mult);
}

/**
 * The most combo a run of this length could reach — one per note, no misses.
 */
export function maxPlausibleCombo(durationSeconds: number): number {
  const duration = Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : 0;
  return Math.max(64, Math.ceil(duration * MAX_NOTES_PER_SECOND));
}

/** Bomb penalty, exported so the engine and any future replay check agree. */
export { BOMB_PENALTY };
