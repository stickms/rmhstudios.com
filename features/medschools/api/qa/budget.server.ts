/**
 * The gates in front of a question (plan R9 to R11, R18), all on the `AiUsage` ledger so there is no new table and no
 * stored question: the Q&A share of the monthly budget, the site's own per-member allowance, then the member's daily cap
 * and one-in-flight lease, taken atomically across processes. Every gate runs before any model call. The daily cap depends on the member's tier and an admin has none (R19). A ledger error
 * fails CLOSED for every one of them.
 */
import { assertAiBudget } from '@/lib/ai/budget.server';
import { getUserTier } from '@/lib/entitlements';
import { AppError } from '@/lib/errors/codes';
import { prisma } from '@/lib/prisma.server';
import {
  QA_ASK_PROMPT_ID,
  QA_LEASE_MS,
  QA_LOCK_PROMPT_ID,
  QA_TASK,
  qaCapForTier,
  qaCapUsd,
  qaShare,
  type QaTier,
  utcDayStart,
} from '../../ai-budget';
import { EXTRACT_TASK, monthStartUtc, monthlyCapUsd } from '../../scrape/sdn/budget';

const warned = new Set<string>();
const warnOnce = (line: string): void => {
  if (warned.has(line)) return;
  warned.add(line);
  console.warn(`[medschools-qa] ${line}`);
};

const paused = (reason: 'budget' | 'unavailable') => new AppError('MEDSCHOOLS_QA_PAUSED', { reason });

/**
 * Questions the member has asked since 00:00 UTC: the reservation rows (`reserveQuestion`), one per question, written
 * before any model call. A failing provider cannot be hammered for free, and a lost metering write cannot lose a count.
 */
export async function questionsToday(userId: string, now: Date = new Date()): Promise<number> {
  return prisma.aiUsage.count({
    where: {
      userId,
      task: QA_TASK,
      promptId: QA_ASK_PROMPT_ID,
      createdAt: { gte: utcDayStart(now) },
    },
  });
}

export interface QaCaller {
  /** The `defineHandler` `isAdmin` of this request. An admin has no per-user limit (plan R19). */
  isAdmin?: boolean;
}

/**
 * The limit tier of this request (plan R19), resolved per request on the server and never taken from the client: an
 * admin (the session's `isAdmin`), else a paying member (`getUserTier`, the Stripe membership and gift memberships the
 * rest of the site uses), else a member with an APPROVED limit request, else free. A lookup that fails drops to the
 * next lower tier (a smaller cap), never to a higher one.
 */
export async function resolveQaTier(userId: string, caller: QaCaller = {}): Promise<QaTier> {
  if (caller.isAdmin) return 'admin';
  try {
    if ((await getUserTier(userId)) !== 'free') return 'member';
  } catch {
    // fall through to the lower tiers
  }
  try {
    const grant = await prisma.medQaLimitRequest.findFirst({
      where: { userId, status: 'APPROVED' },
      select: { id: true },
    });
    if (grant) return 'approved';
  } catch {
    // free
  }
  return 'free';
}

/** A tier's daily cap from the environment, `null` for an admin. */
export const capForTier = (tier: QaTier): number | null => qaCapForTier(tier, process.env, warnOnce);

/**
 * The member's tier, questions left today and cap. An admin has `null` for both (no daily limit) and no ledger read. A
 * ledger error is `MEDSCHOOLS_QA_PAUSED` (unavailable), never "plenty left".
 */
export async function dailyStatus(
  userId: string,
  now: Date = new Date(),
  caller: QaCaller = {},
): Promise<{ tier: QaTier; remainingToday: number | null; dailyCap: number | null }> {
  const tier = await resolveQaTier(userId, caller);
  const dailyCap = capForTier(tier);
  if (dailyCap === null) return { tier, remainingToday: null, dailyCap: null };
  let used: number;
  try {
    used = await questionsToday(userId, now);
  } catch {
    throw paused('unavailable');
  }
  return { tier, remainingToday: Math.max(0, dailyCap - used), dailyCap };
}

export interface Reservation {
  tier: QaTier;
  /** Questions left today AFTER this one; `null` for an admin. */
  remainingToday: number | null;
  /** `null` for an admin. */
  dailyCap: number | null;
  /** Ends the in-flight lease. Never throws; a failure only means the lease runs out by itself (`QA_LEASE_MS`). */
  release(): Promise<void>;
}

