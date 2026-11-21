/** `GET /api/rmhtype/daily/leaderboard?day=&scope=` - today's or yesterday's board, global or friends. */
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getRmhTypeDailyBoardApi } from '@/lib/rmhtype/daily.contract';
import { dailyLeaderboardQuery } from '@/lib/rmhtype/daily-schema';
import { getDailyBoard, isBoardDay } from '@/lib/rmhtype/daily.server';

export const route = apiRoute('/api/rmhtype/daily/leaderboard', {
  GET: implement(
    getRmhTypeDailyBoardApi,
    {
      rateLimit: 'read',
      query: dailyLeaderboardQuery,
    },
    async ({ userId, query }) => {
      if (!isBoardDay(query.day)) {
        return Response.json(
          {
            error: 'Only today and yesterday have a board',
          },
          {
            status: 400,
          },
        );
      }
      return getDailyBoard(userId, query.day, query.scope);
    },
  ),
});
