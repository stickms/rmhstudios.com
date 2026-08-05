/**
 * Per-user AI spend ceilings (A2). Server-only.
 *
 * The AI endpoints were rate-limited (`rateLimit: 'ai'`) but not *budgeted*. A
 * rate limit caps requests per minute; it does not cap the month. An account
 * staying politely inside 20/min can run continuously, and the only place that
 * shows up is the provider invoice — after the fact, with no attribution and no
 * way to stop it that isn't "turn AI off for everyone".
 *
 * A budget is the missing half. It reads the `AiUsage` ledger every
 * `runTask()` writes, so it needs no new bookkeeping, and it refuses through
 * the 402 upgrade envelope `defineHandler` already speaks — which means a user
 * who runs out sees "you've used this month's allowance, here's the plan"
 * rather than a toast that says "Forbidden".
 */

import { prisma } from '@/lib/prisma.server';
import { getUserTier } from '@/lib/entitlements';
import type { Tier } from '@/lib/entitlements/tiers';
import { AppError } from '@/lib/errors/codes';

/**
 * Monthly ceiling in micro-dollars, by tier.
 *
 * Sized so a normal user never meets them: the free allowance covers roughly a
 * few hundred compose-assist calls, which is far more than anyone writing posts
 * by hand will use. They exist to stop a script, not to ration a person — if
 * real users start hitting these, the numbers are wrong, not the users.
 */
export const MONTHLY_BUDGET_MICROS: Record<Tier, number> = {
  free: 250_000, //   $0.25
  starter: 2_000_000, //   $2.00
  pro: 10_000_000, //  $10.00
  enterprise: 50_000_000, //  $50.00
};

/** Spend so far this calendar month, in micro-dollars. */
export async function spentThisMonth(userId: string): Promise<number> {
  const rows = await prisma.$queryRaw<{ spent: bigint | null }[]>`
    SELECT SUM("costMicros")::bigint AS spent
    FROM ai_usage
    WHERE "userId" = ${userId}
      AND "createdAt" >= date_trunc('month', now())
  `;
  return Number(rows[0]?.spent ?? 0);
}

export interface BudgetStatus {
  tier: Tier;
  limitMicros: number;
  spentMicros: number;
  remainingMicros: number;
  /** 0–1, clamped. Drives the meter on /wallet. */
  usedFraction: number;
  exhausted: boolean;
}

/**
 * Where a user stands. Safe to call for display — it never throws on a missing
 * ledger, it just reports zero spend.
 */
export async function budgetStatus(userId: string): Promise<BudgetStatus> {
  const [tier, spentMicros] = await Promise.all([getUserTier(userId), spentThisMonth(userId)]);
  const limitMicros = MONTHLY_BUDGET_MICROS[tier];
  const remainingMicros = Math.max(0, limitMicros - spentMicros);
  return {
    tier,
    limitMicros,
    spentMicros,
    remainingMicros,
    usedFraction: limitMicros > 0 ? Math.min(1, spentMicros / limitMicros) : 1,
    exhausted: remainingMicros <= 0,
  };
}

/**
 * Gate an AI route. Throws `AI_BUDGET_EXCEEDED` (402) when the month is spent.
 *
 * Call it *before* the model call, not after — the point is to not spend the
 * money. Deliberately fails **open** on a ledger read error: an AI feature
 * going down because the usage table is briefly unavailable is a worse outcome
 * than one user overrunning their allowance by a few cents.
 */
export async function assertAiBudget(userId: string | null): Promise<void> {
  // Anonymous callers never reach a metered route (`auth: 'required'`), and a
  // platform job (userId null) is our own spend, tracked but not gated.
  if (!userId) return;
  try {
    const status = await budgetStatus(userId);
    if (status.exhausted) {
      throw new AppError('AI_BUDGET_EXCEEDED', {
        limit: status.limitMicros,
        spent: status.spentMicros,
      });
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    console.error('[ai] budget check failed, allowing through:', (err as Error)?.message);
  }
}
