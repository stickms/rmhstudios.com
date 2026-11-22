/**
 * Event co-hosts, the server half (s05-05; the rules and refusal codes are in `cohosts.ts`).
 *
 * `canManageEvent` is the one answer to "may this member edit the event and look after its guests and
 * waitlist": the host, or an ACCEPTED co-host. Cancelling the event, inviting and removing co-hosts stay
 * the host's alone. Every write that decides who is a co-host takes `event-cohost:<id>` first, so the cap
 * is a cap (two racing invitations cannot both take the fifth place) and an accept claims its invitation
 * with a conditional update, so it flips once and notifies once.
 */
import { notice } from '@/lib/notifications/notice-keys';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { lockKey } from '@/lib/db/advisory-lock.server';
import { getRole } from '@/lib/communities/access.server';
import { createNotification } from '@/lib/notifications.server';
import { resolveUser, userDisplaySelect } from '@/lib/user-display';
import {
  canManage,
  hasRoom,
  MAX_COHOSTS,
  personLabel,
  resolveRole,
  type CohostEntryDTO,
  type CohostRefusal,
  type EventViewerRole,
  type ManagerRole,
} from '@/lib/events/cohosts';

export type CohostResult<T> = { ok: true; value: T } | { ok: false; code: CohostRefusal };

const refuse = (code: CohostRefusal): { ok: false; code: CohostRefusal } => ({ ok: false, code });

const COHOST_ENTITY = 'event_cohost';

const lockName = (eventId: string): string => `event-cohost:${eventId}`;

/** What a member event looks like to this module: the rows `lib/events.server.ts` calls member events. */
const memberEvent = {
  kind: 'event',
  owner: { in: ['COMMUNITY', 'USER'] },
  visibility: { not: 'DRAFT' },
} satisfies Prisma.EventWhereInput;

interface EventFacts {
  id: string;
  title: string;
  hostId: string | null;
  communityId: string | null;
  canceledAt: Date | null;
}

function readEvent(db: Pick<Prisma.TransactionClient, 'event'>, eventId: string): Promise<EventFacts | null> {
  return db.event.findFirst({
    where: { id: eventId, ...memberEvent },
    select: { id: true, title: true, hostId: true, communityId: true, canceledAt: true },
  });
}

/** The role of `actorId` on an event: host, accepted co-host, invited, or nothing. One read unless they are the host. */
export async function roleOn(event: { id: string; hostId: string | null }, actorId: string): Promise<EventViewerRole> {
  if (event.hostId === actorId) return 'host';
  const row = await prisma.eventCohost.findUnique({
    where: { eventId_userId: { eventId: event.id, userId: actorId } },
    select: { status: true },
  });
  return resolveRole(event.hostId, actorId, row?.status);
}

/**
 * `'host'`, `'cohost'` (accepted) or `null`. An invited member has no rights until they accept, and a
 * member who stepped down or was removed has none at all.
 */
export async function canManageEvent(
  event: { id: string; hostId: string | null },
  actorId: string,
): Promise<ManagerRole | null> {
  const role = await roleOn(event, actorId);
  return canManage(role) ? role : null;
}

async function blockedEitherWay(
  tx: Pick<Prisma.TransactionClient, 'userBlock'>,
  a: string,
  b: string,
): Promise<boolean> {
  const hit = await tx.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: a, blockedId: b },
        { blockerId: b, blockedId: a },
      ],
    },
    select: { id: true },
  });
  return !!hit;
}

/** Why `userId` cannot be a co-host of this event right now, or null when they can. */
async function ineligibility(
  tx: Prisma.TransactionClient,
  event: EventFacts,
  userId: string,
  now: Date,
): Promise<CohostRefusal | null> {
  const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, bannedUntil: true } });
  if (!user) return 'user-not-found';
  if (user.bannedUntil && user.bannedUntil.getTime() > now.getTime()) return 'banned';
  if (event.hostId && (await blockedEitherWay(tx, event.hostId, userId))) return 'blocked';
  if (event.communityId && !(await getRole(event.communityId, userId))) return 'not-member';
  return null;
}

