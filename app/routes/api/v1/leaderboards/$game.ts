import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';

/** Supported games and the metric each is ranked by. */
const GAMES = ['vega', 'void-breaker', 'signal-forge', 'neon-driftway', 'laundry', 'slice-it'] as const;
type Game = (typeof GAMES)[number];

interface Entry {
  rank: number;
  username: string;
  score: number;
  [k: string]: number | string;
}

async function fetchLeaderboard(game: Game, limit: number): Promise<{ metric: string; entries: Entry[] }> {
  switch (game) {
    case 'vega': {
      const rows = await prisma.vegaPlayer.findMany({ orderBy: { highestLevel: 'desc' }, take: limit, select: { username: true, highestLevel: true, highestLoop: true, gamesPlayed: true } });
      return { metric: 'highestLevel', entries: rows.map((r, i) => ({ rank: i + 1, username: r.username, score: r.highestLevel, highestLoop: r.highestLoop, gamesPlayed: r.gamesPlayed })) };
    }
    case 'void-breaker': {
      const rows = await prisma.voidBreakerPlayer.findMany({ orderBy: { highScore: 'desc' }, take: limit, select: { username: true, highScore: true, bestWave: true, totalKills: true, gamesPlayed: true } });
      return { metric: 'highScore', entries: rows.map((r, i) => ({ rank: i + 1, username: r.username, score: r.highScore, bestWave: r.bestWave, totalKills: r.totalKills, gamesPlayed: r.gamesPlayed })) };
    }
    case 'signal-forge': {
      const rows = await prisma.signalForgePlayer.findMany({ orderBy: { highScore: 'desc' }, take: limit, select: { username: true, highScore: true, floorReached: true, gamesPlayed: true } });
      return { metric: 'highScore', entries: rows.map((r, i) => ({ rank: i + 1, username: r.username, score: r.highScore, floorReached: r.floorReached, gamesPlayed: r.gamesPlayed })) };
    }
    case 'neon-driftway': {
      const rows = await prisma.neonDriftwayPlayer.findMany({ orderBy: { highScore: 'desc' }, take: limit, select: { username: true, highScore: true, bestDistance: true, bestLevel: true, gamesPlayed: true } });
      return { metric: 'highScore', entries: rows.map((r, i) => ({ rank: i + 1, username: r.username, score: r.highScore, bestDistance: r.bestDistance, bestLevel: r.bestLevel, gamesPlayed: r.gamesPlayed })) };
    }
    case 'laundry': {
      const rows = await prisma.laundryPlayer.findMany({ orderBy: { highScore: 'desc' }, take: limit, select: { username: true, highScore: true, gamesPlayed: true } });
      return { metric: 'highScore', entries: rows.map((r, i) => ({ rank: i + 1, username: r.username, score: r.highScore, gamesPlayed: r.gamesPlayed })) };
    }
    case 'slice-it': {
      const rows = await prisma.player.findMany({ orderBy: { totalScore: 'desc' }, take: limit, select: { username: true, totalScore: true, gamesPlayed: true } });
      return { metric: 'totalScore', entries: rows.map((r, i) => ({ rank: i + 1, username: r.username, score: r.totalScore, gamesPlayed: r.gamesPlayed })) };
    }
  }
}

/** GET /api/v1/leaderboards/{game} — top scores for a supported game. */
export const Route = createFileRoute('/api/v1/leaderboards/$game')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request, params }) =>
        withDeveloperApi(
          request,
          async ({ json, error }) => {
            const game = params.game as Game;
            if (!GAMES.includes(game)) {
              return error('invalid_request', `Unknown game. Supported: ${GAMES.join(', ')}.`, 400);
            }
            const url = new URL(request.url);
            const raw = parseInt(url.searchParams.get('limit') || '25', 10);
            const limit = Math.min(Number.isFinite(raw) && raw > 0 ? raw : 25, 100);
            const { metric, entries } = await fetchLeaderboard(game, limit);
            return json({ game, metric, data: entries });
          },
          { scope: 'read:leaderboards' }
        ),
    },
  },
});
