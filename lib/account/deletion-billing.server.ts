/**
 * A deletion request ends the membership too (s12-18, server only).
 *
 * Stripe is called from here and from nowhere else in the deletion flow, always OUTSIDE a database transaction:
 *
 *  - `syncBilling(userId)` is the whole reconcile and the only thing the `account.billing-sync` job runs. It decides
 *    from the database WHEN IT RUNS (is `deletionScheduledAt` set?), not from what queued it: set means stop, unset
 *    means resume. After its Stripe calls it reads the state again and queues itself if the member changed their
 *    mind meanwhile, so the last word is always the member's latest choice. There is deliberately no separate
 *    "stop" and "resume" command: two opposite jobs retrying in the wrong order would leave a returning member's
 *    membership set to end, or resume one for an account being deleted.
 *  - `stopBilling` sets each active subscription to cancel at the period's end (no refund, no proration), reading it
 *    from Stripe first (the webhook-written `Subscription` row can lag) and recording on the `DeletionHold` only the
 *    ids its own `update` flipped. A subscription the member had already set to cancel is never recorded, so a
 *    restore never resumes it.
 *  - `resumeBilling` resumes the recorded ids that Stripe still shows as set to cancel at the period's end and not
 *    ended; one the member cancelled for themselves since is left alone.
 *  - `cancelRemainingBilling` is the erasure pre-step: whatever is still active (listed from Stripe by the member's
 *    customer id as well as from the `Subscription` rows) is cancelled now, with no refund and no final invoice.
 *    It throws on a Stripe error, so an account that is still billed is never erased.
 *
 * With Stripe unconfigured every step logs and returns. No Stripe key or id is ever logged.
 */
import { prisma } from '@/lib/prisma.server';
import { lockKey } from '@/lib/db/advisory-lock.server';
import { DELETED_ACCOUNT_BAN_REASON } from '@/lib/account-lifecycle';
import { getStripeClient, stripeConfigured } from '@/lib/billing/stripe-client.server';
import { enqueueBillingSync } from '@/lib/account/deletion-billing-queue.server';
import { mergeIds } from '@/lib/account/deletion-hold';

/** The part of a Stripe subscription these steps read. */
export interface BillingSubscription {
  id: string;
  status: string;
  cancel_at_period_end: boolean;
  cancel_at?: number | null;
}

/** The part of the Stripe client these steps call. Tests pass a fake. */
export interface BillingStripe {
  subscriptions: {
    retrieve(id: string): Promise<BillingSubscription>;
    update(id: string, params: { cancel_at_period_end: boolean }): Promise<BillingSubscription>;
    cancel(id: string, params: { prorate: boolean; invoice_now: boolean }): Promise<BillingSubscription>;
    list(params: { customer: string; status: 'all'; limit: number }): Promise<{ data: BillingSubscription[] }>;
  };
}

/** A subscription in one of these states is billing the member. */
const LIVE = new Set(['active', 'trialing', 'past_due']);
/** One that has ended for good cannot be cancelled or resumed. */
const ENDED = new Set(['canceled', 'incomplete_expired']);

const defaultStripe = (): BillingStripe => getStripeClient() as unknown as BillingStripe;

function log(event: string, extra: Record<string, unknown> = {}): void {
  // Counts and step names only: never a key, a customer id or a subscription id.
  console.warn(JSON.stringify({ level: 'warn', event: `account.billing.${event}`, ...extra }));
}

interface MemberBilling {
  deletionScheduledAt: Date | null;
  stripeCustomerId: string | null;
  erased: boolean;
}

async function readMember(userId: string): Promise<MemberBilling | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { deletionScheduledAt: true, stripeCustomerId: true, banReason: true },
  });
  if (!user || typeof user !== 'object') return null;
  return {
    deletionScheduledAt: user.deletionScheduledAt instanceof Date ? user.deletionScheduledAt : null,
    stripeCustomerId: typeof user.stripeCustomerId === 'string' ? user.stripeCustomerId : null,
    erased: user.banReason === DELETED_ACCOUNT_BAN_REASON,
  };
}

/** Every Stripe subscription id that may belong to the member: the rows the plugin wrote, and Stripe's own list. */
async function candidateSubscriptions(
  stripe: BillingStripe,
  userId: string,
  customerId: string | null,
): Promise<BillingSubscription[]> {
  const rows = await prisma.subscription.findMany({
    where: { referenceId: userId, stripeSubscriptionId: { not: null } },
    select: { stripeSubscriptionId: true },
  });
  const found = new Map<string, BillingSubscription>();
  if (customerId) {
    const listed = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 100 });
    for (const s of listed.data) found.set(s.id, s);
  }
  for (const row of Array.isArray(rows) ? rows : []) {
    const id = row.stripeSubscriptionId;
    if (typeof id !== 'string' || found.has(id)) continue;
    try {
      found.set(id, await stripe.subscriptions.retrieve(id));
    } catch (err) {
      // A row can outlive its subscription (deleted in Stripe): nothing there to stop, nothing to cancel.
      if ((err as { code?: string } | null)?.code !== 'resource_missing') throw err;
    }
  }
  return [...found.values()];
}

/**
 * Set every live, not-already-cancelling subscription to end with its period, then record on the hold the ids this
 * call flipped. Failed calls do not stop the others; what was flipped is recorded first, then the error is thrown
 * so the job retries the rest.
 */
