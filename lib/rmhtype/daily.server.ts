/**
 * Server side of the RMHType daily challenge.
 *
 * The clock is the server's. Start writes `startedAt` once and never rewrites it, so a
 * reload or a second Start cannot buy a fresh clock; Finish measures from that stamp to
 * the server's `now` and takes only keystroke counts from the client. A result is
 * accepted once, and only if it is plausible (`plausible`, `daily.ts`).
 */
import { userChipSelect } from '@/lib/user-display';
import { prisma } from '@/lib/prisma.server';
import {
  cached,
  invalidateTag,
} from '@/lib/cached.server';
import { getFollowingIds } from '@/lib/social/follow-graph.server';
import { PASSAGES } from '@/lib/rmhtype/passages';
import {
  DAILY_WINDOW_MS,
  dayKey,
  passageForDay,
  plausible,
  scoreOf,
  shiftDay,
  streakFrom,
  type DailyBoard,
  type DailyBoardRow,
  type DailyScope,
  type DailyState,
} from '@/lib/rmhtype/daily';

const BOARD_SIZE = 50;
const BOARD_TTL_MS = 30_000;
/** How many finished days the streak looks back over. */
const STREAK_LOOKBACK = 400;

const PASSAGE_IDS =
  PASSAGES.map(
    (
      p,
    ) =>
      p.id,
  );

const boardTag =
  (
    day: string,
  ) =>
    `rmhtype-daily:${day}`;

interface Entry {
  userId: string;
  day: string;
  passageId: string;
  startedAt: Date;
  finishedAt: Date | null;
  wpm:
    | number
    | null;
  accuracy:
    | number
    | null;
  timeMs:
    | number
    | null;
}

const passageText =
  (
    passageId: string,
  ):
    | string
    | null =>
    PASSAGES.find(
      (
        p,
      ) =>
        p.id ===
        passageId,
    )
      ?.text ??
    null;

/** Place among scored entries of the day (optionally only `userIds`): wpm, then accuracy, then earlier finish. */
async function rankOf(
  entry: {
    day: string;
    wpm: number;
    accuracy: number;
    finishedAt: Date;
  },
  userIds?: string[],
): Promise<number> {
  const scope =
    {
      day: entry.day,
      wpm: {
        not: null,
      },
      ...(userIds
        ? {
            userId:
              {
                in: userIds,
              },
          }
        : {}),
    };
  const ahead =
    await prisma.rmhTypeDailyEntry.count(
      {
        where:
          {
            ...scope,
            OR: [
              {
                wpm: {
                  gt: entry.wpm,
                },
              },
              {
                wpm: entry.wpm,
                accuracy:
                  {
                    gt: entry.accuracy,
                  },
              },
              {
                wpm: entry.wpm,
                accuracy:
                  entry.accuracy,
                finishedAt:
                  {
                    lt: entry.finishedAt,
                  },
              },
            ],
          },
      },
    );
  return (
    ahead +
    1
  );
}

async function streakOf(
  userId: string,
  today: string,
): Promise<number> {
  const rows =
    await prisma.rmhTypeDailyEntry.findMany(
      {
        where:
          {
            userId,
            wpm: {
              not: null,
            },
          },
        select:
          {
            day: true,
          },
        orderBy:
          {
            day: 'desc',
          },
        take: STREAK_LOOKBACK,
      },
    );
  return streakFrom(
    rows.map(
      (
        r,
      ) =>
        r.day,
    ),
    today,
  );
}

