/**
 * Slice It! progression: achievements, coins and the practice streak.
 *
 * The single best-effort seam `/api/slice-it/score` calls after a run is
 * stored. Every export here follows the same contract as the rest of that
 * route's progression block (`recordGamePlay`, `reportGameResult`,
 * `evaluateQualification`): **never throw into the caller.** A ledger hiccup,
 * a slow aggregate or a bad achievement id must cost the player nothing —
 * the score is already written by the time any of this runs.
 *
 * Three concerns, kept separate:
 *  - `reportSliceItRun` — achievements + coins for one submitted run.
 *  - `getPracticeStreak` — a read, computed on demand from `SliceRun` history
 *    rather than stored (see the note on `getPracticeStreak` for why).
 *  - `recordSongUploaded` / `recordChartPublished` — one-shot achievements
 *    triggered outside the score endpoint, at their own natural call sites.
 */

import { prisma } from '@/lib/prisma.server';
import { awardCoins } from '@/lib/coins.server';
import { grantAchievement, progressAchievement } from '@/lib/achievements/engine.server';
import { sliceItAchievementsForRun, type SliceItRunFacts } from '@/lib/achievements/slice-it';
import { DIFFICULTY_MULTIPLIERS } from '@/lib/slice-it/constants';

/* ─── Coins (X3) ──────────────────────────────────────────────────────────
 *
 * Every award below tags `entityType: 'slice-it'` so `coinsEarnedToday` can
 * sum them, and carries a deterministic `idempotencyKey` so a retried score
 * submission — the same request landing twice, not a second genuine run —
 * cannot double-pay. `creditCoins`'s unique index on `idempotencyKey` is what
 * actually enforces that; this module just has to construct the same key for
 * the same event every time.
 */

/** Most a player can earn from Slice It! progression in one UTC day. */
export const COIN_DAILY_CAP = 150;

const COINS = {
  /** The very first personal best ever set on a (song, difficulty, pool) board. */
  firstClear: 10,
  /** Any later run that beats the existing personal best on that board. */
  newBest: 5,
  /** The first ranked run of a UTC day — see `bumpPracticeStreak`. */
  streakDay: 5,
} as const;

function utcDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfUtcDay(d = new Date()): Date {
  const start = new Date(d);
  start.setUTCHours(0, 0, 0, 0);
  return start;
}

/** How many Slice It! coins this user has already earned today (UTC). */
async function coinsEarnedToday(userId: string): Promise<number> {
  const result = await prisma.coinTransaction.aggregate({
    where: {
      recipientId: userId,
      entityType: 'slice-it',
      createdAt: { gte: startOfUtcDay() },
    },
    _sum: { amount: true },
  });
  return result._sum.amount ?? 0;
}

export interface SliceItRunResult extends SliceItRunFacts {
  userId: string;
  songId: string;
  modPool: string;
  score: number;
  /**
   * No prior `SongLeaderboard` row existed for this exact
   * (song, difficulty, modPool, user) board before this run — i.e. this run
   * *is* the first clear of it. Computed by `score.ts` from the `previous`
   * lookup it already does; recomputing it here would be a second query for
   * data the caller has in hand.
   */
  isFirstClear: boolean;
  /** This run beat (or set) the personal best on that board. */
  isNewBest: boolean;
}

/**
 * Coins for one run: `firstClear` and `newBest` are not mutually exclusive —
 * a first clear IS a new best, so it pays both — but they only ever fire once
 * each per board-improvement, which is what keeps replaying a cleared chart
 * from being a faucet. Scaled by difficulty so the optimal strategy is not
 * "replay the shortest Easy chart", and capped per day on top of that.
 */
async function awardRunCoins(run: SliceItRunResult): Promise<void> {
  const base = (run.isFirstClear ? COINS.firstClear : 0) + (run.isNewBest ? COINS.newBest : 0);
  if (base <= 0) return;
  try {
    const multiplier = DIFFICULTY_MULTIPLIERS[run.difficulty] ?? 1;
    const desired = Math.round(base * multiplier);
    const earnedToday = await coinsEarnedToday(run.userId);
    const award = Math.min(desired, Math.max(0, COIN_DAILY_CAP - earnedToday));
    if (award <= 0) return;

    await awardCoins(run.userId, award, {
      type: 'REWARD',
      entityType: 'slice-it',
      entityId: run.songId,
      note: run.isFirstClear ? 'Slice It! — first clear' : 'Slice It! — new personal best',
      // Scoped to the exact board and the exact score: a genuine later
      // improvement always carries a strictly higher `score` (that is what
      // "new best" means), so it always gets a fresh key, while a retry of
      // *this* submission — same board, same score — collides on purpose.
      idempotencyKey: `slice-it:coins:${run.userId}:${run.songId}:${run.difficulty}:${run.modPool}:${run.score}`,
    });
  } catch (err) {
    console.warn('[slice-it] coin award failed:', err);
  }
}

/* ─── Practice streak (X14) ──────────────────────────────────────────────── */

