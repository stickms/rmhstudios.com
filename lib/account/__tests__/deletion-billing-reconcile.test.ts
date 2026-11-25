/**
 * s13-18: the hourly billing sweep. Prisma is a recorder over a few hold rows and the queue is a fake pg-boss: the
 * sweep picks holds whose done-stamp is null, oldest first, never an erased member, at most 500, hands each to the
 * queue with the member's singleton key (so two sweeps cannot queue one member twice) and writes nothing.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface Hold {
  userId: string;
  createdAt: Date;
  billingSyncedAt: Date | null;
  banReason: string | null;
}

const h = vi.hoisted(() => ({
  holds: [] as Hold[],
  findManyArgs: [] as Record<string, unknown>[],
  writes: 0,
  sent: [] as { name: string; data: unknown; options: Record<string, unknown> }[],
  waiting: new Set<string>(),
}));

vi.mock('@/lib/jobs/boss.server', () => ({ getBoss: vi.fn(async () => null) }));
vi.mock('@/lib/account-lifecycle', () => ({ DELETED_ACCOUNT_BAN_REASON: 'DELETED_ACCOUNT' }));
vi.mock('@/lib/prisma.server', () => {
  const write = () => {
    h.writes += 1;
    throw new Error('the sweep writes nothing');
  };
  return {
    prisma: {
      deletionHold: {
        findMany: vi.fn(
          async (args: { where: { billingSyncedAt: null }; orderBy: { createdAt: 'asc' }; take: number }) => {
            h.findManyArgs.push(args as unknown as Record<string, unknown>);
            return h.holds
              .filter((r) => r.billingSyncedAt === null && r.banReason !== 'DELETED_ACCOUNT')
              .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
              .slice(0, args.take)
              .map((r) => ({ userId: r.userId }));
          },
        ),
        update: vi.fn(write),
        updateMany: vi.fn(write),
        upsert: vi.fn(write),
        delete: vi.fn(write),
        deleteMany: vi.fn(write),
        create: vi.fn(write),
      },
    },
  };
});

import {
  BILLING_RECONCILE_CRON,
  BILLING_RECONCILE_LIMIT,
  BILLING_RECONCILE_QUEUE,
  holdsAwaitingBillingSync,
  registerBillingReconcileCron,
  sweepBillingSync,
} from '@/lib/account/deletion-billing-reconcile.server';
import { BILLING_SYNC_QUEUE, billingSyncSendOptions } from '@/lib/account/deletion-billing-queue.server';
import type { PgBoss } from 'pg-boss';

/** A pg-boss stand-in with the `short` policy's one waiting job per singleton key. */
function fakeBoss() {
  return {
    send: vi.fn(async (name: string, data: unknown, options: Record<string, unknown>) => {
      const key = String(options.singletonKey);
      if (h.waiting.has(key)) return null;
      h.waiting.add(key);
      h.sent.push({ name, data, options });
      return 'job';
    }),
  } as unknown as PgBoss;
}

const at = (n: number) => new Date(Date.UTC(2026, 11, 1, 0, n));
const hold = (userId: string, minute: number, over: Partial<Hold> = {}): Hold => ({
  userId,
  createdAt: at(minute),
  billingSyncedAt: null,
  banReason: null,
  ...over,
});

beforeEach(() => {
  h.holds = [];
  h.findManyArgs.length = 0;
  h.writes = 0;
  h.sent.length = 0;
  h.waiting.clear();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('the billing sweep', () => {
  it('picks holds with a null stamp, oldest first, and skips a stamped one and an erased member', async () => {
    h.holds = [
      hold('late', 30),
      hold('stamped', 5, { billingSyncedAt: at(6) }),
      hold('erased', 6, { banReason: 'DELETED_ACCOUNT' }),
      hold('early', 10),
      hold('middle', 20),
    ];
    await expect(holdsAwaitingBillingSync()).resolves.toEqual(['early', 'middle', 'late']);
    expect(h.findManyArgs[0]).toMatchObject({
      where: { billingSyncedAt: null },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });
  });

  it('caps one sweep at 500 holds', async () => {
    h.holds = Array.from({ length: 620 }, (_, i) => hold(`u${i}`, i));
    const ids = await holdsAwaitingBillingSync();
    expect(BILLING_RECONCILE_LIMIT).toBe(500);
    expect(ids).toHaveLength(500);
    expect(ids[0]).toBe('u0');
    expect(ids[499]).toBe('u499');
  });

  it('queues account.billing-sync for each with the member singleton options, and writes nothing', async () => {
    h.holds = [hold('a', 1), hold('b', 2)];
    const boss = fakeBoss();
    await expect(sweepBillingSync(boss)).resolves.toBe(2);
    expect(h.sent).toEqual([
      { name: BILLING_SYNC_QUEUE, data: { userId: 'a' }, options: billingSyncSendOptions('a') },
      { name: BILLING_SYNC_QUEUE, data: { userId: 'b' }, options: billingSyncSendOptions('b') },
    ]);
    expect(h.sent[0]!.options.singletonKey).toBe('billing-sync:a');
    expect(h.writes).toBe(0);
  });

  it('two sweeps racing queue each member once: the singleton key refuses the second', async () => {
    h.holds = [hold('a', 1), hold('b', 2)];
    const boss = fakeBoss();
    await Promise.all([sweepBillingSync(boss), sweepBillingSync(boss)]);
    expect(h.sent.map((j) => (j.data as { userId: string }).userId).sort()).toEqual(['a', 'b']);
  });

  it('counts only what was sent, and a queue that is down is not an error', async () => {
    h.holds = [hold('a', 1)];
    const boss = { send: vi.fn(async () => Promise.reject(new Error('down'))) } as unknown as PgBoss;
    await expect(sweepBillingSync(boss)).resolves.toBe(0);
  });

  it('logs the count and nothing else about the members', async () => {
    h.holds = [hold('member-secret-id', 1)];
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await sweepBillingSync(fakeBoss());
    const logged = warn.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain('"queued":1');
    expect(logged).not.toContain('member-secret-id');
  });

  it('registers an hourly cron at minute 23 whose worker runs the sweep', async () => {
    const work = vi.fn();
    const boss = {
      createQueue: vi.fn(async () => undefined),
      schedule: vi.fn(async () => undefined),
      work,
      send: vi.fn(async () => 'job'),
    } as unknown as PgBoss;
    await registerBillingReconcileCron(boss);
    expect(BILLING_RECONCILE_QUEUE).toBe('account.billing-reconcile');
    expect(BILLING_RECONCILE_CRON).toBe('23 * * * *');
    expect(boss.schedule).toHaveBeenCalledWith(BILLING_RECONCILE_QUEUE, '23 * * * *', {}, { tz: 'UTC' });
    h.holds = [hold('a', 1)];
    const handler = work.mock.calls[0]![1] as () => Promise<void>;
    await handler();
    expect(boss.send).toHaveBeenCalledTimes(1);
  });
});
