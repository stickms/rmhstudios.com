/** Advent calendar (G2) — pure and client-safe. Doors 1–24 open on Dec 1–24 (UTC). */
export const ADVENT_DOORS = 24;
/** Coins per door: 24 × 25 = 600 a year at most per member. */
export const ADVENT_COINS = 25;

/** Today's door number, or null outside Dec 1–24. */
export function adventDoorFor(now: Date): number | null {
  if (now.getUTCMonth() !== 11) return null;
  const d = now.getUTCDate();
  return d >= 1 && d <= ADVENT_DOORS ? d : null;
}

export const adventRefId = (userId: string, year: number, door: number) =>
  `advent:${userId}:${year}:${door}`;

export interface AdventState {
  year: number;
  /** Today's door, null when the calendar is not open today. */
  today: number | null;
  opened: number[];
  coins: number;
}
