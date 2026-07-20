/**
 * RMHEvents — server logic for community/profile events, RSVPs, and reminders
 * (platform expansion §6). Server-only: touches Prisma, the pg-boss queue, and
 * notifications.
 *
 * Reminders ride pg-boss delayed jobs (T-24h and T-15m before start). We do NOT
 * edit `lib/jobs/boss.server.ts`'s QUEUES array; instead this module owns its
 * own queue constant + an idempotent `createQueue`, and exports
 * `registerEventReminderWorker(boss)` for the `jobs` worker to wire in. Every
 * piece is best-effort: if the queue is unavailable the reminder is simply
 * skipped (it's an optimisation, never a correctness dependency), and the worker
 * re-checks the RSVP + event on fire so a stale job never notifies wrongly.
 */
import { isIP } from 'node:net';
import type { PgBoss } from 'pg-boss';
import { prisma } from '@/lib/prisma.server';
import { getBoss } from '@/lib/jobs/boss.server';
import { getRole, canModerate } from '@/lib/communities/access.server';
import { createNotification } from '@/lib/notifications.server';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';
import { isPrivateIp } from '@/lib/ssrf-guard.server';

// ─── Types (client-safe: imported as `import type` by the UI) ────────────────

export type EventVenueKindValue = 'SPACE' | 'TOURNAMENT' | 'GAME' | 'URL' | 'IRL';
export type RsvpStatus = 'going' | 'maybe';
export type EventScope = 'upcoming' | 'community' | 'mine';

export interface EventPersonDTO {
  id: string;
  name: string | null;
  image: string | null;
  handle: string | null;
}

export interface EventCommunityDTO {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
  color: string | null;
}

export interface EventDTO {
  id: string;
  hostId: string;
  communityId: string | null;
  title: string;
  description: string;
  /** ISO 8601 (UTC). Render in the viewer's locale/timezone client-side. */
  startsAt: string;
  endsAt: string | null;
  venueKind: EventVenueKindValue;
  venueRef: string | null;
  capacity: number | null;
  canceledAt: string | null;
  createdAt: string;
  host: EventPersonDTO;
  community: EventCommunityDTO | null;
  goingCount: number;
  maybeCount: number;
  attendees: EventPersonDTO[];
  viewerRsvp: RsvpStatus | null;
}

export interface RsvpResult {
  goingCount: number;
  maybeCount: number;
  viewerRsvp: RsvpStatus | null;
}

export interface CreateEventInput {
  hostId: string;
  communityId?: string | null;
  title: string;
  description?: string | null;
  startsAt: Date | string;
  endsAt?: Date | string | null;
  venueKind: EventVenueKindValue;
  venueRef?: string | null;
  capacity?: number | null;
}

export interface UpdateEventInput {
  id: string;
  hostId: string;
  title?: string;
  description?: string | null;
  startsAt?: Date | string;
  endsAt?: Date | string | null;
  venueKind?: EventVenueKindValue;
  venueRef?: string | null;
  capacity?: number | null;
}

/** Domain error with a stable `code` the API layer maps to an HTTP status. */
export class EventError extends Error {
  constructor(
    public readonly code:
      | 'NOT_FOUND'
      | 'FORBIDDEN'
      | 'INVALID_DATES'
      | 'INVALID_VENUE_URL'
      | 'CAPACITY_FULL'
      | 'CANCELED',
  ) {
    super(code);
    this.name = 'EventError';
  }
}

// ─── Reminder queue (pg-boss) ────────────────────────────────────────────────

/** Delayed reminder jobs for RSVPs. Owned here, NOT registered in boss.server. */
export const EVENT_REMINDER_QUEUE = 'event.reminder';

type ReminderOffset = '24h' | '15m';

export interface EventReminderJob {
  eventId: string;
  userId: string;
  offset: ReminderOffset;
}

const REMINDER_OFFSETS: { offset: ReminderOffset; leadMs: number }[] = [
  { offset: '24h', leadMs: 24 * 60 * 60 * 1000 },
  { offset: '15m', leadMs: 15 * 60 * 1000 },
];

const reminderKey = (eventId: string, userId: string, offset: ReminderOffset) =>
  `event-reminder:${eventId}:${userId}:${offset}`;