const ledgerRow = (userId: string, promptId: string) => ({
  userId,
  task: QA_TASK,
  provider: 'none',
  model: 'reservation',
  promptId,
  promptVer: null,
  inTokens: 0,
  outTokens: 0,
  cacheHitTokens: 0,
  costMicros: 0,
  ok: true,
});

/**
 * Takes the member's place in the day and in the queue of one, atomically and across every process: inside one
 * transaction holding `pg_advisory_xact_lock` on the member (the transaction-scoped form, which the pooler allows) it
 * refuses when a lease younger than `QA_LEASE_MS` exists (429 `MEDSCHOOLS_QA_BUSY`), refuses when the day's reservations
 * are at the cap (429 `MEDSCHOOLS_QA_DAILY_CAP`), and otherwise writes the reservation and the lease. Both are rows of
 * the AI ledger with no tokens and no cost, so the cap never depends on the provider's metering write. A database
 * error is 503 `MEDSCHOOLS_QA_PAUSED` (unavailable): no ledger, no question.
 */
export async function reserveQuestion(
  userId: string,
  now: Date = new Date(),
  caller: QaCaller = {},
): Promise<Reservation> {
  const tier = await resolveQaTier(userId, caller);
  const dailyCap = capForTier(tier);
  // An admin skips the daily cap and the in-flight lease (R19): nothing to reserve, nothing to release.
  if (dailyCap === null) return { tier, remainingToday: null, dailyCap: null, release: async () => undefined };
  type Outcome = { kind: 'busy' } | { kind: 'cap' } | { kind: 'ok'; used: number; leaseId: bigint };
  let out: Outcome;
  try {
    out = await prisma.$transaction(async (tx): Promise<Outcome> => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`med-qa:${userId}`}, 0))`;
      const leased = await tx.aiUsage.count({
        where: {
          userId,
          task: QA_TASK,
          promptId: QA_LOCK_PROMPT_ID,
          createdAt: { gte: new Date(now.getTime() - QA_LEASE_MS) },
        },
      });
      if (leased > 0) return { kind: 'busy' };
      const used = await tx.aiUsage.count({
        where: { userId, task: QA_TASK, promptId: QA_ASK_PROMPT_ID, createdAt: { gte: utcDayStart(now) } },
      });
      if (used >= dailyCap) return { kind: 'cap' };
      await tx.aiUsage.create({ data: ledgerRow(userId, QA_ASK_PROMPT_ID) });
      const lease = await tx.aiUsage.create({ data: ledgerRow(userId, QA_LOCK_PROMPT_ID), select: { id: true } });
      return { kind: 'ok', used: used + 1, leaseId: lease.id };
    });
  } catch {
    throw paused('unavailable');
  }
  if (out.kind === 'busy') throw new AppError('MEDSCHOOLS_QA_BUSY');
  if (out.kind === 'cap') throw new AppError('MEDSCHOOLS_QA_DAILY_CAP');
  const { leaseId, used } = out;
  return {
    tier,
    remainingToday: Math.max(0, dailyCap - used),
    dailyCap,
    async release() {
      try {
        await prisma.aiUsage.deleteMany({ where: { id: leaseId } });
      } catch {
        console.error('[medschools-qa] could not end the in-flight lease; it expires by itself');
      }
    },
  };
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

/**
 * Every gate in front of the first model call, in the order that gives the most useful refusal (plan R18): the shared
 * monthly gate first (a pause is for everyone, so say so instead of blaming this member's day), then the member's own
 * allowance (`AI_BUDGET_EXCEEDED`, the upgrade envelope), then the atomic reservation (`MEDSCHOOLS_QA_BUSY`, then
 * `MEDSCHOOLS_QA_DAILY_CAP`). The first two only read, so a refused question never uses up a daily one.
 */
export async function admitQuestion(
  userId: string,
  now: Date = new Date(),
  caller: QaCaller = {},
): Promise<Reservation> {
  await assertSharedBudget(now);
  // An admin has no per-user ceiling of any kind (R19); the shared monthly pause above still applies to them.
  if (!caller.isAdmin) await assertAiBudget(userId);
  return reserveQuestion(userId, now, caller);
}
