/**
 * Adapters from the v1 shapes (`/api/v1/events*`, `/api/v1/me/events`) to the functions the site uses.
 * Visibility is exactly `canViewEvent` (a draft, a private event of strangers and a private community's
 * events are `null`, never a different answer); repeating events are expanded with the site's own
 * expansion (`startsBetween`) and have their skipped and moved dates applied (`applyOverrides`); the RSVP
 * write IS the site's `rsvp` / `unrsvp`, so capacity, the waitlist and reminders behave as on the site.
 * Every function acts as the key owner and takes no other member's id.
 */
import type { Prisma } from '@prisma/client';
import type { z } from 'zod';
import { prisma } from '@/lib/prisma.server';
import { RATE_LIMIT_POLICIES, rateLimit } from '@/lib/rate-limit';
import { checkRateLimit } from '@/lib/rate-limit.server';
import { resolveUser, userDisplaySelect } from '@/lib/user-display';
import {
  canViewEvent,
  rsvp,
  unrsvp,
  createEvent,
  updateEvent,
  cancelEvent,
  EventError,
  type CreateEventInput,
  type UpdateEventInput,
} from '@/lib/events.server';
import { UpdateError, listUpdates, postUpdate } from '@/lib/events/updates.server';
import { EVENT_KIND, WHOLE_EVENT, durationMs, seriesOf, startsBetween } from '@/lib/calendar/event-model';
import { attendanceBetween } from '@/lib/calendar/feed-entries';
import { effectiveAttendance, hostFor, occurrenceIndexOf } from '@/lib/calendar/recurrence';
import { OVERRIDE_MARGIN_MS, applyOverrides, upcomingOccurrences } from '@/lib/events/occurrences';
import { overridesForEvents } from '@/lib/events/occurrences.server';
import type { rsvpBody, createEventBody, updateEventBody, postUpdateApiBody } from '@/lib/api/v1/events-schema';
import { denyText } from '@/lib/communities/bans';
import {
  decodeOccurrenceCursor,
  decodeUserCursor,
  encodeOccurrenceCursor,
  encodeUserCursor,
} from '@/lib/api/v1/events-schema';

const DAY_MS = 86_400_000;
/** Events read for one window before visibility and paging (a bound, never a page). */
const EVENTS_SCANNED = 300;
const NEXT_DATES = 10;
const UPDATES_SHOWN = 5;
const RSVP_ROWS = 8000;

export interface ApiPerson {
  id: string;
  handle: string;
  name: string;
}

export interface ApiCounts {
  going: number;
  maybe: number;
  waitlisted: number;
}

export interface ApiEvent {
  id: string;
  title: string;
  description: string;
  /** ISO 8601 UTC. For a repeating event, the date shown (a moved date is where it now is). */
  startsAt: string;
  endsAt: string | null;
  /** The event's IANA time zone (repeating events); null for a one-off. */
  timeZone: string | null;
  /** The ORIGINAL start of the date, which answers are keyed by; null for a one-off. */
  occurrence: string | null;
  state: 'normal' | 'moved';
  note: string | null;
  repeats: boolean;
  venueKind: string;
  venue: string | null;
  capacity: number | null;
  communityId: string | null;
  canceled: boolean;
  host: ApiPerson;
  cohosts: ApiPerson[];
  counts: ApiCounts;
  yourRsvp: 'going' | 'maybe' | 'waitlisted' | null;
}

export interface Page<T> {
  data: T[];
  nextCursor: string | null;
}

const include = {
  host: {
    select: userDisplaySelect,
  },
  community: {
    select: {
      id: true,
      slug: true,
      name: true,
    },
  },
} satisfies Prisma.EventInclude;

type Row = Prisma.EventGetPayload<{
  include: typeof include;
}>;

interface Slot {
  row: Row;
  startsAt: Date;
  endsAt: Date | null;
  original: Date | null;
  state: 'normal' | 'moved';
  note: string | null;
}

const toPerson = (u: Parameters<typeof resolveUser>[0]): ApiPerson => {
  const r = resolveUser(u);
  return {
    id: r.id,
    handle: r.handle ?? r.username ?? '',
    name: r.name ?? r.handle ?? r.username ?? '',
  };
};

