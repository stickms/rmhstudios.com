import { prisma } from '@/lib/prisma.server';
import { levelInfo } from '@/lib/xp/levels';
import { getActiveQuests } from '@/lib/quests/engine.server';
import { CURRENT_SEASON, tierForXp } from '@/lib/battlepass/season';

/**
 * The signed-in user's level, coins, active quests, and season summary. Shared
 * by the `/api/progress` GET handler (and available to a route loader) so the
 * progress view can be server-rendered / prefetched instead of fetched
 * client-side on mount.
 */
export async function getProgressSummary(userId: string) {
  const [profile, seasonProgress, quests] = await Promise.all([
    prisma.userProfile.findUnique({ where: { userId }, select: { xp: true, coins: true } }),
    prisma.userSeasonProgress.findUnique({
      where: { userId_seasonId: { userId, seasonId: CURRENT_SEASON.id } },
      select: { seasonXp: true, premium: true },
    }),
    getActiveQuests(userId),
  ]);

  const seasonXp = seasonProgress?.seasonXp ?? 0;
  return {
    level: levelInfo(profile?.xp ?? 0),
    coins: profile?.coins ?? 0,
    quests,
    season: {
      id: CURRENT_SEASON.id,
      name: CURRENT_SEASON.name,
      endsAt: CURRENT_SEASON.endsAt,
      seasonXp,
      tier: tierForXp(seasonXp),
      maxTier: CURRENT_SEASON.tiers.length,
      premium: seasonProgress?.premium ?? false,
    },
  };
}
