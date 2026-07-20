import { createFileRoute } from '@tanstack/react-router';
/**
 * RMHbox Leaderboard API — GET /api/rmhbox/leaderboard
 *
 * Returns ranked player entries with support for period filtering,
 * per-minigame filtering, and multiple sort metrics.
 *
 * Query parameters:
 *   period  — 'all-time' | 'weekly' | 'monthly' (default: 'all-time')
 *   minigame — optional minigame ID filter
 *   metric  — 'score' | 'wins' | 'games' (default: 'score')
 *   limit   — max entries (default: 20, max: 50)
 *   offset  — pagination offset (default: 0)
 *
 * Rate limited: 30 requests per 60 seconds.
 *
 * Reference: docs/rmhbox/implementation/phase-4.md §3.1
 */

import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { auth } from '@/lib/auth';
import { resolveUserDisplay } from '@/lib/user-display';
import { cached } from '@/lib/cached.server';

/** One precomputed, viewer-independent leaderboard row (perf audit §2.6). */
type BoardRow = {
  userId: string;
  userName: string;
  score: number;
  gamesPlayed: number;
  wins: number;
};

/** Handle weekly/monthly leaderboard via RMHboxMatchPlayer aggregation */
async function handlePeriodLeaderboard(
  period: string,
  metric: string,
  limit: number,
  offset: number,
  currentUserId: string | null,
) {
  // The aggregation over every match-player row in the window is viewer-
  // independent, so compute+sort it ONCE per (period, metric) and cache 60s —
  // shared across all viewers (perf audit §2.6). Pagination + the viewer's own
  // rank are derived per-request from the cached board.
  const sorted = await cached<BoardRow[]>(
    `rmhbox-lb:period:${period}:${metric}`,
    60_000,
    async () => {
      const now = new Date();
      const startDate =
        period === 'weekly'
          ? new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
          : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const [aggregated, winCounts] = await Promise.all([
        prisma.rMHboxMatchPlayer.groupBy({
          by: ['userId', 'userName'],
          where: { createdAt: { gte: startDate } },
          _sum: { score: true },
          _count: { id: true },
        }),
        prisma.rMHboxMatchPlayer.groupBy({
          by: ['userId'],
          where: { createdAt: { gte: startDate }, wasWinner: true },
          _count: { id: true },
        }),
      ]);
      const winMap = new Map(winCounts.map((w) => [w.userId, w._count.id]));
      return aggregated
        .map((row) => ({
          userId: row.userId,
          userName: row.userName,
          score: row._sum.score ?? 0,
          gamesPlayed: row._count.id,
          wins: winMap.get(row.userId) ?? 0,
        }))
        .sort((a, b) =>
          metric === 'wins'
            ? b.wins - a.wins
            : metric === 'games'
              ? b.gamesPlayed - a.gamesPlayed
              : b.score - a.score,
        );
    },
  );

  return Response.json(paginateBoard(sorted, offset, limit, metric, currentUserId, { period }));
}

/** Slice a cached board into a response page + the viewer's rank. */
function paginateBoard(
  sorted: BoardRow[],
  offset: number,
  limit: number,
  metric: string,
  currentUserId: string | null,
  extra: Record<string, unknown>,
) {
  const total = sorted.length;
  const entries = sorted.slice(offset, offset + limit).map((row, idx) => ({
    rank: offset + idx + 1,
    userId: row.userId,
    userName: row.userName,
    avatarUrl: null,
    value: metric === 'wins' ? row.wins : metric === 'games' ? row.gamesPlayed : row.score,
    gamesPlayed: row.gamesPlayed,
    wins: row.wins,
  }));
  let userRank: number | null = null;
  if (currentUserId) {
    const idx = sorted.findIndex((r) => r.userId === currentUserId);
    userRank = idx >= 0 ? idx + 1 : null;
  }
  return { entries, total, metric, userRank, ...extra };
}

