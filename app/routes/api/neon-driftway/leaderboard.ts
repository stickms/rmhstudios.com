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
