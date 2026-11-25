/**
 * The server half of /admin/deletions: the accounts waiting out their grace period, the overdue ones with their last
 * attempt, the last 30 days' finished erasures, and the audited "Try again now". Admin routes only.
 *
 * Nothing here selects an e-mail address, and an attempt's error is only ever the NAME stored on its row. There is no
 * "delete now": a retry on an account whose grace period has not ended is refused inside the claim's transaction.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { recordAdminActionIn } from '@/lib/admin-audit.server';
import { DELETED_ACCOUNT_BAN_REASON, isDeletedAccount } from '@/lib/account-lifecycle';
import { dayOf } from '@/lib/calendar/tz';
import {
  DELETION_GRACE_DAYS,
  ERASURE_CLAIM_WINDOW_MS,
  claimErasure,
  runClaimedErasure,
} from '@/lib/account/deletion.server';
import {
  DELETIONS_LIST_LIMIT,
  FINISHED_DAYS,
  NO_HOLD,
  OVERDUE_AFTER_MS,
  isOverdue,
  type AdminDeletions,
  type FinishedDay,
  type HoldCounts,
  type OverdueDeletionRow,
  type RetryErasureResult,
  type WaitingDeletionRow,
} from '@/lib/admin/deletions';

const DAY_MS = 24 * 60 * 60 * 1000;
const GRACE_MS = DELETION_GRACE_DAYS * DAY_MS;

/** A scheduled, not-yet-erased account (a tombstone keeps its marker, so it never reads as waiting). */
const scheduledWhere = {
  deletionScheduledAt: { not: null },
  OR: [{ banReason: null }, { banReason: { not: DELETED_ACCOUNT_BAN_REASON } }],
} satisfies Prisma.UserWhereInput;

function holdCounts(h: { keyIds: string[]; webhookIds: string[]; subscriptionIds: string[] } | undefined): HoldCounts {
  if (!h) return NO_HOLD;
  return { keys: h.keyIds.length, webhooks: h.webhookIds.length, subscriptions: h.subscriptionIds.length };
}

/** The last {@link FINISHED_DAYS} UTC days as keys, oldest first. */
function lastDays(now: Date): string[] {
  const out: string[] = [];
  for (let i = FINISHED_DAYS - 1; i >= 0; i -= 1) out.push(dayOf(now.getTime() - i * DAY_MS, 'UTC'));
  return out;
}

