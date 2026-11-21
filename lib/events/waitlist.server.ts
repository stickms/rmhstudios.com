/**
 * Event waitlists, the server half (the rules are in `waitlist.ts`).
 *
 * Every write that can change the `going` count of a one-off event takes
 * `lockEventRsvps` first (the same `event-rsvp:<id>` key `rsvpRecurring` uses),
 * then reads the event, counts, writes and promotes inside that one transaction.
 * That serialises the last seat, and it makes a promotion safe to repeat: a row is
 * promoted by a compare-and-set on `status = 'waitlist'`, so only the transaction
 * that flips it notifies the member, and it does so once.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { lockKey } from '@/lib/db/advisory-lock.server';
import { WHOLE_EVENT } from '@/lib/calendar/event-model';
import { createNotification } from '@/lib/notifications.server';
import { resolveUser, userDisplaySelect } from '@/lib/user-display';
import { EventError } from '@/lib/events/event-error';
import { scheduleEventReminders } from '@/lib/events/reminders.server';
import {
  MAX_WAITLIST,
  freeSeats,
  pickPromotions,
  type WaitlistEntry,
  type WaitlistViewDTO,
} from '@/lib/events/waitlist';

type Tx = Prisma.TransactionClient;
/** Anything that can read RSVP rows: a transaction, or the client itself. */
type RsvpReader = Pick<Tx, 'rsvp'>;

/** The fields promotion needs, read fresh inside the lock. */
export interface SeatState {
  id: string;
  title: string;
  startsAt: Date;
  capacity: number | null;
  canceledAt: Date | null;
}

export async function lockEventRsvps(tx: Tx, eventId: string): Promise<void> {
  await lockKey(tx, `event-rsvp:${eventId}`);
}

/** The event's capacity and start as they are now; call it after `lockEventRsvps`. */
export function readSeatState(tx: Tx, eventId: string): Promise<SeatState | null> {
  return tx.event.findUnique({
    where: { id: eventId },
    select: { id: true, title: true, startsAt: true, capacity: true, canceledAt: true },
  });
}

/** The waitlist of a one-off event, first in first out (at most {@link MAX_WAITLIST} rows exist). */
export async function readWaitlist(
  db: RsvpReader,
  eventId: string,
  take: number = MAX_WAITLIST,
): Promise<WaitlistEntry[]> {
  const rows = await db.rsvp.findMany({
    where: { eventId, occurrenceAt: WHOLE_EVENT, status: 'waitlist', waitlistedAt: { not: null } },
    orderBy: [{ waitlistedAt: 'asc' }, { userId: 'asc' }],
    take,
    select: { userId: true, waitlistedAt: true },
  });
  return rows.flatMap((r) => (r.waitlistedAt ? [{ userId: r.userId, waitlistedAt: r.waitlistedAt }] : []));
}

/**
 * Move the first waitlisted members into the free seats of `event`. Call it inside
 * the transaction that freed the seat (or raised the capacity), after
 * `lockEventRsvps`. Returns the members this call promoted, for `announcePromotions`
 * once the transaction has committed. Nobody is promoted after the start, or on a
 * canceled event.
 */
export async function promoteFromWaitlist(tx: Tx, event: SeatState): Promise<string[]> {
  const now = new Date();
  if (event.canceledAt || now.getTime() >= event.startsAt.getTime()) return [];
  const going = await tx.rsvp.count({
    where: { eventId: event.id, occurrenceAt: WHOLE_EVENT, status: 'going' },
  });
  const take = event.capacity == null ? MAX_WAITLIST : freeSeats(event.capacity, going);
  if (take === 0) return [];
  const waitlist = await readWaitlist(tx, event.id, take);
  const promoted: string[] = [];
  for (const userId of pickPromotions({ capacity: event.capacity, going, waitlist, startsAt: event.startsAt, now })) {
    const flipped = await tx.rsvp.updateMany({
      where: { eventId: event.id, userId, occurrenceAt: WHOLE_EVENT, status: 'waitlist' },
      data: { status: 'going', waitlistedAt: null },
    });
    if (flipped.count === 1) promoted.push(userId);
  }
  return promoted;
}

/** After the commit: tell each promoted member and schedule their reminders. Best-effort. */
export async function announcePromotions(
  event: Pick<SeatState, 'id' | 'title' | 'startsAt'>,
  userIds: readonly string[],
): Promise<void> {
  for (const userId of userIds) {
    await createNotification({
      userId,
      type: 'SYSTEM',
      entityType: 'event_waitlist',
      entityId: event.id,
      preview: `A place opened up: you are going to ${event.title}`,
      link: '/calendar',
    }).catch(() => {});
    await scheduleEventReminders({ id: event.id, startsAt: event.startsAt }, userId);
  }
}

