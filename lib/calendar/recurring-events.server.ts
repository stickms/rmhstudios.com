/**
 * K4 — recurring group events. Server-only.
 *
 * A repeating event is ONE `event` row carrying a compact rule
 * (`recurrence`, `recurTz`, `recurUntil`) and an optional host rotation.
 * Occurrences are computed (`recurrence.ts`), never stored, so a weekly event
 * with no end date costs one row.
 *
 * RSVPs are `rsvp` rows. An "every time" RSVP is the WHOLE_EVENT row with
 * `everyTime = true` and applies to every occurrence; a one-off RSVP is a row
 * whose `occurrenceAt` is that occurrence, and overrides the standing one
 * (status `no` sits one out).
 */
import { notice } from '@/lib/notifications/notice-keys';
import { prisma } from '@/lib/prisma.server';
import { createNotification } from '@/lib/notifications.server';
import { getRole } from '@/lib/communities/access.server';
import { isValidTimeZone } from './tz';
import type { EventDTO, EventPersonDTO, RsvpResult, RsvpStatus } from '@/lib/events.server';
import {
  effectiveAttendance,
  hostFor,
  occurrenceIndexOf,
  occurrencesBetween,
  type RecurringSeries,
} from './recurrence';
import {
  applyOverrides,
  effectiveStart,
  toUpcomingDTO,
  upcomingOccurrences,
  type OccurrenceOverride,
} from '@/lib/events/occurrences';
import { overridesFor, overridesForEvents } from '@/lib/events/occurrences.server';
import { loadPeople } from './people.server';
import { WHOLE_EVENT, seriesOf } from './event-model';
import type { EventRecurrenceDTO } from './types';
import type { UpcomingDateDTO } from '@/lib/events/occurrences';

/** How many upcoming dates the event card lists. */
const UPCOMING_SHOWN = 8;

export interface SeriesRow {
  id: string;
  /** Null only on a platform event, which has no host (the rotation then has none either). */
  hostId: string | null;
  startsAt: Date;
  endsAt: Date | null;
  recurrence: string | null;
  recurUntil: Date | null;
  recurTz: string | null;
  rotatingHostIds: string[];
  capacity: number | null;
}

export function seriesFromRow(row: SeriesRow): RecurringSeries | null {
  return seriesOf(row);
}