export async function stopBilling(userId: string, stripe: BillingStripe = defaultStripe()): Promise<string[]> {
  const member = await readMember(userId);
  if (!member || member.erased) return [];
  const subs = await candidateSubscriptions(stripe, userId, member.stripeCustomerId);

  const flipped: string[] = [];
  let failures = 0;
  for (const sub of subs) {
    // Stripe's word, not the row's: already ending (at the period's end or on a date the member chose) is theirs.
    if (!LIVE.has(sub.status) || sub.cancel_at_period_end || sub.cancel_at) continue;
    try {
      const updated = await stripe.subscriptions.update(sub.id, { cancel_at_period_end: true });
      if (updated.cancel_at_period_end) flipped.push(sub.id);
    } catch {
      failures += 1;
    }
  }

  if (flipped.length > 0) {
    await prisma.$transaction(async (tx) => {
      await lockKey(tx, `deletion-hold:${userId}`);
      const existing = await tx.deletionHold.findUnique({ where: { userId } });
      // The hold may be gone (the request was withdrawn while the calls were in flight): it is recreated so the
      // resume the sync queues next still knows what to undo.
      await tx.deletionHold.upsert({
        where: { userId },
        create: { userId, keyIds: [], webhookIds: [], subscriptionIds: mergeIds([], flipped) },
        update: { subscriptionIds: mergeIds(existing?.subscriptionIds ?? [], flipped) },
      });
    });
  }
  if (failures > 0) throw new Error(`billing stop: ${failures} subscription update(s) failed`);
  return flipped;
}

/** Resume what the hold recorded and Stripe still shows as ending, then drop those ids (and the hold when empty). */
export async function resumeBilling(
  userId: string,
  ids: readonly string[],
  stripe: BillingStripe = defaultStripe(),
): Promise<string[]> {
  const handled: string[] = [];
  const resumed: string[] = [];
  let failures = 0;
  for (const id of ids) {
    try {
      const sub = await stripe.subscriptions.retrieve(id);
      if (LIVE.has(sub.status) && sub.cancel_at_period_end) {
        await stripe.subscriptions.update(id, { cancel_at_period_end: false });
        resumed.push(id);
      }
      handled.push(id);
    } catch (err) {
      // Gone from Stripe: nothing to resume, and retrying would never clear it from the hold.
      if ((err as { code?: string } | null)?.code === 'resource_missing') handled.push(id);
      else failures += 1;
    }
  }

  if (handled.length > 0) {
    await prisma.$transaction(async (tx) => {
      await lockKey(tx, `deletion-hold:${userId}`);
      const hold = await tx.deletionHold.findUnique({ where: { userId } });
      if (!hold) return;
      const left = hold.subscriptionIds.filter((x) => !handled.includes(x));
      if (left.length === 0 && hold.keyIds.length === 0 && hold.webhookIds.length === 0) {
        await tx.deletionHold.deleteMany({ where: { userId } });
      } else {
        await tx.deletionHold.updateMany({ where: { userId }, data: { subscriptionIds: left } });
      }
    });
  }
  if (failures > 0) throw new Error(`billing resume: ${failures} subscription call(s) failed`);
  return resumed;
}

export type BillingSyncOutcome = 'unconfigured' | 'skipped' | 'stopped' | 'resumed' | 'requeued';

/**
 * Bring Stripe in line with the member's current choice. Idempotent; safe to run twice or out of order.
 * `enqueue` is injectable for tests.
 */
export async function syncBilling(
  userId: string,
  deps: { stripe?: BillingStripe; enqueue?: (userId: string) => Promise<unknown> } = {},
): Promise<BillingSyncOutcome> {
  if (!stripeConfigured()) {
    log('unconfigured');
    return 'unconfigured';
  }
  const member = await readMember(userId);
  if (!member || member.erased) return 'skipped';
  const stripe = deps.stripe ?? defaultStripe();
  const wasScheduled = member.deletionScheduledAt !== null;

  let outcome: BillingSyncOutcome;
  if (wasScheduled) {
    await stopBilling(userId, stripe);
    outcome = 'stopped';
  } else {
    const hold = await prisma.deletionHold.findUnique({ where: { userId } });
    const ids = hold && Array.isArray(hold.subscriptionIds) ? hold.subscriptionIds : [];
    if (ids.length === 0) return 'skipped';
    await resumeBilling(userId, ids, stripe);
    outcome = 'resumed';
  }

  // The member may have changed their mind while Stripe was being called: the latest choice wins.
  const after = await readMember(userId);
  if (after && !after.erased && (after.deletionScheduledAt !== null) !== wasScheduled) {
    await (deps.enqueue ?? enqueueBillingSync)(userId);
    return 'requeued';
  }
  return outcome;
}

/**
 * The erasure pre-step: cancel, now and without refund, every subscription of the member that still bills.
 * Throws on a Stripe error (the attempt fails and is retried) rather than erasing an account that is still billed.
 */
export async function cancelRemainingBilling(userId: string, stripe?: BillingStripe): Promise<number> {
  if (!stripeConfigured()) {
    log('unconfigured');
    return 0;
  }
  const client = stripe ?? defaultStripe();
  const member = await readMember(userId);
  const subs = await candidateSubscriptions(client, userId, member?.stripeCustomerId ?? null);

  let cancelled = 0;
  let failures = 0;
  for (const sub of subs) {
    if (ENDED.has(sub.status)) continue;
    try {
      await client.subscriptions.cancel(sub.id, { prorate: false, invoice_now: false });
      cancelled += 1;
    } catch {
      failures += 1;
    }
  }
  if (failures > 0) throw new Error(`billing cancel: ${failures} subscription(s) could not be cancelled`);
  return cancelled;
}
