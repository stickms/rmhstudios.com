/**
 * S1 — the Slice It! daily challenge.
 *
 * ## What was there before
 *
 * One entry in `lib/quests/arcade.ts`: "Score 5,000 in Slice It!". Any chart, any
 * difficulty, any modifier set, any number of tries. That is a participation
 * trophy — it asks nothing, so nobody can be better at it than anybody else, and
 * there is no board on which to find out.
 *
 * ## What this is
 *
 * One song, one difficulty, one modifier set, **one attempt**, one board that
 * resets at midnight UTC.
 *
 * ## The two decisions worth knowing
 *
 * **1. The selection is a pure function of the day key, not a stored row.**
 * `dailySelection()` hashes `slice-daily:<dayKey>` into the eligible pool. No
 * table decides today's song, so nothing has to write at midnight, no worker can
 * miss its cron and leave the game without a daily, and every web process and
 * every client compute the same answer without talking to each other. The one
 * thing that is NOT reproducible is a *past* day: the pool is a live query, so
 * yesterday's ordering may not exist tomorrow. That is why `SliceDailyEntry`
 * denormalises `songId` — a historical board row renders from itself.
 *
 * **2. The one-attempt rule is `@@unique([dayKey, userId])`.**
 * Not a disabled button, not a `findFirst` before the insert. `submitDailyEntry`
 * does a bare `create` and reads P2002 as "already played". A check-then-insert
 * loses to two tabs, and two tabs is precisely the client that would try.
 *
 * The eligible pool is bounded to charts on songs with a real play history. A
 * daily on a broken chart is a wasted day for everyone, and there is no way to
 * take it back once the hash has spoken.
 *
 * Rewards keep flowing through the existing Arcade Pass: the submit path calls
 * `reportGameResult`, which is the seam every other game already uses. This
 * mode does not grow its own currency.
 */

import { prisma } from '@/lib/prisma.server';
import { arcadeDayKey } from '@/lib/quests/arcade';
import { reportGameResult } from '@/lib/game/results.server';
import { resolveUser, userDisplaySelect } from '@/lib/user-display';
import { DEFAULT_MODIFIERS } from './modifiers';
import { poolOf } from './pools';
import type { Difficulty } from './constants';
import type { ModPool } from './pools';
import type { Modifiers } from './types';

/**
 * Minimum lifetime plays a song needs before its charts can be the daily.
 *
 * The bar is deliberately low. It is not a quality signal — it is an
 * "at least one person got to the end of it" signal, which is the only claim a
 * play count can support and the only one this needs to make.
 */
export const DAILY_MIN_PLAYS = 25;

/** How many rows the daily board returns. */
export const DAILY_BOARD_LIMIT = 50;

/**
 * The fixed modifier set every daily attempt is played on.
 *
 * Fixed is the entire point: a challenge everybody plays differently is not a
 * challenge, it is a leaderboard filter. `healthGauge` is on because a daily
 * with one attempt and no way to fail is just a score screen, and `speed` stays
 * at 1.0 so the pool stays `standard` rather than drifting into `challenge` —
 * see `pools.ts` for why the gauge is not a challenge modifier.
 *
 * `difficulty` is overwritten per day by {@link dailySelection}; the value here
 * is only the shape's default.
 */
export const DAILY_MODIFIERS: Modifiers = {
  ...DEFAULT_MODIFIERS,
  healthGauge: true,
};

/** The pool a daily run files under. Derived, never typed by hand. */
export const DAILY_MOD_POOL: ModPool = poolOf(DAILY_MODIFIERS);

/** The difficulties the daily rotates through, easiest first. */
const DAILY_DIFFICULTIES = ['normal', 'hard', 'expert'] as const satisfies readonly Difficulty[];

/**
 * Deterministic 32-bit FNV-1a, the same one `lib/quests/arcade.ts` uses.
 *
 * Duplicated rather than exported from there on purpose: `arcade.ts` is a
 * client-safe pure module whose hash is part of the Arcade Pass's contract, and
 * two systems sharing a hash function means changing one silently reshuffles
 * the other. Four lines is cheaper than that coupling.
 */
export function dailyHash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** The song + chart the daily resolves to, plus the fixed rules of the day. */
export interface DailySelection {
  dayKey: string;
  songId: string;
  /** Null when the pick is a song playing its generated `analysisData`. */
  chartId: string | null;
  title: string;
  artist: string;
  coverUrl: string | null;
  duration: number;
  difficulty: Difficulty;
  modifiers: Modifiers;
  modPool: ModPool;
}

