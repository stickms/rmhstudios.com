import { z } from 'zod';
import { pageSize } from '@/lib/pagination';
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import * as C from '@features/doctrine/engine/doctrine.contract';
import { getReputationLeaderboard } from '@features/doctrine/engine/reputation';

export const route = apiRoute('/api/doctrine/reputation/leaderboard', {
  GET: implement(
    C.getDoctrineReputationLeaderboardApi,
    {
      auth: 'none',
      query: z.object({ limit: z.string().optional() }),
      rateLimit: { limit: 20, windowMs: 60_000, prefix: 'doctrine-rep-lb' },
      // Anonymous-invariant global top-N — the same bytes for every caller,
      // which is what `public` claims. Matches `void-breaker/leaderboard`.
      // Opt out of the 30 s micro-cache: awardXp invalidates the leaderboard in the shared cache.
      microCache: false,
      cache: { visibility: 'public', maxAge: 30, sMaxAge: 60, staleWhileRevalidate: 300 },
    },
    async ({ request }) => {
      try {
        const url = new URL(request.url);
        const limit = pageSize(url.searchParams.get('limit'), 50, 100);
        const leaderboard = await getReputationLeaderboard(limit);
        return Response.json(leaderboard);
      } catch (e) {
        console.error('Doctrine reputation leaderboard failed:', e);
        return Response.json({ error: 'Internal Server Error' }, { status: 500 });
      }
    },
  ),
});
