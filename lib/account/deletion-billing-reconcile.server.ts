/**
 * The hourly billing sweep (s13-18, server only; registered under the `s13-18` anchor in `server/jobs/index.ts`).
 *
 * A deletion request or its withdrawal clears `DeletionHold.billingSyncedAt` in the same transaction that writes the
 * hold and then queues `account.billing-sync`; the sync stamps it when Stripe matches the member's current choice. If
 * the queue was down, the stamp stays null, and this sweep queues the sync for those holds, so a request is stopped
 * and a withdrawal is resumed within the hour.
 *
 * The sweep writes nothing and decides nothing: `syncBilling` reads the member's state when it runs. Duplicates are
 * the queue's to prevent (the `short` policy and the `billing-sync:<userId>` singleton key), so two sweeps racing
 * queue each member once. Logs carry the count only.
 */
import type { PgBoss } from 'pg-boss';
import { prisma } from '@/lib/prisma.server';
import { DELETED_ACCOUNT_BAN_REASON } from '@/lib/account-lifecycle';
import { enqueueBillingSync } from '@/lib/account/deletion-billing-queue.server';

export const BILLING_RECONCILE_QUEUE = 'account.billing-reconcile';
/** Hourly, at minute 23. */
export const BILLING_RECONCILE_CRON = '23 * * * *';
/** Members queued per sweep at most; the rest wait for the next hour. */
export const BILLING_RECONCILE_LIMIT = 500;

/** The members whose billing sync has not finished, oldest request first, erased accounts left out. Reads only. */
export async function holdsAwaitingBillingSync(limit: number = BILLING_RECONCILE_LIMIT): Promise<string[]> {
  const rows = await prisma.deletionHold.findMany({
    where: {
      billingSyncedAt: null,
      user: { OR: [{ banReason: null }, { banReason: { not: DELETED_ACCOUNT_BAN_REASON } }] },
    },
    select: { userId: true },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });
  return (Array.isArray(rows) ? rows : []).map((r) => r.userId);
}

/** Queue the sync for each such member. Resolves to how many jobs were sent. */
export async function sweepBillingSync(boss: PgBoss): Promise<number> {
  const userIds = await holdsAwaitingBillingSync();
  let queued = 0;
  for (const userId of userIds) {
    if (await enqueueBillingSync(userId, boss)) queued += 1;
  }
  console.warn(JSON.stringify({ level: 'warn', event: 'account.billing.reconcile', queued }));
  return queued;
}

/** Register the hourly sweep. Called once from the jobs worker (only it can schedule). */
export async function registerBillingReconcileCron(boss: PgBoss): Promise<void> {
  await boss.createQueue(BILLING_RECONCILE_QUEUE);
  await boss.schedule(BILLING_RECONCILE_QUEUE, BILLING_RECONCILE_CRON, {}, { tz: 'UTC' });
  await boss.work(BILLING_RECONCILE_QUEUE, async () => {
    await sweepBillingSync(boss);
  });
}
