/**
 * XP awarding (server-side, best-effort). Increments lifetime XP (drives account
 * level) and the current season's XP (drives the battle pass), fires a level-up
 * notification, and unlocks level-milestone achievements.
 */

import { prisma } from '@/lib/prisma.server';
import { levelFromXp } from '@/lib/xp/levels';
import { CURRENT_SEASON } from '@/lib/battlepass/season';
import { createNotification } from '@/lib/notifications.server';
import { grantAchievement } from '@/lib/achievements/engine.server';

/** Award XP to a user. Returns the new lifetime XP, or null on failure. */
export async function awardXp(userId: string, amount: number): Promise<number | null> {
  if (amount <= 0) return null;
  try {
    // The lifetime-XP upsert and the season-XP upsert touch different rows in
    // different tables with no data dependency, so run them together. The upsert
    // returns the post-increment xp; since it always increments by exactly
    // `amount` (and the create path sets xp: amount), the pre-increment xp is
    // `profile.xp - amount` — so the level-up check needs no separate pre-read.
    const [profile] = await Promise.all([
      prisma.userProfile.upsert({
        where: { userId },
        create: { userId, coins: 10, xp: amount },
        update: { xp: { increment: amount } },
        select: { xp: true },
      }),
      // Mirror into the current season's progress for the battle pass.
      prisma.userSeasonProgress.upsert({
        where: { userId_seasonId: { userId, seasonId: CURRENT_SEASON.id } },
        create: { userId, seasonId: CURRENT_SEASON.id, seasonXp: amount },
        update: { seasonXp: { increment: amount } },
      }),
    ]);

    const beforeLevel = levelFromXp(profile.xp - amount);
    const afterLevel = levelFromXp(profile.xp);
    if (afterLevel > beforeLevel) {
      await createNotification({
        userId,
        type: 'SYSTEM',
        entityType: 'level',
        entityId: String(afterLevel),
        preview: `You reached level ${afterLevel}!`,
        link: '/progress',
      });
      if (afterLevel >= 10) await grantAchievement(userId, 'special.level_10');
      if (afterLevel >= 25) await grantAchievement(userId, 'special.level_25');
      if (afterLevel >= 50) await grantAchievement(userId, 'special.level_50');
    }
    return profile.xp;
  } catch (err) {
    console.error('[xp] awardXp failed:', err);
    return null;
  }
}
