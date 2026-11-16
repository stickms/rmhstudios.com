/**
 * Sight reading results (`music_sprint_best`, `music_sprint_daily`) — plan task S5. The rules are
 * the pure `record.ts`; this file reads and writes rows, always with the server's clock.
 *
 * - **Freeplay:** a checked run (recomputed points) updates the level's best: the higher score
 *   and, independently, the faster average reaction.
 * - **Daily, started:** the scored run is recorded when it STARTS (`startDaily`, a row with no
 *   score). Only the first start of a date is scored, so abandoning a bad run does not deal a fresh
 *   one: the date then reads `started` and later runs are practice. A start that never reached the
 *   server (offline) is not needed to save: the save creates the row itself.
 * - **Daily, finished:** the save fills the date's row once (`UPDATE … WHERE score IS NULL`, one
 *   statement, so two tabs cannot both score). A second save answers `already-scored`, unless it
 *   is the same run retried (equal recomputed results), which answers `saved`.
 * - **Dates:** the dealt date must pass `acceptDealtDate` (today, or yesterday within the grace
 *   window); it is never relabelled.
 * - **The board's verdict (Phase 6):** the fill also records whether the run may be ranked
 *   (`plausible.ts` `judgeDailyRun`, from the time between the recorded start and the save). A run
 *   that fails a check is kept (it counts for the streak) and is not ranked. A ranked perfect run
 *   that asks for a look, of a learner whose board switch is on, files one `[Auto]` report
 *   (`review.server.ts`); it never blocks the save.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { invalidateBoard } from '../social/board-cache.server';
import { utcDate } from './generate';
import {
  isSprintLevelId,
  type SprintLevelId,
} from './levels';
import {
  acceptDealtDate,
  checkDailyRun,
  checkFreeplayRun,
  dailyStreak,
  nextBest,
  sameRun,
} from './record';
import {
  judgeDailyRun,
  needsReview,
  REVIEW_WINDOW_DAYS,
} from './plausible';
import { fileBoardReview } from './review.server';
import type { PromptResult } from './scoring';
import type {
  SprintDailyState,
  SprintLevelBest,
  SprintOverview,
} from './sprint.contract';

/** How many scored dates the streak reads back (a streak longer than this shows this). */
const STREAK_LOOKBACK = 400;

export async function loadSprintOverview(
  userId: string,
  date: string,
  now: number,
): Promise<SprintOverview> {
  const [
    bests,
    row,
    scored,
  ] =
    await Promise.all(
      [
        prisma.musicSprintBest.findMany(
          {
            where:
              {
                userId,
              },
            select:
              {
                level: true,
                bestScore: true,
                bestAvgMs: true,
              },
          },
        ),
        prisma.musicSprintDaily.findUnique(
          {
            where:
              {
                userId_date:
                  {
                    userId,
                    date,
                  },
              },
            select:
              {
                score: true,
              },
          },
        ),
        prisma.musicSprintDaily.findMany(
          {
            where:
              {
                userId,
                score:
                  {
                    not: null,
                  },
              },
            select:
              {
                date: true,
              },
            orderBy:
              {
                date: 'desc',
              },
            take: STREAK_LOOKBACK,
          },
        ),
      ],
    );
  const daily: SprintDailyState =
    !row
      ? 'open'
      : row.score ===
          null
        ? 'started'
        : 'scored';
  return {
    bests:
      bests.flatMap(
        (
          b,
        ): SprintLevelBest[] =>
          isSprintLevelId(
            b.level,
          )
            ? [
                {
                  level:
                    b.level,
                  bestScore:
                    b.bestScore,
                  bestAvgMs:
                    b.bestAvgMs,
                },
              ]
            : [],
      ),
    daily,
    streak:
      dailyStreak(
        scored.map(
          (
            r,
          ) =>
            r.date,
        ),
        utcDate(
          now,
        ),
      ),
  };
}

/** Keep a freeplay run. Null when the run is not a possible run of that level. */
export async function saveSprintFreeplay(
  userId: string,
  level: SprintLevelId,
  results: readonly PromptResult[],
): Promise<SprintLevelBest | null> {
  const run =
    checkFreeplayRun(
      level,
      results,
    );
  if (
    !run
  )
    return null;
  return prisma.$transaction(
    async (
      tx,
    ) => {
      const prev =
        await tx.musicSprintBest.findUnique(
          {
            where:
              {
                userId_level:
                  {
                    userId,
                    level,
                  },
              },
            select:
              {
                bestScore: true,
                bestAvgMs: true,
              },
          },
        );
      const best =
        nextBest(
          prev,
          run.summary,
        );
      await tx.musicSprintBest.upsert(
        {
          where:
            {
              userId_level:
                {
                  userId,
                  level,
                },
            },
          create:
            {
              userId,
              level,
              ...best,
            },
          update:
            best,
        },
      );
      return {
        level,
        ...best,
      };
    },
  );
}

