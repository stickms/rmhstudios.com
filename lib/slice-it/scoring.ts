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
  HOLD_RELEASE_POINTS,
  MODIFIER_BONUSES,
  SPEED_BONUS_PER_X,
  STRICT_TIMING_FACTOR,
  type Difficulty,
  type HitResult,
} from './constants';
import type { Modifiers } from './types';

/**
 * The multiplier a run's settings are worth.
 *
 * Difficulty multiplies; individual modifiers add. See
 * {@link MODIFIER_BONUSES} for why.
 */
export function calculateScoreMultiplier(modifiers: Partial<Modifiers> | null | undefined): number {
  if (!modifiers) return 1;

  const difficulty = (modifiers.difficulty ?? 'normal') as Difficulty;
  let mult = DIFFICULTY_MULTIPLIERS[difficulty] ?? DIFFICULTY_MULTIPLIERS.normal;

  if (modifiers.invisible) mult += MODIFIER_BONUSES.invisible;
  if (modifiers.bombs) mult += MODIFIER_BONUSES.bombs;
  if (modifiers.switching) mult += MODIFIER_BONUSES.switching;
  if (modifiers.spin) mult += MODIFIER_BONUSES.spin;
  if (modifiers.strictTiming) mult += MODIFIER_BONUSES.strictTiming;
  if (modifiers.oneTrack) mult += MODIFIER_BONUSES.oneTrack;

  const speed = typeof modifiers.speed === 'number' && Number.isFinite(modifiers.speed)
    ? modifiers.speed
    : 1;
  if (speed > 1) mult += (speed - 1) * SPEED_BONUS_PER_X;

  return mult;
}

/** The hit-window scale a run's settings imply, in seconds-per-second. */
export function timingScale(modifiers: Pick<Modifiers, 'strictTiming' | 'speed'>): number {
  const strict = modifiers.strictTiming ? STRICT_TIMING_FACTOR : 1;
  const speed = Number.isFinite(modifiers.speed) && modifiers.speed > 0 ? modifiers.speed : 1;
  return strict * speed;
}

/** Judge an input by how far it landed from the note, in seconds. */
export function judge(deltaSeconds: number, scale: number): HitResult {
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

  const perfectChain = HIT_POINTS.MARVELOUS * ((notes * (notes + 1)) / 2);
  const holdReleases = HOLD_RELEASE_POINTS * notes;
  // Hold ticks accrue per rendered frame while a LONG note is held. Bounded by
  // "every frame of the song is a held note at max combo", at 120 fps.
  const holdTicks = 120 * duration * notes;

  return Math.ceil((perfectChain + holdReleases + holdTicks) * mult);
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
