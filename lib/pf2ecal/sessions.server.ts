/**
 * Server side of `/pf2ecal`: turn the recurring rule into rows, and read the
 * whole board back in one query set.
 *
 * **Why materialise at all.** The rule in `schedule.ts` could be evaluated
 * purely at render time, but then a session would have nothing to hang a
 * response, an edit or a stable `.ics` UID on — the moment someone RSVPs to
 * "the 26th" there has to be a row. So generated occurrences become rows on
 * first read, and from then on they behave exactly like a session someone typed
 * in by hand.
 *
 * **Why on read.** There is no cron in the web tier (`lib/CLAUDE.md`), and this
 * is one table's calendar: the write is a `createMany({ skipDuplicates: true })`
 * of at most a handful of rows, guarded by a unique key, and it only fires when
 * the window has actually grown past what is stored. The scheduled-posts
 * publisher already establishes this pattern in the repo.
 *
 * **Why edits win.** `pinnedToRule` goes false the first time a generated
 * session is edited, cancelled or answered. `syncRule` never rewrites a row
 * whose flag is false, so re-tuning `CAMPAIGN_RULE` reshapes the untouched
 * future without disturbing a night the table has already agreed on.
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { SITE_URL } from '@/lib/seo';
import { CAMPAIGN_RULE, describeRule, occurrencesBetween, type RecurrenceRule } from './schedule';
import type { AnnouncementDTO, Availability, CalendarStateDTO, SessionDTO } from './types';

/**
 * How far back and forward the board reaches.
 *
 * Past sessions stay visible for a month so the group can look back at what
 * happened; the forward window is what actually gets generated, and six months
 * of a weekly game is ~26 rows — small enough to send in one response and to
 * hand to a calendar app whole.
 */
export const WINDOW_PAST_DAYS = 30;
export const WINDOW_FUTURE_DAYS = 182;

const DAY_MS = 86_400_000;

export function calendarWindow(now: Date = new Date()): { start: Date; end: Date } {
  return {
    start: new Date(now.getTime() - WINDOW_PAST_DAYS * DAY_MS),
    end: new Date(now.getTime() + WINDOW_FUTURE_DAYS * DAY_MS),
  };
}

/** The default title given to a session the rule generated. */
export const DEFAULT_SESSION_TITLE = 'Pathfinder 2e session';

/**
 * Insert any occurrence of `rule` in the window that has no row yet.
 *
 * Idempotent twice over: `skipDuplicates` handles the race between two readers
 * arriving at once, and `occurrenceKey`'s unique index is what makes that
 * possible at all. Returns the number of rows created, which is 0 on nearly
 * every call.
 */
export async function syncRule(
  window: { start: Date; end: Date },
  rule: RecurrenceRule = CAMPAIGN_RULE,
): Promise<number> {
  const occurrences = occurrencesBetween(window.start, window.end, rule);
  if (!occurrences.length) return 0;

  const existing = await prisma.pf2eSession.findMany({
    where: { occurrenceKey: { in: occurrences.map((o) => o.key) } },
    select: { occurrenceKey: true },
  });
  const have = new Set(existing.map((row) => row.occurrenceKey));
  const missing = occurrences.filter((o) => !have.has(o.key));
  if (!missing.length) return 0;

  const result = await prisma.pf2eSession.createMany({
    data: missing.map((o) => ({
      occurrenceKey: o.key,
      title: DEFAULT_SESSION_TITLE,
      startsAt: o.startsAt,
      endsAt: o.endsAt,
      pinnedToRule: true,
    })),
    skipDuplicates: true,
  });
  return result.count;
}

/**
 * Mark a generated session as hand-managed. Called on every edit and every
 * response, so from that point the rule leaves it alone.
 */
export async function detachFromRule(sessionId: string): Promise<void> {
  await prisma.pf2eSession.updateMany({
    where: { id: sessionId, pinnedToRule: true },
    data: { pinnedToRule: false },
  });
}

