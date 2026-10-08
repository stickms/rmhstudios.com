/**
 * Ranked seasons (P5) — the calendar, placement and decay, as pure functions.
 *
 * ## What was wrong with a lifetime rating
 *
 * `EloRating` is one number per (user, game) that only ever moves when somebody
 * you already know accepts a `RankedChallenge`. It has no season, so a rating
 * earned in March and one earned last week are indistinguishable; no placement,
 * so a first match against a Master costs a beginner as much as it would cost a
 * Master; and no decay, so the ladder is a permanent record of whoever played
 * first. A ladder with those three properties is a leaderboard of tenure.
 *
 * ## Why seasons are derived, not stored
 *
 * A season is a function of the date, so there is no table of seasons to keep
 * in step with a clock, no row to forget to create, and no way for two services
 * to disagree about which season it is. The cost is that a season's length is a
 * constant rather than an admin control — worth it until somebody actually
 * wants to move one, at which point this becomes a table and the id stays the
 * same shape.
 *
 * Client-safe: a profile badge needs to say "Season 7" without asking a server.
 */

/** Seasons are eight weeks. Long enough to climb, short enough to matter. */
export const SEASON_LENGTH_DAYS = 56;

/**
 * Where season 1 began. Fixed forever — moving it renumbers every season that
 * has ever existed, including the ones printed on profiles.
 */
export const SEASON_EPOCH = Date.UTC(2026, 0, 5); // Monday 5 January 2026

const DAY_MS = 86_400_000;

/** The season number containing `at`. 1-based; never less than 1. */
export function seasonFor(at: Date = new Date()): number {
  const elapsed = at.getTime() - SEASON_EPOCH;
  if (elapsed < 0) return 1;
  return Math.floor(elapsed / (SEASON_LENGTH_DAYS * DAY_MS)) + 1;
}

/** When a season starts and ends (end exclusive). */
export function seasonWindow(season: number): { start: Date; end: Date } {
  const start = SEASON_EPOCH + (season - 1) * SEASON_LENGTH_DAYS * DAY_MS;
  return { start: new Date(start), end: new Date(start + SEASON_LENGTH_DAYS * DAY_MS) };
}

/** Fraction of the current season elapsed, 0–1. Drives the "ends in" chip. */
export function seasonProgress(at: Date = new Date()): number {
  const { start, end } = seasonWindow(seasonFor(at));
  const span = end.getTime() - start.getTime();
  return Math.min(1, Math.max(0, (at.getTime() - start.getTime()) / span));
}

/* -------------------------------------------------------------------------- */
/* Placement                                                                  */
/* -------------------------------------------------------------------------- */

/** Matches before a season rating is shown at all. */
export const PLACEMENT_MATCHES = 5;

/**
 * K-factor for a match, given how many placement matches remain.
 *
 * Wider during placement so five matches can actually find your level, then the
 * settled 32 the lifetime ladder already uses. Without this, placement is five
 * matches of moving 32 points from a fixed start, which finds nobody's level.
 */
export function kFactorFor(placementsLeft: number): number {
  return placementsLeft > 0 ? 64 : 32;
}

/** Is this rating still provisional (and therefore hidden from the ladder)? */
export function isProvisional(placementsLeft: number): boolean {
  return placementsLeft > 0;
}

/* -------------------------------------------------------------------------- */
/* Decay                                                                      */
/* -------------------------------------------------------------------------- */

/** Idle days before a high rating starts decaying. */
export const DECAY_AFTER_DAYS = 14;

/** Points shed per idle day past the threshold. */
export const DECAY_PER_DAY = 10;

/**
 * Only ratings above this decay at all.
 *
 * Decay exists so the top of a ladder reflects who is playing now, not who
 * played in week one. Applying it further down would punish someone for having
 * a life, and there is nothing at the bottom of a ladder worth protecting.
 */
export const DECAY_FLOOR = 1200;

/**
 * The rating after idling, and how much was shed.
 *
 * **Never below {@link DECAY_FLOOR}.** Decay is meant to vacate the top, not to
 * push somebody down through the tiers they earned.
 *
 * Deliberately a pure function of `(rating, idleDays)` rather than something
 * applied by a nightly job: computing it on read means there is no sweep to
 * fall behind, no window where two players' ratings were decayed on different
 * days, and no way for a job outage to silently freeze the ladder.
 */
export function applyDecay(
  rating: number,
  idleDays: number,
): { rating: number; shed: number } {
  if (rating <= DECAY_FLOOR) return { rating, shed: 0 };
  const overdue = Math.floor(idleDays) - DECAY_AFTER_DAYS;
  if (overdue <= 0) return { rating, shed: 0 };
  const shed = Math.min(overdue * DECAY_PER_DAY, rating - DECAY_FLOOR);
  return { rating: rating - shed, shed };
}

/** Whole days between two instants, floored at zero. */
export function idleDays(lastPlayedAt: Date | null, now: Date = new Date()): number {
  if (!lastPlayedAt) return 0;
  return Math.max(0, Math.floor((now.getTime() - lastPlayedAt.getTime()) / DAY_MS));
}

/**
 * The rating to SHOW for a stored row: decay folded in, provisional respected.
 *
 * Returns null when the rating is still provisional, which is the signal to
 * render "5 matches to place" instead of a number. A provisional rating never
 * decays — you cannot go stale at something you have not finished starting.
 */
export function displayRating(
  row: { rating: number; placementsLeft: number; lastPlayedAt: Date | null },
  now: Date = new Date(),
): { rating: number | null; shed: number; provisional: boolean } {
  if (isProvisional(row.placementsLeft)) {
    return { rating: null, shed: 0, provisional: true };
  }
  const { rating, shed } = applyDecay(row.rating, idleDays(row.lastPlayedAt, now));
  return { rating, shed, provisional: false };
}
