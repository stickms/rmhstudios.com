/**
 * RMHEvents — server logic for community/profile events, RSVPs, and reminders
 * (platform expansion §6). Server-only: touches Prisma, the pg-boss queue, and
 * notifications.
 *
 * Rows are the one `Event` model (kind 'event', owner COMMUNITY or USER) and
 * answers the one `Rsvp` model; an answer about the event as a whole carries
 * `occurrenceAt = WHOLE_EVENT` (lib/calendar/event-model.ts). The grid, the
 * calendar feed, office hours and game nights read the same tables.
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
import { EventError } from '@/lib/events/event-error';
import {
  EVENT_REMINDER_QUEUE,
  cancelEventReminders,
  scheduleEventReminders,
  type EventReminderJob,
} from '@/lib/events/reminders.server';
import { getRole, canModerate } from '@/lib/communities/access.server';
import { activeSanction } from '@/lib/communities/sanction-read.server';
import { createNotification } from '@/lib/notifications.server';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';
import { isPrivateIp } from '@/lib/ssrf-guard.server';
import {
  OccurrenceError,
  activeSeriesWhere,
  checkRecurrence,
  decorateRecurring,
  isGoingToOccurrence,
  notifyRotation,
  nextLiveOccurrenceAfter,
  rsvpRecurring,
  unrsvpRecurring,
  upcomingOccurrenceEventIds,
  type RecurrenceInput,
} from '@/lib/calendar/recurring-events.server';
import { overridesFor } from '@/lib/events/occurrences.server';
import { effectiveStart } from '@/lib/events/occurrences';
import type { EventRecurrenceDTO } from '@/lib/calendar/types';
import { EVENT_KIND, WHOLE_EVENT } from '@/lib/calendar/event-model';
import { SITE_URL } from '@/lib/seo';
import { canManageEvent } from '@/lib/events/cohosts.server';
import { resolveRole, type CohostPersonDTO, type EventViewerRole } from '@/lib/events/cohosts';
import {
  canJoinWaitlist,
  waitlistPosition,
} from '@/lib/events/waitlist';
import {
  announcePromotions,
  lockEventRsvps,
  promoteFromWaitlist,
  readSeatState,
  readWaitlist,
} from '@/lib/events/waitlist.server';
import type { Prisma } from '@prisma/client';
import { emitRsvpChanged } from '@/lib/webhooks/activity-emit.server';
import { rsvpPayloadStatus } from '@/lib/webhooks/activity-events';

// ─── Types (client-safe: imported as `import type` by the UI) ────────────────

export type EventVenueKindValue = 'SPACE' | 'TOURNAMENT' | 'GAME' | 'URL' | 'IRL';
export type RsvpStatus = 'going' | 'maybe';
/** What a member can ask for: going, maybe, or a place on the waitlist of a full one-off event. */
export type RsvpRequest = RsvpStatus | 'waitlist';
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
  viewerRsvp: RsvpRequest | null;
  /** Members waiting for a seat (one-off events with a capacity). */
  waitlistCount: number;
  /** 1-based place of the viewer in the waitlist, when they are on it. */
  viewerWaitlistPosition: number | null;
  /** K4 — set on a repeating event; `startsAt`/`host`/counts then describe the shown occurrence. */
  recurrence?: EventRecurrenceDTO | null;
  /** Accepted co-hosts, in the order they were invited ("Hosted by A with B and C"). */
  cohosts: CohostPersonDTO[];
  /** What the viewer is to this event: host, accepted co-host, invited co-host, or nothing. */
  viewerRole: EventViewerRole;
}

export interface RsvpResult {
  goingCount: number;
  maybeCount: number;
  viewerRsvp: RsvpRequest | null;
  /** Absent on a repeating event, which has no waitlist. */
  waitlistCount?: number;
  viewerWaitlistPosition?: number | null;
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
  /** K4 — make the event repeat weekly or monthly, with an optional host rotation. */
  recurrence?: RecurrenceInput | null;
  /** PRIVATE: only the host and the people with an RSVP see it (a poll's event). */
  visibility?: 'PUBLIC' | 'PRIVATE';
  /** The availability poll this event is locked in from. */
  pollId?: string | null;
}

