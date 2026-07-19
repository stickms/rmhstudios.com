/**
 * First-run onboarding checklist. Steps are verified against real data on
 * the server — the client can't self-report its way to the reward (except
 * the theme step, which only exists client-side and is low stakes).
 */

import type { ShopItemKind } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { awardCoins } from '@/lib/coins.server';
import { createNotification } from '@/lib/notifications.server';
import { QUESTS } from '@/lib/quests/catalog';
import {
  FIRST_WEEK_STEPS,
  FIRST_WEEK_PERIOD_KEY,
  firstWeekQuestId,
  type FirstWeekStep,
} from '@/lib/quests/onboarding';

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

// ─── Onboarding v2 — the "First Week" arc (§12) ─────────────────────────────
//
// Extends the day-0 checklist above into a seven-day arc across the platform's
// pillars. Steps are defined purely in `lib/quests/onboarding.ts`; here we
// server-verify each against real data (same philosophy as v1) and grant its
// small coin reward lazily-but-idempotently via a `UserQuest` bookkeeping row.
// Finishing every step unlocks a one-time graduation: a coin bonus + a starter
// cosmetic pack.

/** Coin bonus paid once when the whole arc is completed. */
export const FIRST_WEEK_GRADUATION_REWARD = 100;

/**
 * Starter cosmetic pack granted on graduation (design §12: "badge + frame").
 *
 * NOTE for the integrator: these ids are NOT yet in `lib/shop/catalog.ts`. Add a
 * non-purchasable `badge.newcomer` (BADGE) and `frame.starter` (AVATAR_FRAME)
 * there so they render/equip — they're intentionally untradable graduation-only
 * cosmetics, so keep them out of the buyable shop grid.
 */
export const FIRST_WEEK_STARTER_PACK: { itemId: string; kind: ShopItemKind }[] = [
  { itemId: 'badge.newcomer', kind: 'BADGE' },
  { itemId: 'frame.starter', kind: 'AVATAR_FRAME' },
];

// The canonical "played a game" signal in this codebase is the game-play quest
// rows written by `recordGamePlay`. Derive their ids from the catalog so this
// stays correct if the quest set changes.
const GAME_PLAY_QUEST_IDS = QUESTS.filter((q) => q.type === 'game_play').map((q) => q.id);

export interface FirstWeekStepStatus {
  id: string;
  day: number;
  title: string;
  description: string;
  coins: number;
  href: string;
  done: boolean;
  available: boolean;
}

export interface FirstWeekStatus {
  steps: FirstWeekStepStatus[];
  graduated: boolean;
  allDone: boolean;
  accountCreatedAt: string;
  graduationReward: number;
}

/**
 * Grant the per-step coin reward for each freshly-completed step. Idempotent:
 * a `UserQuest` row (`fw.<stepId>` / periodKey 'onboarding') is created with
 * `skipDuplicates`, so the unique `(userId, questId, periodKey)` constraint lets
 * only the first observation of a done step actually award coins — concurrent
 * status fetches can't double-grant. Best-effort; never throws.
 */
async function grantDueStepCoins(userId: string, doneStepIds: Set<string>): Promise<void> {
  if (doneStepIds.size === 0) return;
  try {
    const questIds = [...doneStepIds].map(firstWeekQuestId);
    const existing = await prisma.userQuest.findMany({
      where: { userId, periodKey: FIRST_WEEK_PERIOD_KEY, questId: { in: questIds } },
      select: { questId: true },
    });
    const already = new Set(existing.map((r) => r.questId));

    for (const step of FIRST_WEEK_STEPS) {
      if (!doneStepIds.has(step.id)) continue;
      const questId = firstWeekQuestId(step.id);
      if (already.has(questId)) continue;
      const created = await prisma.userQuest.createMany({
        data: [
          {
            userId,
            questId,
            periodKey: FIRST_WEEK_PERIOD_KEY,
            progress: 1,
            completed: true,
            claimed: true,
          },
        ],
        skipDuplicates: true,
      });
      if (created.count > 0) {
        await awardCoins(userId, step.coins, {
          type: 'REWARD',
          note: `First Week: ${step.title}`,
          entityType: 'onboarding-first-week',
          entityId: step.id,
        });
      }
    }
  } catch (err) {
    console.error('[onboarding] first-week step grant failed:', err);
  }
}

/**
 * Server-verified First Week status. Each step is checked against a real fact
 * (a game play, a wheel spin, a community join, a puzzle score, a profile edit,
 * a sent DM, a check-in). Steps unlock day-by-day. Side effect: lazily grants
 * per-step coin rewards for any step now detected done (idempotent).
 */
