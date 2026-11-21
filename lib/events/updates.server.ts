/**
 * Event updates (s06-11), the server half (the rules are in `updates.ts`).
 *
 * `postUpdate` checks the limit and inserts in one transaction that first takes `event-update:<id>`, so two
 * racing posts cannot both take the third place. The people coming are told after the commit, through the
 * `events.update-fanout` work queue: the job claims the update with a compare-and-set on `notifiedAt` before it
 * sends, reads recipients in batches of 200, and drops the author, anyone blocked with the author and banned
 * accounts. The claim comes first, so a worker that dies mid-send tells the rest nobody (at most once, by design).
 */
import type { PgBoss } from 'pg-boss';
import { prisma } from '@/lib/prisma.server';
import { lockKey } from '@/lib/db/advisory-lock.server';
import { getBoss } from '@/lib/jobs/boss.server';
import { createNotification } from '@/lib/notifications.server';
import { WHOLE_EVENT, seriesOf } from '@/lib/calendar/event-model';
import { canManageEvent } from '@/lib/events/cohosts.server';
import { canViewEvent } from '@/lib/events.server';
import { overridesFor } from '@/lib/events/occurrences.server';
import { upcomingOccurrences } from '@/lib/events/occurrences';
import { resolveUser, userDisplaySelect } from '@/lib/user-display';
import {
  FANOUT_BATCH,
  MAX_RECIPIENTS,
  UPDATES_SHOWN,
  UPDATE_ENTITY,
  UPDATE_FANOUT_QUEUE,
  UPDATE_WINDOW_MS,
  audienceOf,
  canDeleteUpdate,
  nextUpdateAt,
  notifyPreview,
  updateJobKey,
  withoutAuthorAndBlocked,
  type AudienceRow,
  type EventUpdateDTO,
  type UpdateFanoutJob,
  type UpdateRefusal,
} from '@/lib/events/updates';

/** A refused call; `code` is stable for the client, `nextAt` says when a rate-limited post becomes possible. */
export class UpdateError extends Error {
  constructor(
    public readonly code: UpdateRefusal,
    public readonly nextAt: Date | null = null,
  ) {
    super(code);
    this.name = 'UpdateError';
  }
}

/** A refusal as the response: a stable `code`, a plain message, never the caught error. */
export function refused(error: unknown): Response {
  if (error instanceof UpdateError) {
    const status =
      error.code === 'FORBIDDEN'
        ? 403
        : error.code === 'NOT_FOUND'
          ? 404
          : error.code === 'RATE_LIMITED' || error.code === 'CANCELED' || error.code === 'TOO_LATE'
            ? 409
            : 400;
    return Response.json(
      { error: 'That update could not be posted', code: error.code, nextAt: error.nextAt ? error.nextAt.toISOString() : null },
      { status },
    );
  }
  throw error;
}

const eventSelect = {
  id: true,
  hostId: true,
  communityId: true,
  visibility: true,
  pollId: true,
  title: true,
  startsAt: true,
  endsAt: true,
  recurrence: true,
  recurUntil: true,
  recurTz: true,
  canceledAt: true,
} as const;

async function loadEvent(eventId: string) {
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: eventSelect });
  if (!event) throw new UpdateError('NOT_FOUND');
  return event;
}

async function assertManager(event: { id: string; hostId: string | null }, actorId: string, isAdmin: boolean) {
  if (!isAdmin && !(await canManageEvent(event, actorId))) throw new UpdateError('FORBIDDEN');
}

type LoadedEvent = Awaited<ReturnType<typeof loadEvent>>;

/**
 * Where an update points: null for a one-off event or the whole series, otherwise the ORIGINAL start of one date.
 * `requested` undefined means the next date that is not skipped; null means the whole series.
 */
