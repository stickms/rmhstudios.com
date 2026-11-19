/**
 * K3 — the personal calendar feed. Server-only.
 *
 * One private, tokenised ICS URL (`/api/calendar/<token>.ics`) that a calendar
 * app subscribes to. The token IS the credential — Apple, Google and Outlook
 * poll with no cookies — so it is random, rotatable, and the feed can be
 * switched off. Built on `lib/events-ics.ts`.
 *
 * Contents: every Event the member has an Rsvp for (repeating ones expanded
 * for the window: community and profile events, booked office hours, the
 * events their polls locked in, and the platform slots and game nights they
 * added), the office hours booked with them, the locked-in polls they
 * answered, tournaments entered and study-buddy sessions. The event half is
 * mapped by `feed-entries.ts`.
 */
import { randomBytes } from 'node:crypto';
import { prisma } from '@/lib/prisma.server';
import { cached, invalidateCached } from '@/lib/cached.server';
import { SITE_URL } from '@/lib/seo';
import { calendarFeedICS, type ICSEvent } from '@/lib/events-ics';
import { WHOLE_EVENT, startsBetween } from './event-model';
import { feedEntries } from './feed-entries';
import { liveWhere, myEventInputs } from './my-events.server';
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

/** Platform slots a member can add to their feed (game nights, premieres, …). */
const optInWhere = (now: Date) => ({
  owner: 'PLATFORM' as const,
  visibility: 'PUBLIC' as const,
  canceledAt: null,
  kind: { not: 'maintenance' },
  ...liveWhere(now),
});

export async function getFeedView(userId: string): Promise<CalendarFeedView> {
  const now = new Date();
  const [feed, candidates] = await Promise.all([
    prisma.calendarFeed.findUnique({ where: { userId } }),
    prisma.event.findMany({ where: optInWhere(now), orderBy: { startsAt: 'asc' }, take: 60 }),
  ]);
  const optIns = candidates.length
    ? await prisma.rsvp.findMany({
        where: {
          userId,
          eventId: { in: candidates.map((c) => c.id) },
          occurrenceAt: WHOLE_EVENT,
          status: 'going',
        },
        select: { eventId: true },
      })
    : [];
  const chosen = new Set(optIns.map((o) => o.eventId));
  return {
    enabled: feed?.enabled ?? false,
    url: feed ? feedUrl(feed.token) : null,
    slots: candidates.map((c) => {
      const next = startsBetween(c, now, new Date(now.getTime() + 60 * DAY_MS), 1)[0];
      return {
        id: c.id,
        title: c.title,
        startsAt: (next ?? c.startsAt).toISOString(),
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
    void invalidateCached(`calendar-feed:${feed.token}`);
  }
  if (patch.slotIds) {
    // Adding a slot to the feed is a standing 'going' answer to its event;
    // the set replaces the member's answers to platform slots and nothing else.
    const valid = await prisma.event.findMany({
      where: { id: { in: patch.slotIds }, owner: 'PLATFORM', visibility: 'PUBLIC' },
      select: { id: true },
      take: 100,
    });
    const ids = valid.map((v) => v.id);
    await prisma.$transaction([
      prisma.rsvp.deleteMany({
        where: {
          userId,
          occurrenceAt: WHOLE_EVENT,
          event: { owner: 'PLATFORM' },
          eventId: { notIn: ids },
        },
      }),
      prisma.rsvp.createMany({
        data: ids.map((eventId) => ({
          eventId,
          userId,
          status: 'going',
          everyTime: true,
          occurrenceAt: WHOLE_EVENT,
        })),
        skipDuplicates: true,
      }),
    ]);
    void invalidateCached(`calendar-feed:${feed.token}`);
  }
  return getFeedView(userId);
}

/** The ICS body for a token, or null when it is unknown or switched off. */
export async function buildFeedForToken(token: string): Promise<string | null> {
  const key = `calendar-feed:${token}`;
  return cached(
    key,
    FEED_CACHE_MS,
    async () => {
      const feed = await prisma.calendarFeed.findUnique({ where: { token } });
      if (!feed || !feed.enabled) return null;
      const ics = await buildFeed(feed.userId);
      return ics;
    },
    { shouldCache: (v) => v != null },
  );
}

async function buildFeed(userId: string): Promise<string> {
  const now = new Date();
  const from = new Date(now.getTime() - PAST_DAYS * DAY_MS);
  const to = new Date(now.getTime() + FUTURE_DAYS * DAY_MS);
  const events: ICSEvent[] = [];

  const [mine, entrants, matches] = await Promise.all([
    myEventInputs(userId, from, to),
    prisma.tournamentEntrant.findMany({
      where: { userId, tournament: { startsAt: { gte: from, lte: to } } },
      take: 100,
      select: { tournament: { select: { id: true, name: true, gameId: true, startsAt: true } } },
    }),
    prisma.studyBuddyMatch.findMany({
      where: { OR: [{ userAId: userId }, { userBId: userId }], startsAt: { gte: from, lte: to } },
      take: 50,
      select: { id: true, subject: true, startsAt: true, endsAt: true, roomCode: true },
    }),
  ]);

  // ── Events (one-off and repeating), office hours, polls, platform slots ──
  for (const input of mine) events.push(...feedEntries(input, from, to, SITE_URL));

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

  return calendarFeedICS(events, {
    name: 'RMH Studios',
    description: 'Your RSVPs, tournaments, office hours, locked-in polls and game nights.',
    refreshMinutes: 60,
  });
}
