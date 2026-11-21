/**
 * The RMHMusic practice log (`music_practice_entry`): an append-only row for every finished
 * lesson, song run, sprint and card-review session, written by the endpoints that already keep
 * the result (`recordPractice`) and read only by its owner. Every query is scoped to `userId`.
 * The maths is the pure `history.ts`.
 */
import { prisma } from '@/lib/prisma.server';
import {
  addDays,
  dayOf,
} from '@/lib/calendar/tz';
import {
  ENTRIES_PAGE_SIZE,
  HEATMAP_DAYS,
  HISTORY_WINDOW_DAYS,
  SONG_ATTEMPTS_MAX,
  clampDurationMs,
  clampScore,
  goalMetDays,
  isPracticeKind,
  toPracticeDay,
  weekBounds,
  weekDays,
  weekFrom,
  weekMinutes,
  type PracticeKind,
} from '@/lib/rmhmusic/history';
import type {
  PracticeEntry,
  PracticePage,
  PracticeSummary,
  SongProgress,
} from '@/lib/rmhmusic/history.contract';

/** What a writer says about the activity it just kept; `recordPractice` clamps every number. */
export interface PracticeInput {
  kind: PracticeKind;
  refId: string;
  mode?:
    | string
    | null;
  score?:
    | number
    | null;
  durationMs?:
    | number
    | null;
  /**
   * Write nothing when the member already has an entry of this kind, reference and mode. For the
   * daily sprint, whose reference is its date, so a retried save does not log the day twice.
   */
  once?: boolean;
}

/**
 * Append one entry. Never throws: the result it describes is already kept, so a failure here is
 * logged and the request goes on.
 */
export async function recordPractice(
  userId: string,
  input: PracticeInput,
): Promise<void> {
  try {
    const refId =
      input.refId.slice(
        0,
        80,
      );
    const mode =
      input.mode?.slice(
        0,
        8,
      ) ??
      null;
    if (
      input.once
    ) {
      const seen =
        await prisma.musicPracticeEntry.findFirst(
          {
            where:
              {
                userId,
                kind: input.kind,
                refId,
                mode,
              },
            select:
              {
                id: true,
              },
          },
        );
      if (
        seen
      )
        return;
    }
    await prisma.musicPracticeEntry.create(
      {
        data: {
          userId,
          kind: input.kind,
          refId,
          mode,
          score:
            clampScore(
              input.score,
            ),
          durationMs:
            clampDurationMs(
              input.durationMs,
            ),
        },
      },
    );
  } catch (err) {
    console.error(
      '[rmhmusic] practice entry not recorded:',
      err,
    );
  }
}

interface DayRow {
  date: string;
  count: number;
  ms: number;
}

/**
 * The member's practice summary. The day aggregate is one statement over at most
 * {@link HISTORY_WINDOW_DAYS} days through the `(userId, createdAt)` index; `timeZone` is passed
 * as a bound value, never as SQL text, and must already be validated. `createdAt` is stored as a
 * UTC timestamp, tagged UTC first and then shifted into the member's zone. Days before the window
 * in the member's zone are dropped below.
 */
export async function getPracticeSummary(
  userId: string,
  options: {
    timeZone: string;
    weekOffset: number;
    firstDay: number;
  },
  now: number = Date.now(),
): Promise<PracticeSummary> {
  const {
    timeZone,
    weekOffset,
    firstDay,
  } =
    options;
  const today =
    dayOf(
      now,
      timeZone,
    );
  const windowStart =
    addDays(
      today,
      -(
        HISTORY_WINDOW_DAYS -
        1
      ),
    );
  // Generous in UTC terms; rows before the window start in the member's zone are dropped below.
  const since =
    new Date(
      now -
        (HISTORY_WINDOW_DAYS +
          1) *
          86_400_000,
    );
  const [
    rows,
    total,
    profile,
  ] =
    await Promise.all(
      [
        prisma.$queryRaw<
          DayRow[]
        >`
      SELECT to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone}::text, 'YYYY-MM-DD') AS date,
             count(*)::int AS count,
             COALESCE(sum("durationMs"), 0)::float8 AS ms
      FROM music_practice_entry
      WHERE "userId" = ${userId} AND "createdAt" >= ${since}
      GROUP BY 1`,
        prisma.musicPracticeEntry.count(
          {
            where:
              {
                userId,
              },
          },
        ),
        prisma.musicLearnProfile.findUnique(
          {
            where:
              {
                userId,
              },
            select:
              {
                dailyGoal: true,
              },
          },
        ),
      ],
    );
  const days =
    rows
      .filter(
        (
          r,
        ) =>
          r.date >=
            windowStart &&
          r.date <=
            today,
      )
      .map(
        toPracticeDay,
      )
      .sort(
        (
          a,
          b,
        ) =>
          a.date.localeCompare(
            b.date,
          ),
      );
  const thisWeek =
    weekBounds(
      now,
      timeZone,
      firstDay,
    );
  const lastWeek =
    weekFrom(
      addDays(
        thisWeek.start,
        -7,
      ),
    );
  const selected =
    weekFrom(
      addDays(
        thisWeek.start,
        -7 *
          weekOffset,
      ),
    );
  const dailyGoal =
    profile?.dailyGoal ??
    1;
  const yearStart =
    addDays(
      today,
      -(
        HEATMAP_DAYS -
        1
      ),
    );
  return {
    today,
    firstDay,
    dailyGoal,
    thisWeekMinutes:
      weekMinutes(
        days,
        thisWeek,
      ),
    lastWeekMinutes:
      weekMinutes(
        days,
        lastWeek,
      ),
    goalDays:
      goalMetDays(
        days,
        thisWeek,
        dailyGoal,
        today,
      ),
    week: {
      start:
        selected.start,
      days: weekDays(
        days,
        selected,
      ),
    },
    year: days.filter(
      (
        d,
      ) =>
        d.date >=
        yearStart,
    ),
    totalEntries:
      total,
  };
}