async function resolveTarget(
  event: LoadedEvent,
  requested: Date | null | undefined,
  now: Date,
): Promise<Date | null> {
  const series = seriesOf(event);
  if (!series) return null;
  if (requested === null) return null;
  const overrides = await overridesFor(event.id);
  const live = upcomingOccurrences(series, overrides, { now, spanMs: 120 * 86_400_000, limit: 40 }).filter(
    (o) => o.state !== 'skipped',
  );
  if (requested === undefined) {
    const next = live[0];
    if (!next) throw new UpdateError('BAD_OCCURRENCE');
    return next.originalAt;
  }
  if (!live.some((o) => o.originalAt.getTime() === requested.getTime())) throw new UpdateError('BAD_OCCURRENCE');
  return requested;
}

const toDTO = (
  r: { id: string; occurrenceAt: Date | null; body: string; createdAt: Date; authorId: string | null },
  author: EventUpdateDTO['author'],
  viewerId: string | null,
  isAdmin: boolean,
  now: Date,
): EventUpdateDTO => ({
  id: r.id,
  occurrenceAt: r.occurrenceAt ? r.occurrenceAt.toISOString() : null,
  body: r.body,
  createdAt: r.createdAt.toISOString(),
  author,
  canDelete: canDeleteUpdate(r.createdAt, now) && (isAdmin || (!!viewerId && r.authorId === viewerId)),
});

async function authorsOf(ids: readonly (string | null)[]): Promise<Map<string, NonNullable<EventUpdateDTO['author']>>> {
  const wanted = [...new Set(ids.filter((x): x is string => !!x))];
  const out = new Map<string, NonNullable<EventUpdateDTO['author']>>();
  if (wanted.length === 0) return out;
  const users = await prisma.user.findMany({ where: { id: { in: wanted } }, select: userDisplaySelect });
  for (const u of Array.isArray(users) ? users : []) {
    const r = resolveUser(u);
    out.set(r.id, { id: r.id, name: r.name, handle: r.handle });
  }
  return out;
}

/** The updates of an event, newest first, to anyone who may see the event. Null when the event is not theirs to see. */
export async function listUpdates(
  eventId: string,
  viewerId: string | null,
  isAdmin: boolean,
  now: Date = new Date(),
): Promise<EventUpdateDTO[] | null> {
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: eventSelect });
  if (!event || !(await canViewEvent(event, viewerId))) return null;
  const rows = await prisma.eventUpdate.findMany({
    where: { eventId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    take: UPDATES_SHOWN,
    select: { id: true, occurrenceAt: true, body: true, createdAt: true, authorId: true },
  });
  const list = Array.isArray(rows) ? rows : [];
  const authors = await authorsOf(list.map((r) => r.authorId));
  return list.map((r) => toDTO(r, r.authorId ? (authors.get(r.authorId) ?? null) : null, viewerId, isAdmin, now));
}

/** Post an update. The limit check and the insert run under `event-update:<id>`; the fan-out is queued after the commit. */
export async function postUpdate(
  eventId: string,
  actorId: string,
  isAdmin: boolean,
  input: { body: string; occurrenceAt?: Date | null | undefined },
  now: Date = new Date(),
): Promise<EventUpdateDTO> {
  const event = await loadEvent(eventId);
  await assertManager(event, actorId, isAdmin);
  const created = await prisma.$transaction(async (tx) => {
    await lockKey(tx, `event-update:${eventId}`);
    const fresh = await tx.event.findUnique({ where: { id: eventId }, select: { canceledAt: true } });
    if (!fresh) throw new UpdateError('NOT_FOUND');
    if (fresh.canceledAt) throw new UpdateError('CANCELED');
    const recent = await tx.eventUpdate.findMany({
      where: { eventId, createdAt: { gt: new Date(now.getTime() - UPDATE_WINDOW_MS) } },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { createdAt: true },
    });
    const nextAt = nextUpdateAt(
      (Array.isArray(recent) ? recent : []).map((r) => r.createdAt),
      now,
    );
    if (nextAt) throw new UpdateError('RATE_LIMITED', nextAt);
    const target = await resolveTarget(event, input.occurrenceAt, now);
    return tx.eventUpdate.create({
      data: { eventId, occurrenceAt: target, authorId: actorId, body: input.body },
      select: { id: true, occurrenceAt: true, body: true, createdAt: true, authorId: true },
    });
  });
  await enqueueUpdateFanout(created.id);
  const authors = await authorsOf([actorId]);
  return toDTO(created, authors.get(actorId) ?? null, actorId, isAdmin, now);
}

