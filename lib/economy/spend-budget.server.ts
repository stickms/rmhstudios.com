/**
 * Monthly spending budget (s04-07) — the web tier's binding: the read for the
 * settings panel and the wallet, and the one write path.
 *
 * The enforcement lives in `spend-budget-core.ts` (the socket tier needs it);
 * the policy lives in `spend-budget.ts`. This module is the read-modify-write
 * around them, plus the settle of a matured pending change.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { lockKey } from '@/lib/db/advisory-lock.server';
import {
  applySpendBudgetChange,
  effectiveSpendCap,
  hasMaturedSpendPending,
  monthKey,
  NO_BUDGET,
  type SpendBudget,
  type SpendBudgetChange,
} from '@/lib/economy/spend-budget';
import { readSpendBudget, spentThisMonthOn } from '@/lib/economy/spend-budget-core';

/** What the panel and the wallet render. Dates as ISO strings for the wire. */
export interface SpendBudgetView {
  /** The cap in force; null when there is no budget. */
  monthlySpendCap: number | null;
  /** A loosening still waiting out its 24 hours. `pendingSpendCapAt` null = nothing pending. */
  pendingSpendCap: number | null;
  pendingSpendCapAt: string | null;
  /** Coins spent so far this UTC month. */
  spentThisMonth: number;
  /** The `YYYY-MM` the figures are for. */
  month: string;
}

function toView(budget: SpendBudget, spent: number, now: Date): SpendBudgetView {
  const matured = hasMaturedSpendPending(budget, now);
  return {
    monthlySpendCap: effectiveSpendCap(budget, now),
    pendingSpendCap: matured ? null : budget.pendingSpendCap,
    pendingSpendCapAt: matured ? null : (budget.pendingSpendCapAt?.toISOString() ?? null),
    spentThisMonth: spent,
    month: monthKey(now),
  };
}

/**
 * Read for display, settling a matured pending change on the way past so the
 * row never keeps a `pendingSpendCapAt` in the past (same reason as
 * `getPlayLimits`). Enforcement does not wait for this write.
 */
export async function getSpendBudget(userId: string, now: Date = new Date()): Promise<SpendBudgetView> {
  let budget = (await readSpendBudget(prisma, userId)) ?? NO_BUDGET;
  if (hasMaturedSpendPending(budget, now)) {
    budget = {
      ...budget,
      monthlySpendCap: effectiveSpendCap(budget, now),
      pendingSpendCap: null,
      pendingSpendCapAt: null,
    };
    await prisma.userPlayLimits.update({
      where: { userId },
      data: {
        monthlySpendCap: budget.monthlySpendCap,
        pendingSpendCap: null,
        pendingSpendCapAt: null,
      },
    });
  }
  const spent = budget.monthlySpendCap === null ? 0 : await spentThisMonthOn(prisma, userId, now);
  return toView(budget, spent, now);
}

/**
 * Apply a change inside the caller's transaction. A per-member settings lock
 * serialises two edits of the same row (the read-modify-write would otherwise
 * lose one); it is a different key from the ledger's `spend:` lock, so editing
 * the budget never waits behind, or blocks, a purchase.
 */
export async function applySpendBudgetChangeOn(
  tx: Prisma.TransactionClient,
  userId: string,
  change: SpendBudgetChange,
  now: Date,
): Promise<SpendBudget> {
  await lockKey(tx, `spend-budget-settings:${userId}`);
  const current = (await readSpendBudget(tx, userId)) ?? NO_BUDGET;
  const { next } = applySpendBudgetChange(current, change, now);
  const data = {
    monthlySpendCap: next.monthlySpendCap,
    pendingSpendCap: next.pendingSpendCap,
    pendingSpendCapAt: next.pendingSpendCapAt,
  };
  await tx.userPlayLimits.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
  return next;
}

/** The standalone write, for callers that change nothing else. */
export async function updateSpendBudget(
  userId: string,
  change: SpendBudgetChange,
  now: Date = new Date(),
): Promise<SpendBudgetView> {
  const next = await prisma.$transaction((tx) => applySpendBudgetChangeOn(tx, userId, change, now));
  return toView(next, await spentThisMonthOn(prisma, userId, now), now);
}
