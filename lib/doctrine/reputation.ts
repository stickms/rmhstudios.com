/**
 * Doctrine Engine — Reputation System
 *
 * XP calculation, rank determination, streak tracking, and decay logic.
 */

import { prisma } from '@/lib/prisma';
import { apiCache } from '@/lib/cache';
import { RANKS, WEEKLY_DECAY_RATE, XP_ACTIONS } from './constants';
import type { RankDefinition } from './types';

/**
 * Get the rank for a given XP total.
 * Iterates ranks in reverse to find the highest qualifying rank.
 */
export function getRank(xp: number): RankDefinition {
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (xp >= RANKS[i].minXp) return RANKS[i];
  }
  return RANKS[0];
}

/**
 * Calculate XP after decay for inactive users.
 */
export function calculateDecay(currentXp: number, weeksInactive: number): number {
  return Math.floor(currentXp * Math.pow(1 - WEEKLY_DECAY_RATE, weeksInactive));
}

/**
 * Award XP to a user for a specific action.
 * Creates a reputation record if one doesn't exist, then logs to the ledger.
 */
export async function awardXp(
  userId: string,
  action: string,
  metadata?: Record<string, unknown>,
): Promise<{ totalXp: number; rank: RankDefinition }> {
  // Resolve the XP delta
  let xpDelta: number;
  if (action === 'PUZZLE_SOLVE_STREAK_BONUS' && metadata?.streak) {
    xpDelta = XP_ACTIONS.PUZZLE_SOLVE_STREAK_BONUS(metadata.streak as number);
  } else {
    const staticAction = action as keyof typeof XP_ACTIONS;
    const value = XP_ACTIONS[staticAction];
    xpDelta = typeof value === 'number' ? value : 0;
  }

  if (xpDelta === 0) return { totalXp: 0, rank: RANKS[0] };

  // Upsert reputation record
  const reputation = await prisma.doctrineReputation.upsert({
    where: { userId },
    create: {
      userId,
      totalXp: xpDelta,
      lastActiveAt: new Date(),
    },
    update: {
      totalXp: { increment: xpDelta },
      lastActiveAt: new Date(),
    },
  });

  // Log to ledger
  await prisma.doctrineReputationLedger.create({
    data: {
      reputationId: reputation.id,
      action,
      xpDelta,
      reason: `${action} +${xpDelta}XP`,
      metadata: metadata ? (metadata as Record<string, string | number | boolean>) : undefined,
    },
  });

  // Invalidate cache
  apiCache.invalidate(`doctrine:rep:${userId}`);
  apiCache.invalidatePrefix('doctrine:leaderboard');

  const rank = getRank(reputation.totalXp);
  return { totalXp: reputation.totalXp, rank };
}

/**
 * Get user reputation data with caching.
 */
export async function getReputation(userId: string) {
  const cacheKey = `doctrine:rep:${userId}`;
  const cached = apiCache.get<Awaited<ReturnType<typeof fetchReputation>>>(cacheKey);
  if (cached) return cached;

  const result = await fetchReputation(userId);
  apiCache.set(cacheKey, result, 60_000); // 1 minute TTL
  return result;
}

async function fetchReputation(userId: string) {
  const rep = await prisma.doctrineReputation.findUnique({
    where: { userId },
  });

  if (!rep) {
    return {
      totalXp: 0,
      currentStreak: 0,
      longestStreak: 0,
      lastActiveAt: new Date(),
      coalitionScore: 1.0,
      sahurCount: 0,
      rank: RANKS[0],
    };
  }

  return {
    totalXp: rep.totalXp,
    currentStreak: rep.currentStreak,
    longestStreak: rep.longestStreak,
    lastActiveAt: rep.lastActiveAt,
    coalitionScore: rep.coalitionScore,
    sahurCount: rep.sahurCount,
    rank: getRank(rep.totalXp),
  };
}

/**
 * Update streak for puzzle completion.
 */
export async function updateStreak(userId: string): Promise<number> {
  const rep = await prisma.doctrineReputation.findUnique({
    where: { userId },
  });

  if (!rep) return 0;

  const now = new Date();
  const lastActive = new Date(rep.lastActiveAt);
  const diffDays = Math.floor((now.getTime() - lastActive.getTime()) / 86_400_000);

  let newStreak: number;
  if (diffDays <= 1) {
    // Continue streak (same day or next day)
    newStreak = rep.currentStreak + 1;
  } else {
    // Streak broken
    newStreak = 1;
  }

  const longestStreak = Math.max(rep.longestStreak, newStreak);

  await prisma.doctrineReputation.update({
    where: { userId },
    data: {
      currentStreak: newStreak,
      longestStreak,
      lastActiveAt: now,
    },
  });

  apiCache.invalidate(`doctrine:rep:${userId}`);
  return newStreak;
}

/**
 * Get the reputation leaderboard.
 */
export async function getReputationLeaderboard(limit = 50) {
  const cacheKey = `doctrine:leaderboard:rep:${limit}`;
  const cached = apiCache.get<Awaited<ReturnType<typeof fetchLeaderboard>>>(cacheKey);
  if (cached) return cached;

  const result = await fetchLeaderboard(limit);
  apiCache.set(cacheKey, result, 30_000); // 30s TTL
  return result;
}

async function fetchLeaderboard(limit: number) {
  const entries = await prisma.doctrineReputation.findMany({
    take: limit,
    orderBy: { totalXp: 'desc' },
    include: {
      user: {
        select: { id: true, name: true, handle: true, image: true },
      },
    },
  });

  return entries.map((entry, index) => ({
    rank: index + 1,
    userId: entry.userId,
    user: entry.user,
    totalXp: entry.totalXp,
    currentStreak: entry.currentStreak,
    level: getRank(entry.totalXp),
  }));
}

/**
 * Calculate coalition multiplier based on how many RMH products a user is active in.
 */
export async function calculateCoalitionScore(userId: string): Promise<number> {
  const [hasAltair, hasPuzzles, hasSliceIt, hasRmhbox, hasSafehouse] = await Promise.all([
    prisma.altairPlayer.findUnique({ where: { userId }, select: { id: true } }),
    prisma.dailyPuzzleScore.findFirst({ where: { userId }, select: { id: true } }),
    prisma.player.findFirst({ where: { userId }, select: { id: true } }),
    prisma.rMHboxProfile.findUnique({ where: { userId }, select: { id: true } }),
    prisma.doctrineAccessLog.findFirst({ where: { userId }, select: { id: true } }),
  ]);

  const activeProducts = [hasAltair, hasPuzzles, hasSliceIt, hasRmhbox, hasSafehouse]
    .filter(Boolean).length;

  // 1.0x base, +0.15x per additional product, max 2.0x
  return Math.min(2.0, 1.0 + (activeProducts - 1) * 0.15);
}
