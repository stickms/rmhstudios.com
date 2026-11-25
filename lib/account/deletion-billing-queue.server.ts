/**
 * Sending `account.billing-sync` (s12-18, server only). Split from the worker module so the code that queues it
 * (the deletion pause and restore, the sync itself) and the code the worker runs do not import each other.
 *
 * The payload is the member's id and nothing else: the job decides what to do from the database when it runs.
 */
import type { PgBoss } from 'pg-boss';
import { getBoss } from '@/lib/jobs/boss.server';

export const BILLING_SYNC_QUEUE = 'account.billing-sync';

export interface BillingSyncJob {
  userId: string;
}

/** One waiting job per member (the `short` policy keys on this), five attempts with backoff. */
export function billingSyncSendOptions(userId: string) {
  return {
    singletonKey: `billing-sync:${userId}`,
    retryLimit: 5,
    retryDelay: 30,
    retryBackoff: true,
    expireInSeconds: 60 * 60,
  };
}

/**
 * Queue the job. Never rejects: a request that has already committed must not fail because the queue is down, and
 * a queue that is down is logged (no member data). Resolves to whether a job was sent.
 */
export async function enqueueBillingSync(userId: string, bossOverride?: PgBoss | null): Promise<boolean> {
  try {
    const boss = bossOverride === undefined ? await getBoss() : bossOverride;
    if (!boss) throw new Error('queue unavailable');
    const job: BillingSyncJob = { userId };
    await boss.send(BILLING_SYNC_QUEUE, job, billingSyncSendOptions(userId));
    return true;
  } catch {
    console.error('[account] billing sync could not be queued; the next deletion request or sign-in queues it again');
    return false;
  }
}