/** A row of the day's board. */
export interface DailyBoardRow {
  rank: number;
  userId: string;
  name: string;
  image: string | null;
  score: number;
  accuracy: number;
  maxCombo: number;
  cleared: boolean;
  createdAt: string;
}

/** Everything the daily panel needs in one read. */
export interface DailyState {
  selection: DailySelection | null;
  board: DailyBoardRow[];
  /** The viewer's attempt, if they have spent it. Null means "you may play". */
  entry: DailyBoardRow | null;
  /** Their position on the board, 1-based. Null when they have not played. */
  myRank: number | null;
  /** Milliseconds until the day key rolls over, for the countdown. */
  resetsInMs: number;
}

/**
 * The eligible pool, ordered stably.
 *
 * `orderBy: { id: 'asc' }` is load-bearing, not cosmetic: the hash indexes into
 * this array, so an unordered result set means two processes disagree about
 * today's song. Postgres does not promise an order without one.
 *
 * Only `public`/`ranked` charts on public songs with a real play history are
 * eligible. Drafts are invisible by definition, and an unplayed chart is one
 * nobody has verified is finishable.
 */
async function eligibleCharts() {
  return prisma.chart.findMany({
    where: {
      status: { in: ['public', 'ranked'] },
      difficulty: { in: [...DAILY_DIFFICULTIES] },
      song: { isPublic: true, plays: { gte: DAILY_MIN_PLAYS } },
    },
    select: {
      id: true,
      songId: true,
      difficulty: true,
      song: { select: { title: true, artist: true, coverUrl: true, duration: true } },
    },
    orderBy: { id: 'asc' },
  });
}

/** Milliseconds from `now` until the next UTC midnight. */
export function msUntilNextDay(now = new Date()): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return next - now.getTime();
}

/**
 * Today's challenge, or null when the library has nothing eligible yet.
 *
 * Null rather than a thrown error or a fallback to "any song at all": a game
 * whose library is too young for a daily should say so, not quietly hand out a
 * daily on a chart three people have seen.
 */
export async function dailySelection(dayKey = arcadeDayKey()): Promise<DailySelection | null> {
  const pool = await eligibleCharts();
  if (pool.length === 0) return null;

  const pick = pool[dailyHash(`slice-daily:${dayKey}`) % pool.length];
  // The chart already carries a difficulty; the day key only chooses among the
  // eligible ones when the pick's own tier is outside the rotation, which the
  // `where` above already prevents. Trust the chart.
  const difficulty = (DAILY_DIFFICULTIES as readonly string[]).includes(pick.difficulty)
    ? (pick.difficulty as Difficulty)
    : 'normal';

  return {
    dayKey,
    songId: pick.songId,
    chartId: pick.id,
    title: pick.song.title,
    artist: pick.song.artist,
    coverUrl: pick.song.coverUrl,
    duration: pick.song.duration,
    difficulty,
    modifiers: { ...DAILY_MODIFIERS, difficulty },
    modPool: DAILY_MOD_POOL,
  };
}

/** The day's board, best first. */
export async function dailyBoard(
  dayKey = arcadeDayKey(),
  limit = DAILY_BOARD_LIMIT,
): Promise<DailyBoardRow[]> {
  const rows = await prisma.sliceDailyEntry.findMany({
    where: { dayKey },
    orderBy: [{ score: 'desc' }, { id: 'asc' }],
    take: limit,
    select: {
      userId: true,
      score: true,
      accuracy: true,
      maxCombo: true,
      cleared: true,
      createdAt: true,
      // The shared select, not a hand-written one: a board that renders a
      // different name or avatar than the rest of the site is a board people
      // do not recognise themselves on.
      user: { select: userDisplaySelect },
    },
  });

  return rows.map((row, index) => {
    const user = resolveUser(row.user);
    return {
      rank: index + 1,
      userId: row.userId,
      name: user.username || user.name || 'Player',
      image: user.image,
      score: row.score,
      accuracy: row.accuracy,
      maxCombo: row.maxCombo,
      cleared: row.cleared,
      createdAt: row.createdAt.toISOString(),
    };
  });
}

