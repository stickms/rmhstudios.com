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

import { notice } from '@/lib/notifications/notice-keys';
import { prisma } from '@/lib/prisma.server';
import { creditCoins } from '@/lib/economy/ledger.server';
import { getAchievement } from '@/lib/achievements/catalog';
import { createNotification } from '@/lib/notifications.server';
import { maybeRewardReferral } from '@/lib/referrals.server';
import { onProgress } from '@/lib/achievements/tracking.server';
import { emitAchievementUnlocked } from '@/lib/webhooks/game-emit.server';

async function rewardUnlock(userId: string, achievementId: string, name: string, coinReward: number) {
  // Both callers reach here only after winning the `unlockedAt: null` claim, so this fires once per unlock.
  void emitAchievementUnlocked(userId, { achievementId, name, group: getAchievement(achievementId)?.group });
  if (coinReward > 0) {
    await creditCoins(userId, coinReward, {
      type: 'REWARD',
      entityType: 'achievement',
      entityId: achievementId,
      note: name,
    }).catch((e) => console.error('[achievements] coin reward failed:', e));
  }
  await createNotification({
    userId,
    type: 'SYSTEM',
    entityType: 'achievement',
    entityId: achievementId,
    preview:
      coinReward > 0
        ? notice('achievement-unlocked-coins', { name, coins: coinReward })
        : notice('achievement-unlocked', { name }),
    link: '/progress?tab=achievements',
  });
  // A first unlock marks a referred account as genuinely active — pay out the
  // mutual referral reward (no-op if the user wasn't referred / already paid).
  void maybeRewardReferral(userId);
}

/** Unlock a one-shot achievement if not already unlocked. Returns true if newly unlocked. */
export async function grantAchievement(userId: string, achievementId: string): Promise<boolean> {
  const def = getAchievement(achievementId);
  if (!def) return false;
  try {
    // Ensure the row exists (still locked), then atomically claim the unlock.
    // Gating `rewardUnlock` on the count of the null→now transition means two
    // concurrent grants can't both observe `unlockedAt: null` and each pay the
    // coin reward — only the request that actually flips the row rewards.
    await prisma.userAchievement.upsert({
      where: { userId_achievementId: { userId, achievementId } },
      create: { userId, achievementId, progress: def.target, unlockedAt: null },
      update: {},
    });
    const claim = await prisma.userAchievement.updateMany({
      where: { userId, achievementId, unlockedAt: null },
      data: { progress: def.target, unlockedAt: new Date() },
    });
    if (claim.count === 0) return false;

    // An unlocked achievement is no longer tracked. (`onProgress` never throws.)
    await onProgress(userId, achievementId, 0, def.target);
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
    // Ensure the row exists (still locked), then advance progress atomically.
    // The upsert returns the row as it was before this change: the milestone check's `prev`.
    const before = await prisma.userAchievement.upsert({
      where: { userId_achievementId: { userId, achievementId } },
      create: { userId, achievementId, progress: 0, unlockedAt: null },
      update: {},
      select: { progress: true },
    });

    // Apply the progress change only while still locked. `increment` avoids the
    // read-modify-write race on the `by` path; `setProgress` is an absolute value.
    const applied = await prisma.userAchievement.updateMany({
      where: { userId, achievementId, unlockedAt: null },
      data: opts.setProgress !== undefined ? { progress: opts.setProgress } : { progress: { increment: opts.by ?? 1 } },
    });
    if (applied.count === 0) return false; // already unlocked

    const row = await prisma.userAchievement.findUnique({
      where: { userId_achievementId: { userId, achievementId } },
      select: { progress: true },
    });
    const next = row?.progress ?? 0;
    // Milestone notices, and the end of tracking on unlock; an untracked achievement costs one lookup here.
    await onProgress(userId, achievementId, before.progress, next);
    if (next < def.target) return false;

    // Atomically claim the unlock so the reward is paid exactly once.
    const claim = await prisma.userAchievement.updateMany({
      where: { userId, achievementId, unlockedAt: null },
      data: { unlockedAt: new Date() },
    });
    if (claim.count === 0) return false;

    await rewardUnlock(userId, achievementId, def.name, def.coinReward);
    return true;
  } catch (err) {
    console.error('[achievements] progress failed:', err);
    return false;
  }
}
