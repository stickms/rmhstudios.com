/**
 * Server-side read for the Ranked overview: the viewer's ratings plus their
 * pending/active incoming and outgoing challenges.
 *
 * Shared by the `/api/ranked` GET handler and the `/ranked` route loader so the
 * page's primary payload is server-rendered / prefetched instead of fetched on
 * mount. Signed-out visitors still get the games list (with empty ratings /
 * challenges) so the leaderboard section renders. The leaderboard itself is
 * fetched client-side per selected game and is intentionally not included here.
 */

import { prisma } from '@/lib/prisma.server';
import { RANKED_GAMES } from '@/lib/ranked/elo';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';

export interface RankedRating {
  id: string;
  userId: string;
  game: string;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  updatedAt: string;
}

export interface RankedChallengeRow {
  id: string;
  game: string;
  status: string;
  user: ReturnType<typeof resolveUser>;
}

export interface RankedOverview {
  games: typeof RANKED_GAMES;
  signedIn: boolean;
  ratings: RankedRating[];
  incoming: RankedChallengeRow[];
  outgoing: RankedChallengeRow[];
}

export async function getRankedOverview(userId: string | null): Promise<RankedOverview> {
  if (!userId) {
    return { games: RANKED_GAMES, signedIn: false, ratings: [], incoming: [], outgoing: [] };
  }

  const [ratings, incoming, outgoing] = await Promise.all([
    prisma.eloRating.findMany({ where: { userId }, orderBy: { rating: 'desc' } }),
    prisma.rankedChallenge.findMany({
      where: { opponentId: userId, status: { in: ['pending', 'accepted'] } },
      orderBy: { createdAt: 'desc' },
      include: { challenger: { select: userDisplaySelect } },
    }),
    prisma.rankedChallenge.findMany({
      where: { challengerId: userId, status: { in: ['pending', 'accepted'] } },
      orderBy: { createdAt: 'desc' },
      include: { opponent: { select: userDisplaySelect } },
    }),
  ]);

  return {
    games: RANKED_GAMES,
    signedIn: true,
    ratings: ratings.map((r) => ({
      id: r.id,
      userId: r.userId,
      game: r.game,
      rating: r.rating,
      wins: r.wins,
      losses: r.losses,
      draws: r.draws,
      updatedAt: r.updatedAt.toISOString(),
    })),
    incoming: incoming.map((c) => ({ id: c.id, game: c.game, status: c.status, user: resolveUser(c.challenger) })),
    outgoing: outgoing.map((c) => ({ id: c.id, game: c.game, status: c.status, user: resolveUser(c.opponent) })),
  };
}
