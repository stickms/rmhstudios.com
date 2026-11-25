import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getDailyFollowingSummaryApi } from '@/lib/daily-puzzles/following.contract';
import { followingSummaryQuery } from '@/lib/daily-puzzles/following-schema';
import { followingSummary } from '@/lib/daily-puzzles/following.server';

/** GET /api/daily-puzzles/following/summary — one line per mode for a day: friends finished, the best, your own. */
export const route = apiRoute('/api/daily-puzzles/following/summary', {
  GET: implement(
    getDailyFollowingSummaryApi,
    {
      auth: 'required',
      rateLimit: 'read',
      query: followingSummaryQuery,
      cache: { visibility: 'private', maxAge: 30 },
    },
    async ({ userId, query }) => ({
      dateKey: query.date,
      modes: await followingSummary(userId, query.date),
    }),
  ),
});