/**
 * The minimum needed to render an author or a respondent, and the ONE user
 * shape this feature uses (the assistant's grounding builder imports it too).
 *
 * Deliberately not `userDisplaySelect`: that pulls cosmetics and the
 * equipped-inventory join to render an avatar frame and a name colour, and this
 * page draws neither — it is a monochrome list of names, and the response
 * already carries one row per player per session. What it *does* keep is the
 * `profile.displayName` override, which is the substance of
 * `local/no-adhoc-user-select`: the bug that rule exists to stop is showing
 * someone's OAuth name instead of the one they chose, and `displayName` is
 * where that lives.
 */
export const personSelect = {
  id: true,
  name: true,
  image: true,
  profile: { select: { displayName: true, customImage: true } },
} as const satisfies Prisma.UserSelect;

type Person = Prisma.UserGetPayload<{ select: typeof personSelect }>;

/** Display name, preferring a profile override, never empty. */
function displayName(user: Person | null | undefined): string | null {
  if (!user) return null;
  return user.profile?.displayName?.trim() || user.name?.trim() || 'Someone';
}

function displayImage(user: Person | null | undefined): string | null {
  if (!user) return null;
  return user.profile?.customImage || user.image || null;
}

const sessionInclude = {
  createdBy: { select: personSelect },
  updatedBy: { select: personSelect },
  responses: {
    orderBy: { updatedAt: 'desc' },
    include: { user: { select: personSelect } },
  },
} as const satisfies Prisma.Pf2eSessionInclude;

type SessionRow = Prisma.Pf2eSessionGetPayload<{ include: typeof sessionInclude }>;

function toSessionDTO(row: SessionRow): SessionDTO {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    location: row.location,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    canceledAt: row.canceledAt?.toISOString() ?? null,
    fromRule: row.pinnedToRule,
    createdByName: displayName(row.createdBy),
    updatedByName: displayName(row.updatedBy),
    responses: row.responses.map((response) => ({
      userId: response.userId,
      status: response.status as Availability,
      note: response.note,
      name: displayName(response.user) ?? 'Someone',
      image: displayImage(response.user),
      updatedAt: response.updatedAt.toISOString(),
    })),
  };
}

/** One session with everything the page renders, or null if it is gone. */
export async function getSession(id: string): Promise<SessionDTO | null> {
  const row = await prisma.pf2eSession.findUnique({ where: { id }, include: sessionInclude });
  return row ? toSessionDTO(row) : null;
}

/**
 * The whole board in one round trip: sessions in the window (rule-generated
 * ones materialised first), announcements, and the viewer's identity.
 */
export async function getCalendarState(
  viewer: { id: string; name: string | null } | null,
  now: Date = new Date(),
): Promise<CalendarStateDTO> {
  const window = calendarWindow(now);
  await syncRule(window);

  const [sessions, announcements] = await Promise.all([
    prisma.pf2eSession.findMany({
      where: { startsAt: { gte: window.start, lt: window.end } },
      orderBy: { startsAt: 'asc' },
      include: sessionInclude,
    }),
    prisma.pf2eAnnouncement.findMany({
      orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
      take: 40,
      include: { author: { select: personSelect } },
    }),
  ]);

  return {
    sessions: sessions.map(toSessionDTO),
    announcements: announcements.map((row): AnnouncementDTO => ({
      id: row.id,
      body: row.body,
      pinned: row.pinned,
      authorName: displayName(row.author),
      authorImage: displayImage(row.author),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
    viewerId: viewer?.id ?? null,
    viewerName: viewer?.name ?? null,
    scheduleNote: describeRule(),
    feedUrl: `${SITE_URL}/api/pf2ecal/calendar.ics`,
    windowStart: window.start.toISOString(),
    windowEnd: window.end.toISOString(),
  };
}

/**
 * Sessions for the `.ics` feed. Cancelled ones are included on purpose — the
 * feed's job is to tell a subscriber a night is off, and dropping the row would
 * leave it on their phone forever.
 */
export async function getFeedSessions(now: Date = new Date()) {
  const window = calendarWindow(now);
  await syncRule(window);
  return prisma.pf2eSession.findMany({
    where: { startsAt: { gte: window.start, lt: window.end } },
    orderBy: { startsAt: 'asc' },
    select: {
      id: true,
      title: true,
      notes: true,
      location: true,
      startsAt: true,
      endsAt: true,
      canceledAt: true,
      updatedAt: true,
    },
  });
}