export async function getFirstWeekStatus(userId: string): Promise<FirstWeekStatus | null> {
  const [user, profile, gamePlayed, wheelSpins, communities, puzzles, dms, streak] =
    await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true } }),
      prisma.userProfile.findUnique({
        where: { userId },
        select: {
          firstWeekRewardedAt: true,
          bio: true,
          displayName: true,
          customImage: true,
          bannerUrl: true,
        },
      }),
      GAME_PLAY_QUEST_IDS.length
        ? prisma.userQuest.count({
            where: { userId, questId: { in: GAME_PLAY_QUEST_IDS }, progress: { gt: 0 } },
          })
        : Promise.resolve(0),
      prisma.dailyWheelSpin.count({ where: { userId } }),
      prisma.communityMember.count({ where: { userId } }),
      prisma.dailyPuzzleScore.count({ where: { userId } }),
      prisma.directMessage.count({ where: { senderId: userId } }),
      prisma.dailyStreak.findUnique({ where: { userId }, select: { totalCheckIns: true } }),
    ]);
  if (!user) return null;

  const profileCustomized = Boolean(
    profile &&
      (profile.bio?.trim() ||
        profile.displayName?.trim() ||
        profile.customImage ||
        profile.bannerUrl),
  );

  const doneById: Record<string, boolean> = {
    play_game: gamePlayed > 0,
    spin_wheel: wheelSpins > 0,
    join_community: communities > 0,
    daily_puzzle: puzzles > 0,
    customize_profile: profileCustomized,
    send_dm: dms > 0,
    daily_checkin: (streak?.totalCheckIns ?? 0) > 0,
  };

  const ageDays = (Date.now() - user.createdAt.getTime()) / 86_400_000;

  // A step is available once its day arrives OR every earlier step is done —
  // prevents a day-0 speedrun while keeping momentum for eager users.
  let prevDone = true;
  const steps: FirstWeekStepStatus[] = FIRST_WEEK_STEPS.map((step: FirstWeekStep) => {
    const done = doneById[step.id] ?? false;
    const available = ageDays >= step.day || prevDone;
    prevDone = prevDone && done;
    return {
      id: step.id,
      day: step.day,
      title: step.title,
      description: step.description,
      coins: step.coins,
      href: step.href,
      done,
      available,
    };
  });

  const allDone = steps.every((s) => s.done);

  // Award coins for any step now detected done (idempotent, best-effort).
  await grantDueStepCoins(
    userId,
    new Set(steps.filter((s) => s.done).map((s) => s.id)),
  );

  return {
    steps,
    graduated: Boolean(profile?.firstWeekRewardedAt),
    allDone,
    accountCreatedAt: user.createdAt.toISOString(),
    graduationReward: FIRST_WEEK_GRADUATION_REWARD,
  };
}

export type FirstWeekGraduationResult =
  | 'graduated'
  | 'incomplete'
  | 'already-graduated'
  | 'not-found';

/**
 * Complete the First Week arc: award the graduation coin bonus and grant the
 * starter cosmetic pack, exactly once. The `firstWeekRewardedAt` flip is the
 * atomic double-claim guard (mirrors `claimOnboardingReward`).
 */
export async function claimFirstWeekGraduation(
  userId: string,
): Promise<FirstWeekGraduationResult> {
  const status = await getFirstWeekStatus(userId);
  if (!status) return 'not-found';
  if (status.graduated) return 'already-graduated';
  if (!status.allDone) return 'incomplete';

  // Atomic guard: only one concurrent claim can flip the timestamp.
  const { count } = await prisma.userProfile.updateMany({
    where: { userId, firstWeekRewardedAt: null },
    data: { firstWeekRewardedAt: new Date() },
  });
  if (count === 0) {
    // No row flipped — either already graduated, or no profile row yet.
    const created = await prisma.userProfile
      .createMany({ data: [{ userId, firstWeekRewardedAt: new Date() }], skipDuplicates: true })
      .catch(() => ({ count: 0 }));
    if (created.count === 0) return 'already-graduated';
  }

  // Grant the starter cosmetic pack — idempotent via unique (userId, itemId).
  await prisma.userInventory
    .createMany({
      data: FIRST_WEEK_STARTER_PACK.map((item) => ({
        userId,
        itemId: item.itemId,
        kind: item.kind,
      })),
      skipDuplicates: true,
    })
    .catch((err) => console.error('[onboarding] starter pack grant failed:', err));

  await awardCoins(userId, FIRST_WEEK_GRADUATION_REWARD, {
    type: 'REWARD',
    note: 'First Week complete — you graduated! 🎓',
    entityType: 'onboarding-first-week',
    entityId: 'graduation',
  });

  await createNotification({
    userId,
    type: 'SYSTEM',
    entityType: 'coins',
    preview: `First Week complete! +${FIRST_WEEK_GRADUATION_REWARD} coins and a starter cosmetic pack 🎉`,
    link: '/wallet',
  });

  return 'graduated';
}
