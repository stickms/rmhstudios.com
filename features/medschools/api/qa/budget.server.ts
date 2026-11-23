/**
 * The gates in front of a question (plan R9 to R11), all read from the `AiUsage` ledger so there is no new table and no
 * stored question: the member's daily cap, the Q&A share of the monthly budget, then the site's own per-member allowance.
 * Every gate here runs before any model call. A ledger read error fails CLOSED for the two that guard shared money.
 */
import { assertAiBudget } from '@/lib/ai/budget.server';
import { AppError } from '@/lib/errors/codes';
import { prisma } from '@/lib/prisma.server';
import { QA_ROUTE_PROMPT_ID, QA_TASK, qaCapUsd, qaDailyCap, qaShare, utcDayStart } from '../../ai-budget';
import { EXTRACT_TASK, monthStartUtc, monthlyCapUsd } from '../../scrape/sdn/budget';

const warned = new Set<string>();
const warnOnce = (line: string): void => {
  if (warned.has(line)) return;
  warned.add(line);
  console.warn(`[medschools-qa] ${line}`);
};

const paused = (reason: 'budget' | 'unavailable') => new AppError('MEDSCHOOLS_QA_PAUSED', { reason });

/**
 * Questions the member has asked since 00:00 UTC. Every question makes exactly one route call (ok or failed), so the
 * count is the route rows: a failing provider cannot be hammered for free.
 */
export async function questionsToday(userId: string, now: Date = new Date()): Promise<number> {
  return prisma.aiUsage.count({
    where: {
      userId,
      task: QA_TASK,
      promptId: QA_ROUTE_PROMPT_ID,
      createdAt: { gte: utcDayStart(now) },
    },
  });
}

/** 429 `MEDSCHOOLS_QA_DAILY_CAP` when the day's questions are used; 503 `MEDSCHOOLS_QA_PAUSED` when the ledger cannot be read. */
export async function assertDailyCap(
  userId: string,
  now: Date = new Date(),
): Promise<{ remainingToday: number; dailyCap: number }> {
  const dailyCap = qaDailyCap(process.env.MEDSCHOOLS_QA_DAILY_CAP, warnOnce);
  let used: number;
  try {
    used = await questionsToday(userId, now);
  } catch {
    throw paused('unavailable');
  }
  if (used >= dailyCap) throw new AppError('MEDSCHOOLS_QA_DAILY_CAP');
  return { remainingToday: dailyCap - used, dailyCap };
}

/**
 * Q&A may spend while its own UTC-month total is under `cap * share`, and the two sides together stay under `cap`.
 * Spent at the limit is closed (`spent < limit`, as the scrape gates do). A ledger error is `unavailable`, not "over".
 */
export async function assertSharedBudget(now: Date = new Date()): Promise<void> {
  const total = monthlyCapUsd(process.env.MEDSCHOOLS_AI_MONTHLY_USD, warnOnce) * 1_000_000;
  const share = qaShare(process.env.MEDSCHOOLS_QA_AI_SHARE, warnOnce);
  const since = { gte: monthStartUtc(now) };
  let qaSpent: number;
  let allSpent: number;
  try {
    const [qa, both] = await Promise.all([
      prisma.aiUsage.aggregate({ where: { task: QA_TASK, createdAt: since }, _sum: { costMicros: true } }),
      prisma.aiUsage.aggregate({
        where: { task: { in: [QA_TASK, EXTRACT_TASK] }, createdAt: since },
        _sum: { costMicros: true },
      }),
    ]);
    qaSpent = qa._sum.costMicros ?? 0;
    allSpent = both._sum.costMicros ?? 0;
  } catch {
    throw paused('unavailable');
  }
  if (qaSpent >= qaCapUsd(total, share) || allSpent >= total) throw paused('budget');
}

/** Daily cap, then the shared monthly gate, then the member's own allowance (`AI_BUDGET_EXCEEDED`); all before any model call. */
export async function assertQaAllowed(
  userId: string,
  now: Date = new Date(),
): Promise<{ remainingToday: number; dailyCap: number }> {
  const daily = await assertDailyCap(userId, now);
  await assertSharedBudget(now);
  await assertAiBudget(userId);
  return daily;
}
