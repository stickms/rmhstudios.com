/**
 * Reading time (sprint 07 18) — server only. Opt-in, own data only: nothing here
 * is in a public payload, an OG card, a profile or the developer API.
 *
 * Rows are `reading_time_day(userId, day, docKind, docKey, seconds)`; `day` is the
 * calendar day in the member's time zone (the request's `tz`, UTC when missing or
 * invalid). A flush is attributed to the day of the request, so a span crossing
 * midnight counts on the later day (accepted).
 */

import { prisma } from '@/lib/prisma.server';
import { addDays, dayOf, isValidTimeZone, parseDay } from '@/lib/calendar/tz';
import { firstDayOfWeek } from '@/lib/locale-week';
import type { ReadingDocKind } from '@/lib/reading/schema';
import type { ReadingTimePrefs } from '@/lib/reading/time.contract';

/** The day key for `now` in `tz`; UTC when `tz` is missing or not a zone. */
export function dayKeyFor(now: Date, tz: string | undefined): string {
  return dayOf(now.getTime(), tz && isValidTimeZone(tz) ? tz : 'UTC');
}

/** First day (`YYYY-MM-DD`) of the locale week that holds `day`. */
export function weekStartFor(day: string, locale: string | undefined): string {
  const p = parseDay(day);
  if (!p) return day;
  const dow = new Date(Date.UTC(p.y, p.mo - 1, p.d)).getUTCDay();
  const first = firstDayOfWeek(locale && locale.length > 0 ? locale : 'en-GB');
  return addDays(day, -((dow - first + 7) % 7));
}

export async function getTimePrefs(
  userId: string,
  doc?: {
    kind: ReadingDocKind;
    key: string;
  },
): Promise<ReadingTimePrefs> {
  const [row, agg] = await Promise.all([
    prisma.readingPrefs.findUnique({
      where: {
        userId,
      },
      select: {
        trackTime: true,
        weeklyMinutesTarget: true,
      },
    }),
    doc
      ? prisma.readingTimeDay.aggregate({
          where: {
            userId,
            docKind: doc.kind,
            docKey: doc.key,
          },
          _sum: {
            seconds: true,
          },
        })
      : Promise.resolve(null),
  ]);
  return {
    trackTime: row?.trackTime ?? false,
    weeklyMinutesTarget: row?.weeklyMinutesTarget ?? null,
    docSeconds: doc ? (agg?._sum.seconds ?? 0) : null,
  };
}

export async function setTracking(userId: string, on: boolean): Promise<ReadingTimePrefs> {
  await prisma.readingPrefs.upsert({
    where: {
      userId,
    },
    create: {
      userId,
      trackTime: on,
    },
    update: {
      trackTime: on,
    },
  });
  return getTimePrefs(userId);
}

export async function setWeeklyTarget(userId: string, minutes: number | null): Promise<ReadingTimePrefs> {
  await prisma.readingPrefs.upsert({
    where: {
      userId,
    },
    create: {
      userId,
      weeklyMinutesTarget: minutes,
    },
    update: {
      weeklyMinutesTarget: minutes,
    },
  });
  return getTimePrefs(userId);
}

export async function deleteReadingTime(userId: string): Promise<void> {
  await prisma.readingTimeDay.deleteMany({
    where: {
      userId,
    },
  });
}

/** Account deletion anonymises in place, so the cascade never fires: delete explicitly. */
export function readingTimeErasureOps(userId: string) {
  return [
    prisma.readingTimeDay.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.readingPrefs.updateMany({
      where: {
        userId,
      },
      data: {
        trackTime: false,
        weeklyMinutesTarget: null,
      },
    }),
  ];
}

/** The account export: per-day totals per document, plus the two settings. */
export async function exportReadingTime(userId: string) {
  const [prefs, rows] = await Promise.all([
    prisma.readingPrefs.findUnique({
      where: {
        userId,
      },
      select: {
        trackTime: true,
        weeklyMinutesTarget: true,
      },
    }),
    prisma.readingTimeDay.findMany({
      where: {
        userId,
      },
      orderBy: [
        {
          day: 'asc',
        },
        {
          docKind: 'asc',
        },
        {
          docKey: 'asc',
        },
      ],
      select: {
        day: true,
        docKind: true,
        docKey: true,
        seconds: true,
      },
    }),
  ]);
  return {
    trackTime: prefs?.trackTime ?? false,
    weeklyMinutesTarget: prefs?.weeklyMinutesTarget ?? null,
    days: Array.isArray(rows) ? rows : [],
  };
}
