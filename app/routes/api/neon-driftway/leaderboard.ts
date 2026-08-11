import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';

export const Route = createFileRoute('/api/neon-driftway/leaderboard')({
  server: {
    handlers: {
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
            const leaderboard = await prisma.neonDriftwayPlayer.findMany({
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
    },
  },
});
