/**
 * K3 — the personal calendar feed. Server-only.
 *
 * One private, tokenised ICS URL (`/api/calendar/<token>.ics`) that a calendar
 * app subscribes to. The token IS the credential — Apple, Google and Outlook
 * poll with no cookies — so it is random, rotatable, and the feed can be
 * switched off. Built on `lib/events-ics.ts`.
 *
 * Contents: events the member RSVP'd to (repeating ones expanded for the
 * window), tournaments entered, booked office hours, locked-in polls they
 * organised or answered, study-buddy sessions, and the programming-grid slots
 * (game nights) they opted into.
 */
import { randomBytes } from 'node:crypto';
import { prisma } from '@/lib/prisma.server';
import { eventCommunityVisibleWhere } from '@/lib/events-visibility';
import { apiCache } from '@/lib/cache';
import { SITE_URL } from '@/lib/seo';
import { calendarFeedICS, type ICSEvent } from '@/lib/events-ics';
import { expand, type SlotDefinition, type SlotKind } from '@/lib/schedule/slots';
import { effectiveAttendance, occurrencesBetween } from './recurrence';
import { seriesFromRow } from './recurring-events.server';
import { loadPeople } from './people.server';
import type { CalendarFeedView } from './types';

const PAST_DAYS = 7;
const FUTURE_DAYS = 120;
const DAY_MS = 86_400_000;
const FEED_CACHE_MS = 60_000;

const newToken = () => randomBytes(24).toString('base64url');
export const feedUrl = (token: string) => `${SITE_URL}/api/calendar/${token}.ics`;

async function ensureFeed(userId: string) {
  const existing = await prisma.calendarFeed.findUnique({ where: { userId } });
  if (existing) return existing;
  try {
    return await prisma.calendarFeed.create({ data: { userId, token: newToken() } });
  } catch {
    // Lost a create race: the other request's row is the one.
    return prisma.calendarFeed.findUniqueOrThrow({ where: { userId } });
  }
}

/** Editorial slots a member can opt into (game nights, premieres, …). */
async function optInCandidates(now: Date) {
  const rows = await prisma.scheduledSlot.findMany({
    where: {
      published: true,
      kind: { not: 'maintenance' },
      OR: [{ until: null }, { until: { gte: now } }],
    },
    orderBy: { startsAt: 'asc' },
    take: 60,
  });
  return rows;
}

function slotDef(r: {
  id: string;
  kind: string;
  title: string;
  href: string | null;
  startsAt: Date;
  durationMinutes: number;
  recurrence: string;
  until: Date | null;
}): SlotDefinition {
  return {
    id: r.id,
    kind: r.kind as SlotKind,
    title: r.title,
    href: r.href,
    startsAt: r.startsAt,
    durationMinutes: r.durationMinutes,
    recurrence: r.recurrence === 'daily' || r.recurrence === 'weekly' ? r.recurrence : 'once',
    until: r.until,
  };
}

export async function getFeedView(userId: string): Promise<CalendarFeedView> {
  const now = new Date();
  const [feed, optIns, candidates] = await Promise.all([
    prisma.calendarFeed.findUnique({ where: { userId } }),
    prisma.calendarFeedSlot.findMany({ where: { userId }, select: { slotId: true }, take: 200 }),
    optInCandidates(now),
  ]);
  const chosen = new Set(optIns.map((o) => o.slotId));
  return {
    enabled: feed?.enabled ?? false,
    url: feed ? feedUrl(feed.token) : null,
    slots: candidates.map((c) => {
      const next = expand(slotDef(c), now, new Date(now.getTime() + 60 * DAY_MS), 1)[0];
      return {
        id: c.id,
        title: c.title,
        startsAt: (next?.startsAt ?? c.startsAt).toISOString(),
        optedIn: chosen.has(c.id),
      };
    }),
  };
}

export async function updateFeed(
  userId: string,
  patch: { enabled?: boolean; rotate?: true; slotIds?: string[] },
): Promise<CalendarFeedView> {
  const feed = await ensureFeed(userId);
  const data: { enabled?: boolean; token?: string; rotatedAt?: Date } = {};
  if (patch.enabled !== undefined) data.enabled = patch.enabled;
  if (patch.rotate) {
    data.token = newToken();
    data.rotatedAt = new Date();
  }
  if (Object.keys(data).length) {
    await prisma.calendarFeed.update({ where: { userId }, data });
    apiCache.invalidate(`calendar-feed:${feed.token}`);
  }
  if (patch.slotIds) {
    const valid = await prisma.scheduledSlot.findMany({
      where: { id: { in: patch.slotIds }, published: true },
      select: { id: true },
      take: 100,
    });
    const ids = valid.map((v) => v.id);
    await prisma.$transaction([
      prisma.calendarFeedSlot.deleteMany({ where: { userId } }),
      prisma.calendarFeedSlot.createMany({ data: ids.map((slotId) => ({ userId, slotId })) }),
    ]);
    apiCache.invalidate(`calendar-feed:${feed.token}`);
  }
  return getFeedView(userId);
}

