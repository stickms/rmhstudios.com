/**
 * The monthly model budget (D5): the sum of this task's `AiUsage.costMicros` for the UTC month, read through the
 * worker's own pool and checked before every model call. No new table.
 */
import type { MedPrisma } from '../types';

export const EXTRACT_TASK =
  'medschools-extract';
/** Backfill stops at this share of the cap so a long backfill never starves the live feed. */
export const BACKFILL_SHARE = 0.8;
const DEFAULT_CAP_USD = 20;

export function monthStartUtc(
  now: Date,
): Date {
  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      1,
    ),
  );
}

/** `MEDSCHOOLS_AI_MONTHLY_USD`: unset, non-numeric or negative gives 20; `0` pauses extraction. */
export function monthlyCapUsd(
  env:
    | string
    | undefined,
): number {
  if (
    env ===
      undefined ||
    env.trim() ===
      ''
  )
    return DEFAULT_CAP_USD;
  const n =
    Number(
      env,
    );
  return Number.isFinite(
    n,
  ) &&
    n >=
      0
    ? n
    : DEFAULT_CAP_USD;
}

export interface BudgetGate {
  allow(
    kind:
      | 'live'
      | 'backfill',
  ): Promise<boolean>;
}

/** A ledger read error fails closed: a background job spends unattended. */
export function createBudgetGate(
  prisma: MedPrisma,
  now: () => Date,
  capUsd: number,
): BudgetGate {
  return {
    async allow(
      kind,
    ) {
      try {
        const agg =
          await prisma.aiUsage.aggregate(
            {
              where:
                {
                  task: EXTRACT_TASK,
                  createdAt:
                    {
                      gte: monthStartUtc(
                        now(),
                      ),
                    },
                },
              _sum: {
                costMicros: true,
              },
            },
          );
        const spent =
          agg
            ._sum
            .costMicros ??
          0;
        const limit =
          capUsd *
          1_000_000 *
          (kind ===
          'backfill'
            ? BACKFILL_SHARE
            : 1);
        return (
          spent <
          limit
        );
      } catch {
        return false;
      }
    },
  };
}
