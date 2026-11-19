/**
 * Reading the programming grid (L1) — the "What's on" half of /calendar.
 * Server-only.
 *
 * Two sources, one timeline:
 *
 *   1. **Events** — the one Event model: the platform's own slots (puzzle
 *      drops, premieres, game nights) and every PUBLIC community or profile
 *      event, repeating ones expanded over the window.
 *   2. **Tournaments** with a start time, which are their own model (a
 *      bracket, not an appointment) and are read where they are.
 *
 * A grid that only showed what an editor typed would be empty on the days the
 * site is busiest, which is why members' events are on it.
 */

import { prisma } from '@/lib/prisma.server';
import {
  GAME_NIGHT_KIND,
  OFFICE_HOURS_KIND,
  durationMs,
  gridKind,
  gridOccurrences,
} from '@/lib/calendar/event-model';
import { attendanceBetween } from '@/lib/calendar/feed-entries';
import { myEventInputs } from '@/lib/calendar/my-events.server';
import {
  buildGrid,
  groupByDay,
  nextUp,
  startOfDay,
  type Occurrence,
  type SlotDefinition,
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

  const [events, tournaments] = await Promise.all([
    eventOccurrences(start, end),
    tournamentSlots(start, end),
  ]);

  const occurrences = [...events, ...buildGrid(tournaments, start, end)].sort(
    (a, b) => a.startsAt.getTime() - b.startsAt.getTime(),
  );

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

/** Where an event's grid row links. */
export function eventHref(e: {
  kind: string;
  href: string | null;
  hostId: string | null;
  pollId: string | null;
  community: { slug: string } | null;
}): string | null {
  if (e.href) return e.href;
  if (e.kind === GAME_NIGHT_KIND) return '/calendar#game-night';
  if (e.kind === OFFICE_HOURS_KIND && e.hostId) return `/office-hours/${e.hostId}`;
  if (e.pollId) return `/when/${e.pollId}`;
  if (e.community) return `/c/${e.community.slug}`;
  return '/communities?tab=events';
}

/**
 * Every PUBLIC event with a start in the window. A repeating event that
 * started before the window still belongs in it, so the query cannot filter on
 * `startsAt >= from`: it takes series that have not ENDED and lets the
 * expander decide which occurrences land.
 */
async function eventOccurrences(from: Date, to: Date): Promise<Occurrence[]> {
  const rows = await prisma.event.findMany({
    where: {
      visibility: 'PUBLIC',
      canceledAt: null,
      // Public schedule: events of private communities are members-only.
      AND: [
        { OR: [{ communityId: null }, { community: { isPrivate: false } }] },
        {
          OR: [
            { recurrence: null, startsAt: { gte: from, lte: to } },
            {
              recurrence: { not: null },
              startsAt: { lte: to },
              OR: [{ recurUntil: null }, { recurUntil: { gte: new Date(from.getTime() - DAY_MS) } }],
            },
          ],
        },
      ],
    },
    orderBy: { startsAt: 'asc' },
    take: 300,
    select: {
      id: true,
      kind: true,
      title: true,
      href: true,
      hostId: true,
      pollId: true,
      startsAt: true,
      endsAt: true,
      recurrence: true,
      recurUntil: true,
      recurTz: true,
      community: { select: { slug: true } },
    },
  });
  return rows.flatMap((r) => gridOccurrences(r, eventHref(r), from, to));
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

/**
 * The member's own calendar for a window — the "Yours" half of /calendar:
 * what they RSVP'd to, booked, host, locked in or added, the same set their
 * ICS feed carries (lib/calendar/my-events.server.ts). 'maybe' answers are
 * shown; a date they sat out is not.
 */
export async function getMyGrid(userId: string, from: Date = new Date(), days = 7): Promise<GridView> {
  const clamped = Math.min(Math.max(1, Math.trunc(days)), MAX_DAYS);
  const start = startOfDay(from);
  const end = new Date(start.getTime() + clamped * DAY_MS);
  const inputs = await myEventInputs(userId, start, end);

  const occurrences: Occurrence[] = [];
  for (const input of inputs) {
    const e = input.event;
    if (e.canceledAt) continue;
    const span = durationMs(e);
    const title =
      e.kind === OFFICE_HOURS_KIND ? `Office hours with ${input.otherName ?? 'a member'}` : e.title;
    const href =
      e.kind === OFFICE_HOURS_KIND && e.hostId
        ? `/office-hours/${e.hostId}`
        : e.pollId
          ? `/when/${e.pollId}`
          : e.owner === 'PLATFORM'
            ? (e.href ?? (e.kind === GAME_NIGHT_KIND ? '/calendar#game-night' : null))
            : '/communities?tab=events';
    for (const { startsAt } of attendanceBetween(input, start, end)) {
      occurrences.push({
        slotId: e.id,
        kind: gridKind(e.kind),
        title,
        href,
        startsAt,
        endsAt: new Date(startsAt.getTime() + span),
      });
    }
  }
  occurrences.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

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
