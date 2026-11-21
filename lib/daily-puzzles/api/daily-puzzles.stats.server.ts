import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getDailyStatsApi } from '@/lib/daily-puzzles/stats.contract';
import { getDailyStats } from '@/lib/daily-puzzles/stats.server';

/** GET /api/daily-puzzles/stats — the caller's streaks, solve rates, bests and distributions. */
export const route =
  apiRoute(
    '/api/daily-puzzles/stats',
    {
      GET: implement(
        getDailyStatsApi,
        {
          rateLimit:
            'read',
        },
        async ({
          userId,
        }) =>
          Response.json(
            await getDailyStats(
              userId,
            ),
          ),
      ),
    },
  );
