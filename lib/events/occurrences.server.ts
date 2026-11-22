/**
 * Skip or move one date of a repeating event (s06-10), the server half (the rules are in `occurrences.ts`).
 *
 * Create, replace and restore run in one transaction that first takes `lockEventRsvps`, the same
 * `event-rsvp:<id>` key `rsvpRecurring` takes, so an answer racing a skip either lands before it (and the
 * person is told) or finds the date skipped. Answers stay keyed by the ORIGINAL occurrence start and are
 * never rewritten by a move. Notifications and reminder changes happen after the commit, once per person.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { WHOLE_EVENT, durationMs, seriesOf } from '@/lib/calendar/event-model';
import { effectiveAttendance, occurrencesBetween } from '@/lib/calendar/recurrence';
import { createNotification } from '@/lib/notifications.server';
import { EventError } from '@/lib/events/event-error';
import { assertHostOrAdmin, lockEventRsvps } from '@/lib/events/waitlist.server';
import { cancelEventReminders, scheduleEventReminders } from '@/lib/events/reminders.server';
import {
  MAX_OVERRIDES,
  applyOverrides,
  checkOverride,
  effectiveStart,
  occurrenceNoticePreview,
  upcomingDates,
  type OccurrenceKind,
  type OccurrenceOverride,
  type OccurrenceRefusal,
  type UpcomingDateDTO,
} from '@/lib/events/occurrences';

type Db = Pick<Prisma.TransactionClient, 'eventOccurrenceOverride'>;

/** A refused change; `code` is stable for the client (`errorField(e, 'code')`). */
export class OccurrenceChangeError extends Error {
  constructor(public readonly code: OccurrenceRefusal | 'TOO_MANY' | 'CANCELED') {
    super(code);
    this.name = 'OccurrenceChangeError';
  }
}

const overrideSelect = {
  eventId: true,
  occurrenceAt: true,
  kind: true,
  startsAt: true,
  endsAt: true,
  note: true,
  updatedAt: true,
} as const;

type Row = {
  occurrenceAt: Date;
  kind: string;
  startsAt: Date | null;
  endsAt: Date | null;
  note: string | null;
  updatedAt?: Date;
};

const toOverride = (r: Row): OccurrenceOverride => ({
  occurrenceAt: r.occurrenceAt,
  kind: r.kind === 'skip' ? 'skip' : 'move',
  startsAt: r.startsAt,
  endsAt: r.endsAt,
  note: r.note,
  ...(r.updatedAt
    ? {
        updatedAt: r.updatedAt,
      }
    : {}),
});

/** The overrides of one event (at most {@link MAX_OVERRIDES} rows). */
export async function overridesFor(eventId: string, db: Db = prisma): Promise<OccurrenceOverride[]> {
  const rows = await db.eventOccurrenceOverride.findMany({
    where: {
      eventId,
    },
    orderBy: {
      occurrenceAt: 'asc',
    },
    take: MAX_OVERRIDES,
    select: overrideSelect,
  });
  return (Array.isArray(rows) ? rows : []).map(toOverride);
}

/** The overrides of several events in one query. */
export async function overridesForEvents(eventIds: readonly string[]): Promise<Map<string, OccurrenceOverride[]>> {
  const out = new Map<string, OccurrenceOverride[]>();
  if (eventIds.length === 0) return out;
  const rows = await prisma.eventOccurrenceOverride.findMany({
    where: {
      eventId: {
        in: [...eventIds],
      },
    },
    orderBy: {
      occurrenceAt: 'asc',
    },
    take: MAX_OVERRIDES * eventIds.length,
    select: overrideSelect,
  });
  for (const r of Array.isArray(rows) ? rows : []) {
    const list = out.get(r.eventId) ?? [];
    list.push(toOverride(r));
    out.set(r.eventId, list);
  }
  return out;
}

export interface OccurrenceChange {
  occurrenceAt: Date;
  kind: OccurrenceKind;
  startsAt?: Date | null;
  endsAt?: Date | null;
  note?: string | null;
}

interface Audience {
  /** Everyone with an answer for that date (standing or one-off), waitlisted people included. */
  everyone: string[];
  /** The ones whose answer is 'going' (they have reminders). */
  going: string[];
  /** The ones going on a standing "every time" answer: their reminder chain runs through this date. */
  standing: string[];
}