export interface UpdateEventInput {
  id: string;
  /** The member making the edit: the host, or an accepted co-host (s05-05). */
  hostId: string;
  title?: string;
  description?: string | null;
  startsAt?: Date | string;
  endsAt?: Date | string | null;
  venueKind?: EventVenueKindValue;
  venueRef?: string | null;
  capacity?: number | null;
  /** K4 — set, change (object) or clear (null) the repeat rule. */
  recurrence?: RecurrenceInput | null;
}

export { EventError, EVENT_REMINDER_QUEUE, scheduleEventReminders };
export type { EventReminderJob };

/**
 * The reminder job handler. Re-verifies the event exists / isn't canceled and
 * that the RSVP is still 'going' before notifying (the job may outlive an
 * un-RSVP or a cancellation). `createNotification` also mirrors to web push.
 */
export async function runEventReminder(job: EventReminderJob): Promise<void> {
  const event = await prisma.event.findUnique({
    where: { id: job.eventId },
    select: {
      id: true,
      kind: true,
      title: true,
      canceledAt: true,
      hostId: true,
      startsAt: true,
      endsAt: true,
      recurrence: true,
      recurUntil: true,
      recurTz: true,
      rotatingHostIds: true,
      capacity: true,
    },
  });
  if (!event || event.canceledAt) return;

  if (event.recurrence) {
    // K4 — a repeating event: the reminder belongs to one occurrence, and an
    // "every time" RSVP chains the next occurrence's reminders once this one fires.
    if (!job.occurrenceAt) return;
    const at = new Date(job.occurrenceAt);
    // s06-10 — a skipped date sends nothing, and a job scheduled for a time the date no longer has
    // (it was moved after the job was queued) is stale: the move scheduled a fresh one.
    const overrides = await overridesFor(event.id);
    const shown = effectiveStart(at, overrides);
    if (!shown) return;
    if (new Date(job.startsAt ?? job.occurrenceAt).getTime() !== shown.getTime()) return;
    if (!(await isGoingToOccurrence(job.eventId, job.userId, at))) return;
    const whenRecurring = job.offset === '24h' ? 'tomorrow' : 'in 15 minutes';
    await createNotification({
      userId: job.userId,
      type: 'SYSTEM',
      entityType: 'event',
      entityId: event.id,
      preview: `"${event.title}" starts ${whenRecurring}.`,
      link: '/calendar',
    }).catch(() => {});
    if (job.offset === '15m') {
      const standing = await prisma.rsvp.findFirst({
        where: { eventId: event.id, userId: job.userId, occurrenceAt: WHOLE_EVENT, everyTime: true },
        select: { id: true },
      });
      const next = standing ? nextLiveOccurrenceAfter(event, at, overrides) : null;
      if (next) {
        await scheduleEventReminders({ id: event.id, startsAt: next.startsAt }, job.userId, true, {
          occurrenceAt: next.occurrenceAt,
        });
      }
    }
    return;
  }

  const rsvp = await prisma.rsvp.findUnique({
    where: {
      eventId_userId_occurrenceAt: {
        eventId: job.eventId,
        userId: job.userId,
        occurrenceAt: WHOLE_EVENT,
      },
    },
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
    link: '/calendar',
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

/**
 * The rows these surfaces show: a member's event (kind 'event') — never a
 * platform grid slot, a game night or an office-hours booking, which the
 * calendar page lists in their own words — and never a DRAFT.
 */
const memberEventWhere = {
  kind: EVENT_KIND,
  owner: { in: ['COMMUNITY', 'USER'] },
  visibility: { not: 'DRAFT' },
} satisfies Prisma.EventWhereInput;

/** Listings everyone may see: the PUBLIC member events. */
const publicMemberEventWhere = {
  ...memberEventWhere,
  visibility: 'PUBLIC',
} satisfies Prisma.EventWhereInput;

type EventRow = Awaited<ReturnType<typeof fetchEventRow>>;
function fetchEventRow(id: string) {
  return prisma.event.findFirst({ where: { id, ...memberEventWhere }, include: eventInclude });
}

/**
 * A PRIVATE event (a poll's) is the host's and its invitees': the people with
 * an RSVP, and the poll's organiser, invitees and respondents.
 */
async function canViewPrivateEvent(
  row: { id: string; hostId: string | null; pollId: string | null },
  viewerId: string | null,
): Promise<boolean> {
  if (!viewerId) return false;
  if (row.hostId === viewerId) return true;
  // A co-host (invited or accepted) sees the event they were asked to help run, and nobody else gains sight of it.
  if ((await prisma.eventCohost.count({ where: { eventId: row.id, userId: viewerId } })) > 0) return true;
  const answered = await prisma.rsvp.count({ where: { eventId: row.id, userId: viewerId } });
  if (answered > 0) return true;
  if (!row.pollId) return false;
  const poll = await prisma.availabilityPoll.findUnique({
    where: { id: row.pollId },
    select: {
      creatorId: true,
      invitees: { where: { userId: viewerId }, select: { id: true }, take: 1 },
      responses: { where: { userId: viewerId }, select: { id: true }, take: 1 },
    },
  });
  return !!poll && (poll.creatorId === viewerId || poll.invitees.length > 0 || poll.responses.length > 0);
}

/** Whether `viewerId` may see this event at all (callers answer 404 otherwise). */
export async function canViewEvent(
  row: {
    id: string;
    hostId: string | null;
    communityId: string | null;
    visibility: string;
    pollId: string | null;
  },
  viewerId: string | null,
): Promise<boolean> {
  if (row.visibility === 'DRAFT') return false;
  if (row.visibility === 'PRIVATE' && !(await canViewPrivateEvent(row, viewerId))) return false;
  return canViewCommunityEvents(row.communityId, viewerId);
}

/** The venue of a row that predates venues (a poll's own event links its page). */
function venueOf(row: { venueKind: string | null; venueRef: string | null; href: string | null }): {
  venueKind: EventVenueKindValue;
  venueRef: string | null;
} {
  if (row.venueKind) return { venueKind: row.venueKind as EventVenueKindValue, venueRef: row.venueRef };
  return { venueKind: 'URL', venueRef: row.href ? `${SITE_URL}${row.href}` : null };
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

  const grouped = await prisma.rsvp.groupBy({
    by: ['eventId', 'status'],
    where: { eventId: { in: ids }, occurrenceAt: WHOLE_EVENT },
    _count: { _all: true },
  });
  const counts = new Map<string, { going: number; maybe: number; waiting: number }>();
  for (const g of grouped) {
    const c = counts.get(g.eventId) ?? { going: 0, maybe: 0, waiting: 0 };
    if (g.status === 'going') c.going = g._count._all;
    else if (g.status === 'maybe') c.maybe = g._count._all;
    else if (g.status === 'waitlist') c.waiting = g._count._all;
    counts.set(g.eventId, c);
  }

  // Attendee avatar sample (earliest 'going' RSVPs), bucketed per event. Bounded
  // by a hard `take` cap so a huge list can't pull unbounded rows.
  const sampleRows = await prisma.rsvp.findMany({
    where: { eventId: { in: ids }, occurrenceAt: WHOLE_EVENT, status: 'going' },
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

  const viewerRsvps = new Map<string, RsvpRequest>();
  const viewerPlaces = new Map<string, number>();
  if (viewerId) {
    const mine = await prisma.rsvp.findMany({
      where: { eventId: { in: ids }, userId: viewerId, occurrenceAt: WHOLE_EVENT },
      select: { eventId: true, status: true },
    });
    for (const m of mine) viewerRsvps.set(m.eventId, m.status as RsvpRequest);
    // Where the viewer stands: one bounded read (at most MAX_WAITLIST rows) per event they wait on.
    for (const m of mine.filter((r) => r.status === 'waitlist')) {
      const place = waitlistPosition(await readWaitlist(prisma, m.eventId), viewerId);
      if (place != null) viewerPlaces.set(m.eventId, place);
    }
  }

  // Co-hosts: the accepted ones for the card, plus the viewer's own row (an invitation shows its Accept / Decline).
  // At most MAX_COHOSTS rows exist per event, so the read is bounded.
  const cohostRows = await prisma.eventCohost.findMany({
    where: { eventId: { in: ids }, OR: [{ status: 'accepted' }, ...(viewerId ? [{ userId: viewerId }] : [])] },
    orderBy: [{ invitedAt: 'asc' }, { userId: 'asc' }],
    select: { eventId: true, userId: true, status: true, user: { select: userDisplaySelect } },
  });
  const cohostsOf = new Map<string, CohostPersonDTO[]>();
  const myCohostStatus = new Map<string, string>();
  for (const r of cohostRows) {
    if (r.status === 'accepted') cohostsOf.set(r.eventId, [...(cohostsOf.get(r.eventId) ?? []), toPerson(r.user)]);
    if (r.userId === viewerId) myCohostStatus.set(r.eventId, r.status);
  }

  const mapped: EventDTO[] = rows.map((row) => {
    const c = counts.get(row.id) ?? { going: 0, maybe: 0, waiting: 0 };
    return {
      id: row.id,
      // memberEventWhere: a member's event always has a host.
      hostId: row.hostId ?? '',
      communityId: row.communityId,
      title: row.title,
      description: row.description,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt ? row.endsAt.toISOString() : null,
      ...venueOf(row),
      capacity: row.capacity,
      canceledAt: row.canceledAt ? row.canceledAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      host: row.host
        ? toPerson(row.host)
        : { id: '', name: null, image: null, handle: null },
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
      waitlistCount: c.waiting,
      viewerWaitlistPosition: viewerPlaces.get(row.id) ?? null,
      cohosts: cohostsOf.get(row.id) ?? [],
      viewerRole: resolveRole(row.hostId, viewerId, myCohostStatus.get(row.id)),
    };
  });
  // K4 — repeating events show their next occurrence (time, host, attendance).
  return rows.some((r) => r.recurrence) ? decorateRecurring(mapped, rows, viewerId) : mapped;
}

async function summarize(eventId: string, userId: string): Promise<RsvpResult> {
  const grouped = await prisma.rsvp.groupBy({
    by: ['status'],
    where: { eventId, occurrenceAt: WHOLE_EVENT },
    _count: { _all: true },
  });
  let goingCount = 0;
  let maybeCount = 0;
  let waitlistCount = 0;
  for (const g of grouped) {
    if (g.status === 'going') goingCount = g._count._all;
    else if (g.status === 'maybe') maybeCount = g._count._all;
    else if (g.status === 'waitlist') waitlistCount = g._count._all;
  }
  const mine = await prisma.rsvp.findUnique({
    where: { eventId_userId_occurrenceAt: { eventId, userId, occurrenceAt: WHOLE_EVENT } },
    select: { status: true },
  });
  const viewerRsvp = (mine?.status as RsvpRequest | undefined) ?? null;
  return {
    goingCount,
    maybeCount,
    viewerRsvp,
    waitlistCount,
    viewerWaitlistPosition:
      viewerRsvp === 'waitlist' ? waitlistPosition(await readWaitlist(prisma, eventId), userId) : null,
  };
}

// ─── Reads ───────────────────────────────────────────────────────────────────

/**
 * Whether `viewerId` may see events of `communityId`: always for a public
 * community (or a profile event, `communityId` null), members only for a private
 * one. Callers answer 404 / empty on false so existence does not leak.
 */
export async function canViewCommunityEvents(
  communityId: string | null,
  viewerId: string | null,
): Promise<boolean> {
  if (!communityId) return true;
  const c = await prisma.community.findUnique({
    where: { id: communityId },
    select: {
      isPrivate: true,
      members: viewerId ? { where: { userId: viewerId }, select: { id: true }, take: 1 } : false,
    },
  });
  if (!c) return false;
  return !c.isPrivate || !!c.members?.length;
}

/** Prisma filter: events outside private communities, or in ones the viewer belongs to. */
function eventCommunityVisibleWhere(viewerId: string | null) {
  return {
    OR: [
      { communityId: null },
      { community: { isPrivate: false } },
      ...(viewerId ? [{ community: { members: { some: { userId: viewerId } } } }] : []),
    ],
  };
}

/** A single event with counts, an attendee sample, and the viewer's RSVP. */
export async function getEvent(
  id: string,
  viewerId: string | null = null,
): Promise<EventDTO | null> {
  const row = await fetchEventRow(id);
  if (!row) return null;
  if (!(await canViewEvent(row, viewerId))) return null;
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
    const rsvps = await prisma.rsvp.findMany({
      where: {
        userId: viewerId,
        occurrenceAt: WHOLE_EVENT,
        event: {
          ...memberEventWhere,
          canceledAt: null,
          OR: [{ startsAt: { gte: now } }, activeSeriesWhere(now)],
        },
      },
      orderBy: { event: { startsAt: 'asc' } },
      take: 60,
      select: { event: { include: eventInclude } },
    });
    // An RSVP outlives membership: drop events of private communities the viewer has left.
    rows = (
      await Promise.all(
        rsvps.map(async (r) => ((await canViewCommunityEvents(r.event.communityId, viewerId)) ? r.event : null)),
      )
    ).filter((e): e is NonNullable<typeof e> => e !== null);
    // K4 — one-off RSVPs to a single occurrence of a repeating event.
    const seen = new Set(rows.map((r) => r.id));
    const occurrenceIds = (await upcomingOccurrenceEventIds(viewerId, now)).filter((id) => !seen.has(id));
    if (occurrenceIds.length) {
      rows.push(
        ...(await prisma.event.findMany({
          where: {
            id: { in: occurrenceIds },
            ...memberEventWhere,
            canceledAt: null,
            ...eventCommunityVisibleWhere(viewerId),
          },
          take: 60,
          include: eventInclude,
        })),
      );
    }
  } else if (opts.scope === 'community') {
    if (!opts.communityId) return [];
    if (!(await canViewCommunityEvents(opts.communityId, viewerId))) return [];
    rows = await prisma.event.findMany({
      where: {
        ...publicMemberEventWhere,
        communityId: opts.communityId,
        canceledAt: null,
        OR: [{ startsAt: { gte: now } }, activeSeriesWhere(now)],
      },
      orderBy: { startsAt: 'asc' },
      take: 60,
      include: eventInclude,
    });
  } else {
    rows = await prisma.event.findMany({
      where: {
        ...publicMemberEventWhere,
        canceledAt: null,
        AND: [
          { OR: [{ startsAt: { gte: now } }, activeSeriesWhere(now)] },
          { OR: [{ communityId: null }, { community: { isPrivate: false } }] },
        ],
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

  const rows = await prisma.event.findMany({
    where: {
      ...publicMemberEventWhere,
      communityId: { in: communityIds },
      canceledAt: null,
      OR: [{ startsAt: { gte: new Date() } }, activeSeriesWhere(new Date())],
    },
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

  let recurrenceData: Awaited<ReturnType<typeof checkRecurrence>> | null = null;
  if (input.recurrence) {
    recurrenceData = await checkRecurrence(input.recurrence, {
      communityId: input.communityId ?? null,
      hostId: input.hostId,
      startsAt: start,
    });
    if (!recurrenceData.ok) throw new EventError('INVALID_RECURRENCE');
  }

  const created = await prisma.event.create({
    data: {
      ...(recurrenceData?.ok ? recurrenceData.data : {}),
      owner: input.communityId ? 'COMMUNITY' : 'USER',
      kind: EVENT_KIND,
      visibility: input.visibility ?? 'PUBLIC',
      pollId: input.pollId ?? null,
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

  if (recurrenceData?.ok && recurrenceData.data.rotatingHostIds.length) {
    notifyRotation(
      { id: created.id, title: input.title.trim(), hostId: input.hostId },
      recurrenceData.data.rotatingHostIds.filter((id) => id !== input.hostId),
    );
  }
  return (await getEvent(created.id, input.hostId))!;
}

export async function updateEvent(input: UpdateEventInput): Promise<EventDTO> {
  const event = await prisma.event.findFirst({
    where: { id: input.id, ...memberEventWhere },
    select: {
      id: true,
      hostId: true,
      venueKind: true,
      startsAt: true,
      endsAt: true,
      communityId: true,
      recurrence: true,
    },
  });
  if (!event) throw new EventError('NOT_FOUND');
  const role = await canManageEvent(event, input.hostId);
  if (!role) throw new EventError('FORBIDDEN');
  // The repeat rule (and its host rotation) is the host's; a co-host edits the details.
  if (role === 'cohost' && input.recurrence !== undefined) throw new EventError('FORBIDDEN');

  const data: {
    recurrence?: string | null;
    recurTz?: string | null;
    recurUntil?: Date | null;
    rotatingHostIds?: string[];
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

  const nextKind = input.venueKind ?? ((event.venueKind ?? 'URL') as EventVenueKindValue);
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

  if (input.recurrence === null) {
    data.recurrence = null;
    data.recurTz = null;
    data.recurUntil = null;
    data.rotatingHostIds = [];
  } else if (input.recurrence) {
    const checked = await checkRecurrence(input.recurrence, {
      communityId: event.communityId,
      hostId: event.hostId ?? input.hostId,
      startsAt: effectiveStart,
    });
    if (!checked.ok) throw new EventError('INVALID_RECURRENCE');
    Object.assign(data, checked.data);
  }

  // A one-off event whose capacity or start moved may have free seats now: the waitlist fills them
  // in the same locked transaction as the update (lowering the capacity never removes a guest).
  const oneOff = input.recurrence ? false : input.recurrence === null ? true : !event.recurrence;
  if (oneOff && (data.capacity !== undefined || data.startsAt !== undefined)) {
    const done = await prisma.$transaction(async (tx) => {
      await lockEventRsvps(tx, input.id);
      const updated = await tx.event.update({
        where: { id: input.id },
        data,
        select: { id: true, title: true, startsAt: true, capacity: true, canceledAt: true },
      });
      return { updated, promoted: await promoteFromWaitlist(tx, updated) };
    });
    await announcePromotions(done.updated, done.promoted);
  } else {
    await prisma.event.update({ where: { id: input.id }, data });
  }
  return (await getEvent(input.id, input.hostId))!;
}

export async function cancelEvent(id: string, hostId: string): Promise<EventDTO> {
  const event = await prisma.event.findFirst({
    where: { id, ...memberEventWhere },
    select: { id: true, hostId: true, canceledAt: true, title: true },
  });
  if (!event) throw new EventError('NOT_FOUND');
  if (event.hostId !== hostId) throw new EventError('FORBIDDEN');

  if (!event.canceledAt) {
    // Under the RSVP lock, so a seat freed by a racing un-RSVP cannot promote into a canceled event.
    await prisma.$transaction(async (tx) => {
      await lockEventRsvps(tx, id);
      await tx.event.update({ where: { id }, data: { canceledAt: new Date() } });
    });
    // Notify everyone who RSVP'd (best-effort). Pending reminder jobs stay put;
    // the worker's canceled-check turns them into no-ops.
    const rsvps = await prisma.rsvp.findMany({
      where: { eventId: id, status: { not: 'no' } },
      distinct: ['userId'],
      select: { userId: true },
    });
    for (const r of rsvps) {
      createNotification({
        userId: r.userId,
        type: 'SYSTEM',
        entityType: 'event',
        entityId: id,
        preview: `"${event.title}" was canceled.`,
        link: '/calendar',
      }).catch(() => {});
    }
    await prisma.rsvp.deleteMany({
      where: { eventId: id, occurrenceAt: WHOLE_EVENT, status: 'waitlist' },
    });
  }

  return (await getEvent(id, hostId))!;
}

export async function rsvp(
  eventId: string,
  userId: string,
  status: RsvpRequest,
  /** K4 — only meaningful on a repeating event. */
  opts: { everyTime?: boolean; occurrenceAt?: Date } = {},
): Promise<RsvpResult & { occurrenceAt?: string; viewerEveryTime?: boolean }> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      kind: true,
      communityId: true,
      visibility: true,
      pollId: true,
      hostId: true,
      startsAt: true,
      endsAt: true,
      capacity: true,
      canceledAt: true,
      recurrence: true,
      recurUntil: true,
      recurTz: true,
      rotatingHostIds: true,
    },
  });
  if (!event) throw new EventError('NOT_FOUND');
  if (!(await canViewEvent(event, userId))) throw new EventError('NOT_FOUND');
  // A booking is answered by booking it (lib/calendar/office-hours.server.ts).
  if (event.kind === 'office-hours') throw new EventError('FORBIDDEN');
  if (event.canceledAt) throw new EventError('CANCELED');
  // A member banned or timed out of the community cannot answer its events (s06-01,
  // BAN_ENFORCEMENT_PATHS); the site route and POST /api/v1/events/{id}/rsvp both come through here.
  // Withdrawing (`unrsvp`) stays open, so a sanctioned member can still take an answer back.
  if (event.communityId) {
    const sanction = await activeSanction(event.communityId, userId);
    if (sanction)
      throw new EventError('COMMUNITY_SANCTIONED', { kind: sanction.kind, endsAt: sanction.endsAt });
  }

  if (event.recurrence) {
    // Repeating events have no waitlist: attendance merges standing and per-date answers.
    if (status === 'waitlist') throw new EventError('FORBIDDEN');
    try {
      const before = await prisma.rsvp.findMany({
        where: { eventId: event.id, userId },
        select: { status: true, occurrenceAt: true },
      });
      const done = await rsvpRecurring(event, userId, status, {
        everyTime: !!opts.everyTime,
        occurrenceAt: opts.occurrenceAt,
      });
      // The answer in force for this date before the call: the date's own, else the standing one.
      const rows = Array.isArray(before) ? before : [];
      const prior =
        rows.find((r) => r.occurrenceAt.getTime() === done.at.getTime()) ??
        rows.find((r) => r.occurrenceAt.getTime() === WHOLE_EVENT.getTime());
      if (prior?.status !== status) {
        await emitRsvpChanged(userId, {
          eventId: event.id,
          occurrenceAt: done.at,
          status: rsvpPayloadStatus(status),
        });
      }
      if (status === 'going') {
        await scheduleEventReminders({ id: event.id, startsAt: done.effectiveAt }, userId, true, {
          occurrenceAt: done.at,
        });
      } else await cancelEventReminders(event.id, userId, done.at, [done.effectiveAt]);
      return done.summary;
    } catch (e) {
      if (e instanceof OccurrenceError) {
        throw new EventError(
          e.code === 'CAPACITY_FULL'
            ? 'CAPACITY_FULL'
            : e.code === 'CANCELED'
              ? 'CANCELED'
              : e.code === 'NOT_FOUND'
                ? 'NOT_FOUND'
                : e.code === 'SKIPPED'
                  ? 'OCCURRENCE_SKIPPED'
                  : 'INVALID_DATES',
        );
      }
      throw e;
    }
  }

  // One locked transaction: the lock is taken before anything is counted, so two members racing for
  // the last seat are served one after the other (the second finds it taken), and a guest who leaves
  // hands their seat to the waitlist in the same transaction.
  const done = await prisma.$transaction(async (tx) => {
    await lockEventRsvps(tx, eventId);
    const seats = await readSeatState(tx, eventId);
    if (!seats) throw new EventError('NOT_FOUND');
    if (seats.canceledAt) throw new EventError('CANCELED');
    const key = { eventId_userId_occurrenceAt: { eventId, userId, occurrenceAt: WHOLE_EVENT } };
    const mine = await tx.rsvp.findUnique({ where: key, select: { status: true } });
    let next = status;
    if (status !== 'maybe' && seats.capacity != null) {
      const others = await tx.rsvp.count({
        where: { eventId, occurrenceAt: WHOLE_EVENT, status: 'going', userId: { not: userId } },
      });
      const full = others >= seats.capacity;
      // A plain `going` on a full event keeps answering CAPACITY_FULL (older clients); only
      // an explicit request joins the waitlist, and a free seat is simply taken.
      if (status === 'going' && full) throw new EventError('CAPACITY_FULL');
      if (status === 'waitlist') {
        if (!full) next = 'going';
        else if (mine?.status !== 'waitlist') {
          const waiting = await tx.rsvp.count({
            where: { eventId, occurrenceAt: WHOLE_EVENT, status: 'waitlist' },
          });
          const verdict = canJoinWaitlist({ startsAt: seats.startsAt, now: new Date(), waiting });
          if (verdict === 'closed') throw new EventError('WAITLIST_CLOSED');
          if (verdict === 'full') throw new EventError('WAITLIST_FULL');
        }
      }
    } else if (status === 'waitlist') {
      next = 'going'; // no capacity, so no queue
    }
    if (next === 'waitlist') {
      // Re-joining keeps the original place in the queue.
      if (mine?.status !== 'waitlist') {
        await tx.rsvp.upsert({
          where: key,
          create: { eventId, userId, status: next, occurrenceAt: WHOLE_EVENT, waitlistedAt: new Date() },
          update: { status: next, waitlistedAt: new Date() },
        });
      }
    } else {
      await tx.rsvp.upsert({
        where: key,
        create: { eventId, userId, status: next, occurrenceAt: WHOLE_EVENT },
        update: { status: next, waitlistedAt: null },
      });
    }
    const promoted =
      mine?.status === 'going' && next !== 'going' ? await promoteFromWaitlist(tx, seats) : [];
    return { next, seats, promoted, prev: mine?.status ?? null };
  });

  // After commit, and only when the answer actually changed (re-sending the same one emits nothing).
  if (done.prev !== done.next) {
    await emitRsvpChanged(userId, {
      eventId,
      occurrenceAt: null,
      status: rsvpPayloadStatus(done.next),
    });
  }
  await announcePromotions(done.seats, done.promoted);
  if (done.next === 'going') await scheduleEventReminders(event, userId);
  else await cancelEventReminders(eventId, userId);

  return summarize(eventId, userId);
}

export async function unrsvp(
  eventId: string,
  userId: string,
  /** K4 — on a repeating event: sit out one date, or leave the series. */
  opts: { scope?: 'occurrence' | 'all'; occurrenceAt?: Date } = {},
): Promise<RsvpResult & { occurrenceAt?: string; viewerEveryTime?: boolean }> {
  const series = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      kind: true,
      hostId: true,
      startsAt: true,
      endsAt: true,
      capacity: true,
      recurrence: true,
      recurUntil: true,
      recurTz: true,
      rotatingHostIds: true,
    },
  });
  // A booking is cancelled, not un-RSVP'd (it would leave the host's slot taken).
  if (series?.kind === 'office-hours') throw new EventError('FORBIDDEN');
  if (series?.recurrence) {
    try {
      const done = await unrsvpRecurring(series, userId, opts.scope ?? 'occurrence', opts.occurrenceAt);
      await cancelEventReminders(eventId, userId, done.at, [done.effectiveAt]);
      return done.summary;
    } catch (e) {
      if (e instanceof OccurrenceError) throw new EventError(e.code === 'NOT_FOUND' ? 'NOT_FOUND' : 'INVALID_DATES');
      throw e;
    }
  }
  // A guest leaving frees a seat: the first waitlisted member takes it in the same transaction.
  const done = await prisma.$transaction(async (tx) => {
    await lockEventRsvps(tx, eventId);
    const mine = await tx.rsvp.findUnique({
      where: { eventId_userId_occurrenceAt: { eventId, userId, occurrenceAt: WHOLE_EVENT } },
      select: { status: true },
    });
    await tx.rsvp.deleteMany({ where: { eventId, userId, occurrenceAt: WHOLE_EVENT } });
    const seats = mine?.status === 'going' ? await readSeatState(tx, eventId) : null;
    return { seats, promoted: seats ? await promoteFromWaitlist(tx, seats) : [], had: !!mine };
  });
  // Taking an answer back is a change too; withdrawing with no answer on file changes nothing.
  if (done.had) await emitRsvpChanged(userId, { eventId, occurrenceAt: null, status: rsvpPayloadStatus('none') });
  if (done.seats) await announcePromotions(done.seats, done.promoted);
  await cancelEventReminders(eventId, userId);
  return summarize(eventId, userId);
}
