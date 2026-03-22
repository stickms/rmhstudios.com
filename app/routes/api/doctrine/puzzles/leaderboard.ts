import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { apiCache } from '@/lib/cache';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export const Route = createFileRoute('/api/doctrine/puzzles/leaderboard')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ip = getClientIp(request);
        const { allowed } = rateLimit(ip, { limit: 30, windowMs: 60_000, prefix: 'doctrine-lb' });
        if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

        try {
          const url = new URL(request.url);
          const mode = url.searchParams.get('mode') ?? 'ALIBI';
          const date = url.searchParams.get('date') ?? new Date().toISOString().slice(0, 10);
          const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50'), 100);

          const cacheKey = `doctrine:leaderboard:${mode}:${date}:${limit}`;
          const cached = apiCache.get(cacheKey);
          if (cached) return Response.json(cached);

          const entries = await prisma.doctrinePuzzleSubmission.findMany({
            where: {
              puzzle: { mode: mode as 'ALIBI' | 'SPECTRUM' | 'OUTCAST' | 'CHAINLINK' | 'IMPOSTOR', date: new Date(date + 'T00:00:00Z') },
              correct: true,
            },
            orderBy: { score: 'desc' },
            take: limit,
            include: {
              user: { select: { id: true, name: true, handle: true, image: true } },
            },
          });

          const result = entries.map((entry, index) => ({
            rank: index + 1,
            userId: entry.userId,
            user: entry.user,
            score: entry.score,
            timeMs: entry.timeMs,
            attempts: entry.attempts,
          }));

          apiCache.set(cacheKey, result, 30_000); // 30s cache
          return Response.json(result);
        } catch (e) {
          console.error('Doctrine leaderboard failed:', e);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
