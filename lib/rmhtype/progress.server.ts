/**
 * Server side of the RMHType progress page. Everything here reads the caller's own
 * `RmhTypeMatchPlayer` rows (`userId` is always the session user's) and never writes.
 *
 * Costs are bounded: every query reads at most {@link MAX_RUN_ROWS} rows, newest
 * first, through the `(userId, createdAt desc)` index, and the chart gets at most
 * {@link MAX_CHART_POINTS} days. Daily medians are bucketed in SQL in the viewer's
 * (validated) time zone, so a run at 11 pm local counts on its own day.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import {
  MAX_RUN_ROWS,
  RANGE_DAYS,
  RUNS_PAGE_SIZE,
  bestsTable,
  capPoints,
  encodeRunCursor,
  parseRunCursor,
  summarizeRuns,
  type BestRun,
  type DailyPoint,
  type ProgressMode,
  type ProgressRange,
  type ProgressSummary,
  type RunRow,
} from '@/lib/rmhtype/progress';

const DAY_MS = 24 * 60 * 60 * 1000;

/** The match-side filter for a mode: `solo` is one-player runs, `races` is the rest. */
function matchFilter(mode: ProgressMode): Prisma.RmhTypeMatchWhereInput {
  if (mode === 'solo')
    return {
      isSolo: true,
    };
  if (mode === 'races')
    return {
      isSolo: false,
    };
  return {};
}

export interface ProgressResult {
  daily: DailyPoint[];
  truncated: boolean;
  capped: boolean;
  summary: ProgressSummary;
  bests: BestRun[];
}

interface DailyRow {
  day: string;
  runs: bigint;
  wpm: number;
  accuracy: number;
}

interface BestRow {
  at: Date;
  wpm: number;
  accuracy: number;
  passageLength: string;
  difficulty: string;
}

export async function getProgress(
  userId: string,
  {
    range,
    mode,
    tz,
  }: {
    range: ProgressRange;
    mode: ProgressMode;
    tz: string;
  },
): Promise<ProgressResult> {
  const now = Date.now();
  const days = RANGE_DAYS[range];
  const since = days === null ? null : new Date(now - days * DAY_MS);
  const scanFrom = days === null ? null : new Date(now - 2 * days * DAY_MS);

  const [rows, dailyRows, bestRows] = await Promise.all([
    // The range and the one before it, for the summary and the change figure.
    prisma.rmhTypeMatchPlayer.findMany({
      where: {
        userId,
        ...(scanFrom
          ? {
              createdAt: {
                gte: scanFrom,
              },
            }
          : {}),
        match: matchFilter(mode),
      },
      select: {
        createdAt: true,
        wpm: true,
        accuracy: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: MAX_RUN_ROWS,
    }),
    prisma.$queryRaw<DailyRow[]>`
      WITH runs AS (
        SELECT p."createdAt" AS at, p.wpm, p.accuracy
        FROM "rmhtype_match_player" p
        JOIN "rmhtype_match" m ON m.id = p."matchId"
        WHERE p."userId" = ${userId}
          AND p."createdAt" >= ${since ?? new Date(0)}
          AND (${mode}::text = 'all' OR m."isSolo" = (${mode}::text = 'solo'))
        ORDER BY p."createdAt" DESC
        LIMIT ${MAX_RUN_ROWS}
      )
      SELECT to_char((at AT TIME ZONE 'UTC') AT TIME ZONE ${tz}::text, 'YYYY-MM-DD') AS day,
             count(*) AS runs,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY wpm) AS wpm,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY accuracy) AS accuracy
      FROM runs
      GROUP BY 1
      ORDER BY 1 ASC
    `,
    prisma.$queryRaw<BestRow[]>`
      WITH runs AS (
        SELECT p."createdAt" AS at, p.wpm, p.accuracy, m."passageLength", m.difficulty
        FROM "rmhtype_match_player" p
        JOIN "rmhtype_match" m ON m.id = p."matchId"
        WHERE p."userId" = ${userId}
          AND (${mode}::text = 'all' OR m."isSolo" = (${mode}::text = 'solo'))
        ORDER BY p."createdAt" DESC
        LIMIT ${MAX_RUN_ROWS}
      )
      SELECT DISTINCT ON ("passageLength", difficulty) at, wpm, accuracy, "passageLength", difficulty
      FROM runs
      ORDER BY "passageLength", difficulty, wpm DESC, accuracy DESC, at ASC
    `,
  ]);

  const inRange = rows.filter((r) => since === null || r.createdAt >= since);
  const before = rows.filter((r) => since !== null && r.createdAt < since);
  const summary = summarizeRuns(
    inRange.map((r) => ({
      wpm: r.wpm,
      accuracy: r.accuracy,
      at: r.createdAt.toISOString(),
    })),
    before.map((r) => r.wpm),
  );

  const daily: DailyPoint[] = dailyRows.map((r) => ({
    day: r.day,
    runs: Number(r.runs),
    wpm: Math.round(r.wpm * 10) / 10,
    accuracy: Math.round(r.accuracy * 10) / 10,
  }));
  const shown = capPoints(daily);

  return {
    daily: shown,
    truncated: shown.length < daily.length,
    capped: rows.length >= MAX_RUN_ROWS,
    summary,
    bests: bestsTable(
      bestRows.map((r) => ({
        passageLength: r.passageLength,
        difficulty: r.difficulty,
        wpm: r.wpm,
        accuracy: r.accuracy,
        at: r.at.toISOString(),
        cursor: encodeRunCursor(r.at.toISOString()),
      })),
    ),
  };
}

/** One page of the caller's runs, newest first, keyed on (createdAt, id). */
export async function getRuns(
  userId: string,
  {
    mode,
    cursor,
  }: {
    mode: ProgressMode;
    cursor?: string | undefined;
  },
): Promise<{
  runs: RunRow[];
  nextCursor: string | null;
}> {
  const parsed = cursor ? parseRunCursor(cursor) : null;
  const after: Prisma.RmhTypeMatchPlayerWhereInput = parsed
    ? parsed.id
      ? {
          OR: [
            {
              createdAt: {
                lt: parsed.at,
              },
            },
            {
              createdAt: parsed.at,
              id: {
                lt: parsed.id,
              },
            },
          ],
        }
      : {
          createdAt: {
            lte: parsed.at,
          },
        }
    : {};

  const rows = await prisma.rmhTypeMatchPlayer.findMany({
    where: {
      userId,
      match: matchFilter(mode),
      ...after,
    },
    select: {
      id: true,
      createdAt: true,
      wpm: true,
      accuracy: true,
      rank: true,
      match: {
        select: {
          isSolo: true,
          passageLength: true,
          difficulty: true,
        },
      },
    },
    orderBy: [
      {
        createdAt: 'desc',
      },
      {
        id: 'desc',
      },
    ],
    take: RUNS_PAGE_SIZE + 1,
  });

  const page = rows.slice(0, RUNS_PAGE_SIZE);
  const last = page[page.length - 1];
  return {
    runs: page.map((r) => ({
      id: r.id,
      at: r.createdAt.toISOString(),
      solo: r.match.isSolo,
      passageLength: r.match.passageLength,
      difficulty: r.match.difficulty,
      wpm: r.wpm,
      accuracy: r.accuracy,
      rank: r.match.isSolo ? null : r.rank,
    })),
    nextCursor: rows.length > RUNS_PAGE_SIZE && last ? encodeRunCursor(last.createdAt.toISOString(), last.id) : null,
  };
}
