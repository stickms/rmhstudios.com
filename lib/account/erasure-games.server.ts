import { invalidateCached } from '@/lib/cached.server';
import { dailyStatsKey } from '@/lib/daily-puzzles/stats.server';
import { prisma } from '@/lib/prisma.server';

const DELETED_NAME = 'Deleted user';

/**
 * Sprint 08 erasure of per-game progress, saves and daily results. Account deletion anonymises the `User` row in
 * place, so none of the `onDelete: Cascade` relations fire. Prisma operations only, one statement per table, each
 * filtered on the member's id (the leading column of an index or key on every table except `SliceDailyEntry` and
 * `SongPlay`, which are scanned once per deletion; an index for them is a follow-up).
 *
 * Other players' data is never deleted:
 * - `RMHboxProfile` and `RmhTypeProfile` have `*MatchPlayer` children that cascade from them, so they are reset to
 *   their defaults with `updateMany` (never `deleteMany`); the RMHBox boards list only profiles with games played and
 *   the RMHType board only `bestWpm > 0`, so a reset profile is on neither.
 * - `AltairMatchPlayer`, `RMHboxMatchPlayer` and `RmhTypeMatchPlayer` are rows in a shared match: the copied display
 *   name becomes "Deleted user", the row stays.
 * - `RMHboxMatch.results` (rankings snapshot shown to co-players) has the member's name renamed by `scrubMatchSnapshots`, one raw
 *   UPDATE after the transaction (a jsonb rewrite has no Prisma operation).
 *   `RMHboxMatch.gameLog` (free-form, shown only to participants) is a follow-up.
 * - `SliceSetlist` goes only where private; public setlists are published lists (an open owner decision).
 * - Anonymous tallies on kept models (`ConnectionsGrid` plays and ratings, `Song.plays`) are not touched.
 *
 * No table here references another, and each references `User`, which stays: the order of the statements is free.
 */
export function gameProgressErasureOps(userId: string) {
  return [
    // Solo and board rows.
    prisma.altairCoopProfile.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.altairMetaProgress.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.altairSoloRun.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.arcadeSeedRun.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.canvasCooldown.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.connectionsPlay.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.dailyPuzzleScore.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.gabrielsHornTableRead.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.gamePlayStatus.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.huntProgress.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.ndwLivery.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.sliceDailyEntry.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.sliceRun.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.sliceSetlist.deleteMany({
      where: {
        ownerId: userId,
        isPublic: false,
      },
    }),
    prisma.songPlay.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.templeOfJoySave.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.tf2HudUserBlob.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.versecraftProgress.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.versecraftSave.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.rmhTypeDailyEntry.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.rmhTypeKeyStat.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.rmhTypeLessonProgress.deleteMany({
      where: {
        userId,
      },
    }),

    // Profiles with cascading children: reset, never delete.
    prisma.rMHboxProfile.updateMany({
      where: {
        userId,
      },
      data: {
        totalGamesPlayed: 0,
        totalWins: 0,
        totalScore: 0,
        totalPlayTimeMs: 0,
        minigameStats: {},
        currentWinStreak: 0,
        bestWinStreak: 0,
      },
    }),
    prisma.rmhTypeProfile.updateMany({
      where: {
        userId,
      },
      data: {
        totalGamesPlayed: 0,
        totalWins: 0,
        bestWpm: 0,
        bestWpmAccuracy: 0,
        avgWpm: 0,
        bestAccuracy: 0,
        avgAccuracy: 0,
        totalCharsTyped: 0,
        totalTimeMs: 0,
        currentStreak: 0,
        bestStreak: 0,
      },
    }),

    // Name copies in other players' matches.
    prisma.altairMatchPlayer.updateMany({
      where: {
        userId,
      },
      data: {
        userName: DELETED_NAME,
      },
    }),
    prisma.rMHboxMatchPlayer.updateMany({
      where: {
        userId,
      },
      data: {
        userName: DELETED_NAME,
      },
    }),
    prisma.rmhTypeMatchPlayer.updateMany({
      where: {
        userId,
      },
      data: {
        userName: DELETED_NAME,
      },
    }),
  ];
}

/**
 * After the transaction: the member's cached daily-puzzle statistics (keyed, never a scan). The 30 s arcade boards
 * expire on their own and hold no per-member key list.
 */
export async function dropGameBoardCaches(userId: string): Promise<void> {
  await invalidateCached(dailyStatsKey(userId));
}

/**
 * After the transaction: `RMHboxMatch.results` is a snapshot of the rankings (userId + userName) that the history
 * endpoint hands to the other players of the match, so the member's name is renamed inside it, in their own matches
 * only. Idempotent; a failure is logged and never undoes the committed erasure.
 */
export async function scrubMatchSnapshots(userId: string): Promise<void> {
  try {
    await prisma.$executeRaw`
      UPDATE "rmhbox_match" m
      SET "results" = (
        SELECT COALESCE(jsonb_agg(
          CASE WHEN e.value->>'userId' = ${userId}
            THEN jsonb_set(e.value, '{userName}', to_jsonb(${DELETED_NAME}::text))
            ELSE e.value END ORDER BY e.ord), '[]'::jsonb)
        FROM jsonb_array_elements(m."results") WITH ORDINALITY AS e(value, ord))
      WHERE jsonb_typeof(m."results") = 'array'
        AND m."id" IN (SELECT p."matchId" FROM "rmhbox_match_player" p WHERE p."userId" = ${userId})`;
  } catch (err) {
    console.error(`[account] match snapshot scrub failed for ${userId}:`, err);
  }
}
