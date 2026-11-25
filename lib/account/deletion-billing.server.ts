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
 *    from Stripe first (the webhook-written `Subscription` row can lag). The flip and a metadata marker
 *    (`rmh_deletion_stop`) go in ONE `update` call, so Stripe holds both or neither, and a crash before the hold
 *    write cannot strand a subscription: the marker says whose flip it was. The hold records the ids flipped here
 *    (and any marked one found already ending). A subscription the member had already set to cancel carries no
 *    marker and is never recorded, so a restore never resumes it.
 *  - `resumeBilling` resumes the union of the recorded ids and every marked candidate that Stripe still shows as
 *    live and set to cancel at the period's end, flipping it back and removing the marker in ONE `update`; one the
 *    member cancelled for themselves carries no marker and is left alone.
 *  - `cancelRemainingBilling` is the erasure pre-step: whatever is still active (listed from Stripe by the member's
 *    customer id as well as from the `Subscription` rows) is cancelled now, with no refund and no final invoice.
 *    It throws on a Stripe error, so an account that is still billed is never erased.
 *
 * `DeletionHold.billingSyncedAt` is a done-stamp: the request and the withdrawal null it, `syncBilling` sets it when
 * it finishes with nothing left to do, and the hourly sweep (`deletion-billing-reconcile.server.ts`) queues the
 * holds where it is still null.
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
  metadata?: Record<string, string> | null;
}

/** The Stripe metadata key a stop writes in the same call that flips the subscription; its value is the hold's time. */
export const DELETION_STOP_MARKER = 'rmh_deletion_stop';
/** Subscriptions Stripe lists per page, and how many pages are read: past 1,000 the step throws. */
const LIST_PAGE_SIZE = 100;
const LIST_MAX_PAGES = 10;

/** The part of the Stripe client these steps call. Tests pass a fake. */
export interface BillingStripe {
  subscriptions: {
    retrieve(id: string): Promise<BillingSubscription>;
    update(
      id: string,
      params: { cancel_at_period_end?: boolean; metadata?: Record<string, string> },
    ): Promise<BillingSubscription>;
    cancel(id: string, params: { prorate: boolean; invoice_now: boolean }): Promise<BillingSubscription>;
    list(params: {
      customer: string;
      status: 'all';
      limit: number;
      starting_after?: string;
    }): Promise<{ data: BillingSubscription[]; has_more?: boolean }>;
  };
}

/** A subscription in one of these states is billing the member. */
const LIVE = new Set(['active', 'trialing', 'past_due']);
/** One that has ended for good cannot be cancelled or resumed. */
const ENDED = new Set(['canceled', 'incomplete_expired']);

/** The marker value a stop for this hold writes: the hold's `createdAt` in milliseconds. */
const markerFor = (createdAt: Date): string => String(createdAt.getTime());
/**
 * Whether THIS hold's stop flipped the subscription. Only an exact value match counts: a marker an older request
 * left behind (its resume could not clear it) never makes a later cancellation the member chose look like ours.
 */
const isMarkedBy = (sub: BillingSubscription, marker: string | null): boolean =>
  marker !== null && sub.metadata?.[DELETION_STOP_MARKER] === marker;
