/**
 * Reading the programming grid (L1). Server-only.
 *
 * Merges two sources into one timeline:
 *
 *   1. **Editorial slots** — `ScheduledSlot` rows somebody put there.
 *   2. **What the platform already schedules** — tournaments with a start time
 *      and community events with an RSVP. Those are real appointments that
 *      already exist, and copying them into `ScheduledSlot` would mean two
 *      rows that can disagree about when a thing is.
 *
 * The second is why this is a merge rather than a query. A grid that only
 * showed what an editor typed would be empty on the days the site is busiest.
 */

import { prisma } from '@/lib/prisma.server';
import {
  buildGrid,
  groupByDay,
  nextUp,
  startOfDay,
  type Occurrence,
  type SlotDefinition,
  type SlotKind,
} from '@/lib/schedule/slots';

const DAY_MS = 86_400_000;

/** Largest window the grid will build in one request. */
export const MAX_DAYS = 31;

export interface GridView {
  from: string;
  days: number;
  next: Occurrence | null;
  byDay: { day: string; occurrences: Occurrence[] }[];
}

/**
 * The grid for a window.
 *
 * `from` is floored to midnight UTC so two requests a minute apart return the
 * same buckets — a grid whose day boundaries move with the clock re-renders
 * differently on every poll.
 */
export async function getGrid(from: Date = new Date(), days = 7): Promise<GridView> {
  const clamped = Math.min(Math.max(1, Math.trunc(days)), MAX_DAYS);
  const start = startOfDay(from);
  const end = new Date(start.getTime() + clamped * DAY_MS);

  const [editorial, tournaments, events] = await Promise.all([
    editorialSlots(start, end),
    tournamentSlots(start, end),
    eventSlots(start, end),
  ]);

  const occurrences = buildGrid([...editorial, ...tournaments, ...events], start, end);

  return {
    from: start.toISOString(),
    days: clamped,
    next: nextUp(occurrences, from),
    byDay: groupByDay(occurrences, start, clamped).map((b) => ({
      day: b.day.toISOString(),
      occurrences: b.occurrences,
    })),
  };
}

/**
 * Editorial rows.
 *
 * A recurring slot that started before the window still belongs in it, so the
 * query cannot filter on `startsAt >= from`. It filters on the slot having not
 * yet ENDED — `until` null or in the future — and lets the expander decide
 * which occurrences land.
 */
async function editorialSlots(from: Date, to: Date): Promise<SlotDefinition[]> {
  const rows = await prisma.scheduledSlot.findMany({
    where: {
      published: true,
      startsAt: { lte: to },
      OR: [{ until: null }, { until: { gte: from } }],
    },
    orderBy: { startsAt: 'asc' },
    take: 200,
  });

  return rows.map((r) => ({
    id: r.id,
    kind: r.kind as SlotKind,
    title: r.title,
    href: r.href,
    startsAt: r.startsAt,
    durationMinutes: r.durationMinutes,
    recurrence: (r.recurrence === 'daily' || r.recurrence === 'weekly'
      ? r.recurrence
      : 'once') as SlotDefinition['recurrence'],
    until: r.until,
  }));
}

/** Tournaments that start inside the window. */
async function tournamentSlots(from: Date, to: Date): Promise<SlotDefinition[]> {
  const rows = await prisma.tournament.findMany({
    where: { startsAt: { gte: from, lte: to } },
    orderBy: { startsAt: 'asc' },
    take: 100,
    select: { id: true, name: true, startsAt: true },
  });
  return rows.map((t) => ({
    id: `tournament:${t.id}`,
    kind: 'tournament' as const,
    title: t.name,
    href: `/tournaments/${t.id}`,
    startsAt: t.startsAt!,
    durationMinutes: 90,
    recurrence: 'once' as const,
    until: null,
  }));
}

/** Community events with a start inside the window. */
async function eventSlots(from: Date, to: Date): Promise<SlotDefinition[]> {
  const rows = await prisma.communityEvent.findMany({
    where: { startsAt: { gte: from, lte: to } },
    orderBy: { startsAt: 'asc' },
    take: 100,
    select: { id: true, title: true, startsAt: true, endsAt: true },
  });
  return rows.map((e) => ({
    id: `event:${e.id}`,
    kind: 'community-event' as const,
    title: e.title,
    href: `/events?event=${e.id}`,
    startsAt: e.startsAt,
    durationMinutes: e.endsAt
      ? Math.max(0, Math.round((e.endsAt.getTime() - e.startsAt.getTime()) / 60_000))
      : 60,
    recurrence: 'once' as const,
    until: null,
  }));
}
