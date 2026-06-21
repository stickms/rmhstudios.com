/**
 * Ranked challenge resolution (#5). When a challenge result is reported, update
 * both players' ELO ratings for that game and the win/loss/draw tallies.
 */

import { prisma } from '@/lib/prisma.server';
import { BASE_RATING, nextRating } from '@/lib/ranked/elo';
import { grantAchievement } from '@/lib/achievements/engine.server';

async function getOrInitRating(tx: typeof prisma, userId: string, game: string) {
  return tx.eloRating.upsert({
    where: { userId_game: { userId, game } },
    create: { userId, game, rating: BASE_RATING },
    update: {},
    select: { rating: true },
  });
}

/**
 * Apply a resolved result. `winnerId` null = draw. Returns the new ratings.
 */
export async function applyChallengeResult(params: {
  game: string;
  challengerId: string;
  opponentId: string;
  winnerId: string | null;
}): Promise<{ challengerRating: number; opponentRating: number }> {
  const { game, challengerId, opponentId, winnerId } = params;

  return prisma.$transaction(async (tx) => {
    const [a, b] = await Promise.all([
      getOrInitRating(tx as unknown as typeof prisma, challengerId, game),
      getOrInitRating(tx as unknown as typeof prisma, opponentId, game),
    ]);

    // Scores from the challenger's perspective.
    const challengerScore = winnerId === null ? 0.5 : winnerId === challengerId ? 1 : 0;
    const opponentScore = 1 - challengerScore;

    const newChallenger = nextRating(a.rating, b.rating, challengerScore);
    const newOpponent = nextRating(b.rating, a.rating, opponentScore);

    await tx.eloRating.update({
      where: { userId_game: { userId: challengerId, game } },
      data: {
        rating: newChallenger,
        wins: { increment: challengerScore === 1 ? 1 : 0 },
        losses: { increment: challengerScore === 0 ? 1 : 0 },
        draws: { increment: challengerScore === 0.5 ? 1 : 0 },
      },
    });
    await tx.eloRating.update({
      where: { userId_game: { userId: opponentId, game } },
      data: {
        rating: newOpponent,
        wins: { increment: opponentScore === 1 ? 1 : 0 },
        losses: { increment: opponentScore === 0 ? 1 : 0 },
        draws: { increment: opponentScore === 0.5 ? 1 : 0 },
      },
    });

    return { challengerRating: newChallenger, opponentRating: newOpponent };
  }).then(async (res) => {
    // Best-effort achievement for both players' first ranked match.
    await grantAchievement(challengerId, 'game.first_ranked').catch(() => {});
    await grantAchievement(opponentId, 'game.first_ranked').catch(() => {});
    return res;
  });
}
