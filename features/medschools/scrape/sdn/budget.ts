/**
 * The monthly model budget (D5): the sum of this task's `AiUsage.costMicros` for the UTC month, read through the
 * worker's own pool and checked before every model call. No new table.
 */
import type { MedPrisma } from '../types';

export const EXTRACT_TASK = 'medschools-extract';
/** Backfill stops at this share of the cap so a long backfill never starves the live feed. */
export const BACKFILL_SHARE = 0.8;
const DEFAULT_CAP_USD = 20;

export function monthStartUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * `MEDSCHOOLS_AI_MONTHLY_USD`: only an unset (or blank) variable defaults to 20. A value that is present but not a
 * non-negative number (negative, NaN, garbage) is a typo about money, so it fails closed to 0, which pauses
 * extraction, and `warn` says so once. `0` pauses extraction on purpose.
 */
export function monthlyCapUsd(env: string | undefined, warn?: (line: string) => void): number {
  if (env === undefined || env.trim() === '') return DEFAULT_CAP_USD;
  const n = Number(env);
  if (Number.isFinite(n) && n >= 0) return n;
  warn?.('MEDSCHOOLS_AI_MONTHLY_USD is not a non-negative number; extraction is paused (cap 0) until it is fixed');
  return 0;
}

export interface BudgetGate {
  allow(kind: 'live' | 'backfill'): Promise<boolean>;
}

/** A ledger read error fails closed: a background job spends unattended. */
export function createBudgetGate(prisma: MedPrisma, now: () => Date, capUsd: number): BudgetGate {
  return {
    async allow(kind) {
      try {
        const agg = await prisma.aiUsage.aggregate({
          where: {
            task: EXTRACT_TASK,
            createdAt: {
              gte: monthStartUtc(now()),
            },
          },
          _sum: {
            costMicros: true,
          },
        });
        const spent = agg._sum.costMicros ?? 0;
        const limit = capUsd * 1_000_000 * (kind === 'backfill' ? BACKFILL_SHARE : 1);
        return spent < limit;
      } catch {
        return false;
      }
    },
  };
}
