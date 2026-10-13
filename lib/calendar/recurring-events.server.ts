/**
 * K4 — recurring group events. Server-only.
 *
 * A repeating event is ONE `community_event` row carrying a compact rule
 * (`recurrence`, `recurTz`, `recurUntil`) and an optional host rotation.
 * Occurrences are computed (`recurrence.ts`), never stored, so a weekly event
 * with no end date costs one row.
 *
 * RSVPs: an "every time" RSVP is `event_rsvp.everyTime = true` and applies to
 * every occurrence; a one-off RSVP is an `event_occurrence_rsvp` row for that
 * occurrence only, and overrides the standing one (status `no` sits one out).
 */
import { prisma } from '@/lib/prisma.server';
import { createNotification } from '@/lib/notifications.server';
import { getRole } from '@/lib/communities/access.server';
import type { EventDTO, EventPersonDTO, RsvpResult, RsvpStatus } from '@/lib/events.server';
import {
  effectiveAttendance,
  hostFor,
  isRecurrenceRule,
  nextOccurrence,
  occurrenceIndexOf,
  type RecurringSeries,
} from './recurrence';
import { loadPeople } from './people.server';
import { isValidTimeZone } from './tz';
import type { EventRecurrenceDTO } from './types';

export interface SeriesRow {
  id: string;
  hostId: string;
  startsAt: Date;
  endsAt: Date | null;
  recurrence: string | null;
  recurUntil: Date | null;
  recurTz: string | null;
  rotatingHostIds: string[];
  capacity: number | null;
}

export function seriesFromRow(row: SeriesRow): RecurringSeries | null {
  if (!isRecurrenceRule(row.recurrence)) return null;
  return {
    rule: row.recurrence,
    tz: row.recurTz && isValidTimeZone(row.recurTz) ? row.recurTz : 'UTC',
    first: row.startsAt,
    until: row.recurUntil,
  };
}

/** Prisma `where` fragment: a repeating event that has not ended. */
export function activeSeriesWhere(now: Date) {
  return {
    recurrence: { not: null },
    OR: [{ recurUntil: null }, { recurUntil: { gte: new Date(now.getTime() - 86_400_000) } }],
  };
}

export interface RecurrenceInput {
  rule: 'W' | 'M';
  tz: string;
  until?: Date | null;
  rotatingHostIds: string[];
}

export type RecurrenceCheck =
  | {
      ok: true;
      data: {
        recurrence: string;
        recurTz: string;
        recurUntil: Date | null;
        rotatingHostIds: string[];
      };
    }
  | { ok: false; error: string };

/** Validate the rule and, for a community event, that every rotating host is a member. */
export async function checkRecurrence(
  input: RecurrenceInput,
  ctx: { communityId: string | null; hostId: string; startsAt: Date },
): Promise<RecurrenceCheck> {
  if (!isRecurrenceRule(input.rule)) return { ok: false, error: 'Unknown repeat rule' };
  if (!isValidTimeZone(input.tz)) return { ok: false, error: 'Unknown timezone' };
  if (input.until && input.until.getTime() < ctx.startsAt.getTime()) {
    return { ok: false, error: 'The repeat must end after the first event' };
  }
  const rotation = [...new Set(input.rotatingHostIds)];
  if (rotation.length > 0) {
    if (ctx.communityId) {
      const roles = await Promise.all(rotation.map((id) => getRole(ctx.communityId as string, id)));
      if (roles.some((r) => !r))
        return { ok: false, error: 'Every rotating host must be a community member' };
    } else {
      const found = await prisma.user.count({ where: { id: { in: rotation } } });
      if (found !== rotation.length)
        return { ok: false, error: 'Unknown member in the host rotation' };
    }
  }
  return {
    ok: true,
    data: {
      recurrence: input.rule,
      recurTz: input.tz,
      recurUntil: input.until ?? null,
      rotatingHostIds: rotation,
    },
  };
}

