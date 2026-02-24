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

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';

export async function GET(req: NextRequest) {
  // Rate limiting
  const ip = getClientIp(req);
  const rl = rateLimit(ip, { limit: 30, windowMs: 60_000, prefix: 'rmhbox-lb' });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded', retryAfter: rl.retryAfter },
      { status: 429 },
    );
  }

  const { searchParams } = new URL(req.url);
  const period = searchParams.get('period') ?? 'all-time';
  const minigame = searchParams.get('minigame') ?? undefined;
  const metric = searchParams.get('metric') ?? 'score';
  const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 20, 1), 50);
  const offset = Math.max(Number(searchParams.get('offset')) || 0, 0);

  try {
    // Get current user for rank computation
    let currentUserId: string | null = null;
    try {
      const session = await auth.api.getSession({ headers: await headers() });
      currentUserId = session?.user?.id ?? null;
    } catch {
      // Not authenticated — still return leaderboard without user rank
    }

    // Per-minigame leaderboard via match player aggregation
    if (minigame) {
      return await handleMinigameLeaderboard(minigame, metric, limit, offset, period, currentUserId);
    }

    // Period-filtered leaderboard (weekly/monthly) via match player aggregation
    if (period === 'weekly' || period === 'monthly') {
      return await handlePeriodLeaderboard(period, metric, limit, offset, currentUserId);
    }

    // All-time global leaderboard from RMHboxProfile
    const orderBy = metric === 'wins'
      ? { totalWins: 'desc' as const }
      : metric === 'games'
        ? { totalGamesPlayed: 'desc' as const }
        : { totalScore: 'desc' as const };

    const [profiles, total] = await Promise.all([
      prisma.rMHboxProfile.findMany({
        orderBy,
        skip: offset,
        take: limit,
        include: { user: { select: { name: true, image: true } } },
      }),
      prisma.rMHboxProfile.count(),
    ]);

    const entries = profiles.map((p, idx) => ({
      rank: offset + idx + 1,
      userId: p.userId,
      userName: p.user?.name ?? 'Unknown',
      avatarUrl: p.user?.image ?? null,
      value: metric === 'wins' ? p.totalWins : metric === 'games' ? p.totalGamesPlayed : p.totalScore,
      gamesPlayed: p.totalGamesPlayed,
      wins: p.totalWins,
    }));

    // Compute requesting user's rank if authenticated
    let userRank: number | null = null;
    if (currentUserId) {
      userRank = await computeUserRank(currentUserId, metric);
    }

    return NextResponse.json({
      entries,
      total,
      period,
      metric,
      userRank,
    });
  } catch (err) {
    console.error('[RMHbox Leaderboard API] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** Handle weekly/monthly leaderboard via RMHboxMatchPlayer aggregation */
async function handlePeriodLeaderboard(
  period: string,
  metric: string,
  limit: number,
  offset: number,
  currentUserId: string | null,
) {
  const now = new Date();
  const startDate = period === 'weekly'
    ? new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const aggregated = await prisma.rMHboxMatchPlayer.groupBy({
    by: ['userId', 'userName'],
    where: { createdAt: { gte: startDate } },
    _sum: { score: true },
    _count: { id: true },
  });

  // Compute wins count for each user in the period
  const winCounts = await prisma.rMHboxMatchPlayer.groupBy({
    by: ['userId'],
    where: { createdAt: { gte: startDate }, wasWinner: true },
    _count: { id: true },
  });
  const winMap = new Map(winCounts.map((w) => [w.userId, w._count.id]));

  // Sort based on metric
  const sorted = aggregated.sort((a, b) => {
    if (metric === 'wins') return (winMap.get(b.userId) ?? 0) - (winMap.get(a.userId) ?? 0);
    if (metric === 'games') return (b._count.id) - (a._count.id);
    return (b._sum.score ?? 0) - (a._sum.score ?? 0);
  });

  const total = sorted.length;
  const paged = sorted.slice(offset, offset + limit);

  const entries = paged.map((row, idx) => ({
    rank: offset + idx + 1,
    userId: row.userId,
    userName: row.userName,
    avatarUrl: null,
    value: metric === 'wins'
      ? (winMap.get(row.userId) ?? 0)
      : metric === 'games'
        ? row._count.id
        : (row._sum.score ?? 0),
    gamesPlayed: row._count.id,
    wins: winMap.get(row.userId) ?? 0,
  }));

  let userRank: number | null = null;
  if (currentUserId) {
    const idx = sorted.findIndex((r) => r.userId === currentUserId);
    userRank = idx >= 0 ? idx + 1 : null;
  }

  return NextResponse.json({ entries, total, period, metric, userRank });
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
  // Join through RMHboxMatch to filter by minigameId
  const aggregated = await prisma.rMHboxMatchPlayer.groupBy({
    by: ['userId', 'userName'],
    where: { match: { minigameId: minigame } },
    _sum: { score: true },
    _count: { id: true },
  });

  const winCounts = await prisma.rMHboxMatchPlayer.groupBy({
    by: ['userId'],
    where: { match: { minigameId: minigame }, wasWinner: true },
    _count: { id: true },
  });
  const winMap = new Map(winCounts.map((w) => [w.userId, w._count.id]));

  const sorted = aggregated.sort((a, b) => {
    if (metric === 'wins') return (winMap.get(b.userId) ?? 0) - (winMap.get(a.userId) ?? 0);
    if (metric === 'games') return (b._count.id) - (a._count.id);
    return (b._sum.score ?? 0) - (a._sum.score ?? 0);
  });

  const total = sorted.length;
  const paged = sorted.slice(offset, offset + limit);

  const entries = paged.map((row, idx) => ({
    rank: offset + idx + 1,
    userId: row.userId,
    userName: row.userName,
    avatarUrl: null,
    value: metric === 'wins'
      ? (winMap.get(row.userId) ?? 0)
      : metric === 'games'
        ? row._count.id
        : (row._sum.score ?? 0),
    gamesPlayed: row._count.id,
    wins: winMap.get(row.userId) ?? 0,
  }));

  let userRank: number | null = null;
  if (currentUserId) {
    const idx = sorted.findIndex((r) => r.userId === currentUserId);
    userRank = idx >= 0 ? idx + 1 : null;
  }

  return NextResponse.json({ entries, total, period, minigame, metric, userRank });
}

/** Compute a user's global rank based on metric */
async function computeUserRank(userId: string, metric: string): Promise<number | null> {
  const profile = await prisma.rMHboxProfile.findUnique({ where: { userId } });
  if (!profile) return null;

  const field = metric === 'wins' ? 'totalWins' : metric === 'games' ? 'totalGamesPlayed' : 'totalScore';
  const value = profile[field as keyof typeof profile] as number;

  const higherCount = await prisma.rMHboxProfile.count({
    where: { [field]: { gt: value } },
  });

  return higherCount + 1;
}
