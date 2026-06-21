import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';
import { gameName, isRankedGame } from '@/lib/ranked/elo';

/** GET /api/ranked/$game/leaderboard — top ELO ratings for a game. */
export const Route = createFileRoute('/api/ranked/$game/leaderboard')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        if (!isRankedGame(params.game)) {
          return Response.json({ error: 'Unknown game' }, { status: 404 });
        }
        const rows = await prisma.eloRating.findMany({
          where: { game: params.game },
          orderBy: { rating: 'desc' },
          take: 100,
          include: { user: { select: userDisplaySelect } },
        });
        return Response.json({
          game: params.game,
          gameName: gameName(params.game),
          leaderboard: rows.map((r, i) => ({
            rank: i + 1,
            rating: r.rating,
            wins: r.wins,
            losses: r.losses,
            draws: r.draws,
            user: resolveUser(r.user),
          })),
        });
      },
    },
  },
});
