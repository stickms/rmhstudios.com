/**
 * RMHVibe spend: metering policy and the two ceilings. Server-only.
 *
 * Every vibe model call is written to the `AiUsage` ledger (`meterVibe` in
 * `provider.server.ts`), but it is NOT counted against the shared monthly AI
 * allowance (`spentThisMonth` excludes `task LIKE 'vibe%'`): a build costs
 * 3-5 cents against a $0.25 free allowance. Instead:
 *
 *  1. a per-user, per-tier monthly vibe ceiling (`assertVibeBudget`), sized to
 *     stop abuse, not to ration a person; and
 *  2. a platform-wide daily cap (`assertVibeDailyCap`, `VIBE_DAILY_BUDGET_MICROS`)
 *     summed from the ledger, so it holds across the web and the Discord bot
 *     processes and for signed-out builds, which have no user to ceiling.
 *
 * Both fail OPEN on a ledger read error, like `assertAiBudget`.
 */

import { prisma } from '../prisma.server';
import { cached } from '../cached.server';
import { getUserTier } from '../entitlements';
import type { Tier } from '../entitlements/tiers';
import { AppError } from '../errors/codes';
import { VIBE_BUDGET_SCOPE, VIBE_BUSY_SCOPE } from './vibe-tasks';

/** Monthly vibe-only ceiling in micro-dollars, by tier. */
export const VIBE_MONTHLY_BUDGET_MICROS: Record<Tier, number> = {
  free: 2_000_000, //   $2
  starter: 5_000_000, //   $5
  pro: 20_000_000, //  $20
  enterprise: 100_000_000, // $100
};

/** Default platform-wide daily vibe cap: $25. `0` in the env means no cap. */
export const DEFAULT_VIBE_DAILY_BUDGET_MICROS = 25_000_000;

/** How long the platform-wide daily total is reused, so a burst does not hammer the ledger. */
export const VIBE_DAILY_CACHE_MS = 30_000;

export function vibeDailyBudgetMicros(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.VIBE_DAILY_BUDGET_MICROS;
  if (raw === undefined || raw.trim() === '') return DEFAULT_VIBE_DAILY_BUDGET_MICROS;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_VIBE_DAILY_BUDGET_MICROS;
}

/** A user's vibe spend so far this calendar month, in micro-dollars. */
export async function vibeSpentThisMonth(userId: string): Promise<number> {
  const rows = await prisma.$queryRaw<
    {
      spent: bigint | null;
    }[]
  >`
    SELECT SUM("costMicros")::bigint AS spent
    FROM ai_usage
    WHERE "userId" = ${userId}
      AND "createdAt" >= date_trunc('month', now())
      AND task LIKE 'vibe%'
  `;
  return Number(rows[0]?.spent ?? 0);
}

/** Vibe spend by everyone (signed-out and unlinked builds included) since 00:00 UTC. */
async function vibeSpentToday(now: Date = new Date()): Promise<number> {
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const agg = await prisma.aiUsage.aggregate({
    where: {
      task: {
        startsWith: 'vibe',
      },
      createdAt: {
        gte: dayStart,
      },
    },
    _sum: {
      costMicros: true,
    },
  });
  return Number(agg._sum.costMicros ?? 0);
}

/**
 * Refuse a build for a signed-in user over their tier's monthly vibe ceiling
 * (402 `AI_BUDGET_EXCEEDED`, `detail.scope: 'vibe'`). Call BEFORE the model call. A null user
 * (signed-out web build, unlinked Discord user) has no ceiling of their own and
 * is bounded by the daily cap and the rate limit.
 */
export async function assertVibeBudget(userId: string | null): Promise<void> {
  if (!userId) return;
  try {
    const [tier, spent] = await Promise.all([getUserTier(userId), vibeSpentThisMonth(userId)]);
    const limit = VIBE_MONTHLY_BUDGET_MICROS[tier];
    if (spent >= limit)
      throw new AppError('AI_BUDGET_EXCEEDED', {
        scope: VIBE_BUDGET_SCOPE,
        limit,
        spent,
      });
  } catch (err) {
    if (err instanceof AppError) throw err;
    console.error('[vibe] budget check failed, allowing through:', (err as Error)?.message);
  }
}

/**
 * Refuse every new build once the platform's vibe spend today reaches
 * `VIBE_DAILY_BUDGET_MICROS` (503 `AI_UNAVAILABLE`, `detail.scope: 'vibe-busy'`). The total is cached ~30 s per
 * process; both the web and the bot processes read the same ledger.
 */
export async function assertVibeDailyCap(): Promise<void> {
  const cap = vibeDailyBudgetMicros();
  if (cap <= 0) return;
  try {
    const spent = await cached<number | null>(
      'vibe:daily-spend',
      VIBE_DAILY_CACHE_MS,
      async () => {
        try {
          return await vibeSpentToday();
        } catch (err) {
          console.error('[vibe] daily total read failed, allowing through:', (err as Error)?.message);
          return null;
        }
      },
      {
        l2: false,
        shouldCache: (v) => v !== null,
      },
    );
    if (spent !== null && spent >= cap)
      throw new AppError('AI_UNAVAILABLE', {
        scope: VIBE_BUSY_SCOPE,
      });
  } catch (err) {
    if (err instanceof AppError) throw err;
    console.error('[vibe] daily cap check failed, allowing through:', (err as Error)?.message);
  }
}

/** Both gates, in order: the platform cap first (cheaper, cached), then the user's ceiling. */
export async function assertVibeAllowed(userId: string | null): Promise<void> {
  await assertVibeDailyCap();
  await assertVibeBudget(userId);
}
