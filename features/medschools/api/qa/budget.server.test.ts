import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QA_LEASE_MS, QA_THINK_DEADLINE_MS } from '../../ai-budget';

const m = vi.hoisted(() => {
  type Row = { id: bigint; userId: string; task: string; promptId: string; createdAt: Date };
  const ledger: Row[] = [];
  let seq = 0n;
  const matches = (r: Row, w: Record<string, unknown>) => {
    const at = w.createdAt as { gte: Date } | undefined;
    return (
      (w.userId === undefined || r.userId === w.userId) &&
      (w.task === undefined || r.task === w.task) &&
      (w.promptId === undefined || r.promptId === w.promptId) &&
      (w.id === undefined || r.id === w.id) &&
      (!at || r.createdAt >= at.gte)
    );
  };
  const aiUsage = {
    count: vi.fn(async (a: { where: Record<string, unknown> }): Promise<number> => ledger.filter((r) => matches(r, a.where)).length),
    create: vi.fn(async (a: { data: Omit<Row, 'id' | 'createdAt'> }) => {
      const row: Row = { ...a.data, id: ++seq, createdAt: new Date(m.clock.now) };
      ledger.push(row);
      return row;
    }),
    deleteMany: vi.fn(async (a: { where: Record<string, unknown> }) => {
      for (let i = ledger.length - 1; i >= 0; i--) if (matches(ledger[i]!, a.where)) ledger.splice(i, 1);
      return { count: 0 };
    }),
    aggregate: vi.fn(async (..._a: unknown[]): Promise<{ _sum: { costMicros: number | null } }> => ({
      _sum: { costMicros: 0 },
    })),
  };
  // One lock holder at a time, like pg_advisory_xact_lock on the same key.
  let chain: Promise<unknown> = Promise.resolve();
  const tx = { aiUsage, $executeRaw: vi.fn(async () => 1) };
  const prismaMock = {
    aiUsage,
    medQaLimitRequest: {
      findFirst: vi.fn(async (a: { where: { userId: string } }) =>
        m.grants.has(a.where.userId) ? { id: 'g' } : null,
      ),
    },
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => {
      const run = chain.then(() => fn(tx));
      chain = run.catch(() => undefined);
      return run;
    }),
  };
  return {
    ledger,
    aiUsage,
    tx,
    prisma: prismaMock,
    clock: { now: Date.parse('2026-11-23T15:30:00Z') },
    assertAiBudget: vi.fn(async (..._a: unknown[]): Promise<void> => undefined),
    order: [] as string[],
    getUserTier: vi.fn(async (..._a: unknown[]): Promise<string> => 'free'),
    grants: new Set<string>(),
  };
});
vi.mock('@/lib/prisma.server', () => ({ prisma: m.prisma }));
vi.mock('@/lib/entitlements', () => ({ getUserTier: m.getUserTier }));
vi.mock('@/lib/ai/budget.server', () => ({ assertAiBudget: m.assertAiBudget }));

import { AppError } from '@/lib/errors/codes';
import {
  assertSharedBudget,
  admitQuestion,
  dailyStatus,
  questionsToday,
  reserveQuestion,
  resolveQaTier,
} from './budget.server';

const NOW = new Date('2026-11-23T15:30:00Z');
const ENV = ['MEDSCHOOLS_QA_DAILY_CAP', 'MEDSCHOOLS_QA_DAILY_CAP_APPROVED', 'MEDSCHOOLS_QA_DAILY_CAP_MEMBER', 'MEDSCHOOLS_AI_MONTHLY_USD', 'MEDSCHOOLS_QA_AI_SHARE'] as const;