/** The ICS body for a token, or null when it is unknown or switched off. */
export async function buildFeedForToken(token: string): Promise<string | null> {
  const key = `calendar-feed:${token}`;
  const hit = apiCache.get<string>(key);
  if (hit) return hit;
  const feed = await prisma.calendarFeed.findUnique({ where: { token } });
  if (!feed || !feed.enabled) return null;
  const ics = await buildFeed(feed.userId);
  apiCache.set(key, ics, FEED_CACHE_MS);
  return ics;
}

async function buildFeed(userId: string): Promise<string> {
  const now = new Date();
  const from = new Date(now.getTime() - PAST_DAYS * DAY_MS);
  const to = new Date(now.getTime() + FUTURE_DAYS * DAY_MS);
  const events: ICSEvent[] = [];

  const [rsvps, occRsvps, entrants, bookings, polls, matches, optIns] = await Promise.all([
    prisma.eventRsvp.findMany({
      where: {
        userId,
        event: {
          AND: [
            {
              OR: [
                { startsAt: { gte: from, lte: to } },
                {
                  recurrence: { not: null },
                  OR: [{ recurUntil: null }, { recurUntil: { gte: from } }],
                },
              ],
            },
            // An RSVP outlives membership: drop private-community events the
            // user has since left (title/venue must not keep flowing to the feed).
            eventCommunityVisibleWhere(userId),
          ],
        },
      },
      orderBy: { event: { startsAt: 'asc' } },
      take: 300,
      select: {
        status: true,
        everyTime: true,
        event: { include: { community: { select: { name: true } } } },
      },
    }),
    prisma.eventOccurrenceRsvp.findMany({
      where: {
        userId,
        occurrenceAt: { gte: from, lte: to },
        event: eventCommunityVisibleWhere(userId),
      },
      take: 300,
      select: {
        occurrenceAt: true,
        status: true,
        event: { include: { community: { select: { name: true } } } },
      },
    }),
    prisma.tournamentEntrant.findMany({
      where: { userId, tournament: { startsAt: { gte: from, lte: to } } },
      take: 100,
      select: { tournament: { select: { id: true, name: true, gameId: true, startsAt: true } } },
    }),
    prisma.officeHoursBooking.findMany({
      where: { OR: [{ hostId: userId }, { guestId: userId }], startsAt: { gte: from, lte: to } },
      take: 100,
      select: { id: true, hostId: true, guestId: true, startsAt: true, endsAt: true, note: true },
    }),
    prisma.availabilityPoll.findMany({
      where: {
        lockedStartMin: { not: null },
        OR: [{ creatorId: userId }, { responses: { some: { userId } } }],
      },
      orderBy: { lockedAt: 'desc' },
      take: 100,
      select: {
        id: true,
        title: true,
        description: true,
        lockedStartMin: true,
        lockedEndMin: true,
      },
    }),
    prisma.studyBuddyMatch.findMany({
      where: { OR: [{ userAId: userId }, { userBId: userId }], startsAt: { gte: from, lte: to } },
      take: 50,
      select: { id: true, subject: true, startsAt: true, endsAt: true, roomCode: true },
    }),
    prisma.calendarFeedSlot.findMany({ where: { userId }, select: { slotId: true }, take: 100 }),
  ]);

  // ── Events (one-off and repeating) ──
  const eventLoc = (e: {
    venueKind: string;
    venueRef: string | null;
    community: { name: string } | null;
  }) =>
    e.venueKind === 'URL'
      ? e.venueRef
      : e.venueRef
        ? `${e.venueKind}: ${e.venueRef}`
        : (e.community?.name ?? null);
  const seen = new Set<string>();
  const addEvent = (
    e: (typeof rsvps)[number]['event'],
    startsAt: Date,
    idSuffix: string,
    status: string,
  ) => {
    const key = `${e.id}${idSuffix}`;
    if (seen.has(key)) return;
    seen.add(key);
    const duration = e.endsAt ? e.endsAt.getTime() - e.startsAt.getTime() : 0;
    events.push({
      id: `event-${key}`,
      title: status === 'maybe' ? `${e.title} (maybe)` : e.title,
      description: e.description || undefined,
      startsAt,
      endsAt: duration > 0 ? new Date(startsAt.getTime() + duration) : null,
      location: eventLoc(e),
      url: `${SITE_URL}/events`,
      canceledAt: e.canceledAt,
      categories: ['Event'],
    });
  };
  const standingByEvent = new Map<string, typeof rsvps>();
  for (const r of rsvps) {
    if (r.event.recurrence)
      standingByEvent.set(r.event.id, [...(standingByEvent.get(r.event.id) ?? []), r]);
    else addEvent(r.event, r.event.startsAt, '', r.status);
  }
  const occByEvent = new Map<string, typeof occRsvps>();
  for (const o of occRsvps) occByEvent.set(o.event.id, [...(occByEvent.get(o.event.id) ?? []), o]);
  const recurringIds = new Set([...standingByEvent.keys(), ...occByEvent.keys()]);
  for (const id of recurringIds) {
    const base = standingByEvent.get(id)?.[0]?.event ?? occByEvent.get(id)?.[0]?.event;
    const series = base ? seriesFromRow(base) : null;
    if (!base || !series) continue;
    const mineStanding = (standingByEvent.get(id) ?? []).filter((r) => r.everyTime);
    const mineOcc = occByEvent.get(id) ?? [];
    for (const occ of occurrencesBetween(series, from, to)) {
      const att = effectiveAttendance(
        mineStanding.map((r) => ({ userId, status: r.status })),
        mineOcc
          .filter((o) => o.occurrenceAt.getTime() === occ.startsAt.getTime())
          .map((o) => ({ userId, status: o.status })),
      );
      const status = att.get(userId);
      if (status) addEvent(base, occ.startsAt, `-${occ.startsAt.getTime()}`, status);
    }
  }

  // ── Tournaments ──
  for (const t of entrants) {
    if (!t.tournament.startsAt) continue;
    events.push({
      id: `tournament-${t.tournament.id}`,
      title: t.tournament.name,
      startsAt: t.tournament.startsAt,
      endsAt: new Date(t.tournament.startsAt.getTime() + 90 * 60_000),
      location: t.tournament.gameId,
      url: `${SITE_URL}/tournaments/${t.tournament.id}`,
      categories: ['Tournament'],
      alarmMinutes: 15,
    });
  }

  // ── Office hours ──
  const people = await loadPeople(bookings.flatMap((b) => [b.hostId, b.guestId]));
  for (const b of bookings) {
    const other = people.get(b.hostId === userId ? b.guestId : b.hostId);
    events.push({
      id: `office-hours-${b.id}`,
      title: `Office hours with ${other?.name ?? other?.handle ?? 'a member'}`,
      description: b.note || undefined,
      startsAt: b.startsAt,
      endsAt: b.endsAt,
      url: `${SITE_URL}/office-hours/${b.hostId}`,
      categories: ['Office hours'],
      alarmMinutes: 15,
    });
  }

  // ── Locked-in polls ──
  for (const p of polls) {
    if (p.lockedStartMin == null || p.lockedEndMin == null) continue;
    events.push({
      id: `poll-${p.id}`,
      title: p.title,
      description: p.description || undefined,
      startsAt: new Date(p.lockedStartMin * 60_000),
      endsAt: new Date(p.lockedEndMin * 60_000),
      url: `${SITE_URL}/when/${p.id}`,
      categories: ['Poll'],
    });
  }

  // ── Study buddy sessions ──
  for (const m of matches) {
    events.push({
      id: `study-${m.id}`,
      title: `Study session: ${m.subject}`,
      startsAt: m.startsAt,
      endsAt: m.endsAt,
      url: `${SITE_URL}/rmhstudy/${m.roomCode}?bd=${m.id}`,
      categories: ['Study'],
      alarmMinutes: 5,
    });
  }

  // ── Opted-in programming-grid slots ──
  if (optIns.length) {
    const slots = await prisma.scheduledSlot.findMany({
      where: { id: { in: optIns.map((o) => o.slotId) }, published: true },
      take: 100,
    });
    for (const s of slots) {
      for (const occ of expand(slotDef(s), from, to, 60)) {
        events.push({
          id: `slot-${s.id}-${occ.startsAt.getTime()}`,
          title: s.title,
          startsAt: occ.startsAt,
          endsAt: occ.endsAt.getTime() > occ.startsAt.getTime() ? occ.endsAt : null,
          url: `${SITE_URL}${s.href ?? '/schedule'}`,
          categories: ['Game night'],
          alarmMinutes: 10,
        });
      }
    }
  }

  return calendarFeedICS(events, {
    name: 'RMH Studios',
    description: 'Your RSVPs, tournaments, office hours, locked-in polls and game nights.',
    refreshMinutes: 60,
  });
}
