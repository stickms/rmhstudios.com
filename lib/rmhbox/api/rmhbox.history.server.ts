import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { prisma } from '@/lib/prisma.server';
import { listRmhboxMatchesApi } from '@/lib/rmhbox/rmhbox-reads.contract';
import { historyQuerySchema, STATS_PAGE_DEFAULT } from '@/lib/rmhbox/player-stats-schema';
import { resolveStatsAccess } from '@/lib/rmhbox/player-stats.server';

/**
 * GET /api/rmhbox/history — finished matches, newest first.
 *   ?matchId=   one match with its players; the raw log and results only for its
 *               players and admins (they can hold per-round internal state)
 *   ?minigame=  one minigame's matches (public: it names no single player's record)
 *   ?userId=    one player's matches, only when their game-activity setting lets the
 *               caller see them; otherwise the list is empty, the same answer as for
 *               a player with no matches, so it reveals nothing
 */
export const route = apiRoute('/api/rmhbox/history', {
  GET: implement(
    listRmhboxMatchesApi,
    { auth: 'optional', rateLimit: 'read', query: historyQuerySchema },
    async ({ userId, isAdmin, query }) => {
      if (query.matchId) {
        const match = await prisma.rMHboxMatch.findUnique({
          where: { id: query.matchId },
          include: {
            players: {
              orderBy: { rank: 'asc' },
              select: {
                userId: true,
                userName: true,
                rank: true,
                score: true,
                wasWinner: true,
                stats: true,
              },
            },
          },
        });
        if (!match) return Response.json({ error: 'Match not found' }, { status: 404 });
        const canSeeDetail = isAdmin || (!!userId && match.players.some((p) => p.userId === userId));
        return Response.json({
          match: {
            id: match.id,
            minigameId: match.minigameId,
            lobbyId: match.lobbyId,
            startedAt: match.startedAt.toISOString(),
            endedAt: match.endedAt?.toISOString() ?? null,
            durationMs: match.durationMs ?? 0, // an unfinished match has no duration yet
            winnerUserId: match.winnerUserId,
            playerCount: match.playerCount,
            gameLog: canSeeDetail ? match.gameLog : null,
            results: canSeeDetail ? match.results : null,
            players: match.players,
          },
        });
      }

      const limit = query.limit ?? STATS_PAGE_DEFAULT;
      const offset = query.offset ?? 0;

      if (query.userId) {
        const decision = await resolveStatsAccess(userId, query.userId);
        if (decision.access !== 'full') return { matches: [], total: 0, limit, offset };
      }

      const where = {
        ...(query.userId ? { players: { some: { userId: query.userId } } } : {}),
        ...(query.minigame ? { minigameId: query.minigame } : {}),
      };
      const [matches, total] = await Promise.all([
        prisma.rMHboxMatch.findMany({
          where,
          orderBy: { startedAt: 'desc' },
          skip: offset,
          take: limit,
          include: {
            players: {
              orderBy: { rank: 'asc' },
              select: { userId: true, userName: true, rank: true, score: true, wasWinner: true },
            },
          },
        }),
        prisma.rMHboxMatch.count({ where }),
      ]);
      return {
        matches: matches.map((m) => ({
          id: m.id,
          minigameId: m.minigameId,
          lobbyId: m.lobbyId,
          startedAt: m.startedAt.toISOString(),
          endedAt: m.endedAt?.toISOString() ?? null,
          durationMs: m.durationMs ?? 0,
          winnerUserId: m.winnerUserId,
          playerCount: m.playerCount,
          players: m.players,
        })),
        total,
        limit,
        offset,
      };
    },
  ),
});
