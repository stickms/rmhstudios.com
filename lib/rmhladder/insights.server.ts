/**
 * RMHLadder search insights, the server half (sprint 03, feature 18).
 *
 * Two reads, both scoped to the caller's `userId`: their applications (with the
 * job, company and any recorded offer) and their status-change events since the
 * start of the range. The numbers are computed by the pure `insights.ts`.
 */
import { prisma } from '@/lib/prisma.server';
import { isValidTimeZone } from '@/lib/calendar/tz';
import {
  DEFAULT_QUIET_DAYS,
  computeInsights,
  rangeStart,
  type InsightRange,
  type Insights,
} from '@/lib/rmhladder/insights';

/** A member has at most a couple of thousand applications in practice; this bounds the read. */
const MAX_APPLICATIONS = 2000;
const MAX_EVENTS = 20_000;
const DEFAULT_TIME_ZONE = 'America/New_York';

export async function loadInsights(
  userId: string,
  options: {
    range?: InsightRange | undefined;
    quietDays?: number | undefined;
  } = {},
  now: Date = new Date(),
): Promise<Insights> {
  const range = options.range ?? '90d';
  const quietDays = options.quietDays ?? DEFAULT_QUIET_DAYS;
  // The shortest range is 90 days, longer than the longest quiet window (30), so the quiet list sees every recent move.
  const since = rangeStart(range, now);

  const [rows, eventRows, prefs] = await Promise.all([
    prisma.ladderApplication.findMany({
      where: {
        userId,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: MAX_APPLICATIONS,
      select: {
        id: true,
        jobId: true,
        status: true,
        appliedDate: true,
        createdAt: true,
        referralName: true,
        followUpDate: true,
        offer: {
          select: {
            state: true,
          },
        },
        job: {
          select: {
            title: true,
            programType: true,
            sourcePlatform: true,
            company: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    }),
    prisma.ladderApplicationEvent.findMany({
      where: {
        userId,
        type: 'status_changed',
        ...(since
          ? {
              createdAt: {
                gte: since,
              },
            }
          : {}),
      },
      orderBy: {
        createdAt: 'asc',
      },
      take: MAX_EVENTS,
      select: {
        applicationId: true,
        fromStatus: true,
        toStatus: true,
        createdAt: true,
      },
    }),
    prisma.ladderUserPrefs.findUnique({
      where: {
        userId,
      },
      select: {
        timezone: true,
      },
    }),
  ]);

  const timeZone = prefs?.timezone && isValidTimeZone(prefs.timezone) ? prefs.timezone : DEFAULT_TIME_ZONE;

  return computeInsights({
    applications: rows.map((row) => ({
      id: row.id,
      jobId: row.jobId,
      status: row.status,
      appliedDate: row.appliedDate,
      createdAt: row.createdAt,
      referralName: row.referralName,
      followUpDate: row.followUpDate,
      company: row.job.company.name,
      title: row.job.title,
      source: row.job.sourcePlatform,
      programType: row.job.programType,
      offerState: row.offer?.state ?? null,
    })),
    events: eventRows,
    range,
    quietDays,
    timeZone,
    now,
  });
}
