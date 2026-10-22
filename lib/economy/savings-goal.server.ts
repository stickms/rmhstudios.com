/**
 * Savings goals — persistence and the net-history read (C1).
 *
 * Builds ON `savings-goal.ts` (the projection) and adds only what that pure
 * module deliberately leaves out: storing a goal, and reading the daily net
 * history the projection consumes.
 *
 * A goal never moves coins. This module imports no ledger function, and the
 * only write to money-adjacent state is `reachedAt` on the goal's own row.
 */
import { prisma } from '@/lib/prisma.server';
import { apiCache } from '@/lib/cache';
import { getShopItem } from '@/lib/shop/catalog';
import { isTradable } from '@/lib/market/tradable';
import { project, progress, type DailyNet } from '@/lib/economy/savings-goal';
import {
  SAVINGS_GOAL_MAX,
  type CreateSavingsGoalInput,
  type SavingsGoalsPayload,
  type SavingsGoalView,
} from '@/lib/economy/savings-goal-schema';

const DAY_MS = 86_400_000;
/** The projection looks back 28 days; one extra so "yesterday" is always inside. */
const HISTORY_DAYS = 29;
const HISTORY_TTL_MS = 5 * 60_000;
const historyKey = (userId: string) => `savings:net:${userId}`;

export class SavingsGoalError extends Error {
  constructor(
    readonly code: 'TOO_MANY' | 'UNKNOWN_ITEM' | 'NO_LISTING' | 'NOT_TRADABLE' | 'NOT_FOUND',
  ) {
    super(code);
    this.name = 'SavingsGoalError';
  }
}

/**
 * Daily net (earned − spent) for the last ~4 weeks, from ONE grouped query over
 * `CoinTransaction`, cached per member for five minutes. The balance is read
 * fresh on every call; only this slow-moving history is cached.
 */
export async function getNetHistory(userId: string, now: Date = new Date()): Promise<DailyNet[]> {
  const key = historyKey(userId);
  const hit = apiCache.get<DailyNet[]>(key);
  if (hit) return hit;

  const since = new Date((Math.floor(now.getTime() / DAY_MS) - HISTORY_DAYS) * DAY_MS);
  const rows = await prisma.$queryRaw<{ day: number; net: bigint }[]>`
    SELECT floor(extract(epoch FROM "createdAt") / 86400)::int AS day,
           COALESCE(SUM(CASE WHEN "recipientId" = ${userId} THEN amount ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN "senderId" = ${userId} THEN amount ELSE 0 END), 0) AS net
    FROM coin_transaction
    WHERE ("recipientId" = ${userId} OR "senderId" = ${userId})
      AND "createdAt" >= ${since}
    GROUP BY 1
  `;
  const history = rows.map((r) => ({ day: Number(r.day), net: Number(r.net) }));
  apiCache.set(key, history, HISTORY_TTL_MS);
  return history;
}

export async function listSavingsGoals(
  userId: string,
  now: Date = new Date(),
): Promise<SavingsGoalsPayload> {
  const [goals, profile, history] = await Promise.all([
    prisma.savingsGoal.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      take: SAVINGS_GOAL_MAX,
    }),
    prisma.userProfile.findUnique({ where: { userId }, select: { coins: true } }),
    getNetHistory(userId, now),
  ]);
  const balance = Number(profile?.coins ?? 0);
  const today = Math.floor(now.getTime() / DAY_MS);

  const views: SavingsGoalView[] = goals.map((g) => {
    const projection = project(balance, g.targetCoins, history, today);
    return {
      id: g.id,
      kind: g.kind as SavingsGoalView['kind'],
      itemId: g.itemId,
      title: g.title,
      targetCoins: g.targetCoins,
      progress: progress(balance, g.targetCoins),
      projection,
      etaDate:
        projection.status === 'on-track'
          ? new Date(projection.etaDay * DAY_MS).toISOString().slice(0, 10)
          : null,
    };
  });

  // First time a goal is seen reached, stamp it. Cosmetic bookkeeping only.
  const newlyReached = goals
    .filter((g) => !g.reachedAt && balance >= g.targetCoins)
    .map((g) => g.id);
  if (newlyReached.length > 0) {
    await prisma.savingsGoal
      .updateMany({ where: { id: { in: newlyReached }, userId }, data: { reachedAt: now } })
      .catch(() => undefined);
  }

  return { balance, goals: views, max: SAVINGS_GOAL_MAX };
}

export async function createSavingsGoal(
  userId: string,
  input: CreateSavingsGoalInput,
): Promise<string> {
  const count = await prisma.savingsGoal.count({ where: { userId } });
  if (count >= SAVINGS_GOAL_MAX) throw new SavingsGoalError('TOO_MANY');

  let title: string;
  let targetCoins: number;
  let itemId: string | null = null;

  if (input.kind === 'custom') {
    title = input.title;
    targetCoins = input.targetCoins;
  } else {
    const item = getShopItem(input.itemId);
    if (!item) throw new SavingsGoalError('UNKNOWN_ITEM');
    itemId = item.id;
    title = item.name.slice(0, 80);
    if (input.kind === 'shop_item') {
      // The target is the catalog price, read here — never accepted from the client.
      targetCoins = item.price;
    } else {
      if (!isTradable(item.id)) throw new SavingsGoalError('NOT_TRADABLE');
      const cheapest = await prisma.marketListing.aggregate({
        where: { itemId: item.id, status: 'ACTIVE' },
        _min: { priceCoins: true },
      });
      if (cheapest._min.priceCoins == null) throw new SavingsGoalError('NO_LISTING');
      targetCoins = cheapest._min.priceCoins;
    }
  }

  const row = await prisma.savingsGoal.create({
    data: { userId, kind: input.kind, itemId, title, targetCoins },
    select: { id: true },
  });
  return row.id;
}

export async function deleteSavingsGoal(userId: string, id: string): Promise<void> {
  const res = await prisma.savingsGoal.deleteMany({ where: { id, userId } });
  if (res.count === 0) throw new SavingsGoalError('NOT_FOUND');
}
