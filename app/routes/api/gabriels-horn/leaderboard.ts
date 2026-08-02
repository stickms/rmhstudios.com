import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

/**
 * Gabriel's Horn record board.
 *
 * Ranked on games won, not on the smallest hand anyone has ever held: a
 * two-card finish at a three-player table is not the same achievement as one at
 * a six-player table, and a board that rewarded it would reward finding the
 * smallest table. Ties break on the fewest games needed to get those wins.
 *
 * Read-only and public — the rows are display names and counters the game
 * already shows at the table.
 */

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export interface HornLeaderboardRow {
  username: string;
  wins: number;
  gamesPlayed: number;
  bestHand: number | null;
  hornsSounded: number;
  hornsWon: number;
}

export const Route = createFileRoute('/api/gabriels-horn/leaderboard')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { allowed, retryAfter } = rateLimit(getClientIp(request), {
          limit: 30,
          windowMs: 60_000,
          prefix: 'gabriels-horn-leaderboard',
        });
        if (!allowed) {
          return Response.json(
            { error: 'Too many requests' },
            { status: 429, headers: { 'Retry-After': String(retryAfter) } },
          );
        }

        const url = new URL(request.url);
        const parsed = querySchema.safeParse({
          limit: url.searchParams.get('limit') ?? undefined,
        });
        if (!parsed.success) {
          return Response.json({ error: 'Invalid query' }, { status: 400 });
        }

        try {
          const rows = await prisma.gabrielsHornPlayer.findMany({
            where: { gamesPlayed: { gt: 0 } },
            select: {
              username: true,
              wins: true,
              gamesPlayed: true,
              bestHand: true,
              hornsSounded: true,
              hornsWon: true,
            },
            orderBy: [{ wins: 'desc' }, { gamesPlayed: 'asc' }],
            take: parsed.data.limit,
          });
          return Response.json({ rows });
        } catch (error) {
          console.error('gabriels-horn leaderboard error:', error);
          return Response.json({ error: 'Internal server error' }, { status: 500 });
        }
      },
    },
  },
});
