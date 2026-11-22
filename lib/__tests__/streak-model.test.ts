/**
 * The one Streak model (2026-11-19): the check-in streak lives on the user's
 * `(userId, 'daily')` row, and its coin calls are byte-identical to the
 * DailyStreak era — same amounts, CoinTransaction type, entityType and note,
 * and no idempotency key added or removed. Money: a reward per day, a freeze
 * debited before it is granted.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = {
  userId: string;
  kind: string;
  current: number;
  longest: number;
  lastDay: string | null;
  lastCheckIn: Date | null;
  totalDays: number;
  freezeTokens: number;
};

const rows = new Map<string, Row>();
const k = (userId: string, kind: string) => `${userId}|${kind}`;
const ledger = { credit: vi.fn(), debit: vi.fn() };

function fromWhere(where: { userId_kind: { userId: string; kind: string } }) {
  return rows.get(k(where.userId_kind.userId, where.userId_kind.kind)) ?? null;
}

function apply(row: Row, data: Record<string, unknown>) {
  for (const [key, v] of Object.entries(data)) {
    const r = row as unknown as Record<string, unknown>;
    if (v && typeof v === 'object' && 'increment' in v)
      r[key] = (r[key] as number) + (v as { increment: number }).increment;
    else if (v && typeof v === 'object' && 'decrement' in v)
      r[key] = (r[key] as number) - (v as { decrement: number }).decrement;
    else r[key] = v;
  }
}

const streak = {
  findUnique: vi.fn(async ({ where }: { where: { userId_kind: { userId: string; kind: string } } }) => {
    const r = fromWhere(where);
    return r ? { ...r } : null;
  }),
  upsert: vi.fn(
    async ({
      where,
      create,
      update,
    }: {
      where: { userId_kind: { userId: string; kind: string } };
      create: Partial<Row>;
      update: Record<string, unknown>;
    }) => {
      let r = fromWhere(where);
      if (!r) {
        r = {
          current: 0,
          longest: 0,
          lastDay: null,
          lastCheckIn: null,
          totalDays: 0,
          freezeTokens: 0,
          ...create,
        } as Row;
        rows.set(k(r.userId, r.kind), r);
      } else apply(r, update);
      return { ...r };
    },
  ),
  updateMany: vi.fn(
    async ({
      where,
      data,
    }: {
      where: { userId: string; kind: string; NOT: { lastDay: string } };
      data: Record<string, unknown>;
    }) => {
      const r = rows.get(k(where.userId, where.kind));
      if (!r || r.lastDay === where.NOT.lastDay) return { count: 0 };
      apply(r, data);
      return { count: 1 };
    },
  ),
};

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    streak,
    $transaction: async (fn: (tx: unknown) => unknown) => fn({ streak }),
  },
}));
vi.mock('@/lib/economy/ledger.server', () => ({
  creditCoins: (...a: unknown[]) => ledger.credit(...a),
  debitCoins: (...a: unknown[]) => ledger.debit(...a),
  getBalance: async () => 850,
}));
vi.mock('@/lib/achievements/engine.server', () => ({ grantAchievement: vi.fn() }));
vi.mock('@/lib/xp/engine.server', () => ({ awardXp: vi.fn() }));
vi.mock('@/lib/quests/engine.server', () => ({ progressQuests: vi.fn() }));

const { buyFreeze, checkIn, getStreak, todayKey, FREEZE_COST } = await import('@/lib/streak.server');

const dayAgo = (n: number) => todayKey(new Date(Date.now() - n * 86_400_000));
const seed = (userId: string, r: Partial<Row>) =>
  rows.set(k(userId, 'daily'), {
    userId,
    kind: 'daily',
    current: 0,
    longest: 0,
    lastDay: null,
    lastCheckIn: null,
    totalDays: 0,
    freezeTokens: 0,
    ...r,
  });

beforeEach(() => {
  rows.clear();
  ledger.credit.mockReset();
  ledger.debit.mockReset();
});

describe('check-in on the Streak model', () => {
  it('extends from yesterday and credits the reward with the unchanged ledger shape', async () => {
    seed('u', { current: 7, longest: 9, lastDay: dayAgo(1), totalDays: 20 });
    const s = await checkIn('u');
    expect(s).toMatchObject({ current: 8, longest: 9, totalCheckIns: 21, reward: 7, freezeUsed: 0 });
    expect(ledger.credit).toHaveBeenCalledTimes(1);
    const [userId, amount, opts] = ledger.credit.mock.calls[0]!;
    expect(userId).toBe('u');
    expect(amount).toBe(7);
    expect(opts).toEqual({ tx: expect.anything(), type: 'REWARD', entityType: 'streak', note: 'Daily streak reward' });
    expect(rows.get(k('u', 'daily'))).toMatchObject({ current: 8, lastDay: todayKey(), totalDays: 21 });
  });

  it('pays once per day', async () => {
    seed('u', { current: 3, longest: 3, lastDay: dayAgo(1) });
    await checkIn('u');
    const again = await checkIn('u');
    expect(again.reward).toBe(0);
    expect(ledger.credit).toHaveBeenCalledTimes(1);
  });

  it('bridges missed days with freezes, and resets without them', async () => {
    seed('frozen', { current: 5, longest: 5, lastDay: dayAgo(3), freezeTokens: 2 });
    expect((await getStreak('frozen')).current).toBe(5);
    const f = await checkIn('frozen');
    expect(f).toMatchObject({ current: 6, freezeUsed: 2, freezeTokens: 0 });
    expect(rows.get(k('frozen', 'daily'))!.freezeTokens).toBe(0);

    seed('broken', { current: 5, longest: 5, lastDay: dayAgo(10) });
    expect((await getStreak('broken')).current).toBe(0);
    expect((await checkIn('broken')).current).toBe(1);
  });

  it('starts a row of kind daily for a first check-in, never touching another kind', async () => {
    rows.set(k('u', 'arcade'), {
      userId: 'u',
      kind: 'arcade',
      current: 4,
      longest: 4,
      lastDay: todayKey(),
      lastCheckIn: null,
      totalDays: 4,
      freezeTokens: 0,
    });
    const s = await checkIn('u');
    expect(s).toMatchObject({ current: 1, reward: 5 });
    expect(rows.get(k('u', 'daily'))).toMatchObject({ kind: 'daily', current: 1, totalDays: 1 });
    expect(rows.get(k('u', 'arcade'))).toMatchObject({ current: 4, totalDays: 4 });
  });
});

describe('streak freeze on the Streak model', () => {
  it('debits the unchanged amount and ledger shape, then grants one freeze', async () => {
    seed('u', { freezeTokens: 1 });
    const r = await buyFreeze('u');
    expect(r).toEqual({ freezeTokens: 2, newBalance: 850 });
    expect(ledger.debit).toHaveBeenCalledTimes(1);
    const [userId, amount, opts] = ledger.debit.mock.calls[0]!;
    expect(userId).toBe('u');
    expect(amount).toBe(FREEZE_COST);
    expect(FREEZE_COST).toBe(150);
    expect(opts).toEqual({
      tx: expect.anything(),
      type: 'PURCHASE',
      entityType: 'streak-freeze',
      note: 'Streak freeze',
    });
  });

  it('creates the daily row for a first purchase', async () => {
    await buyFreeze('new');
    expect(rows.get(k('new', 'daily'))).toMatchObject({ kind: 'daily', freezeTokens: 1 });
  });

  it('refuses past the cap without charging', async () => {
    seed('u', { freezeTokens: 3 });
    await expect(buyFreeze('u')).rejects.toThrow('MAX_FREEZES');
    expect(ledger.debit).not.toHaveBeenCalled();
  });
});
