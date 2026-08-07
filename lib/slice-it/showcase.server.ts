/**
 * Slice It! stats for the platform profile's showcase module (X6).
 *
 * Deliberately smaller than `player.server.ts#playerProfile` (the dedicated
 * `/slice-it/player/$handle` page's data): a showcase module renders on every
 * profile view across the whole site, not just Slice It!'s own player page, so
 * it gets one cheap query and a cache, not a `$transaction` of six.
 *
 * Server-only.
 */

import { prisma } from '@/lib/prisma.server';
import { apiCache } from '@/lib/cache';
import { DIFFICULTIES, type Difficulty } from './constants';

const CACHE_TTL_MS = 300_000;

export interface SliceItLampCounts {
  difficulty: Difficulty;
  /** Cleared, full-combo'd or perfect'd — the three nest (see `player.server.ts`). */
  cleared: number;
  fullCombo: number;
  perfect: number;
}

export interface SliceItShowcaseStats {
  skillRating: number;
  chartsCleared: number;
  /** 0–1. Null when the account has never posted an accuracy. */
  bestAccuracy: number | null;
  lampsByDifficulty: SliceItLampCounts[];
}

function cacheKey(userId: string): string {
  return `slice:showcase:${userId}`;
}

/** Drop this user's cached showcase stats — call after anything that could move them. */
export function invalidateSliceItShowcase(userId: string): void {
  apiCache.invalidate(cacheKey(userId));
}

/**
 * One grouped aggregate over `SongLeaderboard` (bucketed by difficulty and the
 * three lamp booleans — at most 4 × 2 × 2 × 2 = 32 rows back) plus one
 * single-row `Player` lookup, run in parallel. Cached for 5 minutes: a
 * showcase module is read far more often than a personal best changes.
 *
 * Returns `null` for an account that has never submitted a ranked run —
 * distinct from a zeroed-out stat block, which would read as "played and
 * failed everything".
 */
export async function sliceItShowcaseStats(userId: string): Promise<SliceItShowcaseStats | null> {
  const cached = apiCache.get<SliceItShowcaseStats | null>(cacheKey(userId));
  if (cached !== undefined) return cached;

  const [player, groups] = await Promise.all([
    prisma.player.findUnique({ where: { userId }, select: { skillRating: true } }),
    prisma.songLeaderboard.groupBy({
      by: ['difficulty', 'cleared', 'isFullCombo', 'isPerfect'],
      where: { userId },
      _count: { _all: true },
      _max: { accuracy: true },
    }),
  ]);

  if (!player && groups.length === 0) {
    apiCache.set(cacheKey(userId), null, CACHE_TTL_MS);
    return null;
  }

  const byTier = new Map<Difficulty, SliceItLampCounts>(
    DIFFICULTIES.map((difficulty) => [difficulty, { difficulty, cleared: 0, fullCombo: 0, perfect: 0 }]),
  );
  let chartsCleared = 0;
  let bestAccuracy: number | null = null;

  for (const group of groups) {
    const tier = byTier.get(group.difficulty as Difficulty);
    const count = group._count._all;
    if (tier) {
      if (group.cleared) tier.cleared += count;
      if (group.isFullCombo) tier.fullCombo += count;
      if (group.isPerfect) tier.perfect += count;
    }
    if (group.cleared) chartsCleared += count;
    if (group._max.accuracy !== null) {
      bestAccuracy = Math.max(bestAccuracy ?? 0, group._max.accuracy);
    }
  }

  const stats: SliceItShowcaseStats = {
    skillRating: player?.skillRating ?? 0,
    chartsCleared,
    bestAccuracy,
    lampsByDifficulty: [...byTier.values()],
  };
  apiCache.set(cacheKey(userId), stats, CACHE_TTL_MS);
  return stats;
}
