import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';

export const Route = createFileRoute('/api/void-breaker/leaderboard')({
  server: {
    handlers: {
      GET: defineHandler(
        {
          auth: 'none',
          rateLimit: { limit: 20, windowMs: 60_000, prefix: 'void-breaker-leaderboard' },
          // Anonymous-invariant: the global top ten, with no inputs at all — the
          // same bytes for every caller, which is exactly what `public` claims.
          cache: {
            visibility: 'public',
            maxAge: 30,
            sMaxAge: 60,
            staleWhileRevalidate: 300,
          },
        },
        async () => {
          try {
            const leaderboard = await prisma.voidBreakerPlayer.findMany({
              take: 10,
              orderBy: { highScore: 'desc' },
              select: { username: true, highScore: true },
            });
            return Response.json(leaderboard);
          } catch (e) {
            console.error('Void Breaker leaderboard fetch failed:', e);
            return Response.json({ error: 'Internal Server Error' }, { status: 500 });
          }
        },
      ),
    },
  },
});
