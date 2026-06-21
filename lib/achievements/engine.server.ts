/**
 * Achievement unlock engine (server-side, best-effort).
 *
 * `grantAchievement` — one-shot unlock.
 * `progressAchievement` — increment toward an incremental target, unlocking when
 * it's reached.
 *
 * On unlock we award the achievement's coin reward (into UserProfile.coins) and
 * drop a SYSTEM notification. Every call is wrapped so a failure can never break
 * the gameplay/social action that triggered it.
 */

import { prisma } from '@/lib/prisma.server';
import { getAchievement } from '@/lib/achievements/catalog';
import { createNotification } from '@/lib/notifications.server';

async function rewardUnlock(userId: string, achievementId: string, name: string, coinReward: number) {
  if (coinReward > 0) {
    await prisma.userProfile
      .upsert({
        where: { userId },
        create: { userId, coins: 10 + coinReward },
        update: { coins: { increment: coinReward } },
        select: { userId: true },
      })
      .catch((e) => console.error('[achievements] coin reward failed:', e));
  }
  await createNotification({
    userId,
    type: 'SYSTEM',
    entityType: 'achievement',
    entityId: achievementId,
    preview: `Achievement unlocked: ${name}${coinReward > 0 ? ` (+${coinReward} coins)` : ''}`,
    link: '/achievements',
  });
}

/** Unlock a one-shot achievement if not already unlocked. Returns true if newly unlocked. */
export async function grantAchievement(userId: string, achievementId: string): Promise<boolean> {
  const def = getAchievement(achievementId);
  if (!def) return false;
  try {
    const existing = await prisma.userAchievement.findUnique({
      where: { userId_achievementId: { userId, achievementId } },
      select: { unlockedAt: true },
    });
    if (existing?.unlockedAt) return false;

    await prisma.userAchievement.upsert({
      where: { userId_achievementId: { userId, achievementId } },
      create: { userId, achievementId, progress: def.target, unlockedAt: new Date() },
      update: { progress: def.target, unlockedAt: new Date() },
    });
    await rewardUnlock(userId, achievementId, def.name, def.coinReward);
    return true;
  } catch (err) {
    console.error('[achievements] grant failed:', err);
    return false;
  }
}

/**
 * Add `by` to an incremental achievement's progress, unlocking when the target
 * is reached. Pass `setProgress` to set an absolute value instead (e.g. when the
 * count is already known, like a follower total). Returns true if newly unlocked.
 */
export async function progressAchievement(
  userId: string,
  achievementId: string,
  opts: { by?: number; setProgress?: number } = {}
): Promise<boolean> {
  const def = getAchievement(achievementId);
  if (!def) return false;
  try {
    const existing = await prisma.userAchievement.findUnique({
      where: { userId_achievementId: { userId, achievementId } },
      select: { progress: true, unlockedAt: true },
    });
    if (existing?.unlockedAt) return false;

    const next =
      opts.setProgress !== undefined
        ? opts.setProgress
        : (existing?.progress ?? 0) + (opts.by ?? 1);
    const unlocked = next >= def.target;

    await prisma.userAchievement.upsert({
      where: { userId_achievementId: { userId, achievementId } },
      create: { userId, achievementId, progress: next, unlockedAt: unlocked ? new Date() : null },
      update: { progress: next, ...(unlocked ? { unlockedAt: new Date() } : {}) },
    });

    if (unlocked) {
      await rewardUnlock(userId, achievementId, def.name, def.coinReward);
      return true;
    }
    return false;
  } catch (err) {
    console.error('[achievements] progress failed:', err);
    return false;
  }
}
