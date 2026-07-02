/**
 * First-run onboarding checklist. Steps are verified against real data on
 * the server — the client can't self-report its way to the reward (except
 * the theme step, which only exists client-side and is low stakes).
 */

import { prisma } from '@/lib/prisma.server';
import { awardCoins } from '@/lib/coins.server';
import { createNotification } from '@/lib/notifications.server';

export const ONBOARDING_REWARD = 100;
export const FOLLOW_TARGET = 3;

export interface OnboardingStatus {
  claimed: boolean;
  accountCreatedAt: string;
  steps: {
    posted: boolean;
    follows: number;
    followTarget: number;
    checkedIn: boolean;
  };
}

export async function getOnboardingStatus(userId: string): Promise<OnboardingStatus | null> {
  const [user, profile, postCount, followCount, streak] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true } }),
    prisma.userProfile.findUnique({ where: { userId }, select: { onboardingRewardedAt: true } }),
    prisma.rMHark.count({ where: { userId, deletedAt: null } }),
    prisma.follow.count({ where: { followerId: userId } }),
    prisma.dailyStreak.findUnique({ where: { userId }, select: { totalCheckIns: true } }),
  ]);
  if (!user) return null;
  return {
    claimed: !!profile?.onboardingRewardedAt,
    accountCreatedAt: user.createdAt.toISOString(),
    steps: {
      posted: postCount > 0,
      follows: Math.min(followCount, FOLLOW_TARGET),
      followTarget: FOLLOW_TARGET,
      checkedIn: (streak?.totalCheckIns ?? 0) > 0,
    },
  };
}

export type OnboardingClaimResult = 'claimed' | 'incomplete' | 'already-claimed';

export async function claimOnboardingReward(userId: string): Promise<OnboardingClaimResult> {
  const status = await getOnboardingStatus(userId);
  if (!status) return 'incomplete';
  if (status.claimed) return 'already-claimed';
  const { posted, follows, followTarget, checkedIn } = status.steps;
  if (!posted || follows < followTarget || !checkedIn) return 'incomplete';

  // Atomic guard: only one concurrent claim can flip the timestamp.
  const { count } = await prisma.userProfile.updateMany({
    where: { userId, onboardingRewardedAt: null },
    data: { onboardingRewardedAt: new Date() },
  });
  if (count === 0) {
    // Either already claimed, or the profile row doesn't exist yet — create it
    // claimed-and-rewarded in one step for brand-new accounts.
    const created = await prisma.userProfile
      .createMany({
        data: [{ userId, onboardingRewardedAt: new Date() }],
        skipDuplicates: true,
      })
      .catch(() => ({ count: 0 }));
    if (created.count === 0) return 'already-claimed';
  }

  await awardCoins(userId, ONBOARDING_REWARD, {
    note: 'Onboarding checklist complete — welcome aboard!',
    entityType: 'onboarding',
  });
  await createNotification({
    userId,
    type: 'SYSTEM',
    entityType: 'coins',
    preview: `Checklist complete! +${ONBOARDING_REWARD} coins. Welcome to RMH Studios 🎉`,
    link: '/wallet',
  });
  return 'claimed';
}
