import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

/**
 * Laundry Sort leaderboards.
 *
 * Two boards, because the game has two modes and they are not comparable: a
 * solo run against the clock, and a versus race where everyone gets the same
 * seeded laundry. `mode=solo` ranks by best solo score; `mode=versus` ranks by
 * wins, with best versus score breaking ties.
 */

const querySchema = z.object({
  mode: z.enum(['solo', 'versus']).default('solo'),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export interface LeaderboardRow {
  username: string;
  highScore: number;
  gamesPlayed: number;
  versusWins: number;
  versusPlayed: number;
  versusBest: number;
  bestCombo: number;
  totalSorted: number;
}

export const Route = createFileRoute('/api/laundry-sort/leaderboard')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ip = getClientIp(request);
        const { allowed, retryAfter } = rateLimit(ip, {
          limit: 30,
          windowMs: 60_000,
          prefix: 'laundry-leaderboard',
        });
        if (!allowed) {
          return Response.json(
            { error: 'Too many requests' },
            { status: 429, headers: { 'Retry-After': String(retryAfter) } },
          );
        }

        const url = new URL(request.url);
        const parsed = querySchema.safeParse({
          mode: url.searchParams.get('mode') ?? undefined,
          limit: url.searchParams.get('limit') ?? undefined,
        });
        if (!parsed.success) {
          return Response.json({ error: 'Invalid query' }, { status: 400 });
        }
        const { mode, limit } = parsed.data;

        try {
          const select = {
            username: true,
            highScore: true,
            gamesPlayed: true,
            versusWins: true,
            versusPlayed: true,
            versusBest: true,
            bestCombo: true,
            totalSorted: true,
          } as const;

          const rows =
            mode === 'versus'
              ? await prisma.laundryPlayer.findMany({
                  // Someone who has never raced has nothing to rank.
                  where: { versusPlayed: { gt: 0 } },
                  take: limit,
                  orderBy: [{ versusWins: 'desc' }, { versusBest: 'desc' }],
                  select,
                })
              : await prisma.laundryPlayer.findMany({
                  where: { highScore: { gt: 0 } },
                  take: limit,
                  orderBy: { highScore: 'desc' },
                  select,
                });

          return Response.json(rows satisfies LeaderboardRow[]);
        } catch (error) {
          console.error('Laundry leaderboard fetch failed:', error);
          return Response.json({ error: 'Internal server error' }, { status: 500 });
        }
      },
    },
  },
});