/**
 * The full daily panel state for one viewer.
 *
 * `myRank` is counted rather than looked up in `board`, because the board is
 * capped and a player outside the top 50 still deserves to know where they are.
 */
export async function getDailyState(userId: string | null): Promise<DailyState> {
  const dayKey = arcadeDayKey();
  const [selection, board] = await Promise.all([dailySelection(dayKey), dailyBoard(dayKey)]);

  let entry: DailyBoardRow | null = null;
  let myRank: number | null = null;

  if (userId) {
    const mine = await prisma.sliceDailyEntry.findUnique({
      where: { dayKey_userId: { dayKey, userId } },
      select: {
        score: true,
        accuracy: true,
        maxCombo: true,
        cleared: true,
        createdAt: true,
        // The shared select, not a hand-written one: a board that renders a
        // different name or avatar than the rest of the site is a board people
        // do not recognise themselves on.
        user: { select: userDisplaySelect },
      },
    });
    if (mine) {
      const ahead = await prisma.sliceDailyEntry.count({
        where: { dayKey, score: { gt: mine.score } },
      });
      myRank = ahead + 1;
      const user = resolveUser(mine.user);
      entry = {
        rank: myRank,
        userId,
        name: user.username || user.name || 'You',
        image: user.image,
        score: mine.score,
        accuracy: mine.accuracy,
        maxCombo: mine.maxCombo,
        cleared: mine.cleared,
        createdAt: mine.createdAt.toISOString(),
      };
    }
  }

  return { selection, board, entry, myRank, resetsInMs: msUntilNextDay() };
}

/** What a client submits at the end of a daily attempt. */
export interface DailySubmission {
  songId: string;
  score: number;
  accuracy: number;
  maxCombo: number;
  cleared: boolean;
}

export type DailySubmitResult =
  | { ok: true; rank: number; entry: DailyBoardRow }
  | { ok: false; reason: 'no-daily' | 'wrong-song' | 'already-played' };

/**
 * Record the day's one ranked attempt.
 *
 * The write is a bare `create`. It is allowed — expected — to fail with P2002,
 * and that failure is the answer: the unique index already holds this player's
 * attempt for today. Nothing here reads before it writes, because a read that
 * happens before a write is a read that a second tab can overtake.
 *
 * The Arcade Pass is fed through `reportGameResult` rather than replaced: a
 * daily attempt is still a Slice It play, and it should tick the same
 * challenges any other play ticks. It is fired after the row lands, and
 * awaited-but-swallowed, exactly as the score route does it — the arcade must
 * never be able to fail a score submission.
 */
export async function submitDailyEntry(
  userId: string,
  submission: DailySubmission,
): Promise<DailySubmitResult> {
  const dayKey = arcadeDayKey();
  const selection = await dailySelection(dayKey);
  if (!selection) return { ok: false, reason: 'no-daily' };
  // The client plays what the server says the daily is. A mismatch is a stale
  // tab that was open across midnight, not an attack — but it must not consume
  // today's attempt with yesterday's song.
  if (selection.songId !== submission.songId) return { ok: false, reason: 'wrong-song' };

  try {
    await prisma.sliceDailyEntry.create({
      data: {
        dayKey,
        userId,
        songId: selection.songId,
        chartId: selection.chartId,
        score: submission.score,
        accuracy: submission.accuracy,
        maxCombo: submission.maxCombo,
        cleared: submission.cleared,
      },
    });
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, reason: 'already-played' };
    throw err;
  }

  await reportGameResult(userId, {
    game: 'slice-it',
    score: submission.score,
    daily: true,
  });

  const ahead = await prisma.sliceDailyEntry.count({
    where: { dayKey, score: { gt: submission.score } },
  });
  const rank = ahead + 1;

  return {
    ok: true,
    rank,
    entry: {
      rank,
      userId,
      name: 'You',
      image: null,
      score: submission.score,
      accuracy: submission.accuracy,
      maxCombo: submission.maxCombo,
      cleared: submission.cleared,
      createdAt: new Date().toISOString(),
    },
  };
}

/**
 * Is this the unique-constraint violation?
 *
 * Structural rather than `instanceof PrismaClientKnownRequestError`: importing
 * that class pulls the generated client's runtime into every module that wants
 * to branch on an error code, and the code is the whole signal.
 */
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 'P2002'
  );
}
