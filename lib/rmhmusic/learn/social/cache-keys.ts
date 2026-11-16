/**
 * The server-side cache keys of RMH Music's social layer (Phase 6, plan 1.7), in one place so the
 * writers that must drop them (the switches, a moderator's hide) and the readers agree.
 */

/** The Everyone board of one UTC date: its sorted, filtered list (`board.server.ts`). */
export function boardCacheKey(
  date: string,
): string {
  return `rmhmusic:board:${date}`;
}

/** A viewer's mutual follows who share something (`board.server.ts`, friends' progress). */
export function friendsCacheKey(
  userId: string,
): string {
  return `rmhmusic:friends:${userId}`;
}
