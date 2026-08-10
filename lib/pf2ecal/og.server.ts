/**
 * What the board's Open Graph card and its meta description say.
 *
 * Both answer the same question — *when is the next session* — so both are
 * derived here rather than composed twice. The card is the shared
 * `renderPageCard` (eyebrow / title / subtitle / stats), not a bespoke
 * renderer: the site already has one card design and a second engine for a
 * hidden page would be the thing `lib/og/stat-card.server.tsx` was rewritten to
 * stop.
 *
 * The card is public, and that is a deliberate trade. It says no more than the
 * `.ics` feed already does, and an OG crawler arrives with no cookies — a card
 * behind a session check unfurls as a blank box, which defeats the only reason
 * this page is shareable (pasting it into the group's Discord).
 */

import type { PageCardData } from '@/lib/og/page-card.server';
import { prisma } from '@/lib/prisma.server';
import { calendarWindow, syncRule } from './sessions.server';
import { describeRule } from './schedule';
import { CAMPAIGN_TIME_ZONE, REFERENCE_TIME_ZONE, zoneAbbreviation } from './zoned-time';

export interface NextSession {
  id: string;
  title: string;
  startsAt: Date;
  location: string;
  going: number;
  tentative: number;
  unavailable: number;
  /** Newest response timestamp, so the cache key moves when a reply lands. */
  touchedAt: number;
}

/**
 * The next session that has not started and is not cancelled, with its reply
 * counts. Null when the board is empty ahead.
 */
export async function getNextSession(now: Date = new Date()): Promise<NextSession | null> {
  // The rule is materialised first: on a quiet board nothing has touched the
  // web tier in days, and a crawler hitting the card is exactly the case where
  // the next session may not exist as a row yet.
  await syncRule(calendarWindow(now));

  const row = await prisma.pf2eSession.findFirst({
    where: { startsAt: { gt: now }, canceledAt: null },
    orderBy: { startsAt: 'asc' },
    select: {
      id: true,
      title: true,
      startsAt: true,
      location: true,
      updatedAt: true,
      responses: { select: { status: true, updatedAt: true } },
    },
  });
  if (!row) return null;

  const count = (status: string) => row.responses.filter((r) => r.status === status).length;
  const touchedAt = row.responses.reduce(
    (max, r) => Math.max(max, r.updatedAt.getTime()),
    row.updatedAt.getTime(),
  );

  return {
    id: row.id,
    title: row.title,
    startsAt: row.startsAt,
    location: row.location,
    going: count('GOING'),
    tentative: count('TENTATIVE'),
    unavailable: count('UNAVAILABLE'),
    touchedAt,
  };
}

/** `Wednesday, August 12` in the campaign zone. */
function longDate(instant: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: CAMPAIGN_TIME_ZONE,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(instant);
}

function clock(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(instant);
}

/**
 * `Tonight` / `Tomorrow` / `In 9 days`, computed in whole days in the campaign
 * zone.
 *
 * A day count, not a millisecond division: "tomorrow" is a calendar fact, and a
 * session 20 hours out is tonight or the day after depending on the hour. The
 * card is cached for minutes, so this is allowed to be a rounded human phrase
 * rather than a live countdown.
 */
export function relativeLead(startsAt: Date, now: Date): string {
  const dayKey = (d: Date) =>
    Date.parse(
      `${new Intl.DateTimeFormat('en-CA', {
        timeZone: CAMPAIGN_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(d)}T00:00:00Z`,
    );
  const days = Math.round((dayKey(startsAt) - dayKey(now)) / 86_400_000);
  if (days <= 0) return 'Tonight';
  if (days === 1) return 'Tomorrow';
  // Deliberately never the weekday name. Both callers put this immediately
  // beside `longDate`, which already opens with the weekday — a weekday branch
  // here rendered "Wednesday — Wednesday, August 12", the same stutter the
  // session cards had.
  return `In ${days} days`;
}

/** The one-line summary used for `og:description` and the page's meta. */
export function describeNext(next: NextSession | null, now: Date = new Date()): string {
  if (!next) {
    return `${describeRule()}. Nothing on the books right now — open the board to add a session.`;
  }
  const abbreviation = zoneAbbreviation(next.startsAt, REFERENCE_TIME_ZONE);
  const replies =
    next.going + next.tentative + next.unavailable === 0
      ? 'No replies yet.'
      : `${next.going} in, ${next.tentative} maybe, ${next.unavailable} out.`;
  return (
    `${relativeLead(next.startsAt, now)} — ${longDate(next.startsAt)} at ` +
    `${clock(next.startsAt, CAMPAIGN_TIME_ZONE)} Eastern / ` +
    `${clock(next.startsAt, REFERENCE_TIME_ZONE)} ${abbreviation}. ${replies}`
  );
}

/**
 * The card's data.
 *
 * The title is the DATE, not the session's name: everyone already knows it is
 * Pathfinder — the thing worth reading off an unfurl in a chat window is when.
 * The name goes in the eyebrow when it is not the default.
 */
export async function buildBoardCard(now: Date = new Date()): Promise<PageCardData> {
  const next = await getNextSession(now);

  if (!next) {
    return {
      cacheKey: `pf2ecal:empty:${Math.floor(now.getTime() / 3_600_000)}`,
      eyebrow: 'Pathfinder 2e',
      lead: 'The table',
      title: 'No sessions scheduled',
      subtitle: describeRule(),
      path: '/pf2ecal',
    };
  }

  const abbreviation = zoneAbbreviation(next.startsAt, REFERENCE_TIME_ZONE);
  const replied = next.going + next.tentative + next.unavailable;

  return {
    // Keyed by what is DRAWN: which session, and the newest reply on it. A
    // crawler re-fetching an unchanged board gets the cached bytes; a reply
    // landing moves the key and the card redraws.
    cacheKey: `pf2ecal:${next.id}:${next.touchedAt}`,
    eyebrow: 'Pathfinder 2e',
    lead: relativeLead(next.startsAt, now),
    title: longDate(next.startsAt),
    subtitle:
      `${clock(next.startsAt, CAMPAIGN_TIME_ZONE)} Eastern · ` +
      `${clock(next.startsAt, REFERENCE_TIME_ZONE)} ${abbreviation}` +
      (next.location ? ` · ${next.location}` : ''),
    path: '/pf2ecal',
    stats:
      replied === 0
        ? // A board nobody has answered leads with the ask rather than three
          // zeros — "0 in" reads as nobody coming, not as nobody asked yet.
          [{ value: '—', label: 'no replies yet', lead: true }]
        : [
            { value: String(next.going), label: 'in', lead: true },
            ...(next.tentative > 0 ? [{ value: String(next.tentative), label: 'maybe' }] : []),
            ...(next.unavailable > 0 ? [{ value: String(next.unavailable), label: 'out' }] : []),
          ],
  };
}
