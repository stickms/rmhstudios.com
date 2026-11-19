/**
 * The site's one season clock (client-safe, pure).
 *
 * A season is a fixed 8-week block of the calendar counted from `SEASON_EPOCH`
 * (00:00 UTC, 7 July 2026, the start of battle pass season 1). Nothing stores a
 * table of seasons: every system asks this clock which season an instant falls
 * in, so a season begins by itself and no two systems can disagree about when.
 *
 * Who reads it:
 *  - the battle pass (`lib/battlepass/season.ts`) numbers its seasons with it
 *    directly (`S<n>`);
 *  - ranked (`lib/ranked/season.ts`) keeps the season numbers it has already
 *    stored and runs on this clock from `RANKED_CUTOVER` on;
 *  - forecasting (`lib/forecasting`) takes a season's window as the default
 *    dates of an admin-created prediction season.
 *
 * Never move `SEASON_EPOCH` or `SEASON_LENGTH_DAYS`: stored battle pass rows are
 * keyed by the number this clock produces.
 */

export const DAY_MS = 86_400_000;
/** Start of season 1: 2026-07-07T00:00:00Z. */
export const SEASON_EPOCH = Date.UTC(2026, 6, 7);
export const SEASON_LENGTH_DAYS = 56;
export const SEASON_MS = SEASON_LENGTH_DAYS * DAY_MS;

const toMs = (at: Date | number): number => (typeof at === 'number' ? at : at.getTime());

/** 1-based season number for an instant. Instants before the epoch are season 1. */
export function seasonNumberAt(at: Date | number = Date.now()): number {
  return Math.max(1, Math.floor((toMs(at) - SEASON_EPOCH) / SEASON_MS) + 1);
}

/** Start (inclusive) and end (exclusive), in epoch ms, of season `n`. */
export function seasonBounds(n: number): { start: number; end: number } {
  const start = SEASON_EPOCH + (n - 1) * SEASON_MS;
  return { start, end: start + SEASON_MS };
}

/** The window of the season containing `at`. */
export function seasonWindowAt(at: Date | number = Date.now()): {
  number: number;
  start: Date;
  end: Date;
} {
  const number = seasonNumberAt(at);
  const { start, end } = seasonBounds(number);
  return { number, start: new Date(start), end: new Date(end) };
}
