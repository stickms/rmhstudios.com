/**
 * The profile header's achievement strip: a user's three best unlocked badges
 * (highest tier, then most recent) plus their unlocked count.
 *
 * Pure and client-safe, so the profile route's server loader and the strip's own
 * client fallback pick the same three badges. The strip used to be fetched only
 * on the client, after hydration, and it grew the profile header by ~54px when
 * it arrived — pushing the profile's tabs and posts down on every load
 * (layout-shift audit, 2026-10-09). The loader now sends it with the page.
 */
import { TIER_ORDER, type AchievementTier } from '@/lib/achievements/catalog';

export interface StripAchievement {
  id: string;
  name: string;
  icon: string;
  tier: AchievementTier;
  unlocked: boolean;
  unlockedAt: string | null;
}

export interface AchievementStripData {
  top: StripAchievement[];
  unlocked: number;
}

export function pickAchievementStrip(payload: {
  stats: { unlocked: number };
  achievements: readonly StripAchievement[];
}): AchievementStripData {
  const top = payload.achievements
    .filter((a) => a.unlocked)
    .slice()
    .sort(
      (a, b) =>
        TIER_ORDER[b.tier] - TIER_ORDER[a.tier] ||
        new Date(b.unlockedAt ?? 0).getTime() - new Date(a.unlockedAt ?? 0).getTime(),
    )
    .slice(0, 3)
    .map(({ id, name, icon, tier, unlocked, unlockedAt }) => ({
      id,
      name,
      icon,
      tier,
      unlocked,
      unlockedAt,
    }));
  return { top, unlocked: payload.stats.unlocked };
}
