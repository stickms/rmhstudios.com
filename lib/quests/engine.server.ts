/**
 * Quest progress engine (server-side, best-effort).
 *
 * `progressQuests(userId, type, by)` advances every active quest of that type
 * for the current period, marking them complete when the target is reached.
 * Rewards (XP + coins) are granted when the user claims a completed quest.
 */

import { prisma } from '@/lib/prisma.server';
import { QUESTS, getQuest, periodKeyFor, type QuestType } from '@/lib/quests/catalog';
import { awardXp } from '@/lib/xp/engine.server';
import { grantAchievement, progressAchievement } from '@/lib/achievements/engine.server';
import { redisRateLimit } from '@/lib/redis.server';
import { rateLimit } from '@/lib/rate-limit';

export async function progressQuests(userId: string, type: QuestType, by = 1): Promise<void> {
  try {
    const matching = QUESTS.filter((q) => q.type === type);
    for (const q of matching) {
      const periodKey = periodKeyFor(q.period);
      const existing = await prisma.userQuest.findUnique({
        where: { userId_questId_periodKey: { userId, questId: q.id, periodKey } },
        select: { progress: true, completed: true },
      });
      if (existing?.completed) continue;
      const next = Math.min((existing?.progress ?? 0) + by, q.target);
      const completed = next >= q.target;
      await prisma.userQuest.upsert({
        where: { userId_questId_periodKey: { userId, questId: q.id, periodKey } },
        create: { userId, questId: q.id, periodKey, progress: next, completed },
        update: { progress: next, completed },
      });
    }
  } catch (err) {
    console.error('[quests] progress failed:', err);
  }
}

/**
 * Convenience for game-result endpoints: award a small amount of XP and
 * progress the "play a game" quest in one best-effort call.
 */
export async function recordGamePlay(userId: string): Promise<void> {
  try {
    // A browser-reported score is not proof of a distinct play. Bound reward
    // progression independently of score submission volume across instances.
    const distributed = await redisRateLimit(`quest-game-play:${userId}`, 1, 60_000);
    const limiter = distributed ?? rateLimit(userId, {
      limit: 1,
      windowMs: 60_000,
      prefix: 'quest-game-play',
    });
    if (!limiter.allowed) return;
    await awardXp(userId, 8);
    await progressQuests(userId, 'game_play');
  } catch (err) {
    console.error('[quests] recordGamePlay failed:', err);
  }
}

export interface QuestView {
  id: string;
  period: 'daily' | 'weekly';
  name: string;
  description: string;
  target: number;
  xp: number;
  coins: number;
  progress: number;
  completed: boolean;
  claimed: boolean;
}

export async function getActiveQuests(userId: string): Promise<QuestView[]> {
  const rows = await prisma.userQuest.findMany({
    where: {
      userId,
      OR: [
        { periodKey: periodKeyFor('daily') },
        { periodKey: periodKeyFor('weekly') },
      ],
    },
    select: { questId: true, periodKey: true, progress: true, completed: true, claimed: true },
  });
  const byId = new Map(rows.map((r) => [`${r.questId}:${r.periodKey}`, r]));

  return QUESTS.map((q) => {
    const row = byId.get(`${q.id}:${periodKeyFor(q.period)}`);
    return {
      id: q.id,
      period: q.period,
      name: q.name,
      description: q.description,
      target: q.target,
      xp: q.xp,
      coins: q.coins,
      progress: Math.min(row?.progress ?? 0, q.target),
      completed: row?.completed ?? false,
      claimed: row?.claimed ?? false,
    };
  });
}

/** Claim a completed quest's reward. Returns { xp, coins } granted, or null. */
export async function claimQuest(userId: string, questId: string): Promise<{ xp: number; coins: number } | null> {
  const def = getQuest(questId);
  if (!def) return null;
  const periodKey = periodKeyFor(def.period);

  // Atomic claim: flip claimed false→true only if the quest is completed and not
  // yet claimed. Doing the guard in the WHERE clause (rather than read-then-write)
  // means concurrent claims cannot all observe `claimed:false` and each grant the
  // reward — only the single request that actually flips the row proceeds.
  const claim = await prisma.userQuest.updateMany({
    where: { userId, questId, periodKey, completed: true, claimed: false },
    data: { claimed: true },
  });
  if (claim.count === 0) return null;

  if (def.coins > 0) {
    await prisma.userProfile.upsert({
      where: { userId },
      create: { userId, coins: 10 + def.coins },
      update: { coins: { increment: def.coins } },
    });
  }
  if (def.xp > 0) await awardXp(userId, def.xp);

  // "Quest Master" achievement — count lifetime claimed quests.
  const claimedCount = await prisma.userQuest.count({ where: { userId, claimed: true } });
  await progressAchievement(userId, 'special.quest_master', { setProgress: claimedCount });
  await grantAchievement(userId, 'special.quest_master').catch(() => {});

  return { xp: def.xp, coins: def.coins };
}