/** Month-to-date spend in micro-dollars: Q&A alone, and Q&A plus extraction. */
function spend(qa: number | null, both: number | null = qa) {
  m.aiUsage.aggregate.mockImplementation(async (...a: unknown[]) => {
    const where = (a[0] as { where: { task: unknown } }).where;
    return { _sum: { costMicros: where.task === 'medschools-qa' ? qa : both } };
  });
}
const code = async (p: Promise<unknown>) => ((await p.catch((e: unknown) => e)) as AppError).code;
const at = (iso: string) => {
  m.clock.now = Date.parse(iso);
  return new Date(m.clock.now);
};

beforeEach(() => {
  for (const k of ENV) delete process.env[k];
  m.order.length = 0;
  m.ledger.length = 0;
  m.grants.clear();
  m.prisma.$transaction.mockClear();
  m.prisma.medQaLimitRequest.findFirst.mockClear();
  m.getUserTier.mockReset().mockResolvedValue('free');
  m.clock.now = NOW.getTime();
  m.aiUsage.count.mockClear();
  m.aiUsage.create.mockClear();
  m.assertAiBudget.mockReset().mockImplementation(async () => {
    m.order.push('allowance');
  });
  spend(0);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe('the daily cap and the in-flight lease (reserveQuestion)', () => {
  it('counts reservation rows of this member and task since UTC midnight', async () => {
    await (await reserveQuestion('u1', NOW)).release();
    await (await reserveQuestion('u1', NOW)).release();
    await (await reserveQuestion('u2', NOW)).release();
    expect(await questionsToday('u1', NOW)).toBe(2);
    expect(await questionsToday('u1', new Date('2026-11-24T00:00:00Z'))).toBe(0);
    expect(m.aiUsage.count.mock.calls.at(-1)![0]).toMatchObject({
      where: { userId: 'u1', task: 'medschools-qa', promptId: 'medschools-qa-ask' },
    });
  });
  it('lets the 25th question through and stops the 26th, with the day left after each', async () => {
    let last: { remainingToday: number | null; dailyCap: number | null } = { remainingToday: -1, dailyCap: 0 };
    for (let i = 0; i < 25; i++) {
      const r = await reserveQuestion('u1', NOW);
      last = r;
      await r.release();
    }
    expect(last).toMatchObject({ remainingToday: 0, dailyCap: 25 });
    expect(await code(reserveQuestion('u1', NOW))).toBe('MEDSCHOOLS_QA_DAILY_CAP');
    expect((await dailyStatus('u1', NOW)).remainingToday).toBe(0);
  });
  it('refuses a second question while the first is in flight, on any process, and frees it on release', async () => {
    const first = await reserveQuestion('u1', NOW);
    expect(await code(reserveQuestion('u1', NOW))).toBe('MEDSCHOOLS_QA_BUSY');
    // another member is not held up
    await (await reserveQuestion('u2', NOW)).release();
    await first.release();
    await expect(reserveQuestion('u1', NOW)).resolves.toBeDefined();
  });
  it('lets two simultaneous requests take only one place (the lock serialises them)', async () => {
    const results = await Promise.allSettled([reserveQuestion('u1', NOW), reserveQuestion('u1', NOW)]);
    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(await questionsToday('u1', NOW)).toBe(1);
    expect(m.tx.$executeRaw).toHaveBeenCalled();
  });
  it('keeps the lease past a thinking question and frees a crashed one soon after (R20)', async () => {
    expect(QA_LEASE_MS).toBeGreaterThan(QA_THINK_DEADLINE_MS);
    const t0 = at('2026-11-23T15:30:00Z').getTime();
    await reserveQuestion('u1', new Date(t0));
    // Still busy when a thinking question hits its own deadline.
    expect(await code(reserveQuestion('u1', new Date(t0 + QA_THINK_DEADLINE_MS)))).toBe('MEDSCHOOLS_QA_BUSY');
    await expect(reserveQuestion('u1', new Date(t0 + QA_LEASE_MS + 1_000))).resolves.toBeDefined();
  });
  it('keeps the reservation when the lease cannot be released, and survives the delete failing', async () => {
    const r = await reserveQuestion('u1', NOW);
    m.aiUsage.deleteMany.mockRejectedValueOnce(new Error('db'));
    await expect(r.release()).resolves.toBeUndefined();
    expect(await questionsToday('u1', NOW)).toBe(1);
  });
  it('writes rows with no tokens and no cost, so the monthly sums do not move', async () => {
    await reserveQuestion('u1', NOW);
    for (const c of m.aiUsage.create.mock.calls) {
      expect(c[0].data).toMatchObject({ inTokens: 0, outTokens: 0, costMicros: 0, task: 'medschools-qa' });
    }
  });
  it('reads the cap from the environment; 0 and garbage close it', async () => {
    process.env.MEDSCHOOLS_QA_DAILY_CAP = '3';
    const r = await reserveQuestion('u1', NOW);
    expect(r.dailyCap).toBe(3);
    await r.release();
    process.env.MEDSCHOOLS_QA_DAILY_CAP = '0';
    expect(await code(reserveQuestion('u2', NOW))).toBe('MEDSCHOOLS_QA_DAILY_CAP');
    process.env.MEDSCHOOLS_QA_DAILY_CAP = 'lots';
    expect(await code(reserveQuestion('u2', NOW))).toBe('MEDSCHOOLS_QA_DAILY_CAP');
  });
  it('fails closed, as paused, when the ledger cannot be read or written', async () => {
    m.prisma.$transaction.mockRejectedValueOnce(new Error('db down'));
    const e = (await reserveQuestion('u1', NOW).catch((x: unknown) => x)) as AppError;
    expect(e.code).toBe('MEDSCHOOLS_QA_PAUSED');
    expect(e.detail).toEqual({ reason: 'unavailable' });
    m.aiUsage.count.mockRejectedValueOnce(new Error('db down'));
    const s = (await dailyStatus('u1', NOW).catch((x: unknown) => x)) as AppError;
    expect(s.code).toBe('MEDSCHOOLS_QA_PAUSED');
  });
});

describe('the shared monthly gate', () => {
  // The default cap is $20 and the default share 25%: Q&A may spend $5 (5,000,000 micro-dollars).
  it('passes under the Q&A share and closes at it', async () => {
    spend(4_999_999);
    await expect(assertSharedBudget(NOW)).resolves.toBeUndefined();
    spend(5_000_000);
    expect(await code(assertSharedBudget(NOW))).toBe('MEDSCHOOLS_QA_PAUSED');
  });
  it('reads this UTC month only', async () => {
    await assertSharedBudget(NOW);
    for (const c of m.aiUsage.aggregate.mock.calls) {
      expect((c[0] as { where: { createdAt: unknown } }).where.createdAt).toEqual({
        gte: new Date('2026-11-01T00:00:00Z'),
      });
    }
  });
  it('closes when the two sides together have reached the cap', async () => {
    spend(1_000_000, 20_000_000);
    expect(await code(assertSharedBudget(NOW))).toBe('MEDSCHOOLS_QA_PAUSED');
    spend(1_000_000, 19_999_999);
    await expect(assertSharedBudget(NOW)).resolves.toBeUndefined();
  });
  it('follows the share: 0 is paused, 1 is open until the cap', async () => {
    process.env.MEDSCHOOLS_QA_AI_SHARE = '0';
    expect(await code(assertSharedBudget(NOW))).toBe('MEDSCHOOLS_QA_PAUSED');
    process.env.MEDSCHOOLS_QA_AI_SHARE = '1';
    spend(19_000_000);
    await expect(assertSharedBudget(NOW)).resolves.toBeUndefined();
    spend(20_000_000);
    expect(await code(assertSharedBudget(NOW))).toBe('MEDSCHOOLS_QA_PAUSED');
  });
  it('treats a garbage share or a garbage cap as paused, never as open', async () => {
    process.env.MEDSCHOOLS_QA_AI_SHARE = 'half';
    expect(await code(assertSharedBudget(NOW))).toBe('MEDSCHOOLS_QA_PAUSED');
    delete process.env.MEDSCHOOLS_QA_AI_SHARE;
    process.env.MEDSCHOOLS_AI_MONTHLY_USD = '-5';
    expect(await code(assertSharedBudget(NOW))).toBe('MEDSCHOOLS_QA_PAUSED');
  });
  it('fails closed, as unavailable, when the ledger cannot be read', async () => {
    m.aiUsage.aggregate.mockRejectedValue(new Error('db down'));
    const e = (await assertSharedBudget(NOW).catch((x: unknown) => x)) as AppError;
    expect(e.code).toBe('MEDSCHOOLS_QA_PAUSED');
    expect(e.detail).toEqual({ reason: 'unavailable' });
  });
});

describe('admitQuestion', () => {
  it('runs the shared gate, then the member allowance, then the reservation', async () => {
    m.aiUsage.aggregate.mockImplementation(async () => {
      if (!m.order.includes('shared')) m.order.push('shared');
      return { _sum: { costMicros: 0 } };
    });
    m.aiUsage.create.mockImplementationOnce(async (a) => {
      m.order.push('reserve');
      const row = { ...(a as { data: object }).data, id: 99n, createdAt: new Date(m.clock.now) };
      return row as never;
    });
    const r = await admitQuestion('u1', NOW);
    expect(r).toMatchObject({ remainingToday: 24, dailyCap: 25, tier: 'free' });
    expect(m.order).toEqual(['shared', 'allowance', 'reserve']);
    expect(m.assertAiBudget).toHaveBeenCalledWith('u1');
  });
  it('spends none of the day when the budget or the allowance refuses', async () => {
    spend(5_000_000);
    expect(await code(admitQuestion('u1', NOW))).toBe('MEDSCHOOLS_QA_PAUSED');
    spend(0);
    m.assertAiBudget.mockRejectedValue(new AppError('AI_BUDGET_EXCEEDED'));
    expect(await code(admitQuestion('u1', NOW))).toBe('AI_BUDGET_EXCEEDED');
    expect(m.ledger).toHaveLength(0);
  });
  it('says paused, not the daily cap, when both would refuse', async () => {
    for (let i = 0; i < 25; i++) await (await reserveQuestion('u1', NOW)).release();
    spend(5_000_000);
    expect(await code(admitQuestion('u1', NOW))).toBe('MEDSCHOOLS_QA_PAUSED');
  });
});

describe('limit tiers and the admin bypass (R19)', () => {
  it('resolves admin, then member, then approved, then free, on the server per request', async () => {
    expect(await resolveQaTier('u1', { isAdmin: true })).toBe('admin');
    expect(m.getUserTier).not.toHaveBeenCalled();
    m.grants.add('u1');
    expect(await resolveQaTier('u1')).toBe('approved');
    m.getUserTier.mockResolvedValue('starter');
    expect(await resolveQaTier('u1')).toBe('member'); // a paying member outranks a grant
    m.getUserTier.mockResolvedValue('free');
    expect(await resolveQaTier('u2')).toBe('free');
  });
  it('drops to a lower tier, never a higher one, when a lookup fails', async () => {
    m.getUserTier.mockRejectedValue(new Error('db'));
    m.grants.add('u1');
    expect(await resolveQaTier('u1')).toBe('approved');
    m.prisma.medQaLimitRequest.findFirst.mockRejectedValueOnce(new Error('db'));
    expect(await resolveQaTier('u1')).toBe('free');
  });
  it('gives each tier its own cap: free 25, approved 40, member 100', async () => {
    expect((await dailyStatus('u1', NOW)).dailyCap).toBe(25);
    m.grants.add('u1');
    expect(await dailyStatus('u1', NOW)).toMatchObject({ tier: 'approved', dailyCap: 40, remainingToday: 40 });
    m.getUserTier.mockResolvedValue('pro');
    expect(await dailyStatus('u1', NOW)).toMatchObject({ tier: 'member', dailyCap: 100 });
    process.env.MEDSCHOOLS_QA_DAILY_CAP_MEMBER = '2';
    const r1 = await reserveQuestion('u1', NOW);
    await r1.release();
    const r2 = await reserveQuestion('u1', NOW);
    expect(r2).toMatchObject({ tier: 'member', dailyCap: 2, remainingToday: 0 });
    await r2.release();
    expect(await code(reserveQuestion('u1', NOW))).toBe('MEDSCHOOLS_QA_DAILY_CAP');
  });
  it('closes a tier whose variable is garbage and leaves the others open', async () => {
    process.env.MEDSCHOOLS_QA_DAILY_CAP_APPROVED = 'lots';
    m.grants.add('u1');
    expect(await code(reserveQuestion('u1', NOW))).toBe('MEDSCHOOLS_QA_DAILY_CAP');
    await expect(reserveQuestion('u2', NOW)).resolves.toBeDefined();
  });
  it('lets an admin past the daily cap, the one-at-a-time lease and the member allowance, with null counts', async () => {
    process.env.MEDSCHOOLS_QA_DAILY_CAP = '0';
    const admin = { isAdmin: true };
    const first = await admitQuestion('a1', NOW, admin);
    const second = await admitQuestion('a1', NOW, admin); // the first is still "in flight"
    expect(first).toMatchObject({ tier: 'admin', remainingToday: null, dailyCap: null });
    expect(second.tier).toBe('admin');
    expect(m.assertAiBudget).not.toHaveBeenCalled();
    // Only leases: no reservation row, so no daily count.
    expect(m.ledger.map((r) => r.promptId)).toEqual(['medschools-qa-admin-lock', 'medschools-qa-admin-lock']);
    await expect(first.release()).resolves.toBeUndefined();
    m.aiUsage.count.mockClear();
    expect(await dailyStatus('a1', NOW, admin)).toEqual({ tier: 'admin', remainingToday: null, dailyCap: null });
    expect(m.aiUsage.count).not.toHaveBeenCalled();
  });
  it('caps an admin at three questions in flight, even asked in parallel, and frees a place on release', async () => {
    const admin = { isAdmin: true };
    const results = await Promise.allSettled(Array.from({ length: 6 }, () => reserveQuestion('a1', NOW, admin)));
    const ok = results.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof reserveQuestion>>> => r.status === 'fulfilled');
    expect(ok).toHaveLength(3);
    for (const r of results.filter((x) => x.status === 'rejected')) {
      expect((r as PromiseRejectedResult).reason.code).toBe('MEDSCHOOLS_QA_BUSY');
    }
    // Another admin has their own ceiling.
    await expect(reserveQuestion('a2', NOW, admin)).resolves.toBeDefined();
    await ok[0]!.value.release();
    await expect(reserveQuestion('a1', NOW, admin)).resolves.toBeDefined();
    expect(await code(reserveQuestion('a1', NOW, admin))).toBe('MEDSCHOOLS_QA_BUSY');
    // A lease older than QA_LEASE_MS no longer counts (a crashed process frees its place).
    expect(await code(reserveQuestion('a1', new Date(NOW.getTime() + QA_LEASE_MS + 1_000), admin))).not.toBe('MEDSCHOOLS_QA_BUSY');
  });
  it('still stops an admin at the shared monthly pause', async () => {
    spend(5_000_000);
    expect(await code(admitQuestion('a1', NOW, { isAdmin: true }))).toBe('MEDSCHOOLS_QA_PAUSED');
    process.env.MEDSCHOOLS_AI_MONTHLY_USD = '-5';
    spend(0);
    expect(await code(admitQuestion('a1', NOW, { isAdmin: true }))).toBe('MEDSCHOOLS_QA_PAUSED');
  });
  it('keeps the member allowance for a non-admin', async () => {
    await admitQuestion('u1', NOW);
    expect(m.assertAiBudget).toHaveBeenCalledWith('u1');
  });
});