/** Record the start of the date's scored run. Null for a date outside the window. */
export async function startSprintDaily(
  userId: string,
  date: string,
  now: number,
): Promise<{
  scored: boolean;
} | null> {
  if (
    !acceptDealtDate(
      date,
      now,
    )
  )
    return null;
  const made =
    await prisma.musicSprintDaily.createMany(
      {
        data: [
          {
            userId,
            date,
          },
        ],
        skipDuplicates: true,
      },
    );
  return {
    scored:
      made.count ===
      1,
  };
}

export type DailySaveOutcome =
  | 'saved'
  | 'already-scored'
  | 'invalid';

const DAY_MS = 86_400_000;

/** Keep the date's scored run, once, with the board's verdict on it (`plausible.ts`). */
export async function saveSprintDaily(
  userId: string,
  date: string,
  results: readonly PromptResult[],
  now: number,
): Promise<DailySaveOutcome> {
  if (
    !acceptDealtDate(
      date,
      now,
    )
  )
    return 'invalid';
  const run =
    checkDailyRun(
      results,
    );
  if (
    !run
  )
    return 'invalid';
  // The start may never have reached the server: make the row if it is missing. A row this save
  // had to make is a run with no recorded start, which the board does not rank (`no-start`).
  const made =
    await prisma.musicSprintDaily.createMany(
      {
        data: [
          {
            userId,
            date,
          },
        ],
        skipDuplicates: true,
      },
    );
  const started =
    made.count ===
    1
      ? null
      : await prisma.musicSprintDaily.findUnique(
          {
            where:
              {
                userId_date:
                  {
                    userId,
                    date,
                  },
              },
            select:
              {
                createdAt: true,
              },
          },
        );
  const verdict =
    judgeDailyRun(
      run.results,
      started
        ? now -
            started.createdAt.getTime()
        : null,
    );
  const filled =
    await prisma.musicSprintDaily.updateMany(
      {
        where:
          {
            userId,
            date,
            score:
              null,
          },
        data: {
          score:
            run
              .summary
              .score,
          avgMs:
            run
              .summary
              .avgMs,
          played:
            run
              .summary
              .played,
          skipped:
            run
              .summary
              .skipped,
          results:
            run.results as unknown as Prisma.InputJsonValue,
          scoredAt:
            new Date(
              now,
            ),
          ranked:
            verdict.ranked,
          unrankedReason:
            verdict.reason,
        },
      },
    );
  if (
    filled.count ===
    1
  ) {
    if (
      verdict.ranked
    ) {
      // A newly ranked run belongs on the date's board now, not in 30 s.
      await invalidateBoard(
        date,
      );
      await reviewRankedRun(
        userId,
        date,
        run.summary,
        now,
      );
    }
    return 'saved';
  }
  const stored =
    await prisma.musicSprintDaily.findUnique(
      {
        where:
          {
            userId_date:
              {
                userId,
                date,
              },
          },
        select:
          {
            results: true,
          },
      },
    );
  return sameRun(
    stored?.results,
    run.results,
  )
    ? 'saved'
    : 'already-scored';
}

/**
 * A ranked run on the board (the learner's board switch on) that asks for a moderator's look files
 * the `[Auto]` report; a private run files nothing. Never throws.
 */
async function reviewRankedRun(
  userId: string,
  date: string,
  summary: {
    score: number;
    avgMs:
      | number
      | null;
  },
  now: number,
): Promise<void> {
  if (
    summary.score !==
    100
  )
    return;
  try {
    // A private run (the board switch off) is on no one's board: nothing for a moderator to check.
    const social =
      await prisma.musicSocial.findUnique(
        {
          where:
            {
              userId,
            },
          select:
            {
              board: true,
            },
        },
      );
    if (
      !social?.board
    )
      return;
    const perfect =
      await prisma.musicSprintDaily.count(
        {
          where:
            {
              userId,
              ranked: true,
              score: 100,
              date: {
                gte: utcDate(
                  now -
                    (REVIEW_WINDOW_DAYS -
                      1) *
                      DAY_MS,
                ),
              },
            },
        },
      );
    if (
      !needsReview(
        summary,
        perfect,
      )
    )
      return;
    const row =
      await prisma.musicSprintDaily.findUnique(
        {
          where:
            {
              userId_date:
                {
                  userId,
                  date,
                },
            },
          select:
            {
              id: true,
            },
        },
      );
    if (
      row
    ) {
      await fileBoardReview(
        {
          userId,
          rowId:
            row.id,
          date,
          score:
            summary.score,
          avgMs:
            summary.avgMs,
          now,
        },
      );
    }
  } catch (err) {
    console.error(
      '[rmhmusic] board review failed:',
      err,
    );
  }
}
