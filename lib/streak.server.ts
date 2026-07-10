/**
 * Daily check-in streak.
 *
 * A user "checks in" once per calendar day (UTC). Consecutive days grow the
 * streak; a missed day resets it. Each new day's first check-in grants coins
 * that scale slightly with the streak length, and unlocks streak achievements.
 */

import { prisma } from '@/lib/prisma.server';
import { grantAchievement } from '@/lib/achievements/engine.server';
import { awardXp } from '@/lib/xp/engine.server';
import { progressQuests } from '@/lib/quests/engine.server';

export function todayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

function previousKey(key: string): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
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
}

export async function getStreak(userId: string): Promise<StreakState> {
  const s = await prisma.dailyStreak.findUnique({ where: { userId } });
  const today = todayKey();
  // If the last check-in is older than yesterday, the visible streak is broken.
  const current =
    s && (s.lastDateKey === today || s.lastDateKey === previousKey(today)) ? s.current : 0;
  return {
    current,
    longest: s?.longest ?? 0,
    totalCheckIns: s?.totalCheckIns ?? 0,
    checkedInToday: s?.lastDateKey === today,
    reward: 0,
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
    };
  }

  const continuing = existing?.lastDateKey === previousKey(today);
  const current = continuing ? existing!.current + 1 : 1;
  const longest = Math.max(existing?.longest ?? 0, current);
  const reward = rewardFor(current);

  await prisma.$transaction([
    prisma.dailyStreak.upsert({
      where: { userId },
      create: {
        userId,
        current,
        longest,
        totalCheckIns: 1,
        lastCheckIn: new Date(),
        lastDateKey: today,
      },
      update: {
        current,
        longest,
        totalCheckIns: { increment: 1 },
        lastCheckIn: new Date(),
        lastDateKey: today,
      },
    }),
    prisma.userProfile.upsert({
      where: { userId },
      create: { userId, coins: 10 + reward },
      update: { coins: { increment: reward } },
    }),
  ]);

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
  };
}
