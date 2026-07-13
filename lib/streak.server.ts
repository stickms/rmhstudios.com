/**
 * Daily check-in streak.
 *
 * A user "checks in" once per calendar day (UTC). Consecutive days grow the
 * streak; a missed day resets it — unless the user holds streak freezes
 * (`DailyStreak.freezeTokens`, bought with coins), which are consumed
 * automatically to bridge missed days. Each new day's first check-in grants
 * coins that scale slightly with the streak length, and unlocks streak
 * achievements.
 */

import { prisma } from '@/lib/prisma.server';
import { grantAchievement } from '@/lib/achievements/engine.server';
import { awardXp } from '@/lib/xp/engine.server';
import { progressQuests } from '@/lib/quests/engine.server';

/** Coins to buy one streak freeze, and the most a user can hold at once. */
export const FREEZE_COST = 150;
export const MAX_FREEZE_TOKENS = 3;

export function todayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

/** Whole days from date-key `a` to date-key `b` (b later ⇒ positive). */
function daysBetween(a: string, b: string): number {
  const da = new Date(`${a}T00:00:00Z`).getTime();
  const db = new Date(`${b}T00:00:00Z`).getTime();
  return Math.round((db - da) / 86_400_000);
}

/** Coins for today's check-in: base 5, +2 per week of streak, capped at 25. */
function rewardFor(streak: number): number {
  return Math.min(25, 5 + Math.floor((streak - 1) / 7) * 2);
}

export interface StreakState {
  current: number;
  longest: number;
  totalCheckIns: number;
  checkedInToday: boolean;
  reward: number; // coins granted by this call (0 if already checked in)
  freezeTokens: number;
  /** Freeze tokens consumed by this check-in to bridge missed days. */
  freezeUsed: number;
}

export async function getStreak(userId: string): Promise<StreakState> {
  const s = await prisma.dailyStreak.findUnique({ where: { userId } });
  const today = todayKey();
  // The visible streak survives if the last check-in was today/yesterday, or
  // if the user holds enough freezes to bridge the gap at the next check-in.
  let current = 0;
  if (s?.lastDateKey) {
    const gap = daysBetween(s.lastDateKey, today);
    if (gap <= 1 || gap - 1 <= s.freezeTokens) current = s.current;
  }
  return {
    current,
    longest: s?.longest ?? 0,
    totalCheckIns: s?.totalCheckIns ?? 0,
    checkedInToday: s?.lastDateKey === today,
    reward: 0,
    freezeTokens: s?.freezeTokens ?? 0,
    freezeUsed: 0,
  };
}

/** Record a check-in for today. Idempotent within a day. */
export async function checkIn(userId: string): Promise<StreakState> {
  const today = todayKey();
  const existing = await prisma.dailyStreak.findUnique({ where: { userId } });

  if (existing?.lastDateKey === today) {
    return {
      current: existing.current,
      longest: existing.longest,
      totalCheckIns: existing.totalCheckIns,
      checkedInToday: true,
      reward: 0,
      freezeTokens: existing.freezeTokens,
      freezeUsed: 0,
    };
  }

  // Continue on a 1-day gap; bridge longer gaps by consuming one freeze per
  // fully missed day; otherwise the streak starts over.
  let current = 1;
  let freezeUsed = 0;
  if (existing?.lastDateKey) {
    const gap = daysBetween(existing.lastDateKey, today);
    if (gap === 1) {
      current = existing.current + 1;
    } else if (gap > 1 && gap - 1 <= existing.freezeTokens) {
      freezeUsed = gap - 1;
      current = existing.current + 1;
    }
  }
  const longest = Math.max(existing?.longest ?? 0, current);
  const reward = rewardFor(current);

  const claimed = await prisma.$transaction(async (tx) => {
    // Ensure a row exists WITHOUT recording today's check-in (neutral lastDateKey),
    // so the atomic claim below is what actually books the day and its reward.
    await tx.dailyStreak.upsert({
      where: { userId },
      create: { userId, current: 0, longest: 0, totalCheckIns: 0, lastCheckIn: new Date(), lastDateKey: '' },
      update: {},
    });
    // Atomic once-per-day claim: apply the check-in only if today isn't already
    // recorded. Concurrent check-ins race on this row; the loser gets count 0 and
    // no coin reward, closing the streak double-claim.
    const applied = await tx.dailyStreak.updateMany({
      where: { userId, NOT: { lastDateKey: today } },
      data: {
        current,
        longest,
        totalCheckIns: { increment: 1 },
        lastCheckIn: new Date(),
        lastDateKey: today,
        ...(freezeUsed > 0 ? { freezeTokens: { decrement: freezeUsed } } : {}),
      },
    });
    if (applied.count === 0) return false;
    await tx.userProfile.upsert({
      where: { userId },
      create: { userId, coins: 10 + reward },
      update: { coins: { increment: reward } },
    });
    return true;
  });

  if (!claimed) {
    // A concurrent request already booked today's check-in — return current state
    // with no additional reward.
    const s = await prisma.dailyStreak.findUnique({ where: { userId } });
    return {
      current: s?.current ?? current,
      longest: s?.longest ?? longest,
      totalCheckIns: s?.totalCheckIns ?? (existing?.totalCheckIns ?? 0) + 1,
      checkedInToday: true,
      reward: 0,
      freezeTokens: s?.freezeTokens ?? 0,
      freezeUsed: 0,
    };
  }

  // Streak milestone achievements (best-effort).
  if (current >= 7) await grantAchievement(userId, 'special.streak_7');
  if (current >= 30) await grantAchievement(userId, 'special.streak_30');

  // Progression: XP + daily check-in quest.
  await awardXp(userId, 20);
  await progressQuests(userId, 'checkin');

  return {
    current,
    longest,
    totalCheckIns: (existing?.totalCheckIns ?? 0) + 1,
    checkedInToday: true,
    reward,
    freezeTokens: Math.max(0, (existing?.freezeTokens ?? 0) - freezeUsed),
    freezeUsed,
  };
}

/**
 * Buy one streak freeze for coins. Throws 'INSUFFICIENT_COINS' or
 * 'MAX_FREEZES' — callers map these to 400 responses.
 */
export async function buyFreeze(
  userId: string
): Promise<{ freezeTokens: number; newBalance: number }> {
  return prisma.$transaction(async (tx) => {
    const streak = await tx.dailyStreak.findUnique({
      where: { userId },
      select: { freezeTokens: true },
    });
    if ((streak?.freezeTokens ?? 0) >= MAX_FREEZE_TOKENS) throw new Error('MAX_FREEZES');

    const profile = await tx.userProfile.upsert({
      where: { userId },
      create: { userId, coins: 10 },
      update: {},
      select: { coins: true },
    });
    if (profile.coins < FREEZE_COST) throw new Error('INSUFFICIENT_COINS');

    const updatedProfile = await tx.userProfile.update({
      where: { userId },
      data: { coins: { decrement: FREEZE_COST } },
      select: { coins: true },
    });
    const updated = await tx.dailyStreak.upsert({
      where: { userId },
      create: { userId, freezeTokens: 1 },
      update: { freezeTokens: { increment: 1 } },
      select: { freezeTokens: true },
    });
    await tx.coinTransaction.create({
      data: {
        recipientId: userId,
        amount: -FREEZE_COST,
        type: 'PURCHASE',
        entityType: 'streak-freeze',
        note: 'Streak freeze',
      },
    });
    return { freezeTokens: updated.freezeTokens, newBalance: updatedProfile.coins };
  });
}
