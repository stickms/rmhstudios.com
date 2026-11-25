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
}

const h = vi.hoisted(() => ({
  fake: null as unknown as ReturnType<typeof import('./deletion-hold-fake-db').makeDb>,
  subs: new Map<string, { id: string; status: string; cancel_at_period_end: boolean; cancel_at: number | null }>(),
  calls: [] as string[],
  failOn: new Set<string>(),
  onUpdate: null as null | ((id: string) => Promise<void>),
  configured: true,
  queued: [] as string[],
}));

vi.mock('@/lib/prisma.server', () => ({
  get prisma() {
    return h.fake.db;
  },
}));
vi.mock('@/lib/db/advisory-lock.server', () => ({ lockKey: vi.fn(async () => undefined) }));
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
    return { ...s };
  };
  return {
    stripeConfigured: () => h.configured,
    getStripeClient: () => ({
      subscriptions: {
        retrieve: vi.fn(async (id: string) => {
          h.calls.push(`retrieve:${id}`);
          return copy(id);
        }),
        update: vi.fn(async (id: string, params: { cancel_at_period_end: boolean }) => {
          h.calls.push(`update:${id}:${params.cancel_at_period_end}`);
          if (h.failOn.has(id)) throw new Error('stripe down');
          const s = h.subs.get(id);
          if (!s) throw new Error('no such subscription');
          s.cancel_at_period_end = params.cancel_at_period_end;
          const out = { ...s };
          if (h.onUpdate) await h.onUpdate(id);
          return out;
        }),
        cancel: vi.fn(async (id: string, params: { prorate: boolean; invoice_now: boolean }) => {
          h.calls.push(`cancel:${id}:${params.prorate}:${params.invoice_now}`);
          if (h.failOn.has(id)) throw new Error('stripe down');
          const s = h.subs.get(id);
          if (!s) throw new Error('no such subscription');
          s.status = 'canceled';
          return { ...s };
        }),
        list: vi.fn(async (params: { customer: string; status: string; limit: number }) => {
          h.calls.push(`list:${params.customer}:${params.status}`);
          return { data: [...h.subs.values()].map((s) => ({ ...s })) };
        }),
      },
    }),
  };
});

import { cancelRemainingBilling, resumeBilling, stopBilling, syncBilling } from '@/lib/account/deletion-billing.server';
import { pauseForDeletion, previewDeletionPause, restoreAfterCancel } from '@/lib/account/deletion-hold.server';

const NOW = new Date('2026-12-02T10:00:00Z');
const PERIOD_END = new Date('2026-12-14T00:00:00Z');

function sub(id: string, over: Partial<Sub> = {}): void {
  h.subs.set(id, { id, status: 'active', cancel_at_period_end: false, cancel_at: null, ...over });
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

beforeEach(() => {
  h.fake = seed();
  h.subs.clear();
  h.calls.length = 0;
  h.queued.length = 0;
  h.failOn.clear();
  h.onUpdate = null;
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
    expect(hold()).toMatchObject({ keyIds: [], webhookIds: [], subscriptionIds: ['sub_pro'] });
    expect(h.queued).toEqual(['u1']);
  });

  it('restoreAfterCancel deletes the hold at once when no subscription was recorded', async () => {
    h.fake = seed({
      deletionHold: [{ userId: 'u1', keyIds: [], webhookIds: [], subscriptionIds: [], createdAt: NOW }],
    });
    await restoreAfterCancel('u1', NOW);
    expect(hold()).toBeUndefined();
    expect(h.queued).toEqual([]);
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
      // The member signs back in between Stripe's answer and the job recording it: no hold exists yet.
      user().deletionScheduledAt = null;
      await restoreAfterCancel('u1', NOW);
    };
    await expect(syncBilling('u1')).resolves.toBe('requeued');
    expect(h.queued).toEqual(['u1']);
    expect(hold()?.subscriptionIds).toEqual(['sub_pro']); // recreated so the resume knows what to undo
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
