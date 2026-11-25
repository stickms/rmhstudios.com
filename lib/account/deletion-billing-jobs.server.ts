/**
 * The `account.billing-sync` worker (s12-18, server only; registered under the `s12-18` anchor in
 * `server/jobs/index.ts`). One job per member, retried with backoff; `syncBilling` is idempotent, so a retry, a
 * duplicate or a run after the member changed their mind all end in the state their latest choice asks for.
 */
import type { PgBoss } from 'pg-boss';
import { syncBilling } from '@/lib/account/deletion-billing.server';
import { BILLING_SYNC_QUEUE, type BillingSyncJob } from '@/lib/account/deletion-billing-queue.server';

export {
  BILLING_SYNC_QUEUE,
  enqueueBillingSync,
  billingSyncSendOptions,
} from '@/lib/account/deletion-billing-queue.server';
export type { BillingSyncJob } from '@/lib/account/deletion-billing-queue.server';

/** What the worker does with one job. A throw makes pg-boss retry it. */
export async function handleBillingSyncJob(job: { data: BillingSyncJob }): Promise<void> {
  await syncBilling(job.data.userId);
}

export async function registerBillingSyncWorker(boss: PgBoss): Promise<void> {
  await boss.createQueue(BILLING_SYNC_QUEUE, { policy: 'short' });
  await boss.work<BillingSyncJob>(BILLING_SYNC_QUEUE, { localConcurrency: 2 }, async (jobs) => {
    for (const job of jobs) await handleBillingSyncJob(job);
  });
}