async function audienceOf(tx: Pick<Prisma.TransactionClient, 'rsvp'>, eventId: string, at: Date): Promise<Audience> {
  const rows = await tx.rsvp.findMany({
    where: {
      eventId,
      OR: [
        {
          occurrenceAt: WHOLE_EVENT,
        },
        {
          occurrenceAt: at,
        },
      ],
    },
    select: {
      userId: true,
      status: true,
      occurrenceAt: true,
      everyTime: true,
    },
    take: 4000,
  });
  const list = Array.isArray(rows) ? rows : [];
  const standing = list.filter((r) => r.occurrenceAt.getTime() === 0 && r.everyTime);
  const occurrence = list.filter((r) => r.occurrenceAt.getTime() === at.getTime());
  const att = effectiveAttendance(standing, occurrence);
  const waiting = list.filter((r) => r.status === 'waitlist').map((r) => r.userId);
  return {
    everyone: [...new Set([...att.keys(), ...waiting])],
    standing: standing.map((r) => r.userId).filter((u) => att.get(u) === 'going'),
    going: [...att.entries()].filter(([, s]) => s === 'going').map(([u]) => u),
  };
}

async function loadSeries(tx: Pick<Prisma.TransactionClient, 'event'>, eventId: string) {
  const event = await tx.event.findUnique({
    where: {
      id: eventId,
    },
    select: {
      id: true,
      title: true,
      startsAt: true,
      endsAt: true,
      recurrence: true,
      recurUntil: true,
      recurTz: true,
      canceledAt: true,
    },
  });
  if (!event) throw new EventError('NOT_FOUND');
  const series = seriesOf(event);
  if (!series) throw new EventError('NOT_FOUND');
  if (event.canceledAt) throw new OccurrenceChangeError('CANCELED');
  return {
    event,
    series,
  };
}

interface Applied {
  title: string;
  tz: string;
  audience: Audience;
  /** Where the date was shown (and its reminders keyed) before, and where it is now (null: skipped). */
  before: Date;
  after: Date | null;
  change: OccurrenceKind | 'restore';
  startsAt: Date | null;
  upcoming: UpcomingDateDTO[];
  /**
   * The next date that is not skipped, for a skip: an "every time" reminder chain is carried from one
   * date to the next by the earlier date's own reminder, which a skip cancels, so the skip hands the
   * chain on itself.
   */
  chain: { occurrenceAt: Date; startsAt: Date } | null;
}

/** The first date after `at` that is not skipped: its original start (the answer key) and where it is now. */
function nextLive(
  series: Parameters<typeof occurrencesBetween>[0],
  overrides: readonly OccurrenceOverride[],
  at: Date,
): { occurrenceAt: Date; startsAt: Date } | null {
  const from = new Date(at.getTime() + 60_000);
  const raw = occurrencesBetween(series, from, new Date(from.getTime() + 800 * 86_400_000), overrides.length + 2);
  const live = applyOverrides(raw, overrides)[0];
  return live ? { occurrenceAt: live.originalAt, startsAt: live.startsAt } : null;
}

/** After the commit: drop the old reminders, schedule the new ones and tell each person once. */
async function announce(eventId: string, actorId: string, at: Date, a: Applied): Promise<void> {
  const text = occurrenceNoticePreview({
    title: a.title,
    change: a.change,
    occurrenceAt: at,
    startsAt: a.startsAt,
    tz: a.tz,
  });
  for (const userId of a.audience.everyone) {
    try {
      await cancelEventReminders(eventId, userId, at, [a.before]);
      if (a.after && a.audience.going.includes(userId)) {
        await scheduleEventReminders(
          {
            id: eventId,
            startsAt: a.after,
          },
          userId,
          true,
          {
            occurrenceAt: at,
          },
        );
      }
      if (!a.after && a.chain && a.audience.standing.includes(userId)) {
        await scheduleEventReminders(
          {
            id: eventId,
            startsAt: a.chain.startsAt,
          },
          userId,
          true,
          {
            occurrenceAt: a.chain.occurrenceAt,
          },
        );
      }
      if (userId !== actorId) {
        await createNotification({
          userId,
          actorId,
          type: 'SYSTEM',
          entityType: 'event_occurrence',
          entityId: eventId,
          preview: text,
          link: '/calendar',
        });
      }
    } catch {
      /* best-effort: the reminder worker re-checks the date before it sends */
    }
  }
}

