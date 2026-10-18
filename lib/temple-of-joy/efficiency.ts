/**
 * Temple of Joy efficiency (R9): gladness per real hour played, so idling well
 * ranks, not just idling long. The score is derived on the server from the
 * member's stored save, never taken from the request.
 *
 * Joy runs past 10^100, so the board stores `floor(log10(joy per hour) * 100)`:
 * an integer that sorts the same way and fits the shared score pipeline.
 */
export const EFFICIENCY_GAME_ID = 'temple-of-joy-efficiency';
/** A ratio over a few minutes is noise; require an hour of play to rank. */
export const MIN_HOURS = 1;

export interface Efficiency {
  /** Board score: floor(log10(joy per hour) * 100). */
  score: number;
  /** Whole hours played, the board's progress column. */
  hours: number;
  /** Time played in ms, for the pipeline's duration checks. */
  durationMs: number;
}

export function efficiencyFromSave(save: unknown): Efficiency | null {
  if (!save || typeof save !== 'object') return null;
  const { lifetimeJoy, playtime } = save as { lifetimeJoy?: unknown; playtime?: unknown };
  if (typeof lifetimeJoy !== 'number' || typeof playtime !== 'number') return null;
  if (!Number.isFinite(lifetimeJoy) || !Number.isFinite(playtime) || lifetimeJoy <= 0) return null;
  const hours = playtime / 3600;
  if (hours < MIN_HOURS) return null;
  const perHour = lifetimeJoy / hours;
  if (!Number.isFinite(perHour) || perHour < 1) return null;
  return {
    score: Math.floor(Math.log10(perHour) * 100),
    hours: Math.floor(hours),
    durationMs: Math.round(playtime * 1000),
  };
}

/** The board's score back to a human figure: 10^(score/100) per hour. */
export function exponentOf(score: number): string {
  return (score / 100).toFixed(2);
}
