/**
 * The secondary-prompt forum extractor's own share of the monthly model budget (secondaries plan, Task 10). It is the one
 * model call in the secondaries feature (the page sources use none). Like the Admit forums job, its calls carry their own
 * `promptId` label, so its spend is a sub-sum of the same `medschools-extract` ledger: a call is allowed only while BOTH
 * hold, the month's total spend is under the cap (so the sum of every scrape job never passes it) and the secondaries' own
 * spend is under its share of the cap (default 10%, so the event extraction keeps the rest). A ledger read error fails
 * closed. The caller passes the same `capUsd` the other scrape gates get (the scrape share, after the Q&A reservation).
 */
import { EXTRACT_TASK, monthStartUtc, type BudgetGate } from './sdn/budget';
import type { MedPrisma } from './types';

/** The `AiUsage.promptId` the extractor's calls carry (a metering label; the prompt itself is the registry's). */
export const SECONDARIES_PROMPT_ID = 'medschools-extract:secondaries';
export const DEFAULT_SECONDARIES_AI_SHARE = 0.1;

/**
 * `MEDSCHOOLS_SECONDARIES_AI_SHARE`: a fraction of the monthly cap, 0 to 1. Unset or blank is 0.1; a value that is present
 * but not a number in [0, 1] fails closed to 0 (the extractor is paused) and `warn` says so.
 */
export function secondariesAiShare(env: string | undefined, warn?: (line: string) => void): number {
  if (env === undefined || env.trim() === '') return DEFAULT_SECONDARIES_AI_SHARE;
  const n = Number(env);
  if (Number.isFinite(n) && n >= 0 && n <= 1) return n;
  warn?.(
    'MEDSCHOOLS_SECONDARIES_AI_SHARE is not a number from 0 to 1; forum secondary-prompt extraction is paused until it is fixed',
  );
  return 0;
}

export function createSecondariesBudgetGate(
  prisma: MedPrisma,
  now: () => Date,
  capUsd: number,
  share: number,
): BudgetGate {
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
            where: { task: EXTRACT_TASK, promptId: SECONDARIES_PROMPT_ID, createdAt: since },
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