// Idempotent per-process queue creation, memoised so we don't hit the DB on
// every RSVP. `stately` policy + a per-(event,user,offset) singletonKey gives us
// "one pending reminder per key" dedupe (a re-RSVP won't stack duplicates).
let queueReady: Promise<void> | null = null;
function ensureQueue(boss: PgBoss): Promise<void> {
  if (!queueReady) {
    queueReady = boss.createQueue(EVENT_REMINDER_QUEUE, { policy: 'stately' }).catch((e) => {
      queueReady = null; // allow a later retry
      throw e;
    });
  }
  return queueReady;
}

/**
 * Schedule the two reminder jobs for a 'going' RSVP. No-op when the queue is
 * unavailable (best-effort). Skips any offset whose fire time is already past,
 * and sets a generous `retentionSeconds` so a far-future reminder isn't reaped
 * by pg-boss's default 14-day created-state retention before it fires.
 */
async function scheduleEventReminders(
  event: { id: string; startsAt: Date },
  userId: string,
): Promise<void> {
  const boss = await getBoss();
  if (!boss) return;
  try {
    await ensureQueue(boss);
    const now = Date.now();
    for (const { offset, leadMs } of REMINDER_OFFSETS) {
      const fireAt = new Date(event.startsAt.getTime() - leadMs);
      if (fireAt.getTime() <= now) continue;
      const retentionSeconds = Math.ceil((fireAt.getTime() - now) / 1000) + 86_400;
      await boss.send(
        EVENT_REMINDER_QUEUE,
        { eventId: event.id, userId, offset } satisfies EventReminderJob,
        {
          startAfter: fireAt,
          singletonKey: reminderKey(event.id, userId, offset),
          retentionSeconds,
          retryLimit: 2,
        },
      );
    }
  } catch (e) {
    console.error('[events] failed to schedule reminders:', (e as Error)?.message);
  }
}

/**
 * Best-effort cancel of pending reminder jobs for an (event,user) pair — used on
 * un-RSVP and on switching to 'maybe'. If cancellation fails or the API can't
 * reach a job, the worker's re-check (RSVP must still be 'going') makes it a
 * no-op at fire time, so this is purely an optimisation.
 */
async function cancelEventReminders(eventId: string, userId: string): Promise<void> {
  const boss = await getBoss();
  if (!boss) return;
  try {
    await ensureQueue(boss);
    for (const { offset } of REMINDER_OFFSETS) {
      const jobs = await boss.findJobs(EVENT_REMINDER_QUEUE, {
        key: reminderKey(eventId, userId, offset),
      });
      const ids = jobs.filter((j) => j.state === 'created' || j.state === 'retry').map((j) => j.id);
      if (ids.length) await boss.cancel(EVENT_REMINDER_QUEUE, ids);
    }
  } catch {
    /* best-effort — worker re-checks the RSVP before notifying */
  }
}

/**
 * The reminder job handler. Re-verifies the event exists / isn't canceled and
 * that the RSVP is still 'going' before notifying (the job may outlive an
 * un-RSVP or a cancellation). `createNotification` also mirrors to web push.
 */
export async function runEventReminder(job: EventReminderJob): Promise<void> {
  const event = await prisma.communityEvent.findUnique({
    where: { id: job.eventId },
    select: { id: true, title: true, canceledAt: true },
  });
  if (!event || event.canceledAt) return;

  const rsvp = await prisma.eventRsvp.findUnique({
    where: { eventId_userId: { eventId: job.eventId, userId: job.userId } },
    select: { status: true },
  });
  if (!rsvp || rsvp.status !== 'going') return;

  const when = job.offset === '24h' ? 'tomorrow' : 'in 15 minutes';
  await createNotification({
    userId: job.userId,
    type: 'SYSTEM',
    entityType: 'event',
    entityId: event.id,
    preview: `"${event.title}" starts ${when}.`,
    link: '/events',
  }).catch(() => {});
}

/**
 * Register the reminder worker on the `jobs` container's supervising pg-boss
 * instance. Call this from `server/jobs/index.ts` alongside the other workers.
 */
