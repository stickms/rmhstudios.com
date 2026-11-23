import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  aiUsage: {
    count: vi.fn(async (..._a: unknown[]): Promise<number> => 0),
    aggregate: vi.fn(async (..._a: unknown[]): Promise<{ _sum: { costMicros: number | null } }> => ({
      _sum: { costMicros: 0 },
    })),
  },
  assertAiBudget: vi.fn(async (..._a: unknown[]): Promise<void> => undefined),
  order: [] as string[],
}));
vi.mock('@/lib/prisma.server', () => ({ prisma: m }));
vi.mock('@/lib/ai/budget.server', () => ({ assertAiBudget: m.assertAiBudget }));

import { AppError } from '@/lib/errors/codes';
import { assertDailyCap, assertQaAllowed, assertSharedBudget, questionsToday } from './budget.server';

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

beforeEach(() => {
  for (const k of ENV) delete process.env[k];
  m.order.length = 0;
  m.aiUsage.count.mockReset().mockResolvedValue(0);
  m.assertAiBudget.mockReset().mockImplementation(async () => {
    m.order.push('allowance');
  });
  spend(0);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe('the daily cap', () => {
  it('counts only this member, this task, the route prompt, since UTC midnight', async () => {
    m.aiUsage.count.mockResolvedValue(3);
    expect(await questionsToday('u1', NOW)).toBe(3);
    expect(m.aiUsage.count.mock.calls[0]![0]).toEqual({
      where: {
        userId: 'u1',
        task: 'medschools-qa',
        promptId: 'medschools-qa-route',
        createdAt: { gte: new Date('2026-11-23T00:00:00Z') },
      },
    });
  });
  it('lets the 15th question through and stops the 16th', async () => {
    m.aiUsage.count.mockResolvedValue(14);
    expect(await assertDailyCap('u1', NOW)).toEqual({ remainingToday: 1, dailyCap: 15 });
    m.aiUsage.count.mockResolvedValue(15);
    expect(await code(assertDailyCap('u1', NOW))).toBe('MEDSCHOOLS_QA_DAILY_CAP');
    m.aiUsage.count.mockResolvedValue(16);
    expect(await code(assertDailyCap('u1', NOW))).toBe('MEDSCHOOLS_QA_DAILY_CAP');
  });
  it('reads the cap from the environment; 0 and garbage close it', async () => {
    process.env.MEDSCHOOLS_QA_DAILY_CAP = '3';
    m.aiUsage.count.mockResolvedValue(2);
    expect((await assertDailyCap('u1', NOW)).dailyCap).toBe(3);
    process.env.MEDSCHOOLS_QA_DAILY_CAP = '0';
    expect(await code(assertDailyCap('u1', NOW))).toBe('MEDSCHOOLS_QA_DAILY_CAP');
    process.env.MEDSCHOOLS_QA_DAILY_CAP = 'lots';
    expect(await code(assertDailyCap('u1', NOW))).toBe('MEDSCHOOLS_QA_DAILY_CAP');
  });
  it('fails closed, as paused, when the ledger cannot be read', async () => {
    m.aiUsage.count.mockRejectedValue(new Error('db down'));
    const e = (await assertDailyCap('u1', NOW).catch((x: unknown) => x)) as AppError;
    expect(e.code).toBe('MEDSCHOOLS_QA_PAUSED');
    expect(e.detail).toEqual({ reason: 'unavailable' });
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

describe('assertQaAllowed', () => {
  it('runs the daily cap, then the shared gate, then the member allowance', async () => {
    m.aiUsage.count.mockImplementation(async () => {
      m.order.push('daily');
      return 0;
    });
    m.aiUsage.aggregate.mockImplementation(async () => {
      if (!m.order.includes('shared')) m.order.push('shared');
      return { _sum: { costMicros: 0 } };
    });
    expect(await assertQaAllowed('u1', NOW)).toEqual({ remainingToday: 15, dailyCap: 15 });
    expect(m.order).toEqual(['daily', 'shared', 'allowance']);
    expect(m.assertAiBudget).toHaveBeenCalledWith('u1');
  });
  it('never reaches the allowance when an earlier gate refuses', async () => {
    m.aiUsage.count.mockResolvedValue(15);
    await code(assertQaAllowed('u1', NOW));
    spend(5_000_000);
    m.aiUsage.count.mockResolvedValue(0);
    await code(assertQaAllowed('u1', NOW));
    expect(m.assertAiBudget).not.toHaveBeenCalled();
  });
  it('lets the allowance refusal through', async () => {
    m.assertAiBudget.mockRejectedValue(new AppError('AI_BUDGET_EXCEEDED'));
    expect(await code(assertQaAllowed('u1', NOW))).toBe('AI_BUDGET_EXCEEDED');
  });
});