async function stateOf(
  userId: string,
  day: string,
  entry: Entry | null,
  now: Date,
): Promise<DailyState> {
  const passageId =
    entry?.passageId ??
    passageForDay(
      day,
      PASSAGE_IDS,
    );
  const text =
    passageText(
      passageId,
    );
  const passageLength =
    text?.length ??
    0;
  const streak =
    await streakOf(
      userId,
      dayKey(
        now,
      ),
    );
  const base =
    {
      day,
      passageLength,
      serverNow:
        now.toISOString(),
      streak,
    };
  if (
    !entry
  )
    return {
      ...base,
      status:
        'ready',
      text: null,
      startedAt:
        null,
      result:
        null,
    };
  const startedAt =
    entry.startedAt.toISOString();
  if (
    entry.wpm !==
      null &&
    entry.accuracy !==
      null &&
    entry.timeMs !==
      null &&
    entry.finishedAt
  ) {
    const rank =
      await rankOf(
        {
          day: entry.day,
          wpm: entry.wpm,
          accuracy:
            entry.accuracy,
          finishedAt:
            entry.finishedAt,
        },
      );
    return {
      ...base,
      status:
        'done',
      text,
      startedAt,
      result:
        {
          wpm: entry.wpm,
          accuracy:
            entry.accuracy,
          timeMs:
            entry.timeMs,
          rank,
        },
    };
  }
  const open =
    !entry.finishedAt &&
    now.getTime() -
      entry.startedAt.getTime() <=
      DAILY_WINDOW_MS;
  return {
    ...base,
    status:
      open
        ? 'running'
        : 'missed',
    text,
    startedAt,
    result:
      null,
  };
}

const findEntry =
  (
    userId: string,
    day: string,
  ): Promise<Entry | null> =>
    prisma.rmhTypeDailyEntry.findUnique(
      {
        where:
          {
            userId_day:
              {
                userId,
                day,
              },
          },
      },
    );

/** Today's state for `userId`: not started, running, done or missed. */
export async function getDaily(
  userId: string,
  now: Date = new Date(),
): Promise<DailyState> {
  const day =
    dayKey(
      now,
    );
  return stateOf(
    userId,
    day,
    await findEntry(
      userId,
      day,
    ),
    now,
  );
}

/** Use today's attempt. Idempotent: the row, and so the clock, is created once. */
export async function startDaily(
  userId: string,
  now: Date = new Date(),
): Promise<DailyState> {
  const day =
    dayKey(
      now,
    );
  const entry =
    await prisma.rmhTypeDailyEntry.upsert(
      {
        where:
          {
            userId_day:
              {
                userId,
                day,
              },
          },
        // Empty on purpose: a second Start must never touch the first one's `startedAt`.
        update:
          {},
        create:
          {
            userId,
            day,
            passageId:
              passageForDay(
                day,
                PASSAGE_IDS,
              ),
            startedAt:
              now,
          },
      },
    );
  return stateOf(
    userId,
    day,
    entry,
    now,
  );
}

export type FinishOutcome =
  | {
      kind: 'state';
      state: DailyState;
    }
  | {
      kind:
        | 'not-started'
        | 'already-finished'
        | 'implausible';
    };

/**
 * Score a run. `day` is the day the attempt was started on (a run begun just before
 * midnight may finish after it). Past the window, or on an implausible report, the attempt is closed without a score.
 */
export async function finishDaily(
  userId: string,
  report: {
    day: string;
    correct: number;
    total: number;
  },
  now: Date = new Date(),
): Promise<FinishOutcome> {
  const entry =
    await findEntry(
      userId,
      report.day,
    );
  if (
    !entry
  )
    return {
      kind: 'not-started',
    };
  if (
    entry.finishedAt
  )
    return {
      kind: 'already-finished',
    };

  const elapsedMs =
    now.getTime() -
    entry.startedAt.getTime();
  const passageLength =
    passageText(
      entry.passageId,
    )
      ?.length ??
    0;
  const late =
    elapsedMs >
    DAILY_WINDOW_MS;
  const counts =
    {
      correct:
        report.correct,
      total:
        report.total,
      elapsedMs,
    };
  const rejected =
    !late &&
    !plausible(
      counts,
      passageLength,
    );

  const data =
    late ||
    rejected
      ? {
          finishedAt:
            now,
        }
      : {
          finishedAt:
            now,
          ...scoreOf(
            counts,
            passageLength,
          ),
          timeMs:
            Math.round(
              elapsedMs,
            ),
        };
  // The guard in the where clause is what makes "accepted once" true under concurrent calls.
  const written =
    await prisma.rmhTypeDailyEntry.updateMany(
      {
        where:
          {
            userId,
            day: report.day,
            finishedAt:
              null,
          },
        data,
      },
    );
  if (
    written.count ===
    0
  )
    return {
      kind: 'already-finished',
    };
  // An implausible report uses the attempt up, like a late one: closed without a score, so
  // the state is `missed` and a retry cannot be offered for a result that would fail again.
  if (
    rejected
  )
    return {
      kind: 'implausible',
    };

  void invalidateTag(
    boardTag(
      report.day,
    ),
  );
  const stored =
    await findEntry(
      userId,
      report.day,
    );
  return {
    kind: 'state',
    state:
      await stateOf(
        userId,
        report.day,
        stored,
        now,
      ),
  };
}

