/**
 * Reading time (sprint 07 18) — recording and the summary, server only. Kept out
 * of `time.server.ts` because it reaches the library catalogue
 * (`data/library-metadata.json`) through `docExists` and `getBook`, which the
 * account-deletion path (and so the jobs bundle) must not pull in.
 */

import { prisma } from '@/lib/prisma.server';
import { lockKey } from '@/lib/db/advisory-lock.server';
import { addDays } from '@/lib/calendar/tz';
import { getBook } from '@/lib/library/library.server';
import { docExists } from '@/lib/reading/highlights.server';
import type { ReadingDocKind } from '@/lib/reading/schema';
import type { ReadingTimeSummary } from '@/lib/reading/time.contract';
import { roomInDay } from '@/lib/reading/time';
import { publishedLogWhere } from '@/lib/blog/publication';
import {
  dayKeyFor,
  getTimePrefs,
  weekStartFor,
} from '@/lib/reading/time.server';

const TOP_DOCS = 5;
const PREVIOUS_WEEKS = 4;

export type RecordResult =
  | {
      ok: true;
      recorded: number;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

/**
 * Add `seconds` to the member's row for (today, document). Refused when tracking
 * is off or the document does not exist. The 24-hour day cap is checked inside a
 * transaction that first takes the per-member, per-day advisory lock, so two tabs
 * flushing at once cannot both pass it; the excess over the cap is dropped, not
 * refused, so a flush never retries forever.
 */
export async function recordReadingTime(
  userId: string,
  input: {
    kind: ReadingDocKind;
    key: string;
    seconds: number;
    tz?: string;
  },
  now: Date = new Date(),
): Promise<RecordResult> {
  const prefs =
    await prisma.readingPrefs.findUnique(
      {
        where:
          {
            userId,
          },
        select:
          {
            trackTime: true,
          },
      },
    );
  if (
    !prefs?.trackTime
  )
    return {
      ok: false,
      status: 409,
      error:
        'Reading time is off',
    };
  if (
    !(await docExists(
      input.kind,
      input.key,
    ))
  ) {
    return {
      ok: false,
      status: 404,
      error:
        'Document not found',
    };
  }
  const day =
    dayKeyFor(
      now,
      input.tz,
    );
  const recorded =
    await prisma.$transaction(
      async (
        tx,
      ) => {
        await lockKey(
          tx,
          `reading-time:${userId}:${day}`,
        );
        const used =
          (
            await tx.readingTimeDay.aggregate(
              {
                where:
                  {
                    userId,
                    day,
                  },
                _sum: {
                  seconds: true,
                },
              },
            )
          )
            ._sum
            .seconds ??
          0;
        const add =
          roomInDay(
            used,
            input.seconds,
          );
        if (
          add <=
          0
        )
          return 0;
        await tx.readingTimeDay.upsert(
          {
            where:
              {
                userId_day_docKind_docKey:
                  {
                    userId,
                    day,
                    docKind:
                      input.kind,
                    docKey:
                      input.key,
                  },
              },
            create:
              {
                userId,
                day,
                docKind:
                  input.kind,
                docKey:
                  input.key,
                seconds:
                  add,
              },
            update:
              {
                seconds:
                  {
                    increment:
                      add,
                  },
              },
          },
        );
        return add;
      },
    );
  return {
    ok: true,
    recorded,
  };
}

async function titlesFor(
  rows: Array<{
    docKind: ReadingDocKind;
    docKey: string;
  }>,
): Promise<
  Map<
    string,
    string
  >
> {
  const out =
    new Map<
      string,
      string
    >();
  const keysOf =
    (
      k: ReadingDocKind,
    ) =>
      rows
        .filter(
          (
            r,
          ) =>
            r.docKind ===
            k,
        )
        .map(
          (
            r,
          ) =>
            r.docKey,
        );
  const blog =
    keysOf(
      'blog',
    );
  const news =
    keysOf(
      'news',
    );
  const [
    posts,
    articles,
    books,
  ] =
    await Promise.all(
      [
        blog.length
          ? prisma.blogPost.findMany(
              {
                // A Log taken back to draft keeps its minutes but no longer shows its title (s03-05).
                where:
                  {
                    slug: {
                      in: blog,
                    },
                    ...publishedLogWhere(
                      new Date(),
                    ),
                  },
                select:
                  {
                    slug: true,
                    title: true,
                  },
              },
            )
          : [],
        news.length
          ? prisma.newsArticle.findMany(
              {
                where:
                  {
                    slug: {
                      in: news,
                    },
                  },
                select:
                  {
                    slug: true,
                    title: true,
                  },
              },
            )
          : [],
        Promise.all(
          keysOf(
            'library',
          ).map(
            (
              k,
            ) =>
              getBook(
                k,
              ),
          ),
        ),
      ],
    );
  for (const p of Array.isArray(
    posts,
  )
    ? posts
    : [])
    out.set(
      `blog:${p.slug}`,
      p.title,
    );
  for (const a of Array.isArray(
    articles,
  )
    ? articles
    : [])
    out.set(
      `news:${a.slug}`,
      a.title,
    );
  for (const b of books)
    if (
      b
    )
      out.set(
        `library:${b.slug}`,
        b.title,
      );
  return out;
}

/** This week by day, the four weeks before it, and the month's top documents. */
export async function readingTimeSummary(
  userId: string,
  opts: {
    tz?: string;
    locale?: string;
  },
  now: Date = new Date(),
): Promise<ReadingTimeSummary> {
  const today =
    dayKeyFor(
      now,
      opts.tz,
    );
  const weekStart =
    weekStartFor(
      today,
      opts.locale,
    );
  const from =
    addDays(
      weekStart,
      -7 *
        PREVIOUS_WEEKS,
    );
  const monthStart = `${today.slice(0, 7)}-01`;
  const [
    prefs,
    perDay,
    perDoc,
  ] =
    await Promise.all(
      [
        getTimePrefs(
          userId,
        ),
        prisma.readingTimeDay.groupBy(
          {
            by: [
              'day',
            ],
            where:
              {
                userId,
                day: {
                  gte: from,
                  lte: today,
                },
              },
            _sum: {
              seconds: true,
            },
          },
        ),
        prisma.readingTimeDay.groupBy(
          {
            by: [
              'docKind',
              'docKey',
            ],
            where:
              {
                userId,
                day: {
                  gte: monthStart,
                  lte: today,
                },
              },
            _sum: {
              seconds: true,
            },
            orderBy:
              {
                _sum: {
                  seconds:
                    'desc',
                },
              },
            take: TOP_DOCS,
          },
        ),
      ],
    );
  const byDay =
    new Map<
      string,
      number
    >();
  for (const r of perDay)
    byDay.set(
      r.day,
      r
        ._sum
        .seconds ??
        0,
    );
  const days =
    Array.from(
      {
        length: 7,
      },
      (
        _,
        i,
      ) => {
        const day =
          addDays(
            weekStart,
            i,
          );
        return {
          day,
          seconds:
            byDay.get(
              day,
            ) ??
            0,
        };
      },
    );
  const previousWeeks =
    Array.from(
      {
        length:
          PREVIOUS_WEEKS,
      },
      (
        _,
        w,
      ) => {
        const start =
          addDays(
            weekStart,
            -7 *
              (w +
                1),
          );
        let seconds = 0;
        for (
          let i = 0;
          i <
          7;
          i++
        )
          seconds +=
            byDay.get(
              addDays(
                start,
                i,
              ),
            ) ??
            0;
        return {
          weekStart:
            start,
          seconds,
        };
      },
    );
  const titles =
    await titlesFor(
      perDoc,
    );
  return {
    trackTime:
      prefs.trackTime,
    weeklyMinutesTarget:
      prefs.weeklyMinutesTarget,
    today,
    weekStart,
    days,
    weekSeconds:
      days.reduce(
        (
          n,
          d,
        ) =>
          n +
          d.seconds,
        0,
      ),
    previousWeeks,
    topThisMonth:
      perDoc.map(
        (
          r,
        ) => ({
          kind: r.docKind,
          key: r.docKey,
          title:
            titles.get(
              `${r.docKind}:${r.docKey}`,
            ) ??
            r.docKey,
          seconds:
            r
              ._sum
              .seconds ??
            0,
        }),
      ),
  };
}
