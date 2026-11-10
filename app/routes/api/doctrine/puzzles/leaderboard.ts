import { z } from 'zod';
import { pageSize } from '@/lib/pagination';
import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import * as C from '@/lib/doctrine/doctrine.contract';
import { CACHE_POLICY } from '@/lib/api/cache-policies';
import { prisma } from '@/lib/prisma.server';
import { cached } from '@/lib/cached.server';

export const Route = createFileRoute('/api/doctrine/puzzles/leaderboard')({
  server: {
    handlers: {
      GET: implement(
        C.getDoctrinePuzzleLeaderboardApi,
        {
          auth: 'none',
          query: z.object({
            mode: z.string().optional(),
            date: z.string().optional(),
            limit: z.string().optional(),
          }),
          rateLimit: { limit: 30, windowMs: 60_000, prefix: 'doctrine-lb' },
          // (mode, date, limit) are all query params, hence part of the key.
          // Opt out of the 30 s micro-cache: puzzles/submit invalidates the board's cache tag.
          microCache: false,
          cache: CACHE_POLICY.leaderboard,
        },
        async ({ request }) => {
          try {
            const url = new URL(request.url);
            const mode = url.searchParams.get('mode') ?? 'ALIBI';
            const date = url.searchParams.get('date') ?? new Date().toISOString().slice(0, 10);
            const limit = pageSize(url.searchParams.get('limit'), 50, 100);

            const cacheKey = `doctrine:leaderboard:${mode}:${date}:${limit}`;
            // Tagged per (mode, date) so puzzles/submit can drop every `limit` variant at once
            // (tags are L1-only and broadcast to every process).
            const result = await cached(
              cacheKey,
              30_000,
              async () => {
                const entries = await prisma.doctrinePuzzleSubmission.findMany({
                  where: {
                    puzzle: {
                      mode: mode as 'ALIBI' | 'SPECTRUM' | 'OUTCAST' | 'CHAINLINK' | 'IMPOSTOR',
                      date: new Date(date + 'T00:00:00Z'),
                    },
                    correct: true,
                  },
                  orderBy: { score: 'desc' },
                  take: limit,
                  include: {
                    user: { select: { id: true, name: true, handle: true, image: true } },
                  },
                });

                return entries.map((entry, index) => ({
                  rank: index + 1,
                  userId: entry.userId,
                  user: entry.user,
                  score: entry.score,
                  timeMs: entry.timeMs,
                  attempts: entry.attempts,
                }));
              },
              { tags: [`doctrine:leaderboard:${mode}:${date}`] },
            );
            return Response.json(result);
          } catch (e) {
            console.error('Doctrine leaderboard failed:', e);
            return Response.json({ error: 'Internal Server Error' }, { status: 500 });
          }
        },
      ),
    },
  },
});
