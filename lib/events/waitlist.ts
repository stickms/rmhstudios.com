/**
 * Event waitlists, the pure half: who is promoted when seats free up, and where a
 * member stands in the queue. No I/O, so the rules are testable without a database
 * (`waitlist.server.ts` does the reads and writes inside one locked transaction).
 *
 * A waitlist belongs to a one-off event with a capacity. It is first in, first out
 * by `waitlistedAt`, at most {@link MAX_WAITLIST} long, and frozen once the event
 * has started.
 */

export const MAX_WAITLIST = 200;

export interface WaitlistEntry {
  userId: string;
  waitlistedAt: Date;
}

/** FIFO order: earliest join first; the user id breaks a tie on the same millisecond. */
export function orderWaitlist<T extends WaitlistEntry>(entries: readonly T[]): T[] {
  return [...entries].sort(
    (a, b) =>
      a.waitlistedAt.getTime() - b.waitlistedAt.getTime() ||
      (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0),
  );
}

/** Seats free for the waitlist: none on an uncapped event (nobody waits there), else capacity minus those going. */
export function freeSeats(capacity: number | null, going: number): number {
  if (capacity == null) return 0;
  return Math.max(0, capacity - going);
}

/**
 * Whom to promote: the first `freeSeats` members of the ordered waitlist. Nobody
 * once the event has started, and everybody when the host removes the capacity.
 */
export function pickPromotions(input: {
  capacity: number | null;
  going: number;
  waitlist: readonly WaitlistEntry[];
  startsAt: Date;
  now: Date;
}): string[] {
  if (input.now.getTime() >= input.startsAt.getTime()) return [];
  const ordered = orderWaitlist(input.waitlist);
  const seats = input.capacity == null ? ordered.length : freeSeats(input.capacity, input.going);
  return ordered.slice(0, seats).map((e) => e.userId);
}

/** 1-based place of `userId` in the waitlist, or null when they are not on it. */
export function waitlistPosition(waitlist: readonly WaitlistEntry[], userId: string): number | null {
  const index = orderWaitlist(waitlist).findIndex((e) => e.userId === userId);
  return index === -1 ? null : index + 1;
}

/** Whether a member may still join: the event has not started and the queue has room. */
export function canJoinWaitlist(input: {
  startsAt: Date;
  now: Date;
  waiting: number;
}): 'ok' | 'closed' | 'full' {
  if (input.now.getTime() >= input.startsAt.getTime()) return 'closed';
  return input.waiting >= MAX_WAITLIST ? 'full' : 'ok';
}

/** One waitlisted member as the host sees them. */
export interface WaitlistEntryDTO {
  userId: string;
  name: string | null;
  handle: string | null;
  image: string | null;
  /** ISO 8601 (UTC). */
  waitlistedAt: string;
  /** 1-based. */
  position: number;
}

/** The host's view: the queue in order, and whether the event has started (the queue is then frozen). */
export interface WaitlistViewDTO {
  waitlist: WaitlistEntryDTO[];
  closed: boolean;
}
