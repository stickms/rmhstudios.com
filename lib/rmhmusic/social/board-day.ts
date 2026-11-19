/**
 * Which Daily board a page shows, and that board's UTC date.
 *
 * Kept free of imports on purpose: the `/rmhmusic/daily` route loader computes the board's query
 * key from it, and a route loader is part of the client entry (every route module is imported
 * statically by the route tree). Importing this from `lib/rmhmusic/learn/social/board.ts` pulled
 * the Sprint generator, the plausibility rules and the run record into every page.
 */

/** Which board a page shows: today's (live) or yesterday's. */
export type BoardDay =
  | 'today'
  | 'yesterday';

const DAY_MS = 86_400_000;

/**
 * The UTC date (`YYYY-MM-DD`) of `day`'s board at `now`. The route loader and the page both derive
 * the board's query key from it, so the loader's prefetch is the page's data.
 */
export function boardDate(
  day: BoardDay,
  now: number,
): string {
  return new Date(
    day ===
      'today'
      ? now
      : now -
          DAY_MS,
  )
    .toISOString()
    .slice(
      0,
      10,
    );
}
