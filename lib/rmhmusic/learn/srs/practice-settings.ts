/**
 * The two knobs on how cards are scheduled and introduced — pure, client-safe.
 *
 *   retention   The recall chance a card is allowed to fall to before it comes back (FSRS's "desired
 *               retention"). Higher means shorter intervals and more reviews for a sturdier memory; lower
 *               means longer gaps and fewer reviews, with more forgetting. 0.9 is FSRS's own default.
 *   newPerDay   How many cards the learner has never been asked before Practice may introduce in a
 *               day (the last 24 hours). Cards that are due are never capped; this only stops a new
 *               learner being buried by the first session of the day, every day. 0 introduces none.
 *
 * Both are stored on the learner's profile (`MusicLearnProfile.retention`, `.newPerDay`).
 */

export const MIN_RETENTION = 0.8;
export const MAX_RETENTION = 0.95;
export const DEFAULT_RETENTION = 0.9;
/** The stepper moves in whole percent. */
export const RETENTION_STEP = 0.01;

export const MIN_NEW_PER_DAY = 0;
export const MAX_NEW_PER_DAY = 50;
export const DEFAULT_NEW_PER_DAY = 10;

/** A retention repaired into range and to whole percent; anything that is not a finite number is the default. */
export function clampRetention(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return DEFAULT_RETENTION;
  return Math.round(Math.min(MAX_RETENTION, Math.max(MIN_RETENTION, v)) * 100) / 100;
}

/** A new-cards-per-day allowance repaired into a whole number in range. */
export function clampNewPerDay(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return DEFAULT_NEW_PER_DAY;
  return Math.min(MAX_NEW_PER_DAY, Math.max(MIN_NEW_PER_DAY, Math.round(v)));
}

/** Retention as the percent a learner reads, 90. */
export function retentionPercent(retention: number): number {
  return Math.round(clampRetention(retention) * 100);
}
