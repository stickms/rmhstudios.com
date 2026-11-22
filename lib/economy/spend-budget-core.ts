/**
 * Monthly spending budget (s04-07) — the enforcement, bound to a caller's
 * Prisma client.
 *
 * Same split as `play-limits-core.ts`, for the same reason: the socket tier
 * binds its own client and bundles `ledger-core.ts`, so this module takes the
 * client to use and imports no `.server` module.
 *
 * Called from `debitCoinsOn` and `transferCoinsOn` (the sender side), inside
 * the ledger's transaction and before the balance update, for the spend types
 * only. A member with no row, or no cap, costs one indexed read and nothing
 * else; with a cap there is the lock and one `SUM`.
 */
import { notice, noticeColumns } from '@/lib/notifications/notice-keys';
import { AppError } from '../errors/codes';
import type { Db } from './ledger-core';
import {
  SPEND_TYPES,
  countsAsSpending,
  crossesNotice,
  effectiveSpendCap,
  monthBounds,
  monthKey,
  remainingBudget,
  wouldExceed,
  type SpendBudget,
} from './spend-budget';

const BUDGET_SELECT = {
  monthlySpendCap: true,
  pendingSpendCap: true,
  pendingSpendCapAt: true,
  spendNoticeMonth: true,
} as const;

/** The member's budget columns; a member with no row has no budget. */
export async function readSpendBudget(db: Db, userId: string): Promise<SpendBudget | null> {
  return db.userPlayLimits.findUnique({ where: { userId }, select: BUDGET_SELECT });
}

/** Coins this member has spent so far in the UTC month containing `now`. */
export async function spentThisMonthOn(db: Db, userId: string, now: Date): Promise<number> {
  const { start, end } = monthBounds(now);
  const agg = await db.coinTransaction.aggregate({
    where: {
      senderId: userId,
      type: { in: [...SPEND_TYPES] },
      createdAt: { gte: start, lt: end },
    },
    _sum: { amount: true },
  });
  return Number(agg._sum.amount ?? 0);
}

/**
 * Refuse a spend that would take the member over the budget they set, and send
 * the once-a-month 80% notice when it takes them past that line.
 *
 * The lock is what makes the cap a cap. Two concurrent spends would otherwise
 * both read the same month total, both pass, and both be booked. Taking
 * `pg_advisory_xact_lock` first serialises a member's spends: the second waits
 * until the first commits, and its `SUM` (a fresh statement under READ
 * COMMITTED) then sees the first row. The statement is inlined rather than
 * calling `lockKey` because that lives in a `.server.ts` module this file must
 * not import; it is the same `hashtext` of the same `'spend:'` key. It only
 * serialises when `db` is the ledger's transaction, which `execute` guarantees.
 *
 * Throws `SPEND_BUDGET_REACHED` with `cap`, `spent` and `remaining` in the
 * detail; no coins have moved when it does.
 */
export async function assertSpendAllowedOn(
  db: Db,
  userId: string,
  amount: number,
  type: string,
  now: Date = new Date(),
): Promise<void> {
  if (!countsAsSpending(type)) return;

  const budget = await readSpendBudget(db, userId);
  if (!budget) return;
  const cap = effectiveSpendCap(budget, now);
  if (cap === null) return;

  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`spend:${userId}`}))`;

  const spent = await spentThisMonthOn(db, userId, now);
  if (wouldExceed(cap, spent, amount)) {
    throw new AppError('SPEND_BUDGET_REACHED', {
      cap,
      spent,
      remaining: remainingBudget(cap, spent),
    });
  }

  const month = monthKey(now);
  if (budget.spendNoticeMonth !== month && crossesNotice(cap, spent, amount)) {
    // Compare-and-set, so a notice can go out once even if the in-hand row was
    // stale. In the ledger's transaction: if the debit then fails, the notice
    // is rolled back with it and the next spend that crosses sends it.
    const claimed = await db.userPlayLimits.updateMany({
      where: {
        userId,
        OR: [{ spendNoticeMonth: null }, { spendNoticeMonth: { not: month } }],
      },
      data: { spendNoticeMonth: month },
    });
    if (claimed.count > 0) {
      await db.notification.create({
        data: {
          userId,
          type: 'SYSTEM',
          entityType: 'spend-budget',
          entityId: month,
          ...noticeColumns(notice('spend-budget-80', {})),
          link: '/wallet',
        },
        select: { id: true },
      });
    }
  }
}