/** How a member is named in a notification: their display name, else their @handle. */
const displayName = (u: Parameters<typeof resolveUser>[0] | null): string =>
  (u ? personLabel(resolveUser(u)) : null) ?? 'A member';

async function notifySafely(input: Parameters<typeof createNotification>[0]): Promise<void> {
  try {
    await createNotification(input);
  } catch (err) {
    console.error('[event-cohosts] notification failed:', err);
  }
}

const entrySelect = {
  status: true,
  invitedAt: true,
  user: { select: userDisplaySelect },
} as const satisfies Prisma.EventCohostSelect;

type EntryRow = Prisma.EventCohostGetPayload<{ select: typeof entrySelect }>;

function toEntry(row: EntryRow): CohostEntryDTO {
  const u = resolveUser(row.user);
  return {
    id: u.id,
    name: u.name,
    handle: u.handle,
    image: u.image,
    status: row.status === 'accepted' ? 'accepted' : 'invited',
    invitedAt: row.invitedAt.toISOString(),
  };
}

/** The host invites `userId`. Repeating an invitation (or inviting an existing co-host) changes and notifies nothing. */
export async function inviteCohost(input: {
  eventId: string;
  actorId: string;
  userId: string;
}): Promise<CohostResult<CohostEntryDTO>> {
  const event = await readEvent(prisma, input.eventId);
  if (!event) return refuse('not-found');
  if (event.hostId !== input.actorId) return refuse((await roleOn(event, input.actorId)) ? 'not-host' : 'not-found');
  if (event.canceledAt) return refuse('canceled');
  if (input.userId === event.hostId) return refuse('self');

  const outcome = await prisma.$transaction(async (tx) => {
    await lockKey(tx, lockName(input.eventId));
    const existing = await tx.eventCohost.findUnique({
      where: { eventId_userId: { eventId: input.eventId, userId: input.userId } },
      select: entrySelect,
    });
    if (existing) return { code: null, entry: toEntry(existing), created: false };
    const refused = await ineligibility(tx, event, input.userId, new Date());
    if (refused) return { code: refused, entry: null, created: false };
    const rows = await tx.eventCohost.count({ where: { eventId: input.eventId } });
    if (!hasRoom(rows)) return { code: 'full' as const, entry: null, created: false };
    const created = await tx.eventCohost.create({
      data: { eventId: input.eventId, userId: input.userId, status: 'invited' },
      select: entrySelect,
    });
    return { code: null, entry: toEntry(created), created: true };
  });
  if (outcome.code || !outcome.entry) return refuse(outcome.code ?? 'not-found');

  if (outcome.created) {
    const host = await prisma.user.findUnique({ where: { id: input.actorId }, select: userDisplaySelect });
    await notifySafely({
      userId: input.userId,
      actorId: input.actorId,
      type: 'SYSTEM',
      entityType: COHOST_ENTITY,
      entityId: input.eventId,
      preview: notice('event-cohost-invited', { name: displayName(host), title: event.title }),
      link: '/communities?tab=events',
    });
  }
  return { ok: true, value: outcome.entry };
}

/**
 * The invited member answers. Accepting makes them a co-host (re-checking, inside the lock, that the pair is
 * still unblocked, they are not banned and still belong to the community) and tells the host; declining
 * deletes the invitation so the host may ask again. Accepting twice is a no-op; a co-host cannot "decline".
 */