/**
 * Account erasure: free every seat and waitlist place the member holds on events
 * that have not started (promoting from the waitlist as a guest leaving would),
 * then delete the rest of their RSVP rows. Idempotent, so a re-run of a failed
 * sweep is safe.
 */
export async function releaseSeatsOf(userId: string): Promise<void> {
  const held = await prisma.rsvp.findMany({
    where: {
      userId,
      occurrenceAt: WHOLE_EVENT,
      status: { in: ['going', 'waitlist'] },
      event: { startsAt: { gt: new Date() }, recurrence: null, canceledAt: null },
    },
    select: { eventId: true, status: true },
    take: 1000,
  });
  // Tests that stub prisma with a recording proxy answer a list read with an op object, not rows.
  if (Array.isArray(held)) await releaseHeld(userId, held);
  await prisma.rsvp.deleteMany({ where: { userId } });
}

async function releaseHeld(userId: string, held: { eventId: string; status: string }[]): Promise<void> {
  // Events in id order, so concurrent sweeps take their locks in the same order (one lock at a time anyway).
  held.sort((a, b) => (a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0));
  for (const { eventId, status } of held) {
    const done = await prisma.$transaction(async (tx) => {
      await lockEventRsvps(tx, eventId);
      const removed = await tx.rsvp.deleteMany({ where: { eventId, userId, occurrenceAt: WHOLE_EVENT } });
      const event = await readSeatState(tx, eventId);
      if (!event || removed.count === 0 || status !== 'going') return null;
      return { event, promoted: await promoteFromWaitlist(tx, event) };
    });
    if (done) await announcePromotions(done.event, done.promoted);
  }
}

/** The host or a site admin; anyone else is told the event does not exist. */
async function assertHostOrAdmin(eventId: string, actorId: string, isAdmin: boolean) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, hostId: true, startsAt: true, recurrence: true },
  });
  if (!event || event.recurrence || (event.hostId !== actorId && !isAdmin)) throw new EventError('NOT_FOUND');
  return event;
}

/** The host's view of the waitlist, in order. */
export async function listWaitlist(eventId: string, actorId: string, isAdmin: boolean): Promise<WaitlistViewDTO> {
  const event = await assertHostOrAdmin(eventId, actorId, isAdmin);
  const rows = await prisma.rsvp.findMany({
    where: { eventId, occurrenceAt: WHOLE_EVENT, status: 'waitlist', waitlistedAt: { not: null } },
    orderBy: [{ waitlistedAt: 'asc' }, { userId: 'asc' }],
    take: MAX_WAITLIST,
    select: { waitlistedAt: true, user: { select: userDisplaySelect } },
  });
  return {
    closed: Date.now() >= event.startsAt.getTime(),
    waitlist: rows.flatMap((r, i) => {
      if (!r.waitlistedAt) return [];
      const u = resolveUser(r.user);
      return [
        {
          userId: u.id,
          name: u.name,
          handle: u.handle,
          image: u.image,
          waitlistedAt: r.waitlistedAt.toISOString(),
          position: i + 1,
        },
      ];
    }),
  };
}

/** The host takes one member off the waitlist; answers the new queue. */
export async function removeFromWaitlist(
  eventId: string,
  actorId: string,
  isAdmin: boolean,
  userId: string,
): Promise<WaitlistViewDTO> {
  await assertHostOrAdmin(eventId, actorId, isAdmin);
  await prisma.rsvp.deleteMany({
    where: { eventId, userId, occurrenceAt: WHOLE_EVENT, status: 'waitlist' },
  });
  return listWaitlist(eventId, actorId, isAdmin);
}

/** The member's event answers (going, maybe, waitlist places) for the account export. */
export async function exportEventRsvps(userId: string) {
  const rows = await prisma.rsvp.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    take: 1000,
    select: {
      eventId: true,
      status: true,
      occurrenceAt: true,
      everyTime: true,
      createdAt: true,
      waitlistedAt: true,
      event: { select: { title: true, startsAt: true } },
    },
  });
  return rows.map((r) => ({
    eventId: r.eventId,
    title: r.event.title,
    startsAt: r.event.startsAt.toISOString(),
    status: r.status,
    occurrenceAt: r.occurrenceAt.toISOString(),
    everyTime: r.everyTime,
    answeredAt: r.createdAt.toISOString(),
    waitlistedAt: r.waitlistedAt?.toISOString() ?? null,
  }));
}
