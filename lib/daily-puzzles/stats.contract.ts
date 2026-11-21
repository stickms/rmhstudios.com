/**
 * Contract for the signed-in daily puzzle statistics (`GET /api/daily-puzzles/stats`).
 * Client-safe.
 */
import { endpoint } from '@/lib/contract/endpoint';
import type { DailyStats } from '@/lib/daily-puzzles/stats';

export const getDailyStatsApi =
  endpoint<{
    res: DailyStats;
  }>()(
    {
      method:
        'GET',
      path: '/api/daily-puzzles/stats',
    },
  );
