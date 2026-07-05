import { prisma } from '@/lib/prisma.server';
import { ACHIEVEMENTS, type AchievementCategory, type AchievementTier } from '@/lib/achievements/catalog';

export interface AchievementView {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: AchievementCategory;
  tier: AchievementTier;
  group: string | null;
  target: number;
  coinReward: number;
  secret: boolean;
  unlocked: boolean;
  unlockedAt: string | null;
  progress: number;
}

export interface AchievementsPayload {
  stats: { unlocked: number; total: number; coinsEarned: number };
  achievements: AchievementView[];
}

/**
 * A user's achievement progress merged with the full catalog. `idOrHandle` may
 * be an id or a handle. Secret achievements that are not yet unlocked are
 * returned masked. Shared by the `/api/achievements/$userId` GET handler and the
 * `/achievements` route loader so the page is server-rendered / prefetched
 * instead of fetched client-side on mount. Returns `null` when no such user
 * exists (the caller maps that to a 404 / not-found state).
 */
export async function listAchievements(idOrHandle: string): Promise<AchievementsPayload | null> {
  const resolved = await prisma.user.findFirst({
    where: { OR: [{ id: idOrHandle }, { handle: idOrHandle }] },
    select: { id: true },
  });
  if (!resolved) return null;

  const rows = await prisma.userAchievement.findMany({
    where: { userId: resolved.id },
    select: { achievementId: true, progress: true, unlockedAt: true },
  });
  const byId = new Map(rows.map((r) => [r.achievementId, r]));

  let unlockedCount = 0;
  let coinsEarned = 0;
  const achievements: AchievementView[] = ACHIEVEMENTS.map((def) => {
    const row = byId.get(def.id);
    const unlocked = !!row?.unlockedAt;
    if (unlocked) {
      unlockedCount++;
      coinsEarned += def.coinReward;
    }
    const masked = def.secret && !unlocked;
    return {
      id: def.id,
      name: masked ? '???' : def.name,
      description: masked ? 'Hidden achievement' : def.description,
      icon: masked ? '❓' : def.icon,
      category: def.category,
      tier: def.tier,
      group: def.group ?? null,
      target: def.target,
      coinReward: def.coinReward,
      secret: !!def.secret,
      unlocked,
      unlockedAt: row?.unlockedAt?.toISOString() ?? null,
      progress: Math.min(row?.progress ?? 0, def.target),
    };
  });

  return {
    stats: { unlocked: unlockedCount, total: ACHIEVEMENTS.length, coinsEarned },
    achievements,
  };
}
