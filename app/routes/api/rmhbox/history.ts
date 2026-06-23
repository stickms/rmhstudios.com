import { createFileRoute } from '@tanstack/react-router';
/**
 * RMHbox History API — GET /api/rmhbox/history
 *
 * Returns match history with support for single match detail view
 * and paginated user/minigame filtered lists.
 *
 * Query parameters:
 *   matchId  — optional, returns single match detail with full gameLog
 *   userId   — optional, returns paginated list of user's matches
 *   minigame — optional, filters by minigame ID
 *   limit    — max entries (default: 20, max: 50)
 *   offset   — pagination offset (default: 0)
 *
 * Rate limited: 20 requests per 60 seconds.
 *
 * Reference: docs/rmhbox/implementation/phase-4.md §3.3
 */

import { prisma } from '@/lib/prisma.server';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export const Route = createFileRoute('/api/rmhbox/history')({
  server: {
    handlers: {
  GET: async ({ request }) => {
  // Rate limiting
  const ip = getClientIp(request);
  const rl = rateLimit(ip, { limit: 20, windowMs: 60_000, prefix: 'rmhbox-history' });
  if (!rl.allowed) {
    return Response.json(
      { error: 'Rate limit exceeded', retryAfter: rl.retryAfter },
      { status: 429 },
    );
  }

  const { searchParams } = new URL(request.url);
  const matchId = searchParams.get('matchId');
  const userId = searchParams.get('userId');
  const minigame = searchParams.get('minigame');
  const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 20, 1), 50);
  const offset = Math.max(Number(searchParams.get('offset')) || 0, 0);

  try {
    // Single match detail
    if (matchId) {
      const match = await prisma.rMHboxMatch.findUnique({
        where: { id: matchId },
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

      if (!match) {
        return Response.json({ error: 'Match not found' }, { status: 404 });
      }

      // The raw gameLog/results can contain per-round internal state, so only
      // expose them to participants of the match or admins. Everyone else gets
      // the public leaderboard-style summary.
      const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
      const viewerId = session?.user?.id ?? null;
      const isParticipant = !!viewerId && match.players.some((p) => p.userId === viewerId);
      const isAdmin = !!session && (session.user as { isAdmin?: boolean }).isAdmin === true;
      const canSeeDetail = isParticipant || isAdmin;

      return Response.json({
        match: {
          id: match.id,
          minigameId: match.minigameId,
          lobbyId: match.lobbyId,
          startedAt: match.startedAt.toISOString(),
          endedAt: match.endedAt?.toISOString() ?? null,
          durationMs: match.durationMs,
          winnerUserId: match.winnerUserId,
          playerCount: match.playerCount,
          gameLog: canSeeDetail ? match.gameLog : null,
          results: canSeeDetail ? match.results : null,
          players: match.players,
        },
      });
    }

    // Build where clause for list queries
    const where: Record<string, unknown> = {};
    if (userId) {
      where.players = { some: { userId } };
    }
    if (minigame) {
      where.minigameId = minigame;
    }

    const [matches, total] = await Promise.all([
      prisma.rMHboxMatch.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip: offset,
        take: limit,
        include: {
          players: {
            orderBy: { rank: 'asc' },
            select: {
              userId: true,
              userName: true,
              rank: true,
              score: true,
              wasWinner: true,
            },
          },
        },
      }),
      prisma.rMHboxMatch.count({ where }),
    ]);

    return Response.json({
      matches: matches.map((m) => ({
        id: m.id,
        minigameId: m.minigameId,
        lobbyId: m.lobbyId,
        startedAt: m.startedAt.toISOString(),
        endedAt: m.endedAt?.toISOString() ?? null,
        durationMs: m.durationMs,
        winnerUserId: m.winnerUserId,
        playerCount: m.playerCount,
        players: m.players,
      })),
      total,
      limit,
      offset,
    });
  } catch (err) {
    console.error('[RMHbox History API] Error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
},
    },
  },
});
