/**
 * Quest progress engine (server-side, best-effort).
 *
 * `progressQuests(userId, type, by)` advances every active quest of that type
 * for the current period, marking them complete when the target is reached.
 * Rewards (XP + coins) are granted when the user claims a completed quest.
 */

import { prisma } from '@/lib/prisma.server';
import { creditCoins } from '@/lib/economy/ledger.server';
import { QUESTS, getQuest, periodKeyFor, type QuestType } from '@/lib/quests/catalog';
import { awardXp } from '@/lib/xp/engine.server';
import { grantAchievement, progressAchievement } from '@/lib/achievements/engine.server';
import { redisRateLimit } from '@/lib/redis.server';
import { rateLimit } from '@/lib/rate-limit';

export async function progressQuests(userId: string, type: QuestType, by = 1): Promise<void> {
  try {
    const matching = QUESTS.filter((q) => q.type === type);
    if (matching.length === 0) return;

    // Previously this looped one quest at a time with a serial findUnique + upsert
    // each (2N round-trips) — and this runs on every like/comment/follow/post/
    // check-in/game-play. Load every relevant row in ONE query, then fan the
    // upserts out in parallel (they target distinct rows, so no contention).
    const targets = matching.map((q) => ({ questId: q.id, periodKey: periodKeyFor(q.period) }));
    const existingRows = await prisma.userQuest.findMany({
      where: { userId, OR: targets },
      select: { questId: true, periodKey: true, progress: true, completed: true },
    });
    const byKey = new Map(existingRows.map((r) => [`${r.questId}:${r.periodKey}`, r]));

    await Promise.all(
      matching.map((q) => {
        const periodKey = periodKeyFor(q.period);
        const existing = byKey.get(`${q.id}:${periodKey}`);
        if (existing?.completed) return null;
        const next = Math.min((existing?.progress ?? 0) + by, q.target);
        const completed = next >= q.target;
        return writeQuestProgress(
          { userId, questId: q.id, periodKey },
          { exists: !!existing, progress: next, completed },
        );
      }),
    );
  } catch (err) {
    console.error('[quests] progress failed:', err);
  }
}

/**
 * Write a quest row's progress without ever un-completing it.
 *
 * The values are computed from a read taken before the write, so a blind
 * upsert could land `completed: false` on a row a concurrent event had just
 * completed — and, if it had also been claimed in between, leave the
 * impossible `completed: false, claimed: true` state (the quest can then never
 * be claimed again this period). The update is therefore conditional on the
 * row still being incomplete; a missing row is created, and a create that
 * loses the race to a concurrent one falls back to the conditional update.
 *
 * Shared by `progressQuests` and the arcade's `reportGameResult`.
 */
export async function writeQuestProgress(
  key: { userId: string; questId: string; periodKey: string },
  next: { exists: boolean; progress: number; completed: boolean },
): Promise<void> {
  const update = () =>
    prisma.userQuest.updateMany({
      where: { ...key, completed: false },
      data: { progress: next.progress, completed: next.completed },
    });
  if (next.exists) {
    await update();
    return;
  }
  try {
    await prisma.userQuest.create({
      data: { ...key, progress: next.progress, completed: next.completed },
    });
  } catch (err) {
    if ((err as { code?: string } | null)?.code !== 'P2002') throw err;
    await update();
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

/**
 * Convenience for the flashcard-review endpoint: progress the daily "study"
 * quest and award a small amount of XP, best-effort. Quest progress advances
 * per review (its reward is capped by the once-a-day claim), while the XP grant
 * is rate-limited per user so review-spam can't farm it — SRS reviews are
 * naturally paced. Mirrors {@link recordGamePlay}.
 */
export async function recordStudyReview(userId: string): Promise<void> {
  try {
    await progressQuests(userId, 'study');
    const distributed = await redisRateLimit(`study-review-xp:${userId}`, 1, 20_000);
    const limiter = distributed ?? rateLimit(userId, {
      limit: 1,
      windowMs: 20_000,
      prefix: 'study-review-xp',
    });
    if (limiter.allowed) await awardXp(userId, 4);
  } catch (err) {
    console.error('[quests] recordStudyReview failed:', err);
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
  //
  // The coin credit commits in the SAME transaction as the flip: before, a
  // credit that failed after the flip left the quest claimed with no coins
  // paid and no way to retry. The ledger key (one per user, quest and period)
  // is defense-in-depth behind the flip.
  const claimed = await prisma.$transaction(async (tx) => {
    const claim = await tx.userQuest.updateMany({
      where: { userId, questId, periodKey, completed: true, claimed: false },
      data: { claimed: true },
    });
    if (claim.count === 0) return false;
    if (def.coins > 0) {
      await creditCoins(userId, def.coins, {
        tx,
        type: 'REWARD',
        entityType: 'quest',
        entityId: questId,
        note: def.name,
        idempotencyKey: `quest-claim:${userId}:${questId}:${periodKey}`,
      });
    }
    return true;
  });
  if (!claimed) return null;
  if (def.xp > 0) await awardXp(userId, def.xp);

  // "Quest Master" achievement — count lifetime claimed quests.
  const claimedCount = await prisma.userQuest.count({ where: { userId, claimed: true } });
  await progressAchievement(userId, 'special.quest_master', { setProgress: claimedCount });
  await grantAchievement(userId, 'special.quest_master').catch(() => {});

  return { xp: def.xp, coins: def.coins };
}
