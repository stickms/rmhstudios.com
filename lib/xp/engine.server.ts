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
    const before = await prisma.userProfile.findUnique({ where: { userId }, select: { xp: true } });
    const beforeXp = before?.xp ?? 0;
    const beforeLevel = levelFromXp(beforeXp);

    const profile = await prisma.userProfile.upsert({
      where: { userId },
      create: { userId, coins: 10, xp: amount },
      update: { xp: { increment: amount } },
      select: { xp: true },
    });

    // Mirror into the current season's progress for the battle pass.
    await prisma.userSeasonProgress.upsert({
      where: { userId_seasonId: { userId, seasonId: CURRENT_SEASON.id } },
      create: { userId, seasonId: CURRENT_SEASON.id, seasonXp: amount },
      update: { seasonXp: { increment: amount } },
    });

    // Aggregate into the user's clan (if any) for the clan leaderboard.
    try {
      const membership = await prisma.clanMember.findUnique({
        where: { userId },
        select: { id: true, clanId: true },
      });
      if (membership) {
        await prisma.$transaction([
          prisma.clanMember.update({ where: { id: membership.id }, data: { contributedXp: { increment: amount } } }),
          prisma.clan.update({ where: { id: membership.clanId }, data: { totalXp: { increment: amount } } }),
        ]);
      }
    } catch {
      // best-effort: never let clan aggregation break XP awards
    }

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
