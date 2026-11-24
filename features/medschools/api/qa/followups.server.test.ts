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
      (w.id === undefined ||
        r.id === w.id ||
        (typeof w.id === 'object' && (w.id as { in: bigint[] }).in.includes(r.id))) &&
      (!at || r.createdAt >= at.gte)
    );
  };
  const aiUsage = {
    count: vi.fn(async (a: { where: Record<string, unknown> }) => ledger.filter((r) => matches(r, a.where)).length),
    create: vi.fn(async (a: { data: Omit<Row, 'id' | 'createdAt'> }) => {
      const row: Row = { ...a.data, id: ++seq, createdAt: new Date() };
      ledger.push(row);
      return row;
    }),
    deleteMany: vi.fn(async (a: { where: Record<string, unknown> }) => {
      for (let i = ledger.length - 1; i >= 0; i--) if (matches(ledger[i]!, a.where)) ledger.splice(i, 1);
      return { count: 0 };
    }),
    aggregate: vi.fn(async (..._a: unknown[]) => ({ _sum: { costMicros: 0 } })),
  };
  const tx = { aiUsage, $executeRaw: vi.fn(async () => 1) };
  const prisma = {
    aiUsage,
    medQaLimitRequest: { findFirst: vi.fn(async () => null) },
    medSchool: {
      findFirst: vi.fn(async (a: { where: { slug: string } }) => (a.where.slug === 'duke' ? { id: 's1' } : null)),
    },
    medInterviewQuestion: { findMany: vi.fn(async (..._a: unknown[]) => [{ text: 'Stored one?' }]) },
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  return { ledger, aiUsage, prisma };
});
vi.mock('@/lib/prisma.server', () => ({ prisma: m.prisma }));
vi.mock('@/lib/entitlements', () => ({ getUserTier: vi.fn(async () => 'free') }));
vi.mock('@/lib/ai/budget.server', () => ({ assertAiBudget: vi.fn(async () => undefined) }));
vi.mock('./runner.server', () => ({ aiFollowupRunner: {} }));

import { AppError } from '@/lib/errors/codes';
import { generateFollowups, schoolExampleQuestions } from './followups.server';
import type { FollowupRunner } from './runner.server';

const GOOD = { followups: ['What drew you to that?', 'How did you handle the setback?', 'Who helped you most?'] };
const runner = (out: unknown): FollowupRunner & { calls: unknown[][] } => {
  const calls: unknown[][] = [];
  return {
    calls,
    generate: vi.fn(async (...a: unknown[]) => (calls.push(a), out instanceof Error ? Promise.reject(out) : out)),
  };
};
const input = { userId: 'u1', question: 'Why medicine?', notes: 'my private notes', stored: ['Tell me about Duke?'] };
const code = async (p: Promise<unknown>) => ((await p.catch((e: unknown) => e)) as AppError).code;
const asks = () => m.ledger.filter((r) => r.promptId === 'medschools-qa-ask').length;

beforeEach(() => {
  m.ledger.length = 0;
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  delete process.env.MEDSCHOOLS_QA_DAILY_CAP;
  delete process.env.MEDSCHOOLS_AI_MONTHLY_USD;
});
afterEach(() => vi.restoreAllMocks());

describe('generateFollowups', () => {
  it('counts one daily question, ends the lease and returns the pinned key set', async () => {
    const res = await generateFollowups(input, { runner: runner(GOOD) });
    expect(Object.keys(res).sort()).toEqual(['dailyCap', 'followups', 'remainingToday', 'thinking', 'tier']);
    expect(res).toMatchObject({
      followups: GOOD.followups,
      tier: 'free',
      dailyCap: 25,
      remainingToday: 24,
      thinking: false,
    });
    expect(asks()).toBe(1);
    expect(m.ledger.filter((r) => r.promptId === 'medschools-qa-lock')).toHaveLength(0);
  });

  it('hands the model only the question, the notes and the stored examples, as data', async () => {
    const r = runner(GOOD);
    await generateFollowups(input, { runner: r });
    const [system, user] = r.calls[0] as string[];
    expect(system).toMatch(/follow-up questions/);
    expect(user).toContain('<user-content>');
    expect(JSON.parse(user!.replace(/<\/?user-content>/g, ''))).toEqual({
      question: 'Why medicine?',
      notes: 'my private notes',
      examples: ['Tell me about Duke?'],
    });
  });

  it('is refused at the daily cap before any model call', async () => {
    process.env.MEDSCHOOLS_QA_DAILY_CAP = '1';
    const r = runner(GOOD);
    await generateFollowups(input, { runner: r });
    expect(await code(generateFollowups(input, { runner: r }))).toBe('MEDSCHOOLS_QA_DAILY_CAP');
    expect(r.generate).toHaveBeenCalledTimes(1);
  });

  it('fails closed when the budget ledger cannot be read or the share is spent', async () => {
    const r = runner(GOOD);
    m.aiUsage.aggregate.mockRejectedValueOnce(new Error('db down'));
    expect(await code(generateFollowups(input, { runner: r }))).toBe('MEDSCHOOLS_QA_PAUSED');
    process.env.MEDSCHOOLS_AI_MONTHLY_USD = '10';
    m.aiUsage.aggregate.mockResolvedValue({ _sum: { costMicros: 99_000_000 } });
    expect(await code(generateFollowups(input, { runner: r }))).toBe('MEDSCHOOLS_QA_PAUSED');
    expect(r.generate).not.toHaveBeenCalled();
    expect(asks()).toBe(0);
    m.aiUsage.aggregate.mockResolvedValue({ _sum: { costMicros: 0 } });
  });

  it('gives the day back when the reply is unusable, but not when the provider fails', async () => {
    expect(await code(generateFollowups(input, { runner: runner({ followups: ['Just one?'] }) }))).toBe(
      'AI_UNAVAILABLE',
    );
    expect(asks()).toBe(0);
    expect(await code(generateFollowups(input, { runner: runner(new AppError('AI_UNAVAILABLE')) }))).toBe(
      'AI_UNAVAILABLE',
    );
    expect(asks()).toBe(1);
  });

  it('writes nothing but the reservation rows and logs no content', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await generateFollowups(input, { runner: runner(GOOD) });
    const text =
      JSON.stringify(warn.mock.calls) + JSON.stringify(m.ledger, (_k, v) => (typeof v === 'bigint' ? String(v) : v));
    for (const secret of ['Why medicine', 'my private notes', 'What drew you', 'Duke'])
      expect(text).not.toContain(secret);
    expect(m.ledger.every((r) => r.task === 'medschools-qa')).toBe(true);
  });

  it('an admin has no daily row', async () => {
    const res = await generateFollowups({ ...input, isAdmin: true }, { runner: runner(GOOD) });
    expect(res).toMatchObject({ tier: 'admin', dailyCap: null, remainingToday: null });
    expect(asks()).toBe(0);
  });
});

describe('schoolExampleQuestions', () => {
  it('reads an active school only, selecting just the text', async () => {
    expect(await schoolExampleQuestions('nowhere')).toBeNull();
    expect(await schoolExampleQuestions('duke')).toEqual(['Stored one?']);
    expect(m.prisma.medSchool.findFirst).toHaveBeenLastCalledWith({
      where: { slug: 'duke', active: true },
      select: { id: true },
    });
    expect(m.prisma.medInterviewQuestion.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { schoolId: 's1' }, select: { text: true } }),
    );
  });
});