async function boardRows(
  day: string,
  userIds?: string[],
): Promise<
  DailyBoardRow[]
> {
  const rows =
    await prisma.rmhTypeDailyEntry.findMany(
      {
        where:
          {
            day,
            wpm: {
              not: null,
            },
            ...(userIds
              ? {
                  userId:
                    {
                      in: userIds,
                    },
                }
              : {}),
          },
        orderBy:
          [
            {
              wpm: 'desc',
            },
            {
              accuracy:
                'desc',
            },
            {
              finishedAt:
                'asc',
            },
          ],
        take: BOARD_SIZE,
        select:
          {
            userId: true,
            wpm: true,
            accuracy: true,
            timeMs: true,
            user: {
              select:
                userChipSelect,
            },
          },
      },
    );
  return rows.map(
    (
      r,
      i,
    ) => ({
      rank:
        i +
        1,
      userId:
        r.userId,
      name:
        r
          .user
          .name ??
        r
          .user
          .handle ??
        '',
      image:
        r
          .user
          .image,
      wpm:
        r.wpm ??
        0,
      accuracy:
        r.accuracy ??
        0,
      timeMs:
        r.timeMs ??
        0,
    }),
  );
}

/** True for the days a board is kept for: today and yesterday (UTC). */
export function isBoardDay(
  day: string,
  now: Date = new Date(),
): boolean {
  const today =
    dayKey(
      now,
    );
  return (
    day ===
      today ||
    day ===
      shiftDay(
        today,
        -1,
      )
  );
}

/** The top 50 for a day, plus the viewer's own row. `friends` is the viewer and the people they follow. */
export async function getDailyBoard(
  userId: string,
  day: string,
  scope: DailyScope,
): Promise<DailyBoard> {
  const friendIds =
    scope ===
    'friends'
      ? [
          userId,
          ...(await getFollowingIds(
            userId,
          )),
        ]
      : undefined;
  const rows =
    await cached<
      DailyBoardRow[]
    >(
      `rmhtype-daily:board:${day}:${scope === 'global' ? 'global' : userId}`,
      BOARD_TTL_MS,
      () =>
        boardRows(
          day,
          friendIds,
        ),
      {
        tags: [
          boardTag(
            day,
          ),
        ],
      },
    );
  const mine =
    await findEntry(
      userId,
      day,
    );
  let me: DailyBoardRow | null =
    null;
  if (
    mine &&
    mine.wpm !==
      null &&
    mine.accuracy !==
      null &&
    mine.finishedAt
  ) {
    const own =
      rows.find(
        (
          r,
        ) =>
          r.userId ===
          userId,
      );
    me =
      own ?? {
        rank: await rankOf(
          {
            day,
            wpm: mine.wpm,
            accuracy:
              mine.accuracy,
            finishedAt:
              mine.finishedAt,
          },
          friendIds,
        ),
        userId,
        name: '',
        image:
          null,
        wpm: mine.wpm,
        accuracy:
          mine.accuracy,
        timeMs:
          mine.timeMs ??
          0,
      };
  }
  return {
    day,
    scope,
    rows,
    me,
  };
}
