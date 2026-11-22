import { prisma } from '@/lib/prisma.server';
import type { FocusHistory, FocusSessionsPage } from '@/lib/rmhstudy/history.contract';
import {
  HEATMAP_DAYS,
  HISTORY_WINDOW_DAYS,
  SESSIONS_PAGE_SIZE,
  msToMinutes,
  records,
  weekBounds,
  weekBreaks,
  weekFrom,
  weekTotal,
} from '@/lib/rmhstudy/history';
import { currentStreakDays, longestRun } from '@/lib/rmhstudy/streak';
import { addDays, dayKeyInZone } from '@/lib/study/stats';

interface DayRow {
  day: string;
  minutes: number;
  breakMinutes: number;
  tracked: boolean;
}

/**
 * One member's focus history. Every query is scoped to `userId` and passes the time zone
 * as a bound value, never as SQL text; `timeZone` must already be validated. Runs are bucketed
 * on `startedAt`, so a run that crosses midnight counts on the day it started. The hub writes
 * only finished runs, with the true start and `endedAt`; rows from before that fix have a null
 * `endedAt` and a `startedAt` that is really the end, so they are counted as finished runs on
 * that approximate day. `startedAt` is stored as
 * a UTC timestamp, tagged UTC first and then shifted into the viewer's zone.
 */
export async function getFocusHistory(
  userId: string,
  options: {
    timeZone: string;
    weekOffset: number;
    firstDay: number;
  },
): Promise<FocusHistory> {
  const { timeZone, weekOffset, firstDay } = options;
  const now = new Date();
  const thisWeek = weekBounds(now, timeZone, firstDay);
  const today = dayKeyInZone(now, timeZone);
  // Generous in UTC terms; rows before the window start in the viewer's zone are dropped below.
  const since = new Date(now.getTime() - (HISTORY_WINDOW_DAYS + 1) * 86_400_000);
  const windowStart = addDays(today, -(HISTORY_WINDOW_DAYS - 1));

  const [dayRows, totals, profile] = await Promise.all([
    prisma.$queryRaw<DayRow[]>`
      SELECT to_char((("startedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone}::text)::date, 'YYYY-MM-DD') AS day,
             round(sum("focusTimeMs") / 60000.0)::int AS minutes,
             round(sum("breakTimeMs") / 60000.0)::int AS "breakMinutes",
             bool_or("endedAt" IS NOT NULL) AS tracked
      FROM rmhstudy_session
      WHERE "userId" = ${userId} AND "startedAt" >= ${since}
      GROUP BY 1`,
    prisma.rmhStudySession.aggregate({
      where: {
        userId,
      },
      _max: {
        focusTimeMs: true,
      },
      _count: {
        _all: true,
      },
    }),
    prisma.rmhStudyProfile.findUnique({
      where: {
        userId,
      },
      select: {
        weeklyGoalMinutes: true,
        longestStreak: true,
      },
    }),
  ]);

  const days = dayRows
    .filter((r) => r.day >= windowStart && r.day <= today)
    .map((r) => ({
      date: r.day,
      minutes: r.minutes,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const byDay = new Map(days.map((d) => [d.date, d.minutes]));

  // Streaks come from the session days themselves, so they are right where the stored profile
  // value is stale (rows from before the streak fix); the stored longest streak still counts for
  // runs older than the window.
  const dayKeys = days.map((d) => d.date);
  const streakDays = currentStreakDays(dayKeys, today);
  const previousWeek = weekFrom(addDays(thisWeek.start, -7));
  const selected = weekFrom(addDays(thisWeek.start, -7 * weekOffset));
  const best = records(days, firstDay);
  const yearStart = addDays(today, -(HEATMAP_DAYS - 1));

  return {
    today,
    firstDay,
    thisWeekMinutes: weekTotal(days, thisWeek),
    lastWeekMinutes: weekTotal(days, previousWeek),
    goalMinutes: profile?.weeklyGoalMinutes ?? null,
    streak: {
      current: streakDays.length,
      longest: Math.max(longestRun(dayKeys), profile?.longestStreak ?? 0),
      days: streakDays,
      studiedToday: byDay.has(today),
    },
    thisWeekBreaks: weekBreaks(
      dayRows.map((r) => ({
        date: r.day,
        focusMinutes: r.minutes,
        breakMinutes: r.breakMinutes,
        tracked: r.tracked,
      })),
      thisWeek,
    ),
    week: {
      start: selected.start,
      days: selected.days.map((date) => ({
        date,
        minutes: byDay.get(date) ?? 0,
      })),
    },
    year: days.filter((d) => d.date >= yearStart),
    records: {
      longestRunMinutes: msToMinutes(totals._max.focusTimeMs ?? 0),
      bestDay: best.bestDay,
      bestWeek: best.bestWeek,
      totalSessions: totals._count._all,
    },
  };
}

/**
 * The member's runs, newest first, `SESSIONS_PAGE_SIZE` a page. Keyset on
 * `(startedAt desc, id desc)`, so a run recorded while the member pages never repeats a row.
 */
export async function listFocusSessions(userId: string, cursor: string | undefined): Promise<FocusSessionsPage> {
  const [ms, id] = cursor ? (cursor.split('.') as [string, string]) : [];
  const after =
    ms !== undefined && id !== undefined
      ? {
          at: new Date(Number(ms)),
          id,
        }
      : null;
  const rows = await prisma.rmhStudySession.findMany({
    where: {
      userId,
      ...(after
        ? {
            OR: [
              {
                startedAt: {
                  lt: after.at,
                },
              },
              {
                startedAt: after.at,
                id: {
                  lt: after.id,
                },
              },
            ],
          }
        : {}),
    },
    orderBy: [
      {
        startedAt: 'desc',
      },
      {
        id: 'desc',
      },
    ],
    take: SESSIONS_PAGE_SIZE + 1,
    select: {
      id: true,
      startedAt: true,
      focusTimeMs: true,
      breakTimeMs: true,
      sessionsInRun: true,
      roomId: true,
    },
  });
  const page = rows.slice(0, SESSIONS_PAGE_SIZE);
  const last = page[page.length - 1];
  return {
    sessions: page.map((r) => ({
      id: r.id,
      startedAt: r.startedAt.toISOString(),
      focusMinutes: msToMinutes(r.focusTimeMs),
      breakMinutes: msToMinutes(r.breakTimeMs),
      pomodoros: r.sessionsInRun,
      roomCode: r.roomId,
    })),
    nextCursor: rows.length > SESSIONS_PAGE_SIZE && last ? `${last.startedAt.getTime()}.${last.id}` : null,
  };
}

/** Sets the member's weekly goal in minutes, or clears it with null. */
export async function setWeeklyGoal(userId: string, minutes: number | null): Promise<number | null> {
  const profile = await prisma.rmhStudyProfile.upsert({
    where: {
      userId,
    },
    create: {
      userId,
      weeklyGoalMinutes: minutes,
    },
    update: {
      weeklyGoalMinutes: minutes,
    },
    select: {
      weeklyGoalMinutes: true,
    },
  });
  return profile.weeklyGoalMinutes;
}