/** The author (or an admin) removes an update, for ten minutes after it was posted. */
export async function deleteUpdate(
  eventId: string,
  updateId: string,
  actorId: string,
  isAdmin: boolean,
  now: Date = new Date(),
): Promise<void> {
  const row = await prisma.eventUpdate.findFirst({
    where: { id: updateId, eventId, deletedAt: null },
    select: { id: true, authorId: true, createdAt: true },
  });
  if (!row) throw new UpdateError('NOT_FOUND');
  if (!isAdmin && row.authorId !== actorId) throw new UpdateError('FORBIDDEN');
  if (!canDeleteUpdate(row.createdAt, now)) throw new UpdateError('TOO_LATE');
  await prisma.eventUpdate.updateMany({ where: { id: updateId, deletedAt: null }, data: { deletedAt: now } });
}

/** Everyone an update would reach, before blocks: the audience of that date (or series) minus the author. */
async function audienceFor(event: LoadedEvent, target: Date | null): Promise<string[]> {
  const recurring = !!seriesOf(event);
  const rows = await prisma.rsvp.findMany({
    where: {
      eventId: event.id,
      ...(recurring && target
        ? { OR: [{ occurrenceAt: WHOLE_EVENT }, { occurrenceAt: target }] }
        : { status: { in: ['going', 'maybe', 'waitlist'] } }),
    },
    select: { userId: true, status: true, occurrenceAt: true, everyTime: true },
    take: MAX_RECIPIENTS,
  });
  return audienceOf(Array.isArray(rows) ? (rows as AudienceRow[]) : [], target, recurring);
}

/** Who an update must not reach: anyone blocked with the author (either direction) and site-banned accounts. */
async function blockedWith(authorId: string, ids: readonly string[], now: Date = new Date()): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const [blocks, banned] = await Promise.all([
    prisma.userBlock.findMany({
      where: {
        OR: [
          { blockerId: authorId, blockedId: { in: [...ids] } },
          { blockedId: authorId, blockerId: { in: [...ids] } },
        ],
      },
      select: { blockerId: true, blockedId: true },
    }),
    prisma.user.findMany({ where: { id: { in: [...ids] }, bannedUntil: { gt: now } }, select: { id: true } }),
  ]);
  const out = new Set((Array.isArray(blocks) ? blocks : []).map((b) => (b.blockerId === authorId ? b.blockedId : b.blockerId)));
  for (const u of Array.isArray(banned) ? banned : []) out.add(u.id);
  return out;
}

/** How many people a post would tell: the same selection the job makes. `requested` as in {@link postUpdate}. */
export async function recipientCount(
  eventId: string,
  actorId: string,
  isAdmin: boolean,
  requested: Date | null | undefined,
  now: Date = new Date(),
): Promise<number> {
  const event = await loadEvent(eventId);
  await assertManager(event, actorId, isAdmin);
  const target = await resolveTarget(event, requested, now);
  const ids = await audienceFor(event, target);
  return withoutAuthorAndBlocked(ids, actorId, await blockedWith(actorId, ids)).length;
}

/* ── Queue ──────────────────────────────────────────────────────────────── */

/** Queue the fan-out for an update that has just been committed. A queue that is down is logged, never thrown. */
export async function enqueueUpdateFanout(updateId: string): Promise<void> {
  try {
    const boss = await getBoss();
    if (!boss) throw new Error('queue unavailable');
    const job: UpdateFanoutJob = { updateId };
    await boss.send(UPDATE_FANOUT_QUEUE, job, { singletonKey: updateJobKey(updateId), retryLimit: 3, retryDelay: 60 });
  } catch (error) {
    console.error('[events] could not queue the update fan-out:', error);
  }
}

