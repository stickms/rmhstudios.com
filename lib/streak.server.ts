/**
 * Daily check-in streak.
 *
 * A user "checks in" once per calendar day (UTC). Consecutive days grow the
 * streak; a missed day resets it — unless the user holds streak freezes
 * (`Streak.freezeTokens` on the user's `'daily'` row, bought with coins), which are consumed
 * automatically to bridge missed days. Each new day's first check-in grants
 * coins that scale slightly with the streak length, and unlocks streak
 * achievements.
 */

import { prisma } from '@/lib/prisma.server';
import { creditCoins, debitCoins, getBalance } from '@/lib/economy/ledger.server';
import { grantAchievement } from '@/lib/achievements/engine.server';
import { awardXp } from '@/lib/xp/engine.server';
import { progressQuests } from '@/lib/quests/engine.server';
import { dayKey, daysBetween, streakKey } from '@/lib/streaks/kinds';

/** This module's row in the one `Streak` model. */
const DAILY = 'daily' as const;
const key = (userId: string) => streakKey(userId, DAILY);

/** Coins to buy one streak freeze, and the most a user can hold at once. */
export const FREEZE_COST = 150;
export const MAX_FREEZE_TOKENS = 3;

export function todayKey(d = new Date()): string {
  return dayKey(d); // YYYY-MM-DD (UTC)
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
  const s = await prisma.streak.findUnique({ where: key(userId) });
  const today = todayKey();
  // The visible streak survives if the last check-in was today/yesterday, or
  // if the user holds enough freezes to bridge the gap at the next check-in.
  let current = 0;
  if (s?.lastDay) {
    const gap = daysBetween(s.lastDay, today);
    if (gap <= 1 || gap - 1 <= s.freezeTokens) current = s.current;
  }
  return {
    current,
    longest: s?.longest ?? 0,
    totalCheckIns: s?.totalDays ?? 0,
    checkedInToday: s?.lastDay === today,
    reward: 0,
    freezeTokens: s?.freezeTokens ?? 0,
    freezeUsed: 0,
  };
}

/** Record a check-in for today. Idempotent within a day. */
export async function checkIn(userId: string): Promise<StreakState> {
  const today = todayKey();
  const existing = await prisma.streak.findUnique({ where: key(userId) });

  if (existing?.lastDay === today) {
    return {
      current: existing.current,
      longest: existing.longest,
      totalCheckIns: existing.totalDays,
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
  if (existing?.lastDay) {
    const gap = daysBetween(existing.lastDay, today);
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
    // Ensure a row exists WITHOUT recording today's check-in (neutral lastDay),
    // so the atomic claim below is what actually books the day and its reward.
    await tx.streak.upsert({
      where: key(userId),
      create: { userId, kind: DAILY, current: 0, longest: 0, totalDays: 0, lastCheckIn: new Date(), lastDay: '' },
      update: {},
    });
    // Atomic once-per-day claim: apply the check-in only if today isn't already
    // recorded. Concurrent check-ins race on this row; the loser gets count 0 and
    // no coin reward, closing the streak double-claim.
    const applied = await tx.streak.updateMany({
      where: { userId, kind: DAILY, NOT: { lastDay: today } },
      data: {
        current,
        longest,
        totalDays: { increment: 1 },
        lastCheckIn: new Date(),
        lastDay: today,
        ...(freezeUsed > 0 ? { freezeTokens: { decrement: freezeUsed } } : {}),
      },
    });
    if (applied.count === 0) return false;
    // `applied.count === 0` above already rejects a duplicate check-in, so this
    // grant happens once per day per user.
    await creditCoins(userId, reward, {
      tx,
      type: 'REWARD',
      entityType: 'streak',
      note: 'Daily streak reward',
    });
    return true;
  });

  if (!claimed) {
    // A concurrent request already booked today's check-in — return current state
    // with no additional reward.
    const s = await prisma.streak.findUnique({ where: key(userId) });
    return {
      current: s?.current ?? current,
      longest: s?.longest ?? longest,
      totalCheckIns: s?.totalDays ?? (existing?.totalDays ?? 0) + 1,
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
    totalCheckIns: (existing?.totalDays ?? 0) + 1,
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
    const streak = await tx.streak.findUnique({
      where: key(userId),
      select: { freezeTokens: true },
    });
    if ((streak?.freezeTokens ?? 0) >= MAX_FREEZE_TOKENS) throw new Error('MAX_FREEZES');

    // Was a read-then-decrement: `SELECT coins` → `if (coins < COST) throw` →
    // `UPDATE ... decrement`. Under READ COMMITTED two concurrent buys both read
    // the same balance, both pass the check, and both decrement — one freeze
    // paid for, two delivered, balance negative. debitCoins folds the check into
    // the UPDATE's WHERE clause so only one can win.
    await debitCoins(userId, FREEZE_COST, {
      tx,
      type: 'PURCHASE',
      entityType: 'streak-freeze',
      note: 'Streak freeze',
    });

    const updated = await tx.streak.upsert({
      where: key(userId),
      create: { userId, kind: DAILY, freezeTokens: 1 },
      update: { freezeTokens: { increment: 1 } },
      select: { freezeTokens: true },
    });
    const newBalance = await getBalance(userId, tx);
    return { freezeTokens: updated.freezeTokens, newBalance };
  });
}