const hasAnyMarker = (sub: BillingSubscription): boolean => !!sub.metadata?.[DELETION_STOP_MARKER];

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
async function holdCreatedAt(userId: string): Promise<Date | null> {
  const hold = await prisma.deletionHold.findUnique({ where: { userId }, select: { createdAt: true } });
  return hold?.createdAt instanceof Date ? hold.createdAt : null;
}

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
    let after: string | undefined;
    for (let page = 1; ; page += 1) {
      const listed = await stripe.subscriptions.list({
        customer: customerId,
        status: 'all',
        limit: LIST_PAGE_SIZE,
        ...(after ? { starting_after: after } : {}),
      });
      for (const s of listed.data) found.set(s.id, s);
      const last = listed.data[listed.data.length - 1];
      if (!listed.has_more || !last) break;
      if (page >= LIST_MAX_PAGES) {
        // Refuse rather than miss one: the job retries and the erasure does not finish.
        log('too-many-subscriptions', { count: found.size });
        throw new Error('billing: more subscriptions than the list reads');
      }
      after = last.id;
    }
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
  const toFlip = subs.filter((s) => LIVE.has(s.status) && !s.cancel_at_period_end && !s.cancel_at);
  // The marker is the hold's `createdAt`, and the hold exists BEFORE the first flip: a crash between Stripe's answer
  // and the hold write then still leaves a hold the withdrawal keeps and a marker its resume matches.
  let createdAt = await holdCreatedAt(userId);
  if (!createdAt && toFlip.length > 0) {
    await prisma.$transaction(async (tx) => {
      await lockKey(tx, `deletion-hold:${userId}`);
      await tx.deletionHold.upsert({
        where: { userId },
        create: { userId, keyIds: [], webhookIds: [], subscriptionIds: [], createdAt: new Date() },
        update: {},
      });
    });
    createdAt = await holdCreatedAt(userId);
  }
  const marker = createdAt ? markerFor(createdAt) : null;

  const flipped: string[] = [];
  let failures = 0;
  for (const sub of subs) {
    if (!LIVE.has(sub.status)) continue;
    // A subscription an earlier, interrupted stop for this hold flipped carries its marker: record it now.
    if (sub.cancel_at_period_end && isMarkedBy(sub, marker)) {
      flipped.push(sub.id);
      continue;
    }
    // Stripe's word, not the row's: already ending (at the period's end or on a date the member chose) is theirs.
    if (sub.cancel_at_period_end || sub.cancel_at || marker === null) continue;
    try {
      // One call: Stripe holds the flip and the marker together or neither.
      const updated = await stripe.subscriptions.update(sub.id, {
        cancel_at_period_end: true,
        metadata: { [DELETION_STOP_MARKER]: marker },
      });
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

/**
 * Resume every subscription the stop flipped: the recorded ids, plus any candidate that carries the stop's marker
 * (a crash before the hold write recorded nothing). Each is read from Stripe first and resumed only while it is live
 * and still set to cancel at the period's end; the flip back and the marker's removal are one `update`. One the
 * member cancelled themselves has no marker and is not recorded, so it is never touched. Then the handled ids leave
 * the hold, and the hold goes when nothing else is in it.
 */
export async function resumeBilling(
  userId: string,
  ids: readonly string[],
  stripe: BillingStripe = defaultStripe(),
): Promise<string[]> {
  const member = await readMember(userId);
  const candidates = await candidateSubscriptions(stripe, userId, member?.stripeCustomerId ?? null);
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const createdAt = await holdCreatedAt(userId);
  const marker = createdAt ? markerFor(createdAt) : null;

  const handled: string[] = [];
  const resumed: string[] = [];
  let failures = 0;
  const act = async (id: string, sub: BillingSubscription) => {
    if (LIVE.has(sub.status) && sub.cancel_at_period_end) {
      await stripe.subscriptions.update(id, {
        cancel_at_period_end: false,
        metadata: { [DELETION_STOP_MARKER]: '' },
      });
      resumed.push(id);
    }
  };
  for (const id of ids) {
    try {
      await act(id, byId.get(id) ?? (await stripe.subscriptions.retrieve(id)));
      handled.push(id);
    } catch (err) {
      // Gone from Stripe: nothing to resume, and retrying would never clear it from the hold.
      if ((err as { code?: string } | null)?.code === 'resource_missing') handled.push(id);
      else failures += 1;
    }
  }
  for (const sub of candidates) {
    if (ids.includes(sub.id) || !LIVE.has(sub.status)) continue;
    try {
      if (sub.cancel_at_period_end) {
        if (isMarkedBy(sub, marker)) await act(sub.id, sub);
      } else if (hasAnyMarker(sub)) {
        // Resumed elsewhere (the dashboard, the portal) while the request was pending: only the marker is removed,
        // so it cannot later make a cancellation the member chooses look like ours. Nothing else is sent.
        await stripe.subscriptions.update(sub.id, { metadata: { [DELETION_STOP_MARKER]: '' } });
      }
    } catch {
      failures += 1;
    }
  }

  // The handled ids always leave the hold; the hold itself goes only after a clean run, because a marked
  // subscription that failed is not in the id list and the hold is what makes the retry (and the sweep) find it.
  if (handled.length > 0 || failures === 0) {
    await prisma.$transaction(async (tx) => {
      await lockKey(tx, `deletion-hold:${userId}`);
      const hold = await tx.deletionHold.findUnique({ where: { userId } });
      if (!hold) return;
      const left = hold.subscriptionIds.filter((x) => !handled.includes(x));
      const again = await tx.user.findUnique({ where: { id: userId }, select: { deletionScheduledAt: true } });
      const requestedAgain = !!again && again.deletionScheduledAt instanceof Date;
      if (
        failures === 0 &&
        left.length === 0 &&
        hold.keyIds.length === 0 &&
        hold.webhookIds.length === 0 &&
        !requestedAgain
      ) {
        await tx.deletionHold.deleteMany({ where: { userId } });
      } else if (left.length !== hold.subscriptionIds.length) {
        await tx.deletionHold.updateMany({ where: { userId }, data: { subscriptionIds: left } });
      }
    });
  }
  if (failures > 0) throw new Error(`billing resume: ${failures} subscription call(s) failed`);
  return resumed;
}

/** Stamp the hold's done-stamp unconditionally (a no-op when there is no hold): Stripe unconfigured. */
async function stampSynced(userId: string): Promise<void> {
  await prisma.deletionHold.updateMany({ where: { userId }, data: { billingSyncedAt: new Date() } });
}

/**
 * Stamp the done-stamp only if the member's choice is still the one this run synced. The stamp is written FIRST
 * (taking the hold row's lock) and the choice read after it, in one transaction: a withdrawal commits its
 * `deletionScheduledAt` before `restoreAfterCancel` nulls the stamp, and a request's schedule commits before
 * `markBillingPending` nulls it, so either that null lands after this stamp, or the read here already sees the new
 * choice and takes the stamp back. Resolves to false when it took it back (the caller queues another run).
 */
async function stampIfStill(userId: string, wasScheduled: boolean): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    await lockKey(tx, `deletion-hold:${userId}`);
    const { count } = await tx.deletionHold.updateMany({ where: { userId }, data: { billingSyncedAt: new Date() } });
    if (count === 0) return true;
    const now = await tx.user.findUnique({ where: { id: userId }, select: { deletionScheduledAt: true } });
    if (!now || now.deletionScheduledAt instanceof Date === wasScheduled) return true;
    await tx.deletionHold.updateMany({ where: { userId }, data: { billingSyncedAt: null } });
    return false;
  });
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
    // Nothing will ever be left to do here, so the sweep does not queue this member every hour.
    await stampSynced(userId);
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
    // No hold means no request was ever recorded (or the resume already finished): nothing to undo, no Stripe call.
    // A hold with an empty id list still resumes: a stop that crashed before recording left only the marker.
    const hold = await prisma.deletionHold.findUnique({ where: { userId } });
    if (!hold) return 'skipped';
    const ids = Array.isArray(hold.subscriptionIds) ? hold.subscriptionIds : [];
    await resumeBilling(userId, ids, stripe);
    outcome = 'resumed';
  }

  // The member may have changed their mind while Stripe was being called: the latest choice wins.
  const after = await readMember(userId);
  if (after && !after.erased && (after.deletionScheduledAt !== null) !== wasScheduled) {
    await (deps.enqueue ?? enqueueBillingSync)(userId);
    return 'requeued';
  }
  if (!(await stampIfStill(userId, wasScheduled))) {
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
