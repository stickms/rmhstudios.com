/**
 * Tournament check-in, the pure half (s04-03): the window, who is dropped at the
 * start, and the numbers a refused start reports. No I/O; `checkin.server.ts`
 * does the writes.
 *
 * The window opens `checkInMinutes` before `startsAt` and stays open until the
 * host starts the bracket (start is manual, so there is no closing time). A
 * tournament without a start time cannot have a window.
 */

/** The windows a host can choose, in minutes before the start. */
export const CHECK_IN_MINUTES = [10, 15, 30, 60] as const;
export type CheckInMinutes = (typeof CHECK_IN_MINUTES)[number];

export function isCheckInMinutes(v: unknown): v is CheckInMinutes {
  return typeof v === 'number' && (CHECK_IN_MINUTES as readonly number[]).includes(v);
}

/** The slice of a tournament the window maths reads. */
export interface CheckInConfig {
  startsAt: Date | null;
  checkInMinutes: number | null;
}

/** When check-in opens, or null when the tournament has no check-in. */
export function checkInOpensAt(t: CheckInConfig): Date | null {
  if (t.checkInMinutes == null || t.startsAt == null) return null;
  return new Date(t.startsAt.getTime() - t.checkInMinutes * 60_000);
}

/** Whether check-in is in effect at `now`: enabled, and the window has opened. */
export function isCheckInOpen(t: CheckInConfig, now: Date): boolean {
  const opens = checkInOpensAt(t);
  return opens != null && now.getTime() >= opens.getTime();
}

/** A tournament's check-in, as one word for the page and the guards. */
export type CheckInPhase = 'off' | 'before' | 'open';

export function checkInPhase(t: CheckInConfig, now: Date): CheckInPhase {
  const opens = checkInOpensAt(t);
  if (opens == null) return 'off';
  return now.getTime() >= opens.getTime() ? 'open' : 'before';
}

/**
 * The entrants a start removes: everyone who has not checked in, when the window
 * has opened. Before it opens nobody could have checked in, so a host who starts
 * early keeps the whole field.
 */
export function noShows<E extends { checkedInAt: Date | null }>(
  t: CheckInConfig,
  entrants: readonly E[],
  now: Date,
): E[] {
  if (!isCheckInOpen(t, now)) return [];
  return entrants.filter((e) => e.checkedInAt == null);
}

/** The numbers a refused start reports: how many are in, and how many it needs. */
export interface CheckInShortfall {
  checkedIn: number;
  needed: number;
}

/** Null when enough players remain to start. */
export function checkInShortfall(checkedIn: number, minPlayers: number): CheckInShortfall | null {
  return checkedIn < minPlayers ? { checkedIn, needed: minPlayers } : null;
}

/** "6 of 8 checked in": how many of the entrants have checked in. */
export function checkedInCount(entrants: readonly { checkedInAt: Date | null }[]): number {
  return entrants.filter((e) => e.checkedInAt != null).length;
}
