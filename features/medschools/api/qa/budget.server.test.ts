import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  };
});
vi.mock('@/lib/prisma.server', () => ({ prisma: m.prisma }));
vi.mock('@/lib/ai/budget.server', () => ({ assertAiBudget: m.assertAiBudget }));

import { AppError } from '@/lib/errors/codes';
import { assertSharedBudget, admitQuestion, dailyStatus, questionsToday, reserveQuestion } from './budget.server';

const NOW = new Date('2026-11-23T15:30:00Z');
const ENV = ['MEDSCHOOLS_QA_DAILY_CAP', 'MEDSCHOOLS_AI_MONTHLY_USD', 'MEDSCHOOLS_QA_AI_SHARE'] as const;

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
  it('lets the 15th question through and stops the 16th, with the day left after each', async () => {
    let last = { remainingToday: -1, dailyCap: 0 };
    for (let i = 0; i < 15; i++) {
      const r = await reserveQuestion('u1', NOW);
      last = r;
      await r.release();
    }
    expect(last).toMatchObject({ remainingToday: 0, dailyCap: 15 });
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
  it('does not let a crashed question block the member for more than a minute', async () => {
    await reserveQuestion('u1', at('2026-11-23T15:30:00Z'));
    expect(await code(reserveQuestion('u1', at('2026-11-23T15:30:30Z')))).toBe('MEDSCHOOLS_QA_BUSY');
    await expect(reserveQuestion('u1', at('2026-11-23T15:31:01Z'))).resolves.toBeDefined();
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
    m.aiUsage.create.mockImplementationOnce(async (a: never) => {
      m.order.push('reserve');
      const row = { ...(a as { data: object }).data, id: 99n, createdAt: new Date(m.clock.now) };
      return row as never;
    });
    const r = await admitQuestion('u1', NOW);
    expect(r).toMatchObject({ remainingToday: 14, dailyCap: 15 });
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
    for (let i = 0; i < 15; i++) await (await reserveQuestion('u1', NOW)).release();
    spend(5_000_000);
    expect(await code(admitQuestion('u1', NOW))).toBe('MEDSCHOOLS_QA_PAUSED');
  });
});
