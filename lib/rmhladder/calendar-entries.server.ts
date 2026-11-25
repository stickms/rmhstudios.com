/**
 * RMHLadder on the member's calendar — the read for one member and a window (sprint 13, feature 09). Server-only.
 *
 * One indexed read of the member's applications (`@@unique([userId, jobId])` leads with `userId`), on the member's own
 * readers' scope: catalogue jobs and their own jobs (feature 08), never another member's. The select names dates and
 * titles only, so no note, contact e-mail, referral name or pay is even loaded.
 */
import { prisma } from '@/lib/prisma.server';
import { invalidateCached } from '@/lib/cached.server';
import { ownerOrCatalogJobWhere } from '@/lib/rmhladder/own-jobs';
import {
  LADDER_CALENDAR_EXCLUDED_STATUSES,
  ladderCalendarEntries,
  type LadderCalendarEntry,
} from '@/lib/rmhladder/calendar-entries';

/** More than a member tracks; keeps the read bounded. */
const APPLICATION_TAKE = 500;

export interface LadderCalendarRead {
  /** Whether "Show on my calendar" is on; when false there are no entries. */
  enabled: boolean;
  entries: LadderCalendarEntry[];
}

export async function ladderCalendarFor(userId: string, from: Date, to: Date): Promise<LadderCalendarRead> {
  const prefs = await prisma.ladderUserPrefs.findUnique({
    where: { userId },
    select: { calendarInFeed: true, timezone: true },
  });
  if (!prefs?.calendarInFeed) return { enabled: false, entries: [] };

  const applications = await prisma.ladderApplication.findMany({
    where: {
      userId,
      status: { notIn: [...LADDER_CALENDAR_EXCLUDED_STATUSES] },
      job: ownerOrCatalogJobWhere(userId),
    },
    orderBy: { updatedAt: 'desc' },
    take: APPLICATION_TAKE,
    select: {
      id: true,
      status: true,
      updatedAt: true,
      followUpDate: true,
      interviewDates: true,
      job: {
        select: {
          id: true,
          title: true,
          applicationDeadline: true,
          lastSeenAt: true,
          discoveredAt: true,
          company: { select: { name: true } },
        },
      },
    },
  });
  return { enabled: true, entries: ladderCalendarEntries(applications, prefs.timezone, from, to) };
}

/** Drop the member's cached feed: the setting or the zone changed, so what the feed holds is stale. */
export async function invalidateLadderCalendarFeed(userId: string): Promise<void> {
  const feed = await prisma.calendarFeed.findUnique({ where: { userId }, select: { token: true } });
  if (feed) await invalidateCached(`calendar-feed:${feed.token}`);
}
