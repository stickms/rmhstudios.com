import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getDailyFollowingBoardApi } from '@/lib/daily-puzzles/following.contract';
import { followingBoardQuery } from '@/lib/daily-puzzles/following-schema';
import { followingBoard } from '@/lib/daily-puzzles/following.server';

/** GET /api/daily-puzzles/following — the viewer and their mutual follows on one mode's board for a day. */
export const route = apiRoute('/api/daily-puzzles/following', {
  GET: implement(
    getDailyFollowingBoardApi,
    {
      auth: 'required',
      rateLimit: 'read',
      query: followingBoardQuery,
      // Per viewer: the audience is their own mutual follows.
      cache: { visibility: 'private', maxAge: 30 },
    },
    async ({ userId, query }) => ({
      entries: await followingBoard(userId, query.gameMode, query.date),
      dateKey: query.date,
      gameMode: query.gameMode,
    }),
  ),
});
