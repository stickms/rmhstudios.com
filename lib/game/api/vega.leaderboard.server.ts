import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getVegaLeaderboardApi } from '@/lib/game/leaderboard.contract';
import { prisma } from '@/lib/prisma.server';
import { notHiddenWhere } from '@/lib/game/leaderboard-privacy';
import { leaderboardHiddenUserIds } from '@/lib/game/leaderboard-privacy.server';

export const route = apiRoute('/api/vega/leaderboard', {
  GET: implement(
    getVegaLeaderboardApi,
    {
      auth: 'none',
      rateLimit: { limit: 20, windowMs: 60_000, prefix: 'vega-leaderboard' },
      // Anonymous-invariant global top-N — the same bytes for every caller,
      // which is what `public` claims. Matches `void-breaker/leaderboard`.
      cache: { visibility: 'public', maxAge: 30, sMaxAge: 60, staleWhileRevalidate: 300 },
    },
    async () => {
      try {
        const hidden = await leaderboardHiddenUserIds();
        const leaderboard = await prisma.vegaPlayer.findMany({
          where: notHiddenWhere(hidden),
          take: 10,
          orderBy: [{ highestLevel: 'desc' }, { highestLoop: 'desc' }],
          select: {
            username: true,
            highestLoop: true,
            highestLevel: true,
            updatedAt: true,
          },
        });

        return Response.json(leaderboard);
      } catch (e: any) {
        console.error('Error fetching Vega leaderboard:', {
          error: e.message,
          stack: e.stack,
        });
        return Response.json(
          {
            error: 'Internal Server Error',
            message: process.env.NODE_ENV === 'development' ? e.message : undefined,
          },
          { status: 500 },
        );
      }
    },
  ),
});
