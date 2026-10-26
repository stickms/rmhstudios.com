import { pageSize } from '@/lib/pagination';
import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { resolveUserDisplay } from '@/lib/user-display';

export const Route = createFileRoute('/api/games/synapse-storm/leaderboard')({
  server: {
    handlers: {
      GET: defineHandler(
        {
          auth: 'none',
          // Same policy, same reasoning as `void-breaker/leaderboard`: a global
          // top-N with no per-caller branch. `?limit=` varies the URL, which is
          // the cache key, so each page size caches independently.
          cache: { visibility: 'public', maxAge: 30, sMaxAge: 60, staleWhileRevalidate: 300 },
        },
        async ({ request }) => {
          const { searchParams } = new URL(request.url);
          const limitParam = searchParams.get('limit');
          const limit = pageSize(limitParam, 20, 50);

          const entries = await prisma.synapseStormPlayer.findMany({
            orderBy: { highScore: 'desc' },
            take: limit,
            where: { highScore: { gt: 0 } },
            select: {
              userId: true,
              highScore: true,
              maxCombo: true,
              puzzlesSolved: true,
              peakDifficulty: true,
              totalTime: true,
              updatedAt: true,
              user: {
                select: {
                  name: true,
                  username: true,
                  image: true,
                  profile: { select: { displayName: true, customImage: true } },
                },
              },
            },
          });

          const leaderboard = entries.map((e: (typeof entries)[number], i: number) => {
            const resolved = e.user ? resolveUserDisplay(e.user) : { name: null, image: null };
            return {
              rank: i + 1,
              userId: e.userId,
              displayName: e.user?.username || resolved.name || 'Anonymous',
              avatar: resolved.image || null,
              highScore: e.highScore,
              maxCombo: e.maxCombo,
              puzzlesSolved: e.puzzlesSolved,
              peakDifficulty: e.peakDifficulty,
              totalTime: e.totalTime,
              updatedAt: e.updatedAt.toISOString(),
            };
          });

          return Response.json({ leaderboard });
        },
      ),
    },
  },
});
