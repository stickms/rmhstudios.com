/**
 * s12-18: a deletion request ends the membership too. Stripe is a fake client behind the module getter, Prisma is
 * the in-memory fake the deletion-hold tests share, and the queue is a recorder: the worker is simulated by calling
 * `syncBilling` the way the job does.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeDb } from './deletion-hold-fake-db';
import { planRestore } from '@/lib/account/deletion-hold';

interface Sub {
  id: string;
  status: string;
  cancel_at_period_end: boolean;
  cancel_at: number | null;
  metadata: Record<string, string>;
}

const MARKER = 'rmh_deletion_stop';

const h = vi.hoisted(() => ({
  fake: null as unknown as ReturnType<typeof import('./deletion-hold-fake-db').makeDb>,
  subs: new Map<
    string,
    {
      id: string;
      status: string;
      cancel_at_period_end: boolean;
      cancel_at: number | null;
      metadata: Record<string, string>;
    }
  >(),
  calls: [] as string[],
  updateParams: [] as { id: string; params: Record<string, unknown> }[],
  listParams: [] as Record<string, unknown>[],
  failOn: new Set<string>(),
  onUpdate: null as null | ((id: string) => Promise<void>),
  configured: true,
  queued: [] as string[],
  locks: 0,
  onLock: null as null | ((n: number) => Promise<void>),
}));

vi.mock('@/lib/prisma.server', () => ({
  get prisma() {
    return h.fake.db;
  },
}));
vi.mock('@/lib/db/advisory-lock.server', () => ({
  lockKey: vi.fn(async () => {
    h.locks += 1;
    if (h.onLock) await h.onLock(h.locks);
  }),
}));
vi.mock('@/lib/account/deletion-billing-queue.server', () => ({
  enqueueBillingSync: vi.fn(async (userId: string) => {
    h.queued.push(userId);
    return true;
  }),
}));
vi.mock('@/lib/bulk/bulk.server', () => ({ cancelBulkOperation: vi.fn(async () => true) }));
vi.mock('@/lib/notifications.server', () => ({ createNotification: vi.fn(async () => undefined) }));
vi.mock('@/lib/billing/stripe-client.server', () => {
  const copy = (id: string) => {
    const s = h.subs.get(id);
    if (!s) throw Object.assign(new Error('no such subscription'), { code: 'resource_missing' });
    return { ...s, metadata: { ...s.metadata } };
  };
  return {
    stripeConfigured: () => h.configured,
    getStripeClient: () => ({
      subscriptions: {
        retrieve: vi.fn(async (id: string) => {
          h.calls.push(`retrieve:${id}`);
          return copy(id);
        }),
        update: vi.fn(
          async (id: string, params: { cancel_at_period_end?: boolean; metadata?: Record<string, string> }) => {
            h.calls.push(
              params.cancel_at_period_end === undefined
                ? `update:${id}:metadata`
                : `update:${id}:${params.cancel_at_period_end}`,
            );
            h.updateParams.push({ id, params: JSON.parse(JSON.stringify(params)) as Record<string, unknown> });
            if (h.failOn.has(id)) throw new Error('stripe down');
            const s = h.subs.get(id);
            if (!s) throw new Error('no such subscription');
            // Stripe leaves a field the call does not send as it was.
            if (params.cancel_at_period_end !== undefined) s.cancel_at_period_end = params.cancel_at_period_end;
            // Stripe: an empty value removes a metadata key.
            for (const [k, v] of Object.entries(params.metadata ?? {})) {
              if (v === '') delete s.metadata[k];
              else s.metadata[k] = v;
            }
            const out = { ...s, metadata: { ...s.metadata } };
            if (h.onUpdate) await h.onUpdate(id);
            return out;
          },
        ),
        cancel: vi.fn(async (id: string, params: { prorate: boolean; invoice_now: boolean }) => {
          h.calls.push(`cancel:${id}:${params.prorate}:${params.invoice_now}`);
          if (h.failOn.has(id)) throw new Error('stripe down');
          const s = h.subs.get(id);
          if (!s) throw new Error('no such subscription');
          s.status = 'canceled';
          return { ...s };
        }),
        list: vi.fn(async (params: { customer: string; status: string; limit: number; starting_after?: string }) => {
          h.calls.push(`list:${params.customer}:${params.status}`);
          h.listParams.push({ ...params });
          // Stripe pages by id order: `starting_after` is the last id of the previous page.
          const all = [...h.subs.values()];
          const from = params.starting_after ? all.findIndex((x) => x.id === params.starting_after) + 1 : 0;
          const page = all.slice(from, from + params.limit);
          return {
            data: page.map((x) => ({ ...x, metadata: { ...x.metadata } })),
            has_more: from + params.limit < all.length,
          };
        }),
      },
    }),
  };
});

import { cancelRemainingBilling, resumeBilling, stopBilling, syncBilling } from '@/lib/account/deletion-billing.server';
import {
  markBillingPending,
  pauseForDeletion,
  previewDeletionPause,
  restoreAfterCancel,
} from '@/lib/account/deletion-hold.server';

const NOW = new Date('2026-12-02T10:00:00Z');
const PERIOD_END = new Date('2026-12-14T00:00:00Z');

function sub(id: string, over: Partial<Sub> = {}): void {
  h.subs.set(id, { id, status: 'active', cancel_at_period_end: false, cancel_at: null, metadata: {}, ...over });
}

function seed(extra: Record<string, Record<string, unknown>[]> = {}) {
  return makeDb({
    user: [{ id: 'u1', deletionScheduledAt: NOW, stripeCustomerId: 'cus_u1', banReason: null }],
    // The rows lag Stripe on purpose: the job must trust Stripe, not these.
    subscription: [
      {
        id: 'r1',
        referenceId: 'u1',
        plan: 'pro',
        stripeSubscriptionId: 'sub_pro',
        status: 'active',
        cancelAtPeriodEnd: false,
        periodEnd: PERIOD_END,
      },
      {
        id: 'r2',
        referenceId: 'u1',
        plan: 'starter',
        stripeSubscriptionId: 'sub_stale',
        status: 'canceled',
        cancelAtPeriodEnd: false,
        periodEnd: null,
      },
      {
        id: 'r3',
        referenceId: 'other',
        plan: 'pro',
        stripeSubscriptionId: 'sub_other',
        status: 'active',
        cancelAtPeriodEnd: false,
        periodEnd: PERIOD_END,
      },
    ],
    ...extra,
  });
}

const user = () => h.fake.tables.user?.[0] as Record<string, unknown>;
const hold = () => h.fake.tables.deletionHold?.[0];
const updates = () => h.calls.filter((c) => c.startsWith('update:'));
const cancels = () => h.calls.filter((c) => c.startsWith('cancel:'));

beforeEach(() => {
  h.fake = seed();
  h.subs.clear();
  h.calls.length = 0;
  h.updateParams.length = 0;
  h.listParams.length = 0;
  h.queued.length = 0;
  h.failOn.clear();
  h.onUpdate = null;
  h.locks = 0;
  h.onLock = null;
  h.configured = true;
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe('the request stops the membership', () => {
  it('flips only live, not-already-ending subscriptions as Stripe reports them, and records only those', async () => {
    sub('sub_pro');
    sub('sub_stale', { status: 'active' }); // the row says canceled; Stripe says active
    sub('sub_self_cancelling', { cancel_at_period_end: true });
    sub('sub_portal_date', { cancel_at: 1_800_000_000 });
    sub('sub_ended', { status: 'canceled' });
    sub('sub_trial', { status: 'trialing' });
    await expect(syncBilling('u1')).resolves.toBe('stopped');
    expect(updates().sort()).toEqual(['update:sub_pro:true', 'update:sub_stale:true', 'update:sub_trial:true']);
    expect([...(hold()?.subscriptionIds as string[])].sort()).toEqual(['sub_pro', 'sub_stale', 'sub_trial']);
    expect(h.subs.get('sub_self_cancelling')?.cancel_at_period_end).toBe(true);
  });

  it('is idempotent: a second run changes nothing in Stripe and keeps the record', async () => {
    sub('sub_pro');
    await syncBilling('u1');
    h.calls.length = 0;
    await syncBilling('u1');
    expect(updates()).toEqual([]);
    expect(hold()?.subscriptionIds).toEqual(['sub_pro']);
  });

  it('records what it flipped even when another call fails, then throws so the job retries', async () => {
    sub('sub_pro');
    sub('sub_stale');
    h.failOn.add('sub_stale');
    await expect(stopBilling('u1')).rejects.toThrow();
    expect(hold()?.subscriptionIds).toEqual(['sub_pro']);
    h.failOn.clear();
    await stopBilling('u1');
    expect([...(hold()?.subscriptionIds as string[])].sort()).toEqual(['sub_pro', 'sub_stale']);
  });

  it('makes no Stripe write when nothing needs changing', async () => {
    sub('sub_pro', { cancel_at_period_end: true });
    await syncBilling('u1');
    expect(updates()).toEqual([]);
    expect(hold()).toBeUndefined();
  });

  it('is a logged no-op with Stripe unconfigured', async () => {
    h.configured = false;
    sub('sub_pro');
    await expect(syncBilling('u1')).resolves.toBe('unconfigured');
    await expect(cancelRemainingBilling('u1')).resolves.toBe(0);
    expect(h.calls).toEqual([]);
  });
});

describe('signing back in resumes what the request paused', () => {
  beforeEach(() => {
    h.fake = seed({
      deletionHold: [
        {
          userId: 'u1',
          keyIds: [],
          webhookIds: [],
          subscriptionIds: ['sub_pro', 'sub_cancelled_since'],
          createdAt: NOW,
        },
      ],
    });
    user().deletionScheduledAt = null;
  });

  it('resumes the recorded subscription Stripe still shows ending, leaves one the member cancelled, then deletes the hold', async () => {
    sub('sub_pro', { cancel_at_period_end: true });
    sub('sub_cancelled_since', { status: 'canceled', cancel_at_period_end: true });
    sub('sub_never_recorded', { cancel_at_period_end: true }); // the member cancelled it themselves before the request
    await expect(syncBilling('u1')).resolves.toBe('resumed');
    expect(updates()).toEqual(['update:sub_pro:false']);
    expect(h.subs.get('sub_never_recorded')?.cancel_at_period_end).toBe(true);
    expect(hold()).toBeUndefined();
  });

  it('keeps the hold, and what is left in it, when a resume call fails', async () => {
    sub('sub_pro', { cancel_at_period_end: true });
    sub('sub_cancelled_since', { status: 'canceled' });
    h.failOn.add('sub_pro');
    await expect(resumeBilling('u1', ['sub_pro', 'sub_cancelled_since'])).rejects.toThrow();
    expect(hold()?.subscriptionIds).toEqual(['sub_pro']);
  });

  it('drops a recorded subscription that no longer exists in Stripe instead of retrying it forever', async () => {
    h.fake = seed({
      deletionHold: [{ userId: 'u1', keyIds: [], webhookIds: [], subscriptionIds: ['sub_gone'], createdAt: NOW }],
    });
    user().deletionScheduledAt = null;
    await expect(resumeBilling('u1', ['sub_gone'])).resolves.toEqual([]);
    expect(hold()).toBeUndefined();
  });

  it('restoreAfterCancel keeps the hold while subscriptions are recorded, clears keys and hooks, and queues the sync', async () => {
    h.fake = seed({
      deletionHold: [
        { userId: 'u1', keyIds: ['k1'], webhookIds: ['w1'], subscriptionIds: ['sub_pro'], createdAt: NOW },
      ],
    });
    user().deletionScheduledAt = null;
    await restoreAfterCancel('u1', NOW);
    expect(hold()).toMatchObject({ keyIds: [], webhookIds: [], subscriptionIds: ['sub_pro'], billingSyncedAt: null });
    expect(h.queued).toEqual(['u1']);
  });

  it('restoreAfterCancel keeps the hold even when no subscription was recorded, and queues the sync', async () => {
    h.fake = seed({
      deletionHold: [{ userId: 'u1', keyIds: [], webhookIds: [], subscriptionIds: [], createdAt: NOW }],
    });
    await restoreAfterCancel('u1', NOW);
    expect(hold()).toMatchObject({ subscriptionIds: [], billingSyncedAt: null });
    expect(h.queued).toEqual(['u1']);
  });

  it('planRestore keeps the hold only for a recorded subscription', () => {
    expect(planRestore({ keyIds: [], webhookIds: [], subscriptionIds: ['s'] }, [], []).keepHold).toBe(true);
    expect(planRestore({ keyIds: [], webhookIds: [] }, [], []).keepHold).toBe(false);
  });
});

describe('a request that changes its mind', () => {
  it('withdrawn before the job runs: nothing changes in Stripe', async () => {
    sub('sub_pro');
    user().deletionScheduledAt = null; // signed back in; no hold was ever written
    await expect(syncBilling('u1')).resolves.toBe('skipped');
    expect(h.calls).toEqual([]);
  });

  it('withdrawn while the stop call is in flight: the job queues itself and the next run ends resumed', async () => {
    sub('sub_pro');
    h.onUpdate = async () => {
      // The member signs back in between Stripe's answer and the job recording it. The stop wrote the hold before
      // its first flip, so the restore finds it, keeps it and queues the sync too.
      user().deletionScheduledAt = null;
      await restoreAfterCancel('u1', NOW);
    };
    await expect(syncBilling('u1')).resolves.toBe('requeued');
    expect(h.queued).toEqual(['u1', 'u1']);
    expect(hold()?.subscriptionIds).toEqual(['sub_pro']); // kept so the resume knows what to undo
    h.onUpdate = null;
    h.queued.length = 0;
    await expect(syncBilling('u1')).resolves.toBe('resumed');
    expect(h.subs.get('sub_pro')?.cancel_at_period_end).toBe(false);
    expect(hold()).toBeUndefined();
  });

  it('a stop retry after the withdrawal does nothing', async () => {
    sub('sub_pro');
    await syncBilling('u1');
    user().deletionScheduledAt = null;
    await syncBilling('u1'); // the resume
    h.calls.length = 0;
    await syncBilling('u1'); // a stop job retrying late: it reads the state and finds nothing to do
    expect(h.calls).toEqual([]);
    expect(h.subs.get('sub_pro')?.cancel_at_period_end).toBe(false);
  });

  it('a second request before the resume ran keeps the subscription ending, and a later restore still resumes it', async () => {
    sub('sub_pro');
    await syncBilling('u1'); // stop
    user().deletionScheduledAt = null;
    await restoreAfterCancel('u1', NOW); // withdrawn; the resume has not run
    user().deletionScheduledAt = NOW; // asked again
    await pauseForDeletion('u1', NOW);
    h.calls.length = 0;
    await syncBilling('u1');
    expect(updates()).toEqual([]);
    expect(h.subs.get('sub_pro')?.cancel_at_period_end).toBe(true);
    expect(hold()?.subscriptionIds).toEqual(['sub_pro']);
    user().deletionScheduledAt = null;
    await syncBilling('u1');
    expect(h.subs.get('sub_pro')?.cancel_at_period_end).toBe(false);
  });

  it('pauseForDeletion queues the sync once its transaction has committed', async () => {
    await pauseForDeletion('u1', NOW);
    expect(h.queued).toEqual(['u1']);
    expect(hold()).toBeDefined();
  });
});

describe('the erasure pre-step', () => {
  it('cancels what still bills now, without refund or final invoice, found by customer as well as by row', async () => {
    sub('sub_pro'); // a row exists
    sub('sub_grace', { cancel_at_period_end: true }); // started in the grace period: no row
    sub('sub_ended', { status: 'canceled' });
    await expect(cancelRemainingBilling('u1')).resolves.toBe(2);
    expect(h.calls.filter((c) => c.startsWith('cancel:')).sort()).toEqual([
      'cancel:sub_grace:false:false',
      'cancel:sub_pro:false:false',
    ]);
    expect(h.calls).toContain('list:cus_u1:all');
  });

  it('throws on a Stripe error, after trying every subscription', async () => {
    sub('sub_pro');
    sub('sub_grace');
    h.failOn.add('sub_pro');
    await expect(cancelRemainingBilling('u1')).rejects.toThrow();
    expect(h.subs.get('sub_grace')?.status).toBe('canceled');
  });
});

describe('the preview', () => {
  it('lists plan and date for memberships that are not already ending, and nothing else about them', async () => {
    h.fake = seed({
      subscription: [
        {
          id: 'a',
          referenceId: 'u1',
          plan: 'pro',
          stripeSubscriptionId: 'sub_pro',
          status: 'active',
          cancelAtPeriodEnd: false,
          periodEnd: PERIOD_END,
        },
        {
          id: 'b',
          referenceId: 'u1',
          plan: 'starter',
          stripeSubscriptionId: 'sub_x',
          status: 'canceled',
          cancelAtPeriodEnd: false,
          periodEnd: PERIOD_END,
        },
        {
          id: 'c',
          referenceId: 'u1',
          plan: 'starter',
          stripeSubscriptionId: 'sub_y',
          status: 'active',
          cancelAtPeriodEnd: true,
          periodEnd: PERIOD_END,
        },
      ],
    });
    const preview = await previewDeletionPause('u1');
    expect(preview.subscriptions).toEqual([{ plan: 'pro', periodEnd: PERIOD_END.toISOString() }]);
  });
});

describe('the client getter', () => {
  const saved = process.env.STRIPE_SECRET_KEY;
  afterEach(() => {
    if (saved === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = saved;
  });

  it('throws under vitest for a live key, and builds for the placeholder and a test key', async () => {
    const real = await vi.importActual<typeof import('@/lib/billing/stripe-client.server')>(
      '@/lib/billing/stripe-client.server',
    );
    process.env.STRIPE_SECRET_KEY = ['live', 'placeholder', 'key'].join('-');
    expect(() => real.getStripeClient()).toThrow();
    delete process.env.STRIPE_SECRET_KEY;
    expect(real.stripeConfigured()).toBe(false);
    expect(() => real.getStripeClient()).not.toThrow();
    process.env.STRIPE_SECRET_KEY = ['sk', 'test', 'placeholder'].join('_');
    expect(real.stripeConfigured()).toBe(true);
    expect(() => real.getStripeClient()).not.toThrow();
  });
});

describe('a stop that cannot lose a subscription (s13-18)', () => {
  const markerOf = (id: string) => h.subs.get(id)?.metadata[MARKER];

  it('the stop sends the flip and the marker in one update call per subscription', async () => {
    await pauseForDeletion('u1', NOW);
    sub('sub_pro');
    await syncBilling('u1');
    expect(h.updateParams).toEqual([
      { id: 'sub_pro', params: { cancel_at_period_end: true, metadata: { [MARKER]: String(NOW.getTime()) } } },
    ]);
    expect(cancels()).toEqual([]);
  });

  it('a resume restores a marked but unrecorded subscription and clears its marker in the same call', async () => {
    h.fake = seed({
      deletionHold: [{ userId: 'u1', keyIds: [], webhookIds: [], subscriptionIds: [], createdAt: NOW }],
    });
    user().deletionScheduledAt = null;
    sub('sub_pro', { cancel_at_period_end: true, metadata: { [MARKER]: String(NOW.getTime()) } });
    await expect(syncBilling('u1')).resolves.toBe('resumed');
    expect(h.updateParams).toEqual([
      { id: 'sub_pro', params: { cancel_at_period_end: false, metadata: { [MARKER]: '' } } },
    ]);
    expect(h.subs.get('sub_pro')).toMatchObject({ cancel_at_period_end: false, metadata: {} });
    expect(hold()).toBeUndefined();
    expect(cancels()).toEqual([]);
  });

  it('leaves a subscription the member cancelled themselves alone, marked ones around it still resume', async () => {
    h.fake = seed({
      deletionHold: [{ userId: 'u1', keyIds: [], webhookIds: [], subscriptionIds: ['sub_pro'], createdAt: NOW }],
    });
    user().deletionScheduledAt = null;
    sub('sub_self', { cancel_at_period_end: true });
    sub('sub_pro', { cancel_at_period_end: true, metadata: { [MARKER]: String(NOW.getTime()) } });
    sub('sub_other_meta', { cancel_at_period_end: true, metadata: { other: 'x' } });
    await syncBilling('u1');
    expect(updates()).toEqual(['update:sub_pro:false']);
    expect(h.subs.get('sub_self')?.cancel_at_period_end).toBe(true);
    expect(h.subs.get('sub_other_meta')?.cancel_at_period_end).toBe(true);
  });

  it('an empty hold still resumes marked subscriptions, and a marker on a live one that is not ending is only cleared', async () => {
    h.fake = seed({
      deletionHold: [{ userId: 'u1', keyIds: [], webhookIds: [], subscriptionIds: [], createdAt: NOW }],
    });
    user().deletionScheduledAt = null;
    sub('sub_a', { cancel_at_period_end: true, metadata: { [MARKER]: String(NOW.getTime()) } });
    sub('sub_b', { cancel_at_period_end: false, metadata: { [MARKER]: String(NOW.getTime()) } });
    sub('sub_c', { status: 'canceled', cancel_at_period_end: true, metadata: { [MARKER]: String(NOW.getTime()) } });
    await syncBilling('u1');
    // sub_b was resumed elsewhere: only its marker goes, in a call that sends nothing else.
    expect(updates().sort()).toEqual(['update:sub_a:false', 'update:sub_b:metadata']);
    expect(h.updateParams.find((u) => u.id === 'sub_b')?.params).toEqual({ metadata: { [MARKER]: '' } });
    expect(h.subs.get('sub_b')).toMatchObject({ cancel_at_period_end: false, metadata: {} });
  });

  it('with no Stripe customer and no Subscription row there is no Stripe call, and the hold goes', async () => {
    h.fake = makeDb({
      user: [{ id: 'u1', deletionScheduledAt: null, stripeCustomerId: null, banReason: null }],
      deletionHold: [{ userId: 'u1', keyIds: [], webhookIds: [], subscriptionIds: [], createdAt: NOW }],
    });
    await expect(syncBilling('u1')).resolves.toBe('resumed');
    expect(h.calls).toEqual([]);
    expect(hold()).toBeUndefined();
  });

  it('a stop that crashed after Stripe and before the hold write is resumed by the withdrawal, end to end', async () => {
    await pauseForDeletion('u1', NOW);
    h.queued.length = 0;
    sub('sub_pro');
    sub('sub_second');
    // The process dies between Stripe's answers and the hold write.
    (h.fake.db.$transaction as unknown as { mockRejectedValueOnce(e: Error): void }).mockRejectedValueOnce(
      new Error('crash'),
    );
    await expect(syncBilling('u1')).rejects.toThrow('crash');
    expect(hold()?.subscriptionIds ?? []).toEqual([]);
    expect(markerOf('sub_pro')).toBe(String(NOW.getTime()));
    expect(h.subs.get('sub_pro')?.cancel_at_period_end).toBe(true);
    expect(hold()?.billingSyncedAt ?? null).toBeNull();

    user().deletionScheduledAt = null; // the member withdraws
    await restoreAfterCancel('u1', NOW);
    expect(h.queued).toEqual(['u1']);
    h.calls.length = 0;
    await expect(syncBilling('u1')).resolves.toBe('resumed'); // the queued job
    expect([...h.subs.values()].map((x) => [x.id, x.cancel_at_period_end, x.metadata])).toEqual([
      ['sub_pro', false, {}],
      ['sub_second', false, {}],
    ]);
    expect(updates().sort()).toEqual(['update:sub_pro:false', 'update:sub_second:false']);
    expect(hold()).toBeUndefined();
    expect(cancels()).toEqual([]);
  });

  it('a stop retried after a crash records the subscriptions an earlier call flipped, without another write', async () => {
    await pauseForDeletion('u1', NOW);
    sub('sub_pro');
    (h.fake.db.$transaction as unknown as { mockRejectedValueOnce(e: Error): void }).mockRejectedValueOnce(
      new Error('crash'),
    );
    await expect(syncBilling('u1')).rejects.toThrow();
    h.updateParams.length = 0;
    await expect(syncBilling('u1')).resolves.toBe('stopped');
    expect(h.updateParams).toEqual([]);
    expect(hold()?.subscriptionIds).toEqual(['sub_pro']);
  });
});

describe('paging past 100 subscriptions (s13-18)', () => {
  const many = (n: number) => {
    for (let i = 0; i < n; i += 1) sub(`sub_${String(i).padStart(4, '0')}`);
  };

  it('250 subscriptions page through three lists with starting_after, and every one is stopped', async () => {
    many(250);
    await expect(syncBilling('u1')).resolves.toBe('stopped');
    expect(h.listParams).toEqual([
      { customer: 'cus_u1', status: 'all', limit: 100 },
      { customer: 'cus_u1', status: 'all', limit: 100, starting_after: 'sub_0099' },
      { customer: 'cus_u1', status: 'all', limit: 100, starting_after: 'sub_0199' },
    ]);
    expect(updates()).toHaveLength(250);
    expect(cancels()).toEqual([]);
  });

  it('exactly 1,000 are read; 1,001 throws before any write, so the erasure cannot finish', async () => {
    many(1000);
    await expect(stopBilling('u1')).resolves.toHaveLength(1000);
    expect(h.listParams).toHaveLength(10);
    h.subs.clear();
    h.calls.length = 0;
    h.listParams.length = 0;
    many(1001);
    await expect(stopBilling('u1')).rejects.toThrow();
    await expect(cancelRemainingBilling('u1')).rejects.toThrow();
    expect(h.listParams).toHaveLength(20);
    expect(updates()).toEqual([]);
    expect(cancels()).toEqual([]);
  });
});

describe('the done-stamp (s13-18)', () => {
  const stamp = () => hold()?.billingSyncedAt ?? null;

  it('a request clears it and a successful sync sets it', async () => {
    h.fake = seed({
      deletionHold: [
        { userId: 'u1', keyIds: [], webhookIds: [], subscriptionIds: [], createdAt: NOW, billingSyncedAt: NOW },
      ],
    });
    await pauseForDeletion('u1', NOW);
    expect(stamp()).toBeNull();
    sub('sub_pro');
    await syncBilling('u1');
    expect(stamp()).toBeInstanceOf(Date);
  });

  it('is not set when a Stripe call failed', async () => {
    await pauseForDeletion('u1', NOW);
    sub('sub_pro');
    h.failOn.add('sub_pro');
    await expect(syncBilling('u1')).rejects.toThrow();
    expect(stamp()).toBeNull();
  });

  it('is not set when the sync requeues itself', async () => {
    await pauseForDeletion('u1', NOW);
    sub('sub_pro');
    h.onUpdate = async () => {
      user().deletionScheduledAt = null;
    };
    await expect(syncBilling('u1')).resolves.toBe('requeued');
    expect(stamp()).toBeNull();
  });

  it('a withdrawal clears it', async () => {
    h.fake = seed({
      deletionHold: [
        {
          userId: 'u1',
          keyIds: [],
          webhookIds: [],
          subscriptionIds: ['sub_pro'],
          createdAt: NOW,
          billingSyncedAt: NOW,
        },
      ],
    });
    user().deletionScheduledAt = null;
    await restoreAfterCancel('u1', NOW);
    expect(stamp()).toBeNull();
  });

  it('is set when Stripe is unconfigured, because nothing will ever be left to do', async () => {
    await pauseForDeletion('u1', NOW);
    h.configured = false;
    await expect(syncBilling('u1')).resolves.toBe('unconfigured');
    expect(stamp()).toBeInstanceOf(Date);
  });
});

describe('nothing in this feature cancels', () => {
  it('stop, resume, sync and a repeated sync never call cancel; only the erasure pre-step does', async () => {
    await pauseForDeletion('u1', NOW);
    sub('sub_pro');
    sub('sub_two');
    await syncBilling('u1');
    await syncBilling('u1');
    user().deletionScheduledAt = null;
    await restoreAfterCancel('u1', NOW);
    await syncBilling('u1');
    await resumeBilling('u1', []);
    expect(cancels()).toEqual([]);
    await cancelRemainingBilling('u1');
    expect(cancels().sort()).toEqual(['cancel:sub_pro:false:false', 'cancel:sub_two:false:false']);
  });
});

describe('review fixes (s13-18)', () => {
  const MINE = String(NOW.getTime());
  const OLDER = String(new Date('2026-06-01T00:00:00Z').getTime());

  it('a marker from an older request never makes a cancellation the member chose look like ours', async () => {
    // Resume: the member set sub_self to end themselves; it still carries an older request's marker.
    h.fake = seed({
      deletionHold: [{ userId: 'u1', keyIds: [], webhookIds: [], subscriptionIds: [], createdAt: NOW }],
    });
    user().deletionScheduledAt = null;
    sub('sub_self', { cancel_at_period_end: true, metadata: { [MARKER]: OLDER } });
    sub('sub_mine', { cancel_at_period_end: true, metadata: { [MARKER]: MINE } });
    await syncBilling('u1');
    expect(updates()).toEqual(['update:sub_mine:false']);
    expect(h.subs.get('sub_self')).toMatchObject({ cancel_at_period_end: true, metadata: { [MARKER]: OLDER } });

    // Stop: the same subscription is not adopted into this hold's record either.
    h.fake = seed();
    h.calls.length = 0;
    await pauseForDeletion('u1', NOW);
    await syncBilling('u1');
    expect(updates()).toEqual(['update:sub_mine:true']);
    expect(hold()?.subscriptionIds).toEqual(['sub_mine']);
  });

  it('a marked subscription whose resume failed keeps the hold, so the retry still finds it', async () => {
    h.fake = seed({
      deletionHold: [{ userId: 'u1', keyIds: [], webhookIds: [], subscriptionIds: ['sub_pro'], createdAt: NOW }],
    });
    user().deletionScheduledAt = null;
    sub('sub_pro', { cancel_at_period_end: true, metadata: { [MARKER]: MINE } });
    sub('sub_unrecorded', { cancel_at_period_end: true, metadata: { [MARKER]: MINE } });
    h.failOn.add('sub_unrecorded');
    await expect(syncBilling('u1')).rejects.toThrow();
    expect(hold()?.subscriptionIds).toEqual([]);
    expect(hold()?.billingSyncedAt ?? null).toBeNull();
    h.failOn.clear();
    await expect(syncBilling('u1')).resolves.toBe('resumed');
    expect(h.subs.get('sub_unrecorded')).toMatchObject({ cancel_at_period_end: false, metadata: {} });
    expect(hold()).toBeUndefined();
  });

  it('a stop with no hold writes the hold before its first flip, so a crash after Stripe is still resumed', async () => {
    sub('sub_pro');
    const tx = h.fake.db.$transaction as unknown as ReturnType<typeof vi.fn>;
    const real = tx.getMockImplementation() as (arg: unknown) => Promise<unknown>;
    tx.mockImplementationOnce(real).mockRejectedValueOnce(new Error('crash'));
    await expect(syncBilling('u1')).rejects.toThrow('crash');
    const created = hold()?.createdAt as Date;
    expect(created).toBeInstanceOf(Date);
    expect(h.subs.get('sub_pro')?.metadata[MARKER]).toBe(String(created.getTime()));

    user().deletionScheduledAt = null;
    await restoreAfterCancel('u1', NOW);
    await expect(syncBilling('u1')).resolves.toBe('resumed');
    expect(h.subs.get('sub_pro')).toMatchObject({ cancel_at_period_end: false, metadata: {} });
  });

  it('a withdrawal that lands while the stamp is written takes the stamp back and queues another run', async () => {
    await pauseForDeletion('u1', NOW);
    sub('sub_pro');
    h.queued.length = 0;
    // Lock 1 is the stop's record; lock 2 is the stamp. The member signs back in just before the stamp's write.
    h.onLock = async (n) => {
      if (n !== 2) return;
      user().deletionScheduledAt = null;
      await restoreAfterCancel('u1', NOW);
    };
    await expect(syncBilling('u1')).resolves.toBe('requeued');
    expect(hold()?.billingSyncedAt).toBeNull();
    expect(h.queued).toContain('u1');
    h.onLock = null;
    await expect(syncBilling('u1')).resolves.toBe('resumed');
    expect(h.subs.get('sub_pro')?.cancel_at_period_end).toBe(false);
  });

  it('a sync that runs between the pause and the schedule cannot leave the request unstopped', async () => {
    user().deletionScheduledAt = null; // the pause has committed; the schedule has not
    await pauseForDeletion('u1', NOW);
    sub('sub_pro');
    await expect(syncBilling('u1')).resolves.toBe('resumed'); // reads "not scheduled"
    expect(hold()).toBeUndefined(); // an empty hold is removed by that resume
    user().deletionScheduledAt = NOW; // the schedule lands
    h.queued.length = 0;
    await markBillingPending('u1', NOW);
    expect(hold()).toMatchObject({ billingSyncedAt: null, subscriptionIds: [] });
    expect(h.queued).toEqual(['u1']);
    await expect(syncBilling('u1')).resolves.toBe('stopped');
    expect(h.subs.get('sub_pro')).toMatchObject({ cancel_at_period_end: true, metadata: { [MARKER]: MINE } });
    expect(hold()?.billingSyncedAt).toBeInstanceOf(Date);
  });
});
