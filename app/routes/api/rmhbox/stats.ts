import { createFileRoute } from '@tanstack/react-router';
/**
 * RMHbox Stats API — GET /api/rmhbox/stats
 *
 * Returns aggregated player statistics including global stats,
 * per-minigame breakdown, and recent match history.
 *
 * Query parameters:
 *   userId — required user ID to look up stats for
 *
 * Rate limited: 20 requests per 60 seconds.
 *
 * Reference: docs/rmhbox/implementation/phase-4.md §3.2
 */

import { prisma } from '@/lib/prisma';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export const Route = createFileRoute('/api/rmhbox/stats')({
  server: {
    handlers: {
  GET: async ({ request }) => {
  // Rate limiting
  const ip = getClientIp(request);
  const rl = rateLimit(ip, { limit: 20, windowMs: 60_000, prefix: 'rmhbox-stats' });
  if (!rl.allowed) {
    return Response.json(
      { error: 'Rate limit exceeded', retryAfter: rl.retryAfter },
      { status: 429 },
    );
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');

  if (!userId) {
    return Response.json({ error: 'userId parameter is required' }, { status: 400 });
  }

  try {
    // Fetch the profile
    const profile = await prisma.rMHboxProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      return Response.json({
        global: null,
        minigames: {},
        recentMatches: [],
      });
    }

    // Compute derived stats
    const winRate = profile.totalGamesPlayed > 0
      ? Math.round((profile.totalWins / profile.totalGamesPlayed) * 10000) / 100
      : 0;

    // Find favorite minigame from minigameStats
    const minigameStats = (profile.minigameStats as Record<string, { gamesPlayed: number }>) ?? {};
    let favoriteMinigame: string | null = null;
    let maxPlayed = 0;
    for (const [gameId, stats] of Object.entries(minigameStats)) {
      if (stats.gamesPlayed > maxPlayed) {
        maxPlayed = stats.gamesPlayed;
        favoriteMinigame = gameId;
      }
    }

    // Fetch last 10 matches
    const recentMatchPlayers = await prisma.rMHboxMatchPlayer.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        match: {
          select: {
            id: true,
            minigameId: true,
            startedAt: true,
            endedAt: true,
            durationMs: true,
            playerCount: true,
            winnerUserId: true,
          },
        },
      },
    });

    const recentMatches = recentMatchPlayers.map((mp) => ({
      matchId: mp.match.id,
      minigameId: mp.match.minigameId,
      rank: mp.rank,
      score: mp.score,
      wasWinner: mp.wasWinner,
      playerCount: mp.match.playerCount,
      durationMs: mp.match.durationMs,
      playedAt: mp.match.startedAt.toISOString(),
    }));

    return Response.json({
      global: {
        totalGamesPlayed: profile.totalGamesPlayed,
        totalWins: profile.totalWins,
        totalScore: profile.totalScore,
        totalPlayTimeMs: profile.totalPlayTimeMs,
        currentWinStreak: profile.currentWinStreak,
        bestWinStreak: profile.bestWinStreak,
        winRate,
        favoriteMinigame,
      },
      minigames: minigameStats,
      recentMatches,
    });
  } catch (err) {
    console.error('[RMHbox Stats API] Error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
},
    },
  },
});