/** Prisma `where` for the standing "every time" answers of some events. */
const standingWhere = (eventId: string | { in: string[] }) => ({
  eventId,
  occurrenceAt: WHOLE_EVENT,
  everyTime: true,
});

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
  if (input.rule !== 'W' && input.rule !== 'M') return { ok: false, error: 'Unknown repeat rule' };
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
      preview: notice('event-host-rotation', { title: event.title }),
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
    /** The ORIGINAL start of the shown date: answers are keyed by it. */
    at: Date;
    index: number;
    /** Where the date is shown now (a moved date differs from `at`). */
    shownStart: Date;
    shownEnd: Date | null;
    upcoming: UpcomingDateDTO[];
  }[] = [];
  const dropped = new Set<string>();
  const seriesIds = dtos.filter((d) => byId.has(d.id) && seriesFromRow(byId.get(d.id) as SeriesRow)).map((d) => d.id);
  const overridesBy = await overridesForEvents(seriesIds);
  for (const dto of dtos) {
    const row = byId.get(dto.id);
    const series = row ? seriesFromRow(row) : null;
    if (!row || !series) continue;
    const overrides = overridesBy.get(dto.id) ?? [];
    // Skipped dates are listed (struck through) but never the one shown: the card leads with the next live date.
    const all = upcomingOccurrences(series, overrides, {
      now,
      spanMs: durationOf(row),
      limit: overrides.length + UPCOMING_SHOWN,
    });
    const live = all.find((o) => o.state !== 'skipped');
    if (!live) {
      dropped.add(dto.id);
      continue;
    }
    planned.push({
      dto,
      row,
      series,
      at: live.originalAt,
      index: live.index,
      shownStart: live.startsAt,
      shownEnd: live.endsAt,
      upcoming: all.slice(0, UPCOMING_SHOWN).map(toUpcomingDTO),
    });
  }
  if (planned.length === 0 && dropped.size === 0) return dtos;

  const ids = planned.map((p) => p.row.id);
  const [standing, occurrenceRows] = ids.length
    ? await Promise.all([
        prisma.rsvp.findMany({
          where: standingWhere({ in: ids }),
          select: { eventId: true, userId: true, status: true },
          take: 4000,
        }),
        prisma.rsvp.findMany({
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
    hostFor(p.row.hostId ?? '', p.row.rotatingHostIds, p.index),
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
    const hostId = hostFor(p.row.hostId ?? '', p.row.rotatingHostIds, p.index);
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
      occurrenceAt: p.at.toISOString(),
      upcoming: p.upcoming,
    };
    decorated.set(p.row.id, {
      ...p.dto,
      startsAt: p.shownStart.toISOString(),
      endsAt: p.shownEnd ? p.shownEnd.toISOString() : null,
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
  const rows = await prisma.rsvp.findMany({
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
      'NOT_FOUND' | 'CANCELED' | 'CAPACITY_FULL' | 'NO_OCCURRENCE' | 'BAD_OCCURRENCE' | 'SKIPPED',
  ) {
    super(code);
  }
}

/**
 * The occurrence an RSVP applies to: the one asked for (validated; a skipped date is refused unless
 * `allowSkipped`, which leaving a date uses) or the next live one. `effectiveAt` is where it is shown.
 */
async function resolveOccurrence(
  row: SeriesRow,
  requested: Date | undefined,
  now: Date,
  opts: { allowSkipped?: boolean } = {},
): Promise<{ at: Date; index: number; effectiveAt: Date }> {
  const series = seriesFromRow(row);
  if (!series) throw new OccurrenceError('NOT_FOUND');
  const overrides = await overridesFor(row.id);
  if (requested) {
    const index = occurrenceIndexOf(series, requested);
    if (index === null) throw new OccurrenceError('BAD_OCCURRENCE');
    const effectiveAt = effectiveStart(requested, overrides);
    if (!effectiveAt && !opts.allowSkipped) throw new OccurrenceError('SKIPPED');
    return { at: requested, index, effectiveAt: effectiveAt ?? requested };
  }
  const live = upcomingOccurrences(series, overrides, {
    now,
    spanMs: durationOf(row),
    limit: overrides.length + 1,
  }).find((o) => o.state !== 'skipped');
  if (!live) throw new OccurrenceError('NO_OCCURRENCE');
  return { at: live.originalAt, index: live.index, effectiveAt: live.startsAt };
}

export async function summarizeOccurrence(
  eventId: string,
  at: Date,
  userId: string,
): Promise<RsvpResult & { occurrenceAt: string; viewerEveryTime: boolean }> {
  const [standing, occurrence] = await Promise.all([
    prisma.rsvp.findMany({
      where: standingWhere(eventId),
      select: { userId: true, status: true },
      take: 4000,
    }),
    prisma.rsvp.findMany({
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
  const { at, effectiveAt } = await resolveOccurrence(row, opts.occurrenceAt, now);

  await prisma.$transaction(async (tx) => {
    // Serialise per event so the capacity check cannot be raced.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'event-rsvp:' + row.id}))`;
    // A skip that committed between the read above and this lock refuses the answer too (s06-10).
    const skip = await tx.eventOccurrenceOverride.findUnique({
      where: { eventId_occurrenceAt: { eventId: row.id, occurrenceAt: at } },
      select: { kind: true },
    });
    if (skip?.kind === 'skip') throw new OccurrenceError('SKIPPED');
    if (status === 'going' && row.capacity != null) {
      const [standing, occurrence] = await Promise.all([
        tx.rsvp.findMany({
          where: standingWhere(row.id),
          select: { userId: true, status: true },
          take: 4000,
        }),
        tx.rsvp.findMany({
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
      await tx.rsvp.upsert({
        where: {
          eventId_userId_occurrenceAt: { eventId: row.id, userId, occurrenceAt: WHOLE_EVENT },
        },
        create: { eventId: row.id, userId, status, everyTime: true, occurrenceAt: WHOLE_EVENT },
        update: { status, everyTime: true },
      });
      // "Every time" means every time: drop one-off overrides for upcoming dates.
      await tx.rsvp.deleteMany({
        where: { eventId: row.id, userId, occurrenceAt: { gte: now } },
      });
    } else {
      await tx.rsvp.upsert({
        where: { eventId_userId_occurrenceAt: { eventId: row.id, userId, occurrenceAt: at } },
        create: { eventId: row.id, userId, occurrenceAt: at, status },
        update: { status },
      });
    }
  });
  return { at, effectiveAt, summary: await summarizeOccurrence(row.id, at, userId) };
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
  const { at, effectiveAt } = await resolveOccurrence(row, occurrenceAt, now, { allowSkipped: true });
  if (scope === 'all') {
    await prisma.$transaction([
      prisma.rsvp.deleteMany({ where: { eventId: row.id, userId, occurrenceAt: WHOLE_EVENT } }),
      prisma.rsvp.deleteMany({
        where: { eventId: row.id, userId, occurrenceAt: { gte: now } },
      }),
    ]);
  } else {
    const standing = await prisma.rsvp.findFirst({
      where: { ...standingWhere(row.id), userId },
      select: { id: true },
    });
    if (standing) {
      await prisma.rsvp.upsert({
        where: { eventId_userId_occurrenceAt: { eventId: row.id, userId, occurrenceAt: at } },
        create: { eventId: row.id, userId, occurrenceAt: at, status: 'no' },
        update: { status: 'no' },
      });
    } else {
      await prisma.rsvp.deleteMany({
        where: { eventId: row.id, userId, occurrenceAt: at },
      });
    }
  }
  return { at, effectiveAt, summary: await summarizeOccurrence(row.id, at, userId) };
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
  return nextLiveOccurrenceAfter(row, after, [])?.occurrenceAt ?? null;
}

/**
 * The next date after `after` that has not been skipped: its original start (the answer key) and where it
 * is now (a moved date's new time). Skipped dates are passed over, so an "every time" chain never schedules
 * a reminder for one.
 */
export function nextLiveOccurrenceAfter(
  row: SeriesRow,
  after: Date,
  overrides: readonly OccurrenceOverride[],
): { occurrenceAt: Date; startsAt: Date } | null {
  const series = seriesFromRow(row);
  if (!series) return null;
  const from = new Date(after.getTime() + 60_000);
  const raw = occurrencesBetween(series, from, new Date(from.getTime() + 800 * 86_400_000), overrides.length + 2);
  const live = applyOverrides(raw, overrides)[0];
  return live ? { occurrenceAt: live.originalAt, startsAt: live.startsAt } : null;
}
