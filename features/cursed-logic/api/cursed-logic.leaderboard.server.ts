/** GET /api/cursed-logic/leaderboard — the global top ten runs, with each record run's sector and pacts. */
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getCursedLogicLeaderboardApi } from '@features/cursed-logic/engine/cursed-logic.contract';
import { cursedLogicBoard } from '@features/cursed-logic/api/score-adapter.server';

export const route = apiRoute('/api/cursed-logic/leaderboard', {
  GET: implement(
    getCursedLogicLeaderboardApi,
    {
      auth: 'none',
      rateLimit: { limit: 30, windowMs: 60_000, prefix: 'cursed-logic-leaderboard' },
      // The same bytes for every caller (a global top ten), so it caches publicly like the other boards.
      cache: { visibility: 'public', maxAge: 30, sMaxAge: 60, staleWhileRevalidate: 300 },
    },
    async () => Response.json({ entries: await cursedLogicBoard(10) }),
  ),
});
