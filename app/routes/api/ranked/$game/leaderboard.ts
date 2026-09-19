import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';
import { gameName, isRankedGame } from '@/lib/ranked/elo';
import { tierForRating } from '@/lib/ranked/tiers';
import { getLadder } from '@/lib/ranked/season.server';
import { AppError } from '@/lib/errors/codes';

/**
 * `GET /api/ranked/$game/leaderboard` — a game's ladder.
 *
 * `?scope=season` (the default since P5) returns this season's ladder, with
 * placement and decay applied; `?scope=lifetime` returns the all-time
 * `EloRating` table this route has always served.
 *
 * Seasonal is the default because it is the honest answer to "who is good at
 * this": the lifetime table cannot distinguish a rating earned in March from
 * one earned last week, and never forgets anyone, so it drifts into a record of
 * who played first. Lifetime stays reachable because it is a real thing people
 * care about, not because of compatibility — the shape is the same either way.
 */

const querySchema = z.object({
  scope: z.enum(['season', 'lifetime']).default('season'),
});

export const Route = createFileRoute('/api/ranked/$game/leaderboard')({
  server: {
    handlers: {
      GET: defineHandler(
        {
          auth: 'none',
          rateLimit: 'read',
          query: querySchema,
          // Identical for every caller, so a shared cache may hold it. A minute
          // is short enough that a climb is visible and long enough that a page
          // of 50 rows is not recomputed per viewer.
          cache: { visibility: 'public', maxAge: 30, sMaxAge: 60 },
        },
        async ({ params, query }) => {
          const game = params.game;
          if (!isRankedGame(game)) throw new AppError('NOT_FOUND');

          if (query.scope === 'lifetime') {
            const rows = await prisma.eloRating.findMany({
              where: { game },
              orderBy: { rating: 'desc' },
              take: 100,
              include: { user: { select: userDisplaySelect } },
            });
            return Response.json({
              game,
              gameName: gameName(game),
              scope: 'lifetime',
              leaderboard: rows.map((r, i) => ({
                rank: i + 1,
                rating: r.rating,
                tier: tierForRating(r.rating),
                wins: r.wins,
                losses: r.losses,
                draws: r.draws,
                user: resolveUser(r.user),
              })),
            });
          }

          const ladder = await getLadder(game, 100);
          // Resolve display names in one query rather than per row: the ladder
          // is already sorted and sliced, so this is a single `in` over ≤100
          // ids instead of 100 joins done for rows most of which were dropped.
          const users = await prisma.user.findMany({
            where: { id: { in: ladder.entries.map((e) => e.userId) } },
            select: userDisplaySelect,
          });
          const byId = new Map(users.map((u) => [u.id, u]));

          return Response.json({
            game,
            gameName: gameName(game),
            scope: 'season',
            season: ladder.season,
            seasonEndsAt: ladder.endsAt.toISOString(),
            seasonProgress: ladder.progress,
            leaderboard: ladder.entries.map((e, i) => {
              const u = byId.get(e.userId);
              return {
                rank: i + 1,
                rating: e.rating,
                tier: e.tier,
                wins: e.wins,
                losses: e.losses,
                draws: e.draws,
                user: u ? resolveUser(u) : null,
              };
            }),
          });
        },
      ),
    },
  },
});