/**
 * How many `SliceRun` rows to scan for the streak. Not stored: there is no
 * generic per-(user, game) streak table in the schema (`DailyStreak` and
 * `ArcadeStreak` are both singular per user, for the account check-in and the
 * cross-game arcade rotation respectively — repurposing either would corrupt
 * a feature that already owns it), and this wave does not add one. A practice
 * streak is fully recoverable from `SliceRun.createdAt`, which every ranked
 * run already writes, so it is computed on read instead of maintained on
 * write. 400 rows comfortably covers a year of daily play and several years
 * of realistic practice cadence; a player who ranks up more than 400 times
 * inside their current unbroken streak will see it undercounted, which is the
 * one honest limitation of not storing it.
 */
const PRACTICE_STREAK_LOOKBACK = 400;

export interface PracticeStreak {
  /** Consecutive UTC days, up to and including today or yesterday. */
  current: number;
}

/**
 * The player's current daily practice streak: any ranked run counts, with
 * **no score threshold** — a streak with a performance bar punishes exactly
 * the bad days a streak exists to carry a player through.
 *
 * Today counts as soon as it has a run; if it does not yet, the streak is
 * still alive through yesterday (a miss is only real once the day ends, and
 * this is a read, not a determination that the day is over).
 */
export async function getPracticeStreak(userId: string, now = new Date()): Promise<PracticeStreak> {
  const runs = await prisma.sliceRun.findMany({
    where: { userId },
    select: { createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: PRACTICE_STREAK_LOOKBACK,
  });
  const days = new Set(runs.map((r) => utcDayKey(r.createdAt)));

  const cursor = startOfUtcDay(now);
  if (!days.has(utcDayKey(cursor))) cursor.setUTCDate(cursor.getUTCDate() - 1);

  let current = 0;
  while (days.has(utcDayKey(cursor))) {
    current += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return { current };
}

/**
 * A small coin bonus on the first ranked run of a UTC day — the "showed up
 * today" reward a streak is built around. Idempotent per (user, day): a
 * retried submission for the same day's first run cannot double-pay, and it
 * is a no-op for every run after the first that day.
 */
async function bumpPracticeStreak(userId: string): Promise<void> {
  try {
    const start = startOfUtcDay();
    const todayCount = await prisma.sliceRun.count({
      where: { userId, createdAt: { gte: start } },
    });
    // This run's own `SliceRun` row is already written by the time progression
    // runs, so "first run today" reads as a count of exactly one.
    if (todayCount !== 1) return;

    await awardCoins(userId, COINS.streakDay, {
      type: 'REWARD',
      entityType: 'slice-it',
      entityId: 'streak',
      note: 'Slice It! — practice streak',
      idempotencyKey: `slice-it:streak:${userId}:${utcDayKey(start)}`,
    });
  } catch (err) {
    console.warn('[slice-it] streak bump failed:', err);
  }
}

/* ─── Achievements (X1) ───────────────────────────────────────────────────── */

/** `game.slice_it.centurion` — 100 different songs, ever. Incremental. */
async function progressCenturion(userId: string): Promise<void> {
  try {
    // A distinct songId count off `SongLeaderboard` rather than `SliceRun`:
    // every run's first attempt at a (song, difficulty, pool) sets a personal
    // best (there is nothing to beat yet), so the board already has one row
    // per song a player has ever played, and it is far smaller than the full
    // run history.
    const rows = await prisma.songLeaderboard.findMany({
      where: { userId },
      select: { songId: true },
      distinct: ['songId'],
    });
    await progressAchievement(userId, 'game.slice_it.centurion', { setProgress: rows.length });
  } catch (err) {
    console.error('[slice-it] centurion progress failed:', err);
  }
}

async function grantRunAchievements(run: SliceItRunResult): Promise<void> {
  try {
    const ids = sliceItAchievementsForRun(run);
    await Promise.all(ids.map((id) => grantAchievement(run.userId, id)));
  } catch (err) {
    console.error('[slice-it] achievement grant failed:', err);
  }
  await progressCenturion(run.userId);
}

/** `game.slice_it.upload` — call from the song-upload route on success. */
export async function recordSongUploaded(userId: string): Promise<void> {
  await grantAchievement(userId, 'game.slice_it.upload').catch((err) => {
    console.error('[slice-it] upload achievement failed:', err);
  });
}

/**
 * `game.slice_it.charted` — call from the chart-publish route on the
 * draft/private → public transition (not on every save; a chart can be edited
 * many times before it is ever published).
 */
export async function recordChartPublished(userId: string): Promise<void> {
  await grantAchievement(userId, 'game.slice_it.charted').catch((err) => {
    console.error('[slice-it] charted achievement failed:', err);
  });
}

/* ─── Entry point ─────────────────────────────────────────────────────────── */

/**
 * Called once per stored run from `score.ts`'s best-effort progression block.
 * Streak and coins run in sequence (the streak bonus should count against the
 * same day's coin cap the run coins check), achievements run alongside them.
 */
export async function reportSliceItRun(run: SliceItRunResult): Promise<void> {
  await Promise.allSettled([
    grantRunAchievements(run),
    (async () => {
      await bumpPracticeStreak(run.userId);
      await awardRunCoins(run);
    })(),
  ]);
}