/** Tell members they are in a new event's host rotation. */
export function notifyRotation(
  event: { id: string; title: string; hostId: string },
  ids: string[],
): void {
  for (const userId of ids) {
    void createNotification({
      userId,
      actorId: event.hostId,
      type: 'SYSTEM',
      entityType: 'event',
      entityId: event.id,
      preview: `You are in the host rotation for "${event.title}".`,
      link: '/events',
    });
  }
}

const toPerson = (p: {
  id: string;
  name: string | null;
  image: string | null;
  handle: string | null;
}): EventPersonDTO => ({
  id: p.id,
  name: p.name,
  image: p.image,
  handle: p.handle,
});

type EventRowLike = SeriesRow & { host: unknown };

/**
 * Rewrite the DTOs of repeating events to show their NEXT occurrence — its
 * time, host, attendance and the viewer's RSVP for that date. Series that have
 * no remaining occurrence are dropped. Non-repeating DTOs pass through, and the
 * list is returned in start order. A bounded number of queries however many
 * events are passed.
 */
export async function decorateRecurring(
  dtos: EventDTO[],
  rows: readonly EventRowLike[],
  viewerId: string | null,
  now: Date = new Date(),
): Promise<EventDTO[]> {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const planned: {
    dto: EventDTO;
    row: SeriesRow;
    series: RecurringSeries;
    at: Date;
    index: number;
  }[] = [];
  const dropped = new Set<string>();
  for (const dto of dtos) {
    const row = byId.get(dto.id);
    const series = row ? seriesFromRow(row) : null;
    if (!row || !series) continue;
    const next = nextOccurrence(series, new Date(now.getTime() - Math.max(0, durationOf(row)) / 2));
    if (!next) {
      dropped.add(dto.id);
      continue;
    }
    planned.push({ dto, row, series, at: next.startsAt, index: next.index });
  }
  if (planned.length === 0 && dropped.size === 0) return dtos;

  const ids = planned.map((p) => p.row.id);
  const [standing, occurrenceRows] = ids.length
    ? await Promise.all([
        prisma.eventRsvp.findMany({
          where: { eventId: { in: ids }, everyTime: true },
          select: { eventId: true, userId: true, status: true },
          take: 4000,
        }),
        prisma.eventOccurrenceRsvp.findMany({
          where: {
            eventId: { in: ids },
            occurrenceAt: { in: planned.map((p) => p.at) },
          },
          select: { eventId: true, userId: true, status: true, occurrenceAt: true },
          take: 4000,
        }),
      ])
    : [[], []];

  const peopleIds = planned.flatMap((p) => [
    hostFor(p.row.hostId, p.row.rotatingHostIds, p.index),
    ...p.row.rotatingHostIds,
  ]);
  const attendanceByEvent = new Map<string, Map<string, 'going' | 'maybe'>>();
  for (const p of planned) {
    attendanceByEvent.set(
      p.row.id,
      effectiveAttendance(
        standing.filter((s) => s.eventId === p.row.id),
        occurrenceRows.filter(
          (o) => o.eventId === p.row.id && o.occurrenceAt.getTime() === p.at.getTime(),
        ),
      ),
    );
  }
  const sampleIds = planned.flatMap((p) =>
    [...(attendanceByEvent.get(p.row.id) ?? [])]
      .filter(([, s]) => s === 'going')
      .slice(0, 8)
      .map(([u]) => u),
  );
  const people = await loadPeople([...peopleIds, ...sampleIds]);

  const decorated = new Map<string, EventDTO>();
  for (const p of planned) {
    const att = attendanceByEvent.get(p.row.id) ?? new Map();
    let going = 0;
    let maybe = 0;
    for (const s of att.values()) {
      if (s === 'going') going++;
      else maybe++;
    }
    const durationMs = durationOf(p.row);
    const hostId = hostFor(p.row.hostId, p.row.rotatingHostIds, p.index);
    const hostPerson = people.get(hostId);
    const recurrence: EventRecurrenceDTO = {
      rule: p.series.rule,
      tz: p.series.tz,
      until: p.series.until ? p.series.until.toISOString() : null,
      index: p.index,
      occurrenceHost: hostPerson ?? { id: hostId, name: null, handle: null, image: null },
      rotation: p.row.rotatingHostIds.flatMap((id) => {
        const person = people.get(id);
        return person ? [person] : [];
      }),
      viewerEveryTime:
        !!viewerId && standing.some((s) => s.eventId === p.row.id && s.userId === viewerId),
    };
    decorated.set(p.row.id, {
      ...p.dto,
      startsAt: p.at.toISOString(),
      endsAt: durationMs > 0 ? new Date(p.at.getTime() + durationMs).toISOString() : null,
      host: hostPerson ? toPerson(hostPerson) : p.dto.host,
      goingCount: going,
      maybeCount: maybe,
      attendees: [...att.entries()]
        .filter(([, s]) => s === 'going')
        .slice(0, 8)
        .flatMap(([u]) => {
          const person = people.get(u);
          return person ? [toPerson(person)] : [];
        }),
      viewerRsvp: viewerId ? (att.get(viewerId) ?? null) : null,
      recurrence,
    });
  }

  return dtos
    .filter((d) => !dropped.has(d.id))
    .map((d) => decorated.get(d.id) ?? d)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

function durationOf(row: SeriesRow): number {
  return row.endsAt ? row.endsAt.getTime() - row.startsAt.getTime() : 0;
}

/** Event ids the member has a one-off RSVP for in the future (the "mine" list needs them). */
export async function upcomingOccurrenceEventIds(userId: string, now: Date): Promise<string[]> {
  const rows = await prisma.eventOccurrenceRsvp.findMany({
    where: { userId, occurrenceAt: { gte: now }, status: { not: 'no' } },
    select: { eventId: true },
    distinct: ['eventId'],
    take: 60,
  });
  return rows.map((r) => r.eventId);
}

export class OccurrenceError extends Error {
  constructor(
    public readonly code:
      'NOT_FOUND' | 'CANCELED' | 'CAPACITY_FULL' | 'NO_OCCURRENCE' | 'BAD_OCCURRENCE',
  ) {
    super(code);
  }
}

/** The occurrence an RSVP applies to: the one asked for (validated) or the next. */
async function resolveOccurrence(
  row: SeriesRow,
  requested: Date | undefined,
  now: Date,
): Promise<{ at: Date; index: number }> {
  const series = seriesFromRow(row);
  if (!series) throw new OccurrenceError('NOT_FOUND');
  if (requested) {
    const index = occurrenceIndexOf(series, requested);
    if (index === null) throw new OccurrenceError('BAD_OCCURRENCE');
    return { at: requested, index };
  }
  const next = nextOccurrence(series, new Date(now.getTime() - Math.max(0, durationOf(row)) / 2));
  if (!next) throw new OccurrenceError('NO_OCCURRENCE');
  return { at: next.startsAt, index: next.index };
}

async function summarizeOccurrence(
  eventId: string,
  at: Date,
  userId: string,
): Promise<RsvpResult & { occurrenceAt: string; viewerEveryTime: boolean }> {
  const [standing, occurrence] = await Promise.all([
    prisma.eventRsvp.findMany({
      where: { eventId, everyTime: true },
      select: { userId: true, status: true },
      take: 4000,
    }),
    prisma.eventOccurrenceRsvp.findMany({
      where: { eventId, occurrenceAt: at },
      select: { userId: true, status: true },
      take: 4000,
    }),
  ]);
  const att = effectiveAttendance(standing, occurrence);
  let goingCount = 0;
  let maybeCount = 0;
  for (const s of att.values()) {
    if (s === 'going') goingCount++;
    else maybeCount++;
  }
  return {
    goingCount,
    maybeCount,
    viewerRsvp: att.get(userId) ?? null,
    occurrenceAt: at.toISOString(),
    viewerEveryTime: standing.some((s) => s.userId === userId),
  };
}

/** RSVP to a repeating event: to one occurrence, or "every time". */
export async function rsvpRecurring(
  row: SeriesRow & { canceledAt: Date | null },
  userId: string,
  status: RsvpStatus,
  opts: { everyTime: boolean; occurrenceAt?: Date },
) {
  if (row.canceledAt) throw new OccurrenceError('CANCELED');
  const now = new Date();
  const { at } = await resolveOccurrence(row, opts.occurrenceAt, now);

  await prisma.$transaction(async (tx) => {
    // Serialise per event so the capacity check cannot be raced.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'event-rsvp:' + row.id}))`;
    if (status === 'going' && row.capacity != null) {
      const [standing, occurrence] = await Promise.all([
        tx.eventRsvp.findMany({
          where: { eventId: row.id, everyTime: true },
          select: { userId: true, status: true },
          take: 4000,
        }),
        tx.eventOccurrenceRsvp.findMany({
          where: { eventId: row.id, occurrenceAt: at },
          select: { userId: true, status: true },
          take: 4000,
        }),
      ]);
      const att = effectiveAttendance(standing, occurrence);
      att.delete(userId);
      const going = [...att.values()].filter((s) => s === 'going').length;
      if (going >= row.capacity) throw new OccurrenceError('CAPACITY_FULL');
    }
    if (opts.everyTime) {
      await tx.eventRsvp.upsert({
        where: { eventId_userId: { eventId: row.id, userId } },
        create: { eventId: row.id, userId, status, everyTime: true },
        update: { status, everyTime: true },
      });
      // "Every time" means every time: drop one-off overrides for upcoming dates.
      await tx.eventOccurrenceRsvp.deleteMany({
        where: { eventId: row.id, userId, occurrenceAt: { gte: now } },
      });
    } else {
      await tx.eventOccurrenceRsvp.upsert({
        where: { eventId_userId_occurrenceAt: { eventId: row.id, userId, occurrenceAt: at } },
        create: { eventId: row.id, userId, occurrenceAt: at, status },
        update: { status },
      });
    }
  });
  return { at, summary: await summarizeOccurrence(row.id, at, userId) };
}

/**
 * Withdraw from a repeating event. `scope: 'occurrence'` sits out just this
 * date (keeping a standing RSVP); `'all'` removes the standing RSVP and every
 * upcoming one-off.
 */
export async function unrsvpRecurring(
  row: SeriesRow,
  userId: string,
  scope: 'occurrence' | 'all',
  occurrenceAt?: Date,
) {
  const now = new Date();
  const { at } = await resolveOccurrence(row, occurrenceAt, now);
  if (scope === 'all') {
    await prisma.$transaction([
      prisma.eventRsvp.deleteMany({ where: { eventId: row.id, userId } }),
      prisma.eventOccurrenceRsvp.deleteMany({
        where: { eventId: row.id, userId, occurrenceAt: { gte: now } },
      }),
    ]);
  } else {
    const standing = await prisma.eventRsvp.findFirst({
      where: { eventId: row.id, userId, everyTime: true },
      select: { id: true },
    });
    if (standing) {
      await prisma.eventOccurrenceRsvp.upsert({
        where: { eventId_userId_occurrenceAt: { eventId: row.id, userId, occurrenceAt: at } },
        create: { eventId: row.id, userId, occurrenceAt: at, status: 'no' },
        update: { status: 'no' },
      });
    } else {
      await prisma.eventOccurrenceRsvp.deleteMany({
        where: { eventId: row.id, userId, occurrenceAt: at },
      });
    }
  }
  return { at, summary: await summarizeOccurrence(row.id, at, userId) };
}

/** Is this member attending that occurrence? (the reminder worker re-checks with it) */
export async function isGoingToOccurrence(
  eventId: string,
  userId: string,
  at: Date,
): Promise<boolean> {
  const s = await summarizeOccurrence(eventId, at, userId);
  return s.viewerRsvp === 'going';
}

/** The occurrence right after `after`, for scheduling the next reminder of an every-time RSVP. */
export function occurrenceAfter(row: SeriesRow, after: Date): Date | null {
  const series = seriesFromRow(row);
  if (!series) return null;
  return nextOccurrence(series, new Date(after.getTime() + 60_000))?.startsAt ?? null;
}