export async function registerEventReminderWorker(boss: PgBoss): Promise<void> {
  await boss.createQueue(EVENT_REMINDER_QUEUE, { policy: 'stately' });
  await boss.work<EventReminderJob>(EVENT_REMINDER_QUEUE, async (jobs) => {
    for (const job of jobs) await runEventReminder(job.data);
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const toDate = (v: Date | string): Date => (v instanceof Date ? v : new Date(v));

/**
 * Validate a URL venue reference. The URL is stored and rendered as an outbound
 * link (never fetched server-side), so the relevant guards are: http(s) scheme
 * only (blocks `javascript:`/`data:` XSS sinks) and rejecting private/internal
 * IP literals via the shared `isPrivateIp`. Any future server-side fetch of a
 * venue URL MUST go through `safeFetch` from `lib/ssrf-guard.server`.
 */
function assertSafeVenueUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new EventError('INVALID_VENUE_URL');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:')
    throw new EventError('INVALID_VENUE_URL');
  if (isIP(url.hostname) && isPrivateIp(url.hostname)) throw new EventError('INVALID_VENUE_URL');
  const normalized = url.toString();
  if (normalized.length > 191) throw new EventError('INVALID_VENUE_URL');
  return normalized;
}

const eventInclude = {
  host: { select: userDisplaySelect },
  community: { select: { id: true, slug: true, name: true, icon: true, color: true } },
} as const;

type EventRow = Awaited<ReturnType<typeof fetchEventRow>>;
function fetchEventRow(id: string) {
  return prisma.communityEvent.findUnique({ where: { id }, include: eventInclude });
}

function toPerson(user: Parameters<typeof resolveUser>[0]): EventPersonDTO {
  const r = resolveUser(user);
  return { id: r.id, name: r.name, image: r.image, handle: r.handle };
}

/**
 * Enrich raw event rows with RSVP counts, an attendee sample, and (when a viewer
 * is given) the viewer's own RSVP — in a bounded number of queries regardless of
 * how many events are passed.
 */
async function attachAndMap(
  rows: NonNullable<EventRow>[],
  viewerId: string | null,
  attendeeSample = 8,
): Promise<EventDTO[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);

  const grouped = await prisma.eventRsvp.groupBy({
    by: ['eventId', 'status'],
    where: { eventId: { in: ids } },
    _count: { _all: true },
  });
  const counts = new Map<string, { going: number; maybe: number }>();
  for (const g of grouped) {
    const c = counts.get(g.eventId) ?? { going: 0, maybe: 0 };
    if (g.status === 'going') c.going = g._count._all;
    else if (g.status === 'maybe') c.maybe = g._count._all;
    counts.set(g.eventId, c);
  }

  // Attendee avatar sample (earliest 'going' RSVPs), bucketed per event. Bounded
  // by a hard `take` cap so a huge list can't pull unbounded rows.
  const sampleRows = await prisma.eventRsvp.findMany({
    where: { eventId: { in: ids }, status: 'going' },
    orderBy: { createdAt: 'asc' },
    take: Math.min(ids.length * attendeeSample, 600),
    select: { eventId: true, user: { select: userDisplaySelect } },
  });
  const attendees = new Map<string, EventPersonDTO[]>();
  for (const row of sampleRows) {
    const list = attendees.get(row.eventId) ?? [];
    if (list.length < attendeeSample) list.push(toPerson(row.user));
    attendees.set(row.eventId, list);
  }

  const viewerRsvps = new Map<string, RsvpStatus>();
  if (viewerId) {
    const mine = await prisma.eventRsvp.findMany({
      where: { eventId: { in: ids }, userId: viewerId },
      select: { eventId: true, status: true },
    });
    for (const m of mine) viewerRsvps.set(m.eventId, m.status as RsvpStatus);
  }

  return rows.map((row) => {
    const c = counts.get(row.id) ?? { going: 0, maybe: 0 };
    return {
      id: row.id,
      hostId: row.hostId,
      communityId: row.communityId,
      title: row.title,
      description: row.description,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt ? row.endsAt.toISOString() : null,
      venueKind: row.venueKind as EventVenueKindValue,
      venueRef: row.venueRef,
      capacity: row.capacity,
      canceledAt: row.canceledAt ? row.canceledAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      host: toPerson(row.host),
      community: row.community
        ? {
            id: row.community.id,
            slug: row.community.slug,
            name: row.community.name,
            icon: row.community.icon,
            color: row.community.color,
          }
        : null,
      goingCount: c.going,
      maybeCount: c.maybe,
      attendees: attendees.get(row.id) ?? [],
      viewerRsvp: viewerRsvps.get(row.id) ?? null,
    };
  });
}

async function summarize(eventId: string, userId: string): Promise<RsvpResult> {
  const grouped = await prisma.eventRsvp.groupBy({
    by: ['status'],
    where: { eventId },
    _count: { _all: true },
  });
  let goingCount = 0;
  let maybeCount = 0;
  for (const g of grouped) {
    if (g.status === 'going') goingCount = g._count._all;
    else if (g.status === 'maybe') maybeCount = g._count._all;
  }
  const mine = await prisma.eventRsvp.findUnique({
    where: { eventId_userId: { eventId, userId } },
    select: { status: true },
  });
  return { goingCount, maybeCount, viewerRsvp: (mine?.status as RsvpStatus | undefined) ?? null };
}

// ─── Reads ───────────────────────────────────────────────────────────────────

/** A single event with counts, an attendee sample, and the viewer's RSVP. */
export async function getEvent(
  id: string,
  viewerId: string | null = null,
): Promise<EventDTO | null> {
  const row = await fetchEventRow(id);
  if (!row) return null;
  const [mapped] = await attachAndMap([row], viewerId, 12);
  return mapped ?? null;
}

/**
 * List upcoming events by scope:
 * - `upcoming`: all public upcoming events (profile-hosted or from public
 *   communities), soonest first.
 * - `community`: upcoming events for one community.
 * - `mine`: upcoming events the viewer has RSVP'd to (going or maybe).
 */
export async function listEvents(opts: {
  scope: EventScope;
  communityId?: string | null;
  userId?: string | null;
}): Promise<EventDTO[]> {
  const now = new Date();
  const viewerId = opts.userId ?? null;
  let rows: NonNullable<EventRow>[];

  if (opts.scope === 'mine') {
    if (!viewerId) return [];
    const rsvps = await prisma.eventRsvp.findMany({
      where: { userId: viewerId, event: { startsAt: { gte: now }, canceledAt: null } },
      orderBy: { event: { startsAt: 'asc' } },
      take: 60,
      select: { event: { include: eventInclude } },
    });
    rows = rsvps.map((r) => r.event);
  } else if (opts.scope === 'community') {
    if (!opts.communityId) return [];
    rows = await prisma.communityEvent.findMany({
      where: { communityId: opts.communityId, canceledAt: null, startsAt: { gte: now } },
      orderBy: { startsAt: 'asc' },
      take: 60,
      include: eventInclude,
    });
  } else {
    rows = await prisma.communityEvent.findMany({
      where: {
        canceledAt: null,
        startsAt: { gte: now },
        OR: [{ communityId: null }, { community: { isPrivate: false } }],
      },
      orderBy: { startsAt: 'asc' },
      take: 60,
      include: eventInclude,
    });
  }

  return attachAndMap(rows, viewerId);
}

/** Upcoming events across every community the viewer is a member of. */
export async function listMemberCommunityEvents(userId: string): Promise<EventDTO[]> {
  const memberships = await prisma.communityMember.findMany({
    where: { userId },
    select: { communityId: true },
  });
  const communityIds = memberships.map((m) => m.communityId);
  if (communityIds.length === 0) return [];

  const rows = await prisma.communityEvent.findMany({
    where: { communityId: { in: communityIds }, canceledAt: null, startsAt: { gte: new Date() } },
    orderBy: { startsAt: 'asc' },
    take: 60,
    include: eventInclude,
  });
  return attachAndMap(rows, userId);
}

// ─── Writes ──────────────────────────────────────────────────────────────────

export async function createEvent(input: CreateEventInput): Promise<EventDTO> {
  const start = toDate(input.startsAt);
  if (Number.isNaN(start.getTime())) throw new EventError('INVALID_DATES');
  const end = input.endsAt ? toDate(input.endsAt) : null;
  if (end && (Number.isNaN(end.getTime()) || end <= start)) throw new EventError('INVALID_DATES');

  // Community events require the host to be a mod/owner of that community.
  if (input.communityId) {
    const community = await prisma.community.findUnique({
      where: { id: input.communityId },
      select: { id: true },
    });
    if (!community) throw new EventError('NOT_FOUND');
    const role = await getRole(input.communityId, input.hostId);
    if (!canModerate(role)) throw new EventError('FORBIDDEN');
  }

  let venueRef = input.venueRef?.trim() || null;
  if (input.venueKind === 'URL') {
    if (!venueRef) throw new EventError('INVALID_VENUE_URL');
    venueRef = assertSafeVenueUrl(venueRef);
  }

  const created = await prisma.communityEvent.create({
    data: {
      hostId: input.hostId,
      communityId: input.communityId ?? null,
      title: input.title.trim(),
      description: input.description?.trim() ?? '',
      startsAt: start,
      endsAt: end,
      venueKind: input.venueKind,
      venueRef,
      capacity: input.capacity ?? null,
    },
    select: { id: true },
  });

  return (await getEvent(created.id, input.hostId))!;
}

export async function updateEvent(input: UpdateEventInput): Promise<EventDTO> {
  const event = await prisma.communityEvent.findUnique({
    where: { id: input.id },
    select: { id: true, hostId: true, venueKind: true, startsAt: true, endsAt: true },
  });
  if (!event) throw new EventError('NOT_FOUND');
  if (event.hostId !== input.hostId) throw new EventError('FORBIDDEN');

  const data: {
    title?: string;
    description?: string;
    startsAt?: Date;
    endsAt?: Date | null;
    venueKind?: EventVenueKindValue;
    venueRef?: string | null;
    capacity?: number | null;
  } = {};

  if (input.title !== undefined) data.title = input.title.trim();
  if (input.description !== undefined) data.description = input.description?.trim() ?? '';
  if (input.startsAt !== undefined) {
    const d = toDate(input.startsAt);
    if (Number.isNaN(d.getTime())) throw new EventError('INVALID_DATES');
    data.startsAt = d;
  }
  if (input.endsAt !== undefined) {
    data.endsAt = input.endsAt ? toDate(input.endsAt) : null;
    if (data.endsAt && Number.isNaN(data.endsAt.getTime())) throw new EventError('INVALID_DATES');
  }

  const effectiveStart = data.startsAt ?? event.startsAt;
  const effectiveEnd = data.endsAt !== undefined ? data.endsAt : event.endsAt;
  if (effectiveEnd && effectiveEnd <= effectiveStart) throw new EventError('INVALID_DATES');

  const nextKind = input.venueKind ?? (event.venueKind as EventVenueKindValue);
  if (input.venueKind !== undefined) data.venueKind = input.venueKind;
  if (input.venueRef !== undefined) {
    let ref = input.venueRef?.trim() || null;
    if (nextKind === 'URL') {
      if (!ref) throw new EventError('INVALID_VENUE_URL');
      ref = assertSafeVenueUrl(ref);
    }
    data.venueRef = ref;
  }
  if (input.capacity !== undefined) data.capacity = input.capacity ?? null;

  await prisma.communityEvent.update({ where: { id: input.id }, data });
  return (await getEvent(input.id, input.hostId))!;
}

export async function cancelEvent(id: string, hostId: string): Promise<EventDTO> {
  const event = await prisma.communityEvent.findUnique({
    where: { id },
    select: { id: true, hostId: true, canceledAt: true, title: true },
  });
  if (!event) throw new EventError('NOT_FOUND');
  if (event.hostId !== hostId) throw new EventError('FORBIDDEN');

  if (!event.canceledAt) {
    await prisma.communityEvent.update({ where: { id }, data: { canceledAt: new Date() } });
    // Notify everyone who RSVP'd (best-effort). Pending reminder jobs stay put;
    // the worker's canceled-check turns them into no-ops.
    const rsvps = await prisma.eventRsvp.findMany({
      where: { eventId: id },
      select: { userId: true },
    });
    for (const r of rsvps) {
      createNotification({
        userId: r.userId,
        type: 'SYSTEM',
        entityType: 'event',
        entityId: id,
        preview: `"${event.title}" was canceled.`,
        link: '/events',
      }).catch(() => {});
    }
  }

  return (await getEvent(id, hostId))!;
}

export async function rsvp(
  eventId: string,
  userId: string,
  status: RsvpStatus,
): Promise<RsvpResult> {
  const event = await prisma.communityEvent.findUnique({
    where: { id: eventId },
    select: { id: true, startsAt: true, capacity: true, canceledAt: true },
  });
  if (!event) throw new EventError('NOT_FOUND');
  if (event.canceledAt) throw new EventError('CANCELED');

  await prisma.$transaction(async (tx) => {
    // Enforce capacity for 'going' (count other users already going). Best-effort
    // under concurrency — v1 has no waitlist.
    if (status === 'going' && event.capacity != null) {
      const going = await tx.eventRsvp.count({
        where: { eventId, status: 'going', userId: { not: userId } },
      });
      if (going >= event.capacity) throw new EventError('CAPACITY_FULL');
    }
    await tx.eventRsvp.upsert({
      where: { eventId_userId: { eventId, userId } },
      create: { eventId, userId, status },
      update: { status },
    });
  });

  if (status === 'going') await scheduleEventReminders(event, userId);
  else await cancelEventReminders(eventId, userId);

  return summarize(eventId, userId);
}

export async function unrsvp(eventId: string, userId: string): Promise<RsvpResult> {
  await prisma.eventRsvp.deleteMany({ where: { eventId, userId } });
  await cancelEventReminders(eventId, userId);
  return summarize(eventId, userId);
}