interface DbEntry {
  id: bigint;
  kind: string;
  refId: string;
  mode:
    | string
    | null;
  score:
    | number
    | null;
  durationMs:
    | number
    | null;
  createdAt: Date;
}

const ENTRY_SELECT =
  {
    id: true,
    kind: true,
    refId: true,
    mode: true,
    score: true,
    durationMs: true,
    createdAt: true,
  } as const;

function toEntry(
  r: DbEntry,
): PracticeEntry | null {
  // The column is a plain string; a value this build does not know is left out, never shown raw.
  if (
    !isPracticeKind(
      r.kind,
    )
  )
    return null;
  return {
    id: r.id.toString(),
    kind: r.kind,
    refId:
      r.refId,
    mode: r.mode,
    score:
      r.score,
    durationMs:
      r.durationMs,
    createdAt:
      r.createdAt.toISOString(),
  };
}

function entries(
  rows: DbEntry[],
): PracticeEntry[] {
  return rows.flatMap(
    (
      r,
    ) => {
      const e =
        toEntry(
          r,
        );
      return e
        ? [
            e,
          ]
        : [];
    },
  );
}

/**
 * The member's entries, newest first, {@link ENTRIES_PAGE_SIZE} a page, optionally of one kind.
 * Keyset on the BigInt `id` (it only rises), so an entry written while the member pages never
 * repeats a row.
 */
export async function listPractice(
  userId: string,
  options: {
    kind?:
      | PracticeKind
      | undefined;
    cursor?:
      | string
      | undefined;
  } = {},
): Promise<PracticePage> {
  const rows =
    await prisma.musicPracticeEntry.findMany(
      {
        where:
          {
            userId,
            ...(options.kind
              ? {
                  kind: options.kind,
                }
              : {}),
            ...(options.cursor
              ? {
                  id: {
                    lt: BigInt(
                      options.cursor,
                    ),
                  },
                }
              : {}),
          },
        orderBy:
          {
            id: 'desc',
          },
        take:
          ENTRIES_PAGE_SIZE +
          1,
        select:
          ENTRY_SELECT,
      },
    );
  const page =
    rows.slice(
      0,
      ENTRIES_PAGE_SIZE,
    );
  const last =
    page[
      page.length -
        1
    ];
  return {
    entries:
      entries(
        page,
      ),
    nextCursor:
      rows.length >
        ENTRIES_PAGE_SIZE &&
      last
        ? last.id.toString()
        : null,
  };
}

/**
 * The member's attempts at one song (optionally one mode): the newest
 * {@link SONG_ATTEMPTS_MAX}, oldest first. Only the caller's own rows, by `userId`.
 */
export async function getSongProgress(
  userId: string,
  songId: string,
  mode?: string,
): Promise<SongProgress> {
  const rows =
    await prisma.musicPracticeEntry.findMany(
      {
        where:
          {
            userId,
            kind: 'song',
            refId:
              songId,
            ...(mode
              ? {
                  mode,
                }
              : {}),
          },
        orderBy:
          {
            id: 'desc',
          },
        take: SONG_ATTEMPTS_MAX,
        select:
          ENTRY_SELECT,
      },
    );
  return {
    attempts:
      entries(
        rows.reverse(),
      ),
  };
}

/** Clear history: delete every one of the member's entries. Returns how many went. */
export async function clearPractice(
  userId: string,
): Promise<number> {
  const {
    count,
  } =
    await prisma.musicPracticeEntry.deleteMany(
      {
        where:
          {
            userId,
          },
      },
    );
  return count;
}
