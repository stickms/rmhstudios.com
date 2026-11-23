/**
 * The Admit forums job's own share of the monthly model budget (owner 2026-11-23). SDN's gate (`sdn/budget.ts`) sums
 * every `medschools-extract` call against `MEDSCHOOLS_AI_MONTHLY_USD`; the forums job labels its calls with its own
 * `promptId`, so its spend is a sub-sum of the same ledger. A forums call is allowed only while BOTH hold: the month's
 * total spend is under the cap (so the sum of both jobs never passes it) and the forums' own spend is under its share
 * of the cap (default 40%, so SDN always keeps at least 60% and is never starved). A ledger read error fails closed.
 */
import { EXTRACT_TASK, monthStartUtc, type BudgetGate } from './sdn/budget';
import type { MedPrisma } from './types';

/** The `AiUsage.promptId` the forums job's calls carry (a metering label; the prompt itself is the registry's). */
export const ADMIT_FORUMS_PROMPT_ID = 'medschools-extract:admit-forums';
export const DEFAULT_FORUMS_AI_SHARE = 0.4;

/**
 * `MEDSCHOOLS_ADMIT_FORUMS_AI_SHARE`: a fraction of the monthly cap, 0 to 1. Unset or blank is 0.4; a value that is
 * present but not a number in [0, 1] fails closed to 0 (extraction paused) and `warn` says so.
 */
export function forumsAiShare(env: string | undefined, warn?: (line: string) => void): number {
  if (env === undefined || env.trim() === '') return DEFAULT_FORUMS_AI_SHARE;
  const n = Number(env);
  if (Number.isFinite(n) && n >= 0 && n <= 1) return n;
  warn?.(
    'MEDSCHOOLS_ADMIT_FORUMS_AI_SHARE is not a number from 0 to 1; Admit forum extraction is paused until it is fixed',
  );
  return 0;
}

export function createForumsBudgetGate(prisma: MedPrisma, now: () => Date, capUsd: number, share: number): BudgetGate {
  return {
    async allow() {
      try {
        const since = { gte: monthStartUtc(now()) };
        const [all, own] = await Promise.all([
          prisma.aiUsage.aggregate({
            where: { task: EXTRACT_TASK, createdAt: since },
            _sum: { costMicros: true },
          }),
          prisma.aiUsage.aggregate({
            where: { task: EXTRACT_TASK, promptId: ADMIT_FORUMS_PROMPT_ID, createdAt: since },
            _sum: { costMicros: true },
          }),
        ]);
        const cap = capUsd * 1_000_000;
        return (all._sum.costMicros ?? 0) < cap && (own._sum.costMicros ?? 0) < cap * share;
      } catch {
        return false;
      }
    },
  };
}
