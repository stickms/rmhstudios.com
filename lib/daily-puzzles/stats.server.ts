import { cached } from '@/lib/cached.server';
import { prisma } from '@/lib/prisma.server';
import { formatDateKey, getTodayEST } from '@/lib/daily-puzzles/seed';
import { computeDailyStats, type DailyStats } from '@/lib/daily-puzzles/stats';

const TTL_MS = 60_000;

/** The cache key for one member's statistics; the score endpoint drops it after a write. */
export const dailyStatsKey = (userId: string) => `daily-puzzles:stats:${userId}`;

/**
 * The member's statistics, computed from their own `DailyPuzzleScore` rows (one read
 * over the `userId` prefix of the unique index). Cached 60 s per member.
 */
export function getDailyStats(userId: string): Promise<DailyStats> {
  return cached(dailyStatsKey(userId), TTL_MS, async () => {
    const rows = await prisma.dailyPuzzleScore.findMany({
      where: {
        userId,
      },
      select: {
        gameMode: true,
        dateKey: true,
        score: true,
        moves: true,
        dnf: true,
        timeSeconds: true,
      },
    });
    return computeDailyStats(rows, formatDateKey(getTodayEST()));
  });
}
