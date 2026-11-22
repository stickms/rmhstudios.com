import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { notHiddenWhere } from '@/lib/game/leaderboard-privacy';
import { leaderboardHiddenUserIds } from '@/lib/game/leaderboard-privacy.server';

export const route = apiRoute('/api/neon-driftway/leaderboard', {
  GET: defineHandler(
    {
      auth: 'none',
      rateLimit: { limit: 20, windowMs: 60_000, prefix: 'neon-driftway-leaderboard' },
      // Anonymous-invariant global top-N — the same bytes for every caller,
      // which is what `public` claims. Matches `void-breaker/leaderboard`.
      cache: { visibility: 'public', maxAge: 30, sMaxAge: 60, staleWhileRevalidate: 300 },
    },
    async () => {
      try {
        const hidden = await leaderboardHiddenUserIds();
        const leaderboard = await prisma.neonDriftwayPlayer.findMany({
          where: notHiddenWhere(hidden),
          take: 10,
          orderBy: { highScore: 'desc' },
          select: {
            username: true,
            highScore: true,
          },
        });

        return Response.json(leaderboard);
      } catch (e) {
        console.error('Neon Driftway leaderboard fetch failed:', e);
        return Response.json({ error: 'Internal Server Error' }, { status: 500 });
      }
    },
  ),
});
