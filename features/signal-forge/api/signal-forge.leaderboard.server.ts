import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getSignalForgeLeaderboardApi } from '@features/signal-forge/engine/signal-forge.contract';
import { prisma } from '@/lib/prisma.server';
import { notHiddenWhere } from '@/lib/game/leaderboard-privacy';
import { leaderboardHiddenUserIds } from '@/lib/game/leaderboard-privacy.server';

export const route = apiRoute('/api/signal-forge/leaderboard', {
  GET: implement(
    getSignalForgeLeaderboardApi,
    {
      auth: 'none',
      rateLimit: { limit: 20, windowMs: 60_000, prefix: 'signal-forge-leaderboard' },
      // Anonymous-invariant global top-N — the same bytes for every caller,
      // which is what `public` claims. Matches `void-breaker/leaderboard`.
      cache: { visibility: 'public', maxAge: 30, sMaxAge: 60, staleWhileRevalidate: 300 },
    },
    async () => {
      try {
        const hidden = await leaderboardHiddenUserIds();
        const leaderboard = await prisma.signalForgePlayer.findMany({
          where: notHiddenWhere(hidden),
          take: 100,
          orderBy: [{ highScore: 'desc' }, { floorReached: 'desc' }],
          select: {
            username: true,
            highScore: true,
            floorReached: true,
            gamesPlayed: true,
            updatedAt: true,
          },
        });

        return Response.json(leaderboard);
      } catch (error) {
        console.error('Error fetching Signal Forge leaderboard:', error);
        return Response.json({ error: 'Internal Server Error' }, { status: 500 });
      }
    },
  ),
});