/**
 * The job. Claims the update (`notifiedAt` null → now, compare-and-set), so a retried or duplicated job tells
 * nobody twice, then notifies in batches of {@link FANOUT_BATCH}. Returns how many people were notified.
 */
export async function runEventUpdateFanout(updateId: string, now: Date = new Date()): Promise<number> {
  const claim = await prisma.eventUpdate.updateMany({
    where: { id: updateId, notifiedAt: null, deletedAt: null },
    data: { notifiedAt: now },
  });
  if (claim.count !== 1) return 0;
  const update = await prisma.eventUpdate.findUnique({
    where: { id: updateId },
    select: { id: true, eventId: true, occurrenceAt: true, authorId: true, body: true },
  });
  if (!update?.authorId) return 0;
  const event = await prisma.event.findUnique({ where: { id: update.eventId }, select: eventSelect });
  if (!event || event.canceledAt) return 0;
  const ids = await audienceFor(event, update.occurrenceAt);
  const preview = notifyPreview(update.body);
  let notified = 0;
  for (let i = 0; i < ids.length; i += FANOUT_BATCH) {
    const batch = ids.slice(i, i + FANOUT_BATCH);
    const blocked = await blockedWith(update.authorId, batch);
    for (const userId of withoutAuthorAndBlocked(batch, update.authorId, blocked)) {
      await createNotification({
        userId,
        actorId: update.authorId,
        type: 'SYSTEM',
        entityType: UPDATE_ENTITY,
        entityId: event.id,
        preview,
        link: '/calendar',
      });
      notified += 1;
    }
  }
  return notified;
}

export async function registerEventUpdateWorker(boss: PgBoss): Promise<void> {
  await boss.createQueue(UPDATE_FANOUT_QUEUE);
  await boss.work<UpdateFanoutJob>(UPDATE_FANOUT_QUEUE, async (jobs) => {
    for (const job of jobs) await runEventUpdateFanout(job.data.updateId);
  });
}

/** The latest live updates of several events (for the calendar description), newest first. */
export async function latestUpdatesFor(
  eventIds: readonly string[],
  viewerId: string,
): Promise<Map<string, { body: string; createdAt: Date }[]>> {
  const out = new Map<string, { body: string; createdAt: Date }[]>();
  if (eventIds.length === 0) return out;
  const rows = await prisma.eventUpdate.findMany({
    where: { eventId: { in: [...eventIds] }, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    take: 20 * eventIds.length,
    select: { eventId: true, body: true, createdAt: true },
  });
  for (const r of Array.isArray(rows) ? rows : []) {
    const list = out.get(r.eventId) ?? [];
    if (list.length < 3) list.push({ body: r.body, createdAt: r.createdAt });
    out.set(r.eventId, list);
  }
  // Only a feed whose owner can see the event carries its updates (a private event they lost access to does not).
  if (out.size > 0) {
    const events = await prisma.event.findMany({ where: { id: { in: [...out.keys()] } }, select: eventSelect });
    for (const e of Array.isArray(events) ? events : []) {
      if (!(await canViewEvent(e, viewerId))) out.delete(e.id);
    }
  }
  return out;
}

/** Account erasure: an update is event content and stays; where the member wrote it the author is nulled. */
export function eventUpdateErasureOps(userId: string) {
  return [prisma.eventUpdate.updateMany({ where: { authorId: userId }, data: { authorId: null } })];
}

/** The updates the member wrote, for the account export. */
export async function exportEventUpdates(userId: string) {
  const rows = await prisma.eventUpdate.findMany({
    where: { authorId: userId },
    orderBy: { createdAt: 'asc' },
    take: 1000,
    select: { eventId: true, occurrenceAt: true, body: true, createdAt: true, deletedAt: true, event: { select: { title: true } } },
  });
  return rows.map((r) => ({
    eventId: r.eventId,
    eventTitle: r.event.title,
    occurrenceAt: r.occurrenceAt,
    body: r.body,
    createdAt: r.createdAt,
    deleted: r.deletedAt !== null,
  }));
}