export async function listDeletions(now: Date = new Date()): Promise<AdminDeletions> {
  const overdueBefore = new Date(now.getTime() - OVERDUE_AFTER_MS);
  const finishedSince = new Date(now.getTime() - FINISHED_DAYS * DAY_MS);
  const [waitingTotal, overdueTotal, waitingUsers, overdueUsers, finishedRows] = await Promise.all([
    prisma.user.count({ where: { ...scheduledWhere, deletionScheduledAt: { gte: overdueBefore } } }),
    prisma.user.count({ where: { ...scheduledWhere, deletionScheduledAt: { lt: overdueBefore } } }),
    prisma.user.findMany({
      where: { ...scheduledWhere, deletionScheduledAt: { gte: overdueBefore } },
      select: { id: true, handle: true, deletionScheduledAt: true },
      orderBy: { deletionScheduledAt: 'asc' },
      take: DELETIONS_LIST_LIMIT,
    }),
    prisma.user.findMany({
      where: { ...scheduledWhere, deletionScheduledAt: { lt: overdueBefore } },
      select: { id: true, handle: true, deletionScheduledAt: true },
      orderBy: { deletionScheduledAt: 'asc' },
      take: DELETIONS_LIST_LIMIT,
    }),
    prisma.accountErasureAttempt.findMany({
      where: { ok: true, finishedAt: { gte: finishedSince } },
      select: { finishedAt: true },
    }),
  ]);

  const ids = [...waitingUsers, ...overdueUsers].map((u) => u.id);
  const [holds, attempts] = await Promise.all([
    ids.length
      ? prisma.deletionHold.findMany({
          where: { userId: { in: ids } },
          select: { userId: true, keyIds: true, webhookIds: true, subscriptionIds: true, createdAt: true },
        })
      : [],
    overdueUsers.length
      ? prisma.accountErasureAttempt.findMany({
          where: { userId: { in: overdueUsers.map((u) => u.id) } },
          select: { userId: true, startedAt: true, finishedAt: true, ok: true, errorName: true },
          orderBy: { startedAt: 'desc' },
        })
      : [],
  ]);
  const holdByUser = new Map(holds.map((h) => [h.userId, h]));

  const base = (u: { id: string; handle: string | null; deletionScheduledAt: Date | null }): WaitingDeletionRow => {
    const due = u.deletionScheduledAt as Date;
    const hold = holdByUser.get(u.id);
    return {
      userId: u.id,
      handle: u.handle,
      // The hold is written at the request, so it is the truest "requested" time; the grace period gives the rest.
      requestedAt: (hold?.createdAt ?? new Date(due.getTime() - GRACE_MS)).toISOString(),
      dueAt: due.toISOString(),
      held: holdCounts(hold),
    };
  };

  const waiting = waitingUsers.map(base);
  const overdue: OverdueDeletionRow[] = overdueUsers
    .filter((u) => isOverdue(u.deletionScheduledAt, now))
    .map((u) => {
      const mine = attempts.filter((a) => a.userId === u.id);
      const last = mine[0];
      const running =
        !!last && last.finishedAt === null && now.getTime() - last.startedAt.getTime() < ERASURE_CLAIM_WINDOW_MS;
      return {
        ...base(u),
        attempts: mine.length,
        lastErrorName: last?.errorName ?? null,
        lastAttemptAt: last ? last.startedAt.toISOString() : null,
        running,
      };
    });

  const counts = new Map<string, number>();
  for (const r of finishedRows) {
    if (!r.finishedAt) continue;
    const day = dayOf(r.finishedAt.getTime(), 'UTC');
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  const finished: FinishedDay[] = lastDays(now).map((day) => ({ day, count: counts.get(day) ?? 0 }));

  return {
    waiting,
    waitingTotal,
    overdue,
    overdueTotal,
    finished,
    finishedTotal: finished.reduce((n, d) => n + d.count, 0),
  };
}

export type RetryOutcome =
  { ok: true; result: RetryErasureResult } | { ok: false; code: 'ERASURE_NOT_OVERDUE' | 'ERASURE_IN_PROGRESS' };

class NotOverdue extends Error {}

/**
 * "Try again now" for one overdue account. The claim's transaction re-reads the account and refuses unless it is
 * still scheduled and overdue (so a member who signed back in, or an account still in its grace period, is never
 * erased from here) and writes the audit row in the same transaction as the attempt row. The erasure itself then runs
 * outside any transaction, as the sweep's does.
 */
export async function retryErasure(adminId: string, userId: string, now: Date = new Date()): Promise<RetryOutcome> {
  let attemptId: bigint | null;
  try {
    attemptId = await claimErasure(userId, 'admin', {
      now,
      inTx: async (tx) => {
        const user = await tx.user.findUnique({
          where: { id: userId },
          select: { deletionScheduledAt: true, banReason: true },
        });
        if (!user || isDeletedAccount(user) || !isOverdue(user.deletionScheduledAt, now)) throw new NotOverdue();
        await recordAdminActionIn(tx, adminId, 'account.erasure.retry', { targetType: 'user', targetId: userId });
      },
    });
  } catch (err) {
    if (err instanceof NotOverdue) return { ok: false, code: 'ERASURE_NOT_OVERDUE' };
    throw err;
  }
  if (attemptId === null) return { ok: false, code: 'ERASURE_IN_PROGRESS' };
  const out = await runClaimedErasure(attemptId, userId);
  return { ok: true, result: out.ok ? { erased: true, errorName: null } : { erased: false, errorName: out.errorName } };
}