const arr = <T>(v: T[] | unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** The rows a key owner may see: `canViewEvent`'s rule, applied per row (the where only narrows the scan). */
async function visible(rows: Row[], ownerId: string): Promise<Row[]> {
  const keep: Row[] = [];
  for (const row of rows) {
    if (row.kind !== EVENT_KIND || row.hostId === null) continue;
    if (await canViewEvent(row, ownerId)) keep.push(row);
  }
  return keep;
}

/** Dates of the rows inside [from, to] with overrides applied; a skipped date is gone, a moved one is where it is. */
function expand(rows: Row[], from: Date, to: Date, overrides: Map<string, ReturnType<typeof arr>>): Slot[] {
  const out: Slot[] = [];
  for (const row of rows) {
    if (!seriesOf(row)) {
      if (row.startsAt >= from && row.startsAt <= to)
        out.push({
          row,
          startsAt: row.startsAt,
          endsAt: row.endsAt,
          original: null,
          state: 'normal',
          note: null,
        });
      continue;
    }
    const ov = (overrides.get(row.id) ?? []) as Parameters<typeof applyOverrides>[1];
    const margin = ov.length > 0 ? OVERRIDE_MARGIN_MS : 0;
    const span = durationMs(row);
    const raw = startsBetween(row, new Date(from.getTime() - margin), new Date(to.getTime() + margin)).map(
      (startsAt) => ({
        startsAt,
        endsAt: span > 0 ? new Date(startsAt.getTime() + span) : null,
      }),
    );
    for (const o of applyOverrides(raw, ov)) {
      if (o.startsAt < from || o.startsAt > to) continue;
      out.push({
        row,
        startsAt: o.startsAt,
        endsAt: o.endsAt ?? null,
        original: o.originalAt,
        state: o.state === 'moved' ? 'moved' : 'normal',
        note: o.note,
      });
    }
  }
  return out;
}

const slotOrder = (a: Slot, b: Slot) =>
  a.startsAt.getTime() - b.startsAt.getTime() ||
  (a.row.id < b.row.id ? -1 : a.row.id > b.row.id ? 1 : 0) ||
  (a.original?.getTime() ?? 0) - (b.original?.getTime() ?? 0);

const after = (
  s: Slot,
  c: {
    startsAtMs: number;
    id: string;
    originalMs: number;
  },
) =>
  s.startsAt.getTime() !== c.startsAtMs
    ? s.startsAt.getTime() > c.startsAtMs
    : s.row.id !== c.id
      ? s.row.id > c.id
      : (s.original?.getTime() ?? 0) > c.originalMs;

/** Serialise a page of dates: counts, hosts and co-hosts in a bounded number of queries. */
async function serialise(slots: Slot[], ownerId: string): Promise<ApiEvent[]> {
  if (slots.length === 0) return [];
  const ids = [...new Set(slots.map((s) => s.row.id))];
  const originals = slots.flatMap((s) => (s.original ? [s.original] : []));
  const [rsvps, cohostRows] = await Promise.all([
    prisma.rsvp.findMany({
      where: {
        eventId: {
          in: ids,
        },
        OR: [
          {
            occurrenceAt: WHOLE_EVENT,
          },
          ...(originals.length
            ? [
                {
                  occurrenceAt: {
                    in: originals,
                  },
                },
              ]
            : []),
        ],
      },
      select: {
        eventId: true,
        userId: true,
        status: true,
        occurrenceAt: true,
        everyTime: true,
      },
      take: RSVP_ROWS,
    }),
    prisma.eventCohost.findMany({
      where: {
        eventId: {
          in: ids,
        },
        status: 'accepted',
      },
      orderBy: [
        {
          invitedAt: 'asc',
        },
        {
          userId: 'asc',
        },
      ],
      select: {
        eventId: true,
        user: {
          select: userDisplaySelect,
        },
      },
    }),
  ]);
  const rotation = [...new Set(slots.flatMap((s) => s.row.rotatingHostIds))];
  const rotationUsers = rotation.length
    ? await prisma.user.findMany({
        where: {
          id: {
            in: rotation,
          },
        },
        select: userDisplaySelect,
        take: rotation.length,
      })
    : [];
  const people = new Map(
    arr<
      Parameters<typeof resolveUser>[0] & {
        id: string;
      }
    >(rotationUsers).map((u) => [u.id, toPerson(u)]),
  );
  const cohosts = new Map<string, ApiPerson[]>();
  for (const c of arr<{
    eventId: string;
    user: Parameters<typeof resolveUser>[0];
  }>(cohostRows))
    cohosts.set(c.eventId, [...(cohosts.get(c.eventId) ?? []), toPerson(c.user)]);
  const answers = arr<{
    eventId: string;
    userId: string;
    status: string;
    occurrenceAt: Date;
    everyTime: boolean;
  }>(rsvps);

  return slots.map((s) => {
    const mine = answers.filter((a) => a.eventId === s.row.id);
    const series = seriesOf(s.row);
    let counts: ApiCounts = {
      going: 0,
      maybe: 0,
      waitlisted: 0,
    };
    let yourRsvp: ApiEvent['yourRsvp'] = null;
    if (series && s.original) {
      const att = effectiveAttendance(
        mine.filter((a) => a.occurrenceAt.getTime() === 0 && a.everyTime),
        mine.filter((a) => a.occurrenceAt.getTime() === s.original?.getTime()),
      );
      for (const v of att.values())
        counts = {
          ...counts,
          [v]: counts[v] + 1,
        };
      yourRsvp = att.get(ownerId) ?? null;
    } else {
      for (const a of mine.filter((x) => x.occurrenceAt.getTime() === 0)) {
        if (a.status === 'going') counts.going++;
        else if (a.status === 'maybe') counts.maybe++;
        else if (a.status === 'waitlist') counts.waitlisted++;
        if (a.userId === ownerId)
          yourRsvp =
            a.status === 'waitlist' ? 'waitlisted' : a.status === 'going' || a.status === 'maybe' ? a.status : null;
      }
    }
    let host = toPerson(s.row.host as Parameters<typeof resolveUser>[0]);
    if (series && s.original && s.row.rotatingHostIds.length) {
      const index = occurrenceIndexOf(series, s.original);
      const who = index === null ? null : people.get(hostFor(s.row.hostId ?? '', s.row.rotatingHostIds, index));
      if (who) host = who;
    }
    return {
      id: s.row.id,
      title: s.row.title,
      description: s.row.description,
      startsAt: s.startsAt.toISOString(),
      endsAt: s.endsAt ? s.endsAt.toISOString() : null,
      timeZone: s.row.recurTz,
      occurrence: s.original ? s.original.toISOString() : null,
      state: s.state,
      note: s.note,
      repeats: !!series,
      venueKind: s.row.venueKind ?? 'URL',
      venue: s.row.venueRef,
      capacity: s.row.capacity,
      communityId: s.row.communityId,
      canceled: !!s.row.canceledAt,
      host,
      cohosts: cohosts.get(s.row.id) ?? [],
      counts,
      yourRsvp,
    };
  });
}

/** Events in a window that could be listed at all (the scan bound; visibility is applied after). */
const inWindowWhere = (from: Date, to: Date): Prisma.EventWhereInput => ({
  kind: EVENT_KIND,
  owner: {
    in: ['COMMUNITY', 'USER'],
  },
  visibility: {
    not: 'DRAFT',
  },
  canceledAt: null,
  OR: [
    {
      recurrence: null,
      startsAt: {
        gte: from,
        lte: to,
      },
    },
    {
      recurrence: {
        not: null,
      },
      startsAt: {
        lte: new Date(to.getTime() + OVERRIDE_MARGIN_MS),
      },
      AND: [
        {
          OR: [
            {
              recurUntil: null,
            },
            {
              recurUntil: {
                gte: new Date(from.getTime() - OVERRIDE_MARGIN_MS - DAY_MS),
              },
            },
          ],
        },
      ],
    },
  ],
});

function pageOf(slots: Slot[], limit: number, cursor: string | undefined): Slot[] | 'invalid_cursor' {
  const sorted = [...slots].sort(slotOrder);
  if (!cursor) return sorted.slice(0, limit + 1);
  const c = decodeOccurrenceCursor(cursor);
  if (!c) return 'invalid_cursor';
  return sorted.filter((s) => after(s, c)).slice(0, limit + 1);
}

async function finishPage(slots: Slot[], limit: number, ownerId: string): Promise<Page<ApiEvent>> {
  const more = slots.length > limit;
  const shown = slots.slice(0, limit);
  const last = shown[shown.length - 1];
  return {
    data: await serialise(shown, ownerId),
    nextCursor:
      more && last
        ? encodeOccurrenceCursor({
            startsAtMs: last.startsAt.getTime(),
            id: last.row.id,
            originalMs: last.original?.getTime() ?? 0,
          })
        : null,
  };
}

/** `GET /events`: the events the key owner can see, repeating ones expanded into dates inside the window. */
export async function listEventsForKey(
  ownerId: string,
  q: {
    from: Date;
    to: Date;
    community?: string | undefined;
    limit: number;
    cursor?: string | undefined;
  },
): Promise<Page<ApiEvent> | 'invalid_cursor'> {
  const rows = arr<Row>(
    await prisma.event.findMany({
      where: {
        ...inWindowWhere(q.from, q.to),
        ...(q.community
          ? {
              community: {
                OR: [
                  {
                    id: q.community,
                  },
                  {
                    slug: q.community,
                  },
                ],
              },
            }
          : {}),
      },
      orderBy: [
        {
          startsAt: 'asc',
        },
        {
          id: 'asc',
        },
      ],
      take: EVENTS_SCANNED,
      include,
    }),
  );
  const seen = await visible(rows, ownerId);
  const overrides = await overridesForEvents(seen.filter((r) => seriesOf(r)).map((r) => r.id));
  const page = pageOf(expand(seen, q.from, q.to, overrides), q.limit, q.cursor);
  if (page === 'invalid_cursor') return page;
  return finishPage(page, q.limit, ownerId);
}

/** `GET /me/events`: the dates the key owner answered going or maybe, as the site's attendance rule has them. */
export async function listMyEventsForKey(
  ownerId: string,
  q: {
    from: Date;
    to: Date;
    limit: number;
    cursor?: string | undefined;
  },
): Promise<Page<ApiEvent> | 'invalid_cursor'> {
  const answers = arr<{
    status: string;
    occurrenceAt: Date;
    everyTime: boolean;
    event: Row;
  }>(
    await prisma.rsvp.findMany({
      where: {
        userId: ownerId,
        status: {
          not: 'waitlist',
        },
        OR: [
          {
            occurrenceAt: WHOLE_EVENT,
          },
          {
            occurrenceAt: {
              gte: new Date(q.from.getTime() - OVERRIDE_MARGIN_MS),
              lte: new Date(q.to.getTime() + OVERRIDE_MARGIN_MS),
            },
          },
        ],
        event: inWindowWhere(q.from, q.to),
      },
      take: 600,
      select: {
        status: true,
        occurrenceAt: true,
        everyTime: true,
        event: {
          include,
        },
      },
    }),
  );
  const byEvent = new Map<
    string,
    {
      row: Row;
      answers: {
        status: string;
        occurrenceAt: Date;
        everyTime: boolean;
      }[];
    }
  >();
  for (const a of answers) {
    const entry = byEvent.get(a.event.id) ?? {
      row: a.event,
      answers: [],
    };
    entry.answers.push({
      status: a.status,
      occurrenceAt: a.occurrenceAt,
      everyTime: a.everyTime,
    });
    byEvent.set(a.event.id, entry);
  }
  // An answer outlives membership: events the owner can no longer see are dropped, as on the site.
  const seen = await visible(
    [...byEvent.values()].map((e) => e.row),
    ownerId,
  );
  const overrides = await overridesForEvents(seen.filter((r) => seriesOf(r)).map((r) => r.id));
  const slots: Slot[] = [];
  for (const row of seen) {
    const entry = byEvent.get(row.id);
    if (!entry) continue;
    const dates = attendanceBetween(
      {
        event: {
          ...row,
          owner: row.owner,
          community: row.community
            ? {
                name: row.community.name,
              }
            : null,
        },
        answers: entry.answers,
        overrides: overrides.get(row.id) ?? [],
      },
      q.from,
      q.to,
    );
    const span = durationMs(row);
    for (const d of dates) {
      slots.push({
        row,
        startsAt: d.startsAt,
        endsAt: span > 0 ? new Date(d.startsAt.getTime() + span) : null,
        original: seriesOf(row) ? d.originalAt : null,
        state: d.state === 'moved' ? 'moved' : 'normal',
        note: d.note,
      });
    }
  }
  const page = pageOf(slots, q.limit, q.cursor);
  if (page === 'invalid_cursor') return page;
  return finishPage(page, q.limit, ownerId);
}

export interface ApiEventDetail extends ApiEvent {
  nextOccurrences: {
    occurrence: string;
    startsAt: string;
    endsAt: string | null;
    state: 'normal' | 'moved';
    note: string | null;
  }[];
  updates: {
    id: string;
    body: string;
    occurrence: string | null;
    createdAt: string;
  }[];
}

async function loadVisible(id: string, ownerId: string): Promise<Row | null> {
  const row = await prisma.event.findFirst({
    where: {
      id,
      kind: EVENT_KIND,
      owner: {
        in: ['COMMUNITY', 'USER'],
      },
      visibility: {
        not: 'DRAFT',
      },
    },
    include,
  });
  if (!row) return null;
  return (await visible([row], ownerId))[0] ?? null;
}

/** `GET /events/{id}`: the event, its next dates, counts, hosts and the latest five updates. */
export async function getEventForKey(id: string, ownerId: string, now = new Date()): Promise<ApiEventDetail | null> {
  const row = await loadVisible(id, ownerId);
  if (!row) return null;
  const series = seriesOf(row);
  let next: ApiEventDetail['nextOccurrences'];
  let shown: Slot = {
    row,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    original: null,
    state: 'normal',
    note: null,
  };
  if (series) {
    const ov = (await overridesForEvents([row.id])).get(row.id) ?? [];
    const live = upcomingOccurrences(series, ov, {
      now,
      spanMs: durationMs(row),
      limit: ov.length + NEXT_DATES,
    }).filter((o) => o.state !== 'skipped');
    next = live.slice(0, NEXT_DATES).map((o) => ({
      occurrence: o.originalAt.toISOString(),
      startsAt: o.startsAt.toISOString(),
      endsAt: o.endsAt ? o.endsAt.toISOString() : null,
      state: o.state === 'moved' ? 'moved' : 'normal',
      note: o.note,
    }));
    const first = live[0];
    if (first)
      shown = {
        row,
        startsAt: first.startsAt,
        endsAt: first.endsAt,
        original: first.originalAt,
        state: first.state === 'moved' ? 'moved' : 'normal',
        note: first.note,
      };
    else
      shown = {
        ...shown,
        original: row.startsAt,
      };
  } else {
    next = [
      {
        occurrence: row.startsAt.toISOString(),
        startsAt: row.startsAt.toISOString(),
        endsAt: row.endsAt ? row.endsAt.toISOString() : null,
        state: 'normal',
        note: null,
      },
    ];
  }
  const [event] = await serialise([shown], ownerId);
  const updates = arr<{
    id: string;
    body: string;
    occurrenceAt: Date | null;
    createdAt: Date;
  }>(
    await prisma.eventUpdate.findMany({
      where: {
        eventId: row.id,
        deletedAt: null,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: UPDATES_SHOWN,
      select: {
        id: true,
        body: true,
        occurrenceAt: true,
        createdAt: true,
      },
    }),
  );
  if (!event) return null;
  return {
    ...event,
    nextOccurrences: series ? next : [],
    updates: updates.map((u) => ({
      id: u.id,
      body: u.body,
      occurrence: u.occurrenceAt ? u.occurrenceAt.toISOString() : null,
      createdAt: u.createdAt.toISOString(),
    })),
  };
}

export interface ApiAttendee extends ApiPerson {
  status: 'going' | 'maybe';
}

/**
 * `GET /events/{id}/attendees`: who is going or maybe for one date. Only the host and accepted co-hosts;
 * anyone else (a guest, a member who cannot see the event) gets `forbidden` / `not_found` and reads the
 * counts from the event endpoint instead.
 */
export async function listAttendeesForKey(
  id: string,
  ownerId: string,
  q: {
    occurrence?: Date | undefined;
    limit: number;
    cursor?: string | undefined;
  },
  now = new Date(),
): Promise<Page<ApiAttendee> | 'not_found' | 'forbidden' | 'invalid_cursor' | 'bad_occurrence'> {
  const row = await loadVisible(id, ownerId);
  if (!row) return 'not_found';
  let manager = row.hostId === ownerId;
  if (!manager) {
    const co = await prisma.eventCohost.findUnique({
      where: {
        eventId_userId: {
          eventId: id,
          userId: ownerId,
        },
      },
      select: {
        status: true,
      },
    });
    manager = co?.status === 'accepted';
  }
  if (!manager) return 'forbidden';
  const series = seriesOf(row);
  let attending: Map<string, 'going' | 'maybe'>;
  if (series) {
    const ov = (await overridesForEvents([id])).get(id) ?? [];
    let at = q.occurrence;
    if (at) {
      if (occurrenceIndexOf(series, at) === null) return 'bad_occurrence';
    } else {
      at = upcomingOccurrences(series, ov, {
        now,
        spanMs: durationMs(row),
        limit: ov.length + 1,
      }).find((o) => o.state !== 'skipped')?.originalAt;
    }
    if (!at)
      return {
        data: [],
        nextCursor: null,
      };
    const rows = arr<{
      userId: string;
      status: string;
      occurrenceAt: Date;
      everyTime: boolean;
    }>(
      await prisma.rsvp.findMany({
        where: {
          eventId: id,
          OR: [
            {
              occurrenceAt: WHOLE_EVENT,
              everyTime: true,
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
        take: RSVP_ROWS,
      }),
    );
    attending = effectiveAttendance(
      rows.filter((r) => r.occurrenceAt.getTime() === 0),
      rows.filter((r) => r.occurrenceAt.getTime() === at.getTime()),
    );
  } else {
    const rows = arr<{
      userId: string;
      status: string;
    }>(
      await prisma.rsvp.findMany({
        where: {
          eventId: id,
          occurrenceAt: WHOLE_EVENT,
          status: {
            in: ['going', 'maybe'],
          },
        },
        select: {
          userId: true,
          status: true,
        },
        take: RSVP_ROWS,
      }),
    );
    attending = new Map(rows.map((r) => [r.userId, r.status === 'going' ? 'going' : 'maybe'] as const));
  }
  let ids = [...attending.keys()].sort();
  if (q.cursor) {
    const c = decodeUserCursor(q.cursor);
    if (c === null) return 'invalid_cursor';
    ids = ids.filter((u) => u > c);
  }
  const pageIds = ids.slice(0, q.limit);
  const users = arr<
    Parameters<typeof resolveUser>[0] & {
      id: string;
    }
  >(
    pageIds.length
      ? await prisma.user.findMany({
          where: {
            id: {
              in: pageIds,
            },
          },
          select: userDisplaySelect,
          take: pageIds.length,
        })
      : [],
  );
  const byId = new Map(users.map((u) => [u.id, toPerson(u)]));
  const data = pageIds.flatMap((u) => {
    const p = byId.get(u);
    const status = attending.get(u);
    return p && status
      ? [
          {
            ...p,
            status,
          },
        ]
      : [];
  });
  const last = pageIds[pageIds.length - 1];
  return {
    data,
    nextCursor: ids.length > q.limit && last ? encodeUserCursor(last) : null,
  };
}

export interface ApiRsvpResult {
  eventId: string;
  status: 'going' | 'maybe' | 'waitlisted' | 'none';
  occurrence: string | null;
  everyTime: boolean;
  counts: ApiCounts;
  waitlistPosition: number | null;
}

type RsvpOut = Awaited<ReturnType<typeof rsvp>>;

function resultOf(eventId: string, r: RsvpOut): ApiRsvpResult {
  return {
    eventId,
    status: r.viewerRsvp === 'waitlist' ? 'waitlisted' : (r.viewerRsvp ?? 'none'),
    occurrence: r.occurrenceAt ?? null,
    everyTime: !!r.viewerEveryTime,
    counts: {
      going: r.goingCount,
      maybe: r.maybeCount,
      waitlisted: r.waitlistCount ?? 0,
    },
    waitlistPosition: r.viewerWaitlistPosition ?? null,
  };
}

export type RsvpFailure = {
  code: 'not_found' | 'forbidden' | 'conflict' | 'invalid_request';
  message: string;
  status: 404 | 403 | 409 | 400;
};

function failureOf(e: EventError): RsvpFailure {
  switch (e.code) {
    case 'NOT_FOUND':
      return {
        code: 'not_found',
        message: 'Not found.',
        status: 404,
      };
    case 'CAPACITY_FULL':
      return {
        code: 'conflict',
        message: 'This event is full.',
        status: 409,
      };
    case 'WAITLIST_CLOSED':
      return {
        code: 'conflict',
        message: 'The waitlist is closed.',
        status: 409,
      };
    case 'WAITLIST_FULL':
      return {
        code: 'conflict',
        message: 'The waitlist is full.',
        status: 409,
      };
    case 'CANCELED':
      return {
        code: 'conflict',
        message: 'This event was canceled.',
        status: 409,
      };
    case 'OCCURRENCE_SKIPPED':
      return {
        code: 'conflict',
        message: 'This date was skipped.',
        status: 409,
      };
    // Banned or timed out of the event's community (BAN_ENFORCEMENT_PATHS): the same text as the v1 comment route.
    case 'COMMUNITY_SANCTIONED':
      return {
        code: 'forbidden',
        message: e.sanction
          ? denyText(e.sanction.kind, e.sanction.endsAt)
          : 'You cannot answer events in this community.',
        status: 403,
      };
    default:
      return {
        code: 'invalid_request',
        message: 'Could not update the RSVP.',
        status: 400,
      };
  }
}

/**
 * `PUT /events/{id}/rsvp`: the site's `rsvp`. A full one-off event answers `waitlisted` (the key owner asked
 * for a place, as the site's "Join the waitlist" button does); a repeating event has no waitlist and is a 409.
 */
export async function rsvpForKey(
  id: string,
  ownerId: string,
  body: z.infer<typeof rsvpBody>,
): Promise<
  | {
      ok: true;
      result: ApiRsvpResult;
    }
  | ({
      ok: false;
    } & RsvpFailure)
> {
  const opts = {
    everyTime: body.everyTime,
    occurrenceAt: body.occurrence,
  };
  try {
    try {
      return {
        ok: true,
        result: resultOf(id, await rsvp(id, ownerId, body.status, opts)),
      };
    } catch (e) {
      if (!(e instanceof EventError) || e.code !== 'CAPACITY_FULL' || body.status !== 'going') throw e;
      try {
        return {
          ok: true,
          result: resultOf(id, await rsvp(id, ownerId, 'waitlist', opts)),
        };
      } catch (inner) {
        // A repeating event refuses the waitlist: the answer is the original "full".
        if (inner instanceof EventError && inner.code === 'FORBIDDEN') throw e;
        throw inner;
      }
    }
  } catch (e) {
    if (e instanceof EventError)
      return {
        ok: false,
        ...failureOf(e),
      };
    throw e;
  }
}

/** `DELETE /events/{id}/rsvp`: the site's `unrsvp`. */
export async function unrsvpForKey(
  id: string,
  ownerId: string,
  q: {
    occurrence?: Date | undefined;
    everyTime?: 'true' | 'false' | undefined;
  },
): Promise<
  | {
      ok: true;
      result: ApiRsvpResult;
    }
  | ({
      ok: false;
    } & RsvpFailure)
> {
  try {
    const r = await unrsvp(id, ownerId, {
      scope: q.everyTime === 'true' ? 'all' : 'occurrence',
      occurrenceAt: q.occurrence,
    });
    return {
      ok: true,
      result: resultOf(id, r),
    };
  } catch (e) {
    if (e instanceof EventError)
      return {
        ok: false,
        ...failureOf(e),
      };
    throw e;
  }
}

/** A per-key write budget on top of the wrapper's limits, as the flashcards API has. */
export function writeBudgetExceeded(userId: string): boolean {
  return !rateLimit(userId, {
    ...RATE_LIMIT_POLICIES.write,
    prefix: 'v1-events-write',
  }).allowed;
}

export { queryOf, readInput, readBody } from './request-input';

/* ── Hosting: create, edit, cancel and post updates as the key owner (`manage:events`) ───────────────────────── */

export type HostFailure = {
  code:
    | 'not_found'
    | 'forbidden'
    | 'not_host'
    | 'invalid_request'
    | 'invalid_dates'
    | 'invalid_venue_url'
    | 'invalid_recurrence'
    | 'canceled'
    | 'already_canceled'
    | 'rate_limited';
  message: string;
  status: 400 | 403 | 404 | 409 | 429;
};

export type HostResult<T> =
  | {
      ok: true;
      result: T;
    }
  | ({
      ok: false;
    } & HostFailure);

const hostFail = (f: HostFailure) =>
  ({
    ok: false,
    ...f,
  }) as const;

const NOT_FOUND: HostFailure = {
  code: 'not_found',
  message: 'Not found.',
  status: 404,
};

/** An `EventError` of a hosting write as a v1 error. `forbidden` is the caller's own `FORBIDDEN` wording. */
function hostFailureOf(e: EventError, forbidden: HostFailure): HostFailure {
  switch (e.code) {
    case 'NOT_FOUND':
      return NOT_FOUND;
    case 'FORBIDDEN':
      return forbidden;
    case 'INVALID_DATES':
      return {
        code: 'invalid_dates',
        message: '`ends_at` must be after `starts_at`, and both must be valid dates.',
        status: 400,
      };
    case 'INVALID_VENUE_URL':
      return {
        code: 'invalid_venue_url',
        message: 'A venue of kind URL needs a public http(s) address.',
        status: 400,
      };
    case 'INVALID_RECURRENCE':
      return {
        code: 'invalid_recurrence',
        message: 'Those repeat settings are not allowed.',
        status: 400,
      };
    case 'CANCELED':
      return {
        code: 'canceled',
        message: 'This event was canceled.',
        status: 409,
      };
    default:
      return {
        code: 'invalid_request',
        message: 'Could not save the event.',
        status: 400,
      };
  }
}

const iso = (v: Date | string | undefined) => (v === undefined ? undefined : new Date(v));

/**
 * The site's own event-create limit (10 a minute), keyed by the key owner. The site's create handler takes from the
 * same `event-create:<userId>` bucket (through `checkRateLimit`, so it is shared across instances), so the API and the
 * site form together cannot exceed it.
 */
export async function createBudgetExceeded(userId: string): Promise<boolean> {
  return !(
    await checkRateLimit(userId, {
      limit: 10,
      windowMs: 60_000,
      prefix: 'event-create',
    })
  ).allowed;
}

/**
 * `POST /events`: the site's `createEvent` with the key owner as host. A community event is `forbidden` unless the
 * owner moderates that community (the site's check); an unknown community slug is `not_found`.
 */
export async function createEventForKey(
  ownerId: string,
  body: z.infer<typeof createEventBody>,
): Promise<HostResult<ApiEventDetail>> {
  try {
    let communityId: string | null = null;
    if (body.community) {
      const community = await prisma.community.findUnique({
        where: {
          slug: body.community,
        },
        select: {
          id: true,
        },
      });
      if (!community) return hostFail(NOT_FOUND);
      communityId = community.id;
    }
    const input: CreateEventInput = {
      hostId: ownerId,
      communityId,
      title: body.title,
      description: body.description ?? null,
      startsAt: new Date(body.starts_at),
      endsAt: iso(body.ends_at) ?? null,
      venueKind: body.venue_kind,
      venueRef: body.venue ?? null,
      capacity: body.capacity ?? null,
      recurrence: body.repeat
        ? {
            rule: body.repeat,
            tz: body.repeat_tz ?? '',
            until: iso(body.repeat_until) ?? null,
            rotatingHostIds: [],
          }
        : null,
      visibility: body.visibility === 'private' ? 'PRIVATE' : 'PUBLIC',
    };
    const made = await createEvent(input);
    const event = await getEventForKey(made.id, ownerId);
    if (!event) return hostFail(NOT_FOUND);
    return {
      ok: true,
      result: event,
    };
  } catch (e) {
    if (e instanceof EventError)
      return hostFail(
        hostFailureOf(e, {
          code: 'forbidden',
          message: 'Only moderators of a community can host its events.',
          status: 403,
        }),
      );
    throw e;
  }
}

const NOT_HOST: HostFailure = {
  code: 'not_host',
  message: 'Only the host or a co-host can change this event; only the host can change how it repeats.',
  status: 403,
};

/** `PATCH /events/{id}`: the site's `updateEvent` (host or accepted co-host). A co-host may not touch the repeat rule. */
export async function updateEventForKey(
  id: string,
  ownerId: string,
  body: z.infer<typeof updateEventBody>,
): Promise<HostResult<ApiEventDetail>> {
  try {
    if (!(await loadVisible(id, ownerId))) return hostFail(NOT_FOUND);
    const input: UpdateEventInput = {
      id,
      hostId: ownerId,
      ...(body.title !== undefined && {
        title: body.title,
      }),
      ...(body.description !== undefined && {
        description: body.description,
      }),
      ...(body.starts_at !== undefined && {
        startsAt: new Date(body.starts_at),
      }),
      ...(body.ends_at !== undefined && {
        endsAt: body.ends_at === null ? null : new Date(body.ends_at),
      }),
      ...(body.venue_kind !== undefined && {
        venueKind: body.venue_kind,
      }),
      ...(body.venue !== undefined && {
        venueRef: body.venue,
      }),
      ...(body.capacity !== undefined && {
        capacity: body.capacity,
      }),
      ...(body.repeat !== undefined && {
        recurrence:
          body.repeat === null
            ? null
            : {
                rule: body.repeat,
                tz: body.repeat_tz ?? '',
                until: iso(body.repeat_until) ?? null,
                rotatingHostIds: [],
              },
      }),
    };
    await updateEvent(input);
    const event = await getEventForKey(id, ownerId);
    if (!event) return hostFail(NOT_FOUND);
    return {
      ok: true,
      result: event,
    };
  } catch (e) {
    if (e instanceof EventError) return hostFail(hostFailureOf(e, NOT_HOST));
    throw e;
  }
}

/** `POST /events/{id}/cancel`: the site's `cancelEvent` (the host only); a second cancel is `already_canceled`. */
export async function cancelEventForKey(id: string, ownerId: string): Promise<HostResult<ApiEventDetail>> {
  try {
    const row = await loadVisible(id, ownerId);
    if (!row) return hostFail(NOT_FOUND);
    if (row.hostId !== ownerId)
      return hostFail({
        code: 'not_host',
        message: 'Only the host can cancel this event.',
        status: 403,
      });
    if (row.canceledAt)
      return hostFail({
        code: 'already_canceled',
        message: 'This event is already canceled.',
        status: 409,
      });
    await cancelEvent(id, ownerId);
    const event = await getEventForKey(id, ownerId);
    if (!event) return hostFail(NOT_FOUND);
    return {
      ok: true,
      result: event,
    };
  } catch (e) {
    if (e instanceof EventError)
      return hostFail(
        hostFailureOf(e, {
          code: 'not_host',
          message: 'Only the host can cancel this event.',
          status: 403,
        }),
      );
    throw e;
  }
}

export interface ApiEventUpdate {
  id: string;
  body: string;
  /** The original start of the date it is about (repeating events); null for the whole series or a one-off. */
  occurrence: string | null;
  createdAt: string;
}

/** `GET /events/{id}/updates`: the live updates as an attendee sees them (the site's `listUpdates`, newest first). */
export async function listUpdatesForKey(id: string, ownerId: string): Promise<ApiEventUpdate[] | null> {
  const rows = await listUpdates(id, ownerId, false);
  if (!rows) return null;
  return rows.map((u) => ({
    id: u.id,
    body: u.body,
    occurrence: u.occurrenceAt,
    createdAt: u.createdAt,
  }));
}

/**
 * `POST /events/{id}/updates`: the site's `postUpdate`, which checks the host or an accepted co-host, takes the
 * per-event limit under its lock and queues the durable fan-out to the people coming. Never as an admin.
 */
export async function postUpdateForKey(
  id: string,
  ownerId: string,
  body: z.infer<typeof postUpdateApiBody>,
): Promise<HostResult<ApiEventUpdate>> {
  try {
    if (!(await loadVisible(id, ownerId))) return hostFail(NOT_FOUND);
    const u = await postUpdate(id, ownerId, false, {
      body: body.body,
      occurrenceAt:
        body.occurrence === undefined ? undefined : body.occurrence === null ? null : new Date(body.occurrence),
    });
    return {
      ok: true,
      result: {
        id: u.id,
        body: u.body,
        occurrence: u.occurrenceAt,
        createdAt: u.createdAt,
      },
    };
  } catch (e) {
    if (e instanceof UpdateError) {
      switch (e.code) {
        case 'NOT_FOUND':
          return hostFail(NOT_FOUND);
        case 'FORBIDDEN':
          return hostFail({
            code: 'not_host',
            message: 'Only the host or a co-host can post updates.',
            status: 403,
          });
        case 'CANCELED':
          return hostFail({
            code: 'canceled',
            message: 'This event was canceled.',
            status: 409,
          });
        case 'RATE_LIMITED':
          return hostFail({
            code: 'rate_limited',
            message: e.nextAt ? `Too many updates. Try again after ${e.nextAt.toISOString()}.` : 'Too many updates.',
            status: 429,
          });
        default:
          return hostFail({
            code: 'invalid_request',
            message: "That date is not one of this event's upcoming dates.",
            status: 400,
          });
      }
    }
    throw e;
  }
}