/** Handle per-minigame leaderboard via match player aggregation */
async function handleMinigameLeaderboard(
  minigame: string,
  metric: string,
  limit: number,
  offset: number,
  period: string,
  currentUserId: string | null,
) {
  // Viewer-independent aggregation over this minigame's match players — computed
  // once per (minigame, metric) and cached 60s (perf audit §2.6).
  const sorted = await cached<BoardRow[]>(
    `rmhbox-lb:minigame:${minigame}:${metric}`,
    60_000,
    async () => {
      const [aggregated, winCounts] = await Promise.all([
        prisma.rMHboxMatchPlayer.groupBy({
          by: ['userId', 'userName'],
          where: { match: { minigameId: minigame } },
          _sum: { score: true },
          _count: { id: true },
        }),
        prisma.rMHboxMatchPlayer.groupBy({
          by: ['userId'],
          where: { match: { minigameId: minigame }, wasWinner: true },
          _count: { id: true },
        }),
      ]);
      const winMap = new Map(winCounts.map((w) => [w.userId, w._count.id]));
      return aggregated
        .map((row) => ({
          userId: row.userId,
          userName: row.userName,
          score: row._sum.score ?? 0,
          gamesPlayed: row._count.id,
          wins: winMap.get(row.userId) ?? 0,
        }))
        .sort((a, b) =>
          metric === 'wins'
            ? b.wins - a.wins
            : metric === 'games'
              ? b.gamesPlayed - a.gamesPlayed
              : b.score - a.score,
        );
    },
  );

  return Response.json(
    paginateBoard(sorted, offset, limit, metric, currentUserId, { period, minigame }),
  );
}

/** Compute a user's global rank based on metric */
async function computeUserRank(userId: string, metric: string): Promise<number | null> {
  const profile = await prisma.rMHboxProfile.findUnique({ where: { userId } });
  if (!profile) return null;

  const field =
    metric === 'wins' ? 'totalWins' : metric === 'games' ? 'totalGamesPlayed' : 'totalScore';
  const value = profile[field as keyof typeof profile] as number;

  const higherCount = await prisma.rMHboxProfile.count({
    where: { [field]: { gt: value } },
  });

  return higherCount + 1;
}

export const Route = createFileRoute('/api/rmhbox/leaderboard')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Rate limiting
        const ip = getClientIp(request);
        const rl = rateLimit(ip, { limit: 30, windowMs: 60_000, prefix: 'rmhbox-lb' });
        if (!rl.allowed) {
          return Response.json(
            { error: 'Rate limit exceeded', retryAfter: rl.retryAfter },
            { status: 429 },
          );
        }

        const { searchParams } = new URL(request.url);
        const period = searchParams.get('period') ?? 'all-time';
        const minigame = searchParams.get('minigame') ?? undefined;
        const metric = searchParams.get('metric') ?? 'score';
        const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 20, 1), 50);
        const offset = Math.max(Number(searchParams.get('offset')) || 0, 0);

        try {
          // Get current user for rank computation
          let currentUserId: string | null = null;
          try {
            const session = await auth.api.getSession({ headers: request.headers });
            currentUserId = session?.user?.id ?? null;
          } catch {
            // Not authenticated — still return leaderboard without user rank
          }

          // Per-minigame leaderboard via match player aggregation
          if (minigame) {
            return await handleMinigameLeaderboard(
              minigame,
              metric,
              limit,
              offset,
              period,
              currentUserId,
            );
          }

          // Period-filtered leaderboard (weekly/monthly) via match player aggregation
          if (period === 'weekly' || period === 'monthly') {
            return await handlePeriodLeaderboard(period, metric, limit, offset, currentUserId);
          }

          // All-time global leaderboard from RMHboxProfile
          const orderBy =
            metric === 'wins'
              ? { totalWins: 'desc' as const }
              : metric === 'games'
                ? { totalGamesPlayed: 'desc' as const }
                : { totalScore: 'desc' as const };

          const [profiles, total] = await Promise.all([
            prisma.rMHboxProfile.findMany({
              orderBy,
              skip: offset,
              take: limit,
              include: {
                user: {
                  select: {
                    name: true,
                    image: true,
                    profile: { select: { displayName: true, customImage: true } },
                  },
                },
              },
            }),
            prisma.rMHboxProfile.count(),
          ]);

          const entries = profiles.map((p, idx) => {
            const resolved = p.user ? resolveUserDisplay(p.user) : { name: null, image: null };
            return {
              rank: offset + idx + 1,
              userId: p.userId,
              userName: resolved.name ?? 'Unknown',
              avatarUrl: resolved.image ?? null,
              value:
                metric === 'wins'
                  ? p.totalWins
                  : metric === 'games'
                    ? p.totalGamesPlayed
                    : p.totalScore,
              gamesPlayed: p.totalGamesPlayed,
              wins: p.totalWins,
            };
          });

          // Compute requesting user's rank if authenticated
          let userRank: number | null = null;
          if (currentUserId) {
            userRank = await computeUserRank(currentUserId, metric);
          }

          return Response.json({
            entries,
            total,
            period,
            metric,
            userRank,
          });
        } catch (err) {
          console.error('[RMHbox Leaderboard API] Error:', err);
          return Response.json({ error: 'Internal server error' }, { status: 500 });
        }
      },
    },
  },
});
