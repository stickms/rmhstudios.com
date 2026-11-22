/**
 * Values both halves of GlobeSet's race agree on.
 *
 * Imported by the browser client, by the lobby UI and by
 * `server/socket-server/handlers/globeset.ts`, so a limit is written once and
 * cannot drift between what the UI offers and what the server accepts.
 */

/** Seats per race room. Eight is the party system's own ceiling. */
export const MAX_RACE_PLAYERS = 8;

/** A race needs an opponent. */
export const MIN_RACE_PLAYERS = 2;

/** Seconds of "get ready" between the host starting and the deal appearing. */
export const COUNTDOWN_SECONDS = 3;

/** What a race is won by. */
export type RaceGoal =
  /** Clear all 63 cards. The daily game, raced. */
  | 'clear'
  /** First to a fixed number of GlobeSets — a two-minute version. */
  | 'sprint';

export const RACE_GOALS: readonly RaceGoal[] = ['clear', 'sprint'];

/** GlobeSet counts a sprint can be run to. */
export const SPRINT_TARGETS = [5, 10, 15] as const;
export type SprintTarget = (typeof SPRINT_TARGETS)[number];

export const DEFAULT_GOAL: RaceGoal = 'clear';
export const DEFAULT_SPRINT_TARGET: SprintTarget = 10;

/**
 * Hard ceiling on a race, after which the server closes it out and ranks
 * whoever is still playing by progress.
 *
 * Without it a single player who walks away holds the room — and everyone in
 * it — open until the idle sweep, which is half an hour away.
 */
export const RACE_TIMEOUT_MS = 15 * 60_000;

/** How often live standings are broadcast — one batched message, not one per player. */
export const STANDINGS_TICK_MS = 600;

export function isSprintTarget(value: unknown): value is SprintTarget {
  return SPRINT_TARGETS.includes(value as SprintTarget);
}

export function isRaceGoal(value: unknown): value is RaceGoal {
  return RACE_GOALS.includes(value as RaceGoal);
}