export async function respondToCohostInvite(input: {
  eventId: string;
  userId: string;
  accept: boolean;
}): Promise<CohostResult<{ accept: boolean }>> {
  const event = await readEvent(prisma, input.eventId);
  if (!event) return refuse('not-found');

  const outcome = await prisma.$transaction(async (tx) => {
    await lockKey(tx, lockName(input.eventId));
    const mine = await tx.eventCohost.findUnique({
      where: { eventId_userId: { eventId: input.eventId, userId: input.userId } },
      select: { status: true },
    });
    if (!mine) return { code: 'no-invite' as const, notify: false };
    if (mine.status === 'accepted')
      return input.accept ? { code: null, notify: false } : { code: 'already-accepted' as const, notify: false };
    if (!input.accept) {
      await tx.eventCohost.deleteMany({ where: { eventId: input.eventId, userId: input.userId, status: 'invited' } });
      return { code: null, notify: false };
    }
    if (event.canceledAt) return { code: 'canceled' as const, notify: false };
    const refused = await ineligibility(tx, event, input.userId, new Date());
    if (refused) return { code: refused, notify: false };
    const flipped = await tx.eventCohost.updateMany({
      where: { eventId: input.eventId, userId: input.userId, status: 'invited' },
      data: { status: 'accepted', respondedAt: new Date() },
    });
    return { code: null, notify: flipped.count === 1 };
  });
  if (outcome.code) return refuse(outcome.code);

  if (outcome.notify && event.hostId) {
    const me = await prisma.user.findUnique({ where: { id: input.userId }, select: userDisplaySelect });
    await notifySafely({
      userId: event.hostId,
      actorId: input.userId,
      type: 'SYSTEM',
      entityType: COHOST_ENTITY,
      entityId: input.eventId,
      preview: notice('event-cohost-accepted', { name: displayName(me), title: event.title }),
      link: '/communities?tab=events',
    });
  }
  return { ok: true, value: { accept: input.accept } };
}

/**
 * The host removes a co-host or withdraws an invitation; a member removes their own row (a co-host
 * stepping down, or an invited member who prefers to decline from the panel). Nobody is notified.
 * Removing a row that is already gone succeeds.
 */
export async function removeCohost(input: {
  eventId: string;
  actorId: string;
  userId: string;
}): Promise<CohostResult<true>> {
  const event = await readEvent(prisma, input.eventId);
  if (!event) return refuse('not-found');
  const isHost = event.hostId === input.actorId;
  if (!isHost && input.actorId !== input.userId) {
    return refuse((await roleOn(event, input.actorId)) === 'cohost' ? 'not-host' : 'not-found');
  }
  await prisma.$transaction(async (tx) => {
    await lockKey(tx, lockName(input.eventId));
    await tx.eventCohost.deleteMany({ where: { eventId: input.eventId, userId: input.userId } });
  });
  return { ok: true, value: true };
}

/**
 * The co-host list for a manager: the host reads every row (invited and accepted); an accepted co-host reads the
 * accepted ones. Everyone else (including an invited member) is told the event does not exist.
 */
export async function listCohosts(eventId: string, actorId: string): Promise<CohostResult<CohostEntryDTO[]>> {
  const event = await readEvent(prisma, eventId);
  if (!event) return refuse('not-found');
  const role = await roleOn(event, actorId);
  if (!canManage(role)) return refuse('not-found');
  const rows = await prisma.eventCohost.findMany({
    where: { eventId, ...(role === 'host' ? {} : { status: 'accepted' }) },
    orderBy: [{ invitedAt: 'asc' }, { userId: 'asc' }],
    take: MAX_COHOSTS,
    select: entrySelect,
  });
  return { ok: true, value: rows.map(toEntry) };
}

/**
 * Account erasure operations (the cascade never fires on an anonymised account): the member's own co-host
 * rows, and every row on the events they host, which stay behind with their host de-identified.
 */
export function cohostErasureOps(userId: string) {
  return [prisma.eventCohost.deleteMany({ where: { OR: [{ userId }, { event: { hostId: userId } }] } })] as const;
}

/** The data export: the co-host roles the member holds or was asked to hold (invited and accepted), with the event named. */
export async function exportEventCohosts(userId: string) {
  const rows = await prisma.eventCohost.findMany({
    where: { userId },
    orderBy: { invitedAt: 'asc' },
    take: 1000,
    select: {
      eventId: true,
      status: true,
      invitedAt: true,
      respondedAt: true,
      event: { select: { title: true, startsAt: true } },
    },
  });
  return rows.map((r) => ({
    eventId: r.eventId,
    title: r.event.title,
    startsAt: r.event.startsAt.toISOString(),
    status: r.status,
    invitedAt: r.invitedAt.toISOString(),
    respondedAt: r.respondedAt?.toISOString() ?? null,
  }));
}