/** Skip or move one future date of a repeating event; replaces any earlier change of that date. */
export async function setOverride(
  eventId: string,
  actorId: string,
  isAdmin: boolean,
  input: OccurrenceChange,
  now: Date = new Date(),
): Promise<{
  upcoming: UpcomingDateDTO[];
}> {
  await assertHostOrAdmin(eventId, actorId, isAdmin, {
    recurring: true,
    denyWith: 'FORBIDDEN',
  });
  const applied = await prisma.$transaction(async (tx): Promise<Applied> => {
    await lockEventRsvps(tx, eventId);
    const { event, series } = await loadSeries(tx, eventId);
    const refusal = checkOverride(series, input, now);
    if (refusal) throw new OccurrenceChangeError(refusal);
    const existing = await tx.eventOccurrenceOverride.findUnique({
      where: {
        eventId_occurrenceAt: {
          eventId,
          occurrenceAt: input.occurrenceAt,
        },
      },
      select: overrideSelect,
    });
    if (
      !existing &&
      (await tx.eventOccurrenceOverride.count({
        where: {
          eventId,
        },
      })) >= MAX_OVERRIDES
    ) {
      throw new OccurrenceChangeError('TOO_MANY');
    }
    const move = input.kind === 'move';
    const data = {
      kind: input.kind,
      startsAt: move ? (input.startsAt ?? null) : null,
      endsAt: move ? (input.endsAt ?? null) : null,
      note: input.note?.trim() || null,
    };
    await tx.eventOccurrenceOverride.upsert({
      where: {
        eventId_occurrenceAt: {
          eventId,
          occurrenceAt: input.occurrenceAt,
        },
      },
      create: {
        eventId,
        occurrenceAt: input.occurrenceAt,
        createdById: actorId,
        ...data,
      },
      update: {
        ...data,
        createdById: actorId,
      },
    });
    const overrides = await overridesFor(eventId, tx);
    const prior = existing ? toOverride(existing) : null;
    return {
      title: event.title,
      tz: series.tz,
      audience: await audienceOf(tx, eventId, input.occurrenceAt),
      before: prior ? (effectiveStart(input.occurrenceAt, [prior]) ?? input.occurrenceAt) : input.occurrenceAt,
      after: move ? (data.startsAt ?? input.occurrenceAt) : null,
      chain: move ? null : nextLive(series, overrides, input.occurrenceAt),
      change: input.kind,
      startsAt: data.startsAt,
      upcoming: upcomingDates(series, overrides, {
        now,
        spanMs: durationMs(event),
      }),
    };
  });
  await announce(eventId, actorId, input.occurrenceAt, applied);
  return {
    upcoming: applied.upcoming,
  };
}

/** Bring a skipped or moved future date back (idempotent: a date with no change answers the same dates). */
export async function restoreOccurrence(
  eventId: string,
  actorId: string,
  isAdmin: boolean,
  occurrenceAt: Date,
  now: Date = new Date(),
): Promise<{
  upcoming: UpcomingDateDTO[];
}> {
  await assertHostOrAdmin(eventId, actorId, isAdmin, {
    recurring: true,
    denyWith: 'FORBIDDEN',
  });
  const applied = await prisma.$transaction(async (tx): Promise<Applied | null> => {
    await lockEventRsvps(tx, eventId);
    const { event, series } = await loadSeries(tx, eventId);
    const refusal = checkOverride(
      series,
      {
        occurrenceAt,
        kind: 'skip',
      },
      now,
    );
    if (refusal) throw new OccurrenceChangeError(refusal);
    const prior = await tx.eventOccurrenceOverride.findUnique({
      where: {
        eventId_occurrenceAt: {
          eventId,
          occurrenceAt,
        },
      },
      select: overrideSelect,
    });
    if (!prior) return null;
    await tx.eventOccurrenceOverride.deleteMany({
      where: {
        eventId,
        occurrenceAt,
      },
    });
    const overrides = await overridesFor(eventId, tx);
    return {
      title: event.title,
      tz: series.tz,
      audience: await audienceOf(tx, eventId, occurrenceAt),
      before: effectiveStart(occurrenceAt, [toOverride(prior)]) ?? occurrenceAt,
      after: occurrenceAt,
      chain: null,
      change: 'restore',
      startsAt: null,
      upcoming: upcomingDates(series, overrides, {
        now,
        spanMs: durationMs(event),
      }),
    };
  });
  if (applied) {
    await announce(eventId, actorId, occurrenceAt, applied);
    return {
      upcoming: applied.upcoming,
    };
  }
  const { event, series } = await loadSeries(prisma, eventId);
  return {
    upcoming: upcomingDates(series, await overridesFor(eventId), {
      now,
      spanMs: durationMs(event),
    }),
  };
}

/** The dates of an event as a reader sees them, for a path that has the rows already. */
export function visibleDates<
  T extends {
    startsAt: Date;
    endsAt?: Date | null;
  },
>(occurrences: readonly T[], overrides: readonly OccurrenceOverride[]) {
  return applyOverrides(occurrences, overrides);
}

/**
 * Account erasure: where the member made an override the reference is nulled (the override is event data
 * and stays); the events of a deleted host are handled as they are today.
 */
export function eventOverrideErasureOps(userId: string) {
  return [
    prisma.eventOccurrenceOverride.updateMany({
      where: {
        createdById: userId,
      },
      data: {
        createdById: null,
      },
    }),
  ];
}
