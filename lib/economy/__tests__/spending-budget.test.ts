import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Monthly spending budget (s04-07). Money, so the properties are tested against
 * a fake that behaves like Postgres where it matters:
 *
 *  - `$transaction` snapshots the tables and restores them if the callback
 *    throws, so a refusal or a failed debit leaves nothing behind;
 *  - `pg_advisory_xact_lock` is a real per-key mutex held until the
 *    transaction ends, so concurrent spends queue exactly as they do in
 *    production;
 *  - the month `SUM` yields to the event loop after it reads, so without the
 *    lock every concurrent spend sees the same total (the race).
 *
 * `lockWorks: false` turns the mutex off to prove the race test has teeth.
 */

vi.mock('@/lib/prisma.server', () => ({ prisma: {} }));

import { AppError, isAppError } from '@/lib/errors/codes';
import {
  InsufficientFundsError,
  creditCoinsOn,
  debitCoinsOn,
  transferCoinsOn,
} from '@/lib/economy/ledger-core';
import { SPEND_TYPES, monthKey } from '@/lib/economy/spend-budget';
import { applySpendBudgetChangeOn } from '@/lib/economy/spend-budget.server';
import { playLimitsChangeSchema } from '@/lib/economy/play-limits-schema';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

interface State {
  limits: Map<string, Row>;
  profiles: Map<string, number>;
  txns: Row[];
  notifications: Row[];
}

function makeDb(initial: Partial<State> = {}, opts: { lockWorks?: boolean } = {}) {
  const lockWorks = opts.lockWorks ?? true;
  const state: State = {
    limits: initial.limits ?? new Map(),
    profiles: initial.profiles ?? new Map(),
    txns: initial.txns ?? [],
    notifications: initial.notifications ?? [],
  };
  const log: string[] = [];
  const locks = new Map<string, Promise<void>>();
  let nextId = 1;

  /** Undo journal of the running transaction: rolling back one must not erase a rival's commit. */
  type Undo = Array<() => void>;
  const setCoins = (undo: Undo, id: string, value: number) => {
    const prev = state.profiles.get(id);
    undo.push(() => (prev === undefined ? state.profiles.delete(id) : state.profiles.set(id, prev)));
    state.profiles.set(id, value);
  };
  const touchLimits = (undo: Undo, id: string) => {
    const prev = state.limits.get(id);
    const copy = prev ? { ...prev } : undefined;
    undo.push(() => (copy ? state.limits.set(id, copy) : state.limits.delete(id)));
  };

  function build(release: Array<() => void>, undo: Undo) {
    return {
      $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const sql = strings.join('?');
        log.push(`raw:${sql}|${values.join(',')}`);
        if (!sql.includes('pg_advisory_xact_lock')) return 0;
        log.push('lock');
        if (!lockWorks) return 0;
        const key = String(values[0]);
        const prev = locks.get(key) ?? Promise.resolve();
        let done!: () => void;
        const mine = new Promise<void>((r) => (done = r));
        locks.set(key, prev.then(() => mine));
        await prev;
        release.push(done);
        return 0;
      },
      userPlayLimits: {
        findUnique: async ({ where }: Row) => {
          log.push('limits');
          const r = state.limits.get(where.userId);
          return r ? { ...r } : null;
        },
        updateMany: async ({ where, data }: Row) => {
          const r = state.limits.get(where.userId);
          if (!r) return { count: 0 };
          const ok = (where.OR as Row[]).some((c) =>
            'spendNoticeMonth' in c && c.spendNoticeMonth === null
              ? r.spendNoticeMonth == null
              : r.spendNoticeMonth != null && r.spendNoticeMonth !== c.spendNoticeMonth.not,
          );
          if (!ok) return { count: 0 };
          touchLimits(undo, where.userId);
          Object.assign(r, data);
          return { count: 1 };
        },
        upsert: async ({ where, create, update }: Row) => {
          touchLimits(undo, where.userId);
          const r = state.limits.get(where.userId);
          if (r) Object.assign(r, update);
          else state.limits.set(where.userId, { ...create });
        },
      },
      userProfile: {
        upsert: async ({ where, create, update }: Row) => {
          const coins = state.profiles.get(where.userId);
          if (coins === undefined) setCoins(undo, where.userId, create.coins);
          else if (update.coins?.increment) setCoins(undo, where.userId, coins + update.coins.increment);
        },
        updateMany: async ({ where, data }: Row) => {
          const coins = state.profiles.get(where.userId);
          if (coins === undefined || coins < where.coins.gte) return { count: 0 };
          setCoins(undo, where.userId, coins - data.coins.decrement);
          return { count: 1 };
        },
        update: async ({ where, data }: Row) => {
          setCoins(undo, where.userId, (state.profiles.get(where.userId) ?? 0) + data.coins.increment);
        },
      },
      coinTransaction: {
        findUnique: async ({ where }: Row) => {
          const r = state.txns.find((t) => t.idempotencyKey === where.idempotencyKey);
          return r ? { id: r.id } : null;
        },
        aggregate: async ({ where }: Row) => {
          log.push('sum');
          const types: string[] = typeof where.type === 'string' ? [where.type] : where.type.in;
          const total = state.txns
            .filter(
              (t) =>
                t.senderId === where.senderId &&
                types.includes(t.type) &&
                t.createdAt >= where.createdAt.gte &&
                (where.createdAt.lt === undefined || t.createdAt < where.createdAt.lt),
            )
            .reduce((a, t) => a + t.amount, 0);
          // Yield after reading, so an unlocked rival reads the same total.
          await new Promise((r) => setTimeout(r, 2));
          return { _sum: { amount: total } };
        },
        create: async ({ data }: Row) => {
          const row = { ...data, id: `t${nextId++}`, createdAt: new Date() };
          state.txns.push(row);
          undo.push(() => void state.txns.splice(state.txns.indexOf(row), 1));
          return { id: row.id };
        },
      },
      notification: {
        create: async ({ data }: Row) => {
          const row = { ...data };
          state.notifications.push(row);
          undo.push(() => void state.notifications.splice(state.notifications.indexOf(row), 1));
          return { id: 'n1' };
        },
      },
    };
  }

  const client = {
    ...build([], []),
    $transaction: async <T>(fn: (tx: ReturnType<typeof build>) => Promise<T>): Promise<T> => {
      const release: Array<() => void> = [];
      const undo: Undo = [];
      try {
        return await fn(build(release, undo));
      } catch (err) {
        for (const u of undo.reverse()) u();
        throw err;
      } finally {
        for (const r of release) r();
      }
    },
  };
  return { client: client as unknown as Parameters<typeof debitCoinsOn>[0], state, log };
}

const NOW = new Date('2026-11-21T14:05:00.000Z');
const OPEN: Row = { monthlySpendCap: null, pendingSpendCap: null, pendingSpendCapAt: null, spendNoticeMonth: null };
const limitsWith = (over: Row) => new Map([['u1', { ...OPEN, ...over }]]);
const spent = (userId: string, type: string, amount: number, at = NOW): Row => ({
  id: `seed-${Math.random()}`,
  senderId: userId,
  recipientId: null,
  type,
  amount,
  createdAt: at,
});

async function refusal(p: Promise<unknown>): Promise<AppError> {
  try {
    await p;
  } catch (err) {
    if (isAppError(err)) return err;
    throw err;
  }
  throw new Error('expected the spend to be refused');
}

beforeEach(() => vi.useFakeTimers({ toFake: ['Date'], now: NOW }));
afterEach(() => vi.useRealTimers());

describe('the budget refuses a spend before any coins move', () => {
  it('refuses a 200-coin purchase at 900 of 1000 and reports 100 left', async () => {
    const db = makeDb({
      limits: limitsWith({ monthlySpendCap: 1000 }),
      profiles: new Map([['u1', 5000]]),
      txns: [spent('u1', 'PURCHASE', 900)],
    });
    const err = await refusal(debitCoinsOn(db.client, 'u1', 200, { type: 'PURCHASE' }));
    expect(err.code).toBe('SPEND_BUDGET_REACHED');
    expect(err.detail).toEqual({ cap: 1000, spent: 900, remaining: 100 });
    expect(err.status).toBe(403);
    expect(db.state.profiles.get('u1')).toBe(5000);
    expect(db.state.txns).toHaveLength(1);
  });

  it('allows a spend that lands exactly on the cap', async () => {
    const db = makeDb({
      limits: limitsWith({ monthlySpendCap: 1000 }),
      profiles: new Map([['u1', 5000]]),
      txns: [spent('u1', 'PURCHASE', 900)],
    });
    await debitCoinsOn(db.client, 'u1', 100, { type: 'PURCHASE' });
    expect(db.state.profiles.get('u1')).toBe(4900);
  });

  it('treats an untyped debit as the purchase it is booked as', async () => {
    const db = makeDb({ limits: limitsWith({ monthlySpendCap: 100 }), profiles: new Map([['u1', 5000]]) });
    await refusal(debitCoinsOn(db.client, 'u1', 101));
  });

  it('counts only this month: last month’s spending is not this month’s', async () => {
    const db = makeDb({
      limits: limitsWith({ monthlySpendCap: 1000 }),
      profiles: new Map([['u1', 5000]]),
      txns: [spent('u1', 'PURCHASE', 900, new Date('2026-10-31T23:59:59.999Z'))],
    });
    await debitCoinsOn(db.client, 'u1', 1000, { type: 'PURCHASE' });
  });

  it('counts every spend type, and tips and gifts on the sender side', async () => {
    for (const type of SPEND_TYPES) {
      const db = makeDb({
        limits: limitsWith({ monthlySpendCap: 1000 }),
        profiles: new Map([['u1', 5000]]),
        txns: [spent('u1', type, 950)],
      });
      const err = await refusal(debitCoinsOn(db.client, 'u1', 100, { type: 'PURCHASE' }));
      expect(err.code, type).toBe('SPEND_BUDGET_REACHED');
    }
    const db = makeDb({
      limits: limitsWith({ monthlySpendCap: 1000 }),
      profiles: new Map([['u1', 5000]]),
    });
    await transferCoinsOn(db.client, 'u1', 'u2', 600, { type: 'TIP' });
    const err = await refusal(transferCoinsOn(db.client, 'u1', 'u2', 500, { type: 'GIFT' }));
    expect(err.detail?.remaining).toBe(400);
    await transferCoinsOn(db.client, 'u1', 'u2', 400, { type: 'GIFT' });
    expect(db.state.profiles.get('u2')).toBe(1000 + 10); // 10: the seeded starting balance of a new profile
  });

  it('checks the full amount of a transfer, fee included', async () => {
    const db = makeDb({ limits: limitsWith({ monthlySpendCap: 500 }), profiles: new Map([['u1', 5000]]) });
    await refusal(transferCoinsOn(db.client, 'u1', 'u2', 501, { type: 'TIP', fee: 50 }));
    await transferCoinsOn(db.client, 'u1', 'u2', 500, { type: 'TIP', fee: 50 });
    // The delivered row and the fee row together are what the member spent.
    const sum = db.state.txns.filter((t) => t.senderId === 'u1').reduce((a, t) => a + t.amount, 0);
    expect(sum).toBe(500);
    await refusal(debitCoinsOn(db.client, 'u1', 1, { type: 'PURCHASE' }));
  });
});

describe('what is not spending', () => {
  it('never refuses or counts wagers, admin debits and rewards', async () => {
    const db = makeDb({
      limits: limitsWith({ monthlySpendCap: 100 }),
      profiles: new Map([['u1', 100_000]]),
      txns: [
        spent('u1', 'WAGER', 50_000),
        spent('u1', 'ADMIN', 50_000),
        spent('u1', 'REWARD', 50_000),
      ],
    });
    await debitCoinsOn(db.client, 'u1', 5000, { type: 'WAGER' });
    await debitCoinsOn(db.client, 'u1', 5000, { type: 'ADMIN' });
    // None of them is in the month total, so a real purchase up to the cap still fits.
    await debitCoinsOn(db.client, 'u1', 100, { type: 'PURCHASE' });
    await refusal(debitCoinsOn(db.client, 'u1', 1, { type: 'PURCHASE' }));
  });

  it('does not count coins a member received, such as a won bet', async () => {
    const payout = { ...spent('x', 'WAGER', 90_000), senderId: null, recipientId: 'u1' };
    const db = makeDb({
      limits: limitsWith({ monthlySpendCap: 1000 }),
      profiles: new Map([['u1', 5000]]),
      txns: [payout],
    });
    await debitCoinsOn(db.client, 'u1', 1000, { type: 'PURCHASE' });
  });

  it('never blocks a credit', async () => {
    const db = makeDb({
      limits: limitsWith({ monthlySpendCap: 100 }),
      profiles: new Map([['u1', 0]]),
      txns: [spent('u1', 'PURCHASE', 100)],
    });
    await creditCoinsOn(db.client, 'u1', 500, { type: 'REWARD' });
    expect(db.state.profiles.get('u1')).toBe(500);
  });

  it('adds no query at all for a member with no row or no budget', async () => {
    for (const limits of [new Map(), limitsWith({ dailyCoinCap: 5 })]) {
      const db = makeDb({ limits, profiles: new Map([['u1', 500]]) });
      await debitCoinsOn(db.client, 'u1', 10, { type: 'PURCHASE' });
      expect(db.log).not.toContain('sum');
      expect(db.log).not.toContain('lock');
    }
  });

  it('does not re-check a replayed idempotency key', async () => {
    const db = makeDb({ limits: limitsWith({ monthlySpendCap: 100 }), profiles: new Map([['u1', 500]]) });
    const first = await debitCoinsOn(db.client, 'u1', 100, { type: 'PURCHASE', idempotencyKey: 'k1' });
    const again = await debitCoinsOn(db.client, 'u1', 100, { type: 'PURCHASE', idempotencyKey: 'k1' });
    expect(first.applied).toBe(true);
    expect(again).toMatchObject({ applied: false, replayed: true });
  });
});

describe('raising waits, cutting does not', () => {
  it('keeps enforcing the old cap until a raise matures, then the new one', async () => {
    const waiting = limitsWith({
      monthlySpendCap: 1000,
      pendingSpendCap: 5000,
      pendingSpendCapAt: new Date(NOW.getTime() + 60_000),
    });
    const db = makeDb({ limits: waiting, profiles: new Map([['u1', 9000]]) });
    await refusal(debitCoinsOn(db.client, 'u1', 1500, { type: 'PURCHASE' }));

    vi.setSystemTime(new Date(NOW.getTime() + 60_000));
    await debitCoinsOn(db.client, 'u1', 1500, { type: 'PURCHASE' });
  });

  it('enforces a removal only once it has matured', async () => {
    const db = makeDb({
      limits: limitsWith({
        monthlySpendCap: 100,
        pendingSpendCap: null,
        pendingSpendCapAt: new Date(NOW.getTime() + 60_000),
      }),
      profiles: new Map([['u1', 9000]]),
    });
    await refusal(debitCoinsOn(db.client, 'u1', 500, { type: 'PURCHASE' }));
    vi.setSystemTime(new Date(NOW.getTime() + 60_000));
    await debitCoinsOn(db.client, 'u1', 500, { type: 'PURCHASE' });
  });

  it('applies a cut at once and parks a raise through the settings write', async () => {
    const db = makeDb({ limits: limitsWith({ monthlySpendCap: 2000 }) });
    const tx = (db.client as unknown as { $transaction: (f: (t: never) => Promise<unknown>) => Promise<unknown> })
      .$transaction;

    await tx((t) => applySpendBudgetChangeOn(t, 'u1', { monthlySpendCap: 1500 }, NOW));
    expect(db.state.limits.get('u1')).toMatchObject({ monthlySpendCap: 1500, pendingSpendCapAt: null });

    await tx((t) => applySpendBudgetChangeOn(t, 'u1', { monthlySpendCap: 4000 }, NOW));
    expect(db.state.limits.get('u1')).toMatchObject({
      monthlySpendCap: 1500,
      pendingSpendCap: 4000,
      pendingSpendCapAt: new Date(NOW.getTime() + 24 * 3600_000),
    });

    await tx((t) => applySpendBudgetChangeOn(t, 'u1', { cancelPendingSpendCap: true }, NOW));
    expect(db.state.limits.get('u1')).toMatchObject({
      monthlySpendCap: 1500,
      pendingSpendCap: null,
      pendingSpendCapAt: null,
    });
  });

  it('takes its own settings lock, not the ledger’s spend lock', async () => {
    const db = makeDb();
    const tx = (db.client as unknown as { $transaction: (f: (t: never) => Promise<unknown>) => Promise<unknown> })
      .$transaction;
    await tx((t) => applySpendBudgetChangeOn(t, 'u1', { monthlySpendCap: 500 }, NOW));
    const raw = db.log.filter((l) => l.startsWith('raw:'));
    expect(raw).toHaveLength(1);
    expect(raw[0]).toContain('spend-budget-settings:u1');
    expect(raw[0]).not.toContain('|spend:');
  });
});

describe('concurrency', () => {
  it('lets only as many concurrent spends through as the cap holds', async () => {
    const db = makeDb({
      limits: limitsWith({ monthlySpendCap: 1000 }),
      profiles: new Map([['u1', 100_000]]),
    });
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => debitCoinsOn(db.client, 'u1', 300, { type: 'PURCHASE' })),
    );
    const ok = results.filter((r) => r.status === 'fulfilled');
    const refused = results.filter(
      (r) => r.status === 'rejected' && isAppError(r.reason) && r.reason.code === 'SPEND_BUDGET_REACHED',
    );
    expect(ok).toHaveLength(3);
    expect(refused).toHaveLength(3);
    const total = db.state.txns.reduce((a, t) => a + t.amount, 0);
    expect(total).toBe(900);
    expect(db.state.profiles.get('u1')).toBe(100_000 - 900);
  });

  it('holds across a debit and a transfer racing each other', async () => {
    const db = makeDb({
      limits: limitsWith({ monthlySpendCap: 1000 }),
      profiles: new Map([['u1', 100_000]]),
    });
    const results = await Promise.allSettled([
      debitCoinsOn(db.client, 'u1', 600, { type: 'PURCHASE' }),
      transferCoinsOn(db.client, 'u1', 'u2', 600, { type: 'TIP' }),
      transferCoinsOn(db.client, 'u1', 'u3', 600, { type: 'GIFT' }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(db.state.txns.reduce((a, t) => a + t.amount, 0)).toBe(600);
  });

  it('would overspend without the lock (the test can fail)', async () => {
    const db = makeDb(
      { limits: limitsWith({ monthlySpendCap: 1000 }), profiles: new Map([['u1', 100_000]]) },
      { lockWorks: false },
    );
    await Promise.allSettled(
      Array.from({ length: 6 }, () => debitCoinsOn(db.client, 'u1', 300, { type: 'PURCHASE' })),
    );
    expect(db.state.txns.reduce((a, t) => a + t.amount, 0)).toBeGreaterThan(1000);
  });

  it('takes the member’s lock before it sums, and the lock is the spec’s key', async () => {
    const db = makeDb({ limits: limitsWith({ monthlySpendCap: 1000 }), profiles: new Map([['u1', 500]]) });
    await debitCoinsOn(db.client, 'u1', 10, { type: 'PURCHASE' });
    expect(db.log.indexOf('lock')).toBeGreaterThan(-1);
    expect(db.log.indexOf('lock')).toBeLessThan(db.log.indexOf('sum'));
    expect(db.log).toContain('raw:SELECT pg_advisory_xact_lock(hashtext(?))|spend:u1');
  });
});

describe('the 80% notice', () => {
  it('goes out once, on the first spend that crosses the line', async () => {
    const db = makeDb({ limits: limitsWith({ monthlySpendCap: 1000 }), profiles: new Map([['u1', 100_000]]) });
    await debitCoinsOn(db.client, 'u1', 500, { type: 'PURCHASE' });
    expect(db.state.notifications).toHaveLength(0);

    await debitCoinsOn(db.client, 'u1', 300, { type: 'PURCHASE' });
    expect(db.state.notifications).toHaveLength(1);
    expect(db.state.notifications[0]).toMatchObject({
      userId: 'u1',
      type: 'SYSTEM',
      entityType: 'spend-budget',
      entityId: '2026-11',
      link: '/wallet',
    });
    expect(db.state.limits.get('u1')!.spendNoticeMonth).toBe('2026-11');

    await debitCoinsOn(db.client, 'u1', 50, { type: 'PURCHASE' });
    await debitCoinsOn(db.client, 'u1', 100, { type: 'TIP' });
    expect(db.state.notifications).toHaveLength(1);
  });

  it('goes out again the next month', async () => {
    const db = makeDb({ limits: limitsWith({ monthlySpendCap: 1000 }), profiles: new Map([['u1', 100_000]]) });
    await debitCoinsOn(db.client, 'u1', 850, { type: 'PURCHASE' });
    vi.setSystemTime(new Date('2026-12-02T10:00:00Z'));
    await debitCoinsOn(db.client, 'u1', 850, { type: 'PURCHASE' });
    expect(db.state.notifications.map((n) => n.entityId)).toEqual(['2026-11', '2026-12']);
    expect(db.state.limits.get('u1')!.spendNoticeMonth).toBe(monthKey(new Date('2026-12-02T10:00:00Z')));
  });

  it('is sent once even when concurrent spends cross the line together', async () => {
    const db = makeDb({ limits: limitsWith({ monthlySpendCap: 1000 }), profiles: new Map([['u1', 100_000]]) });
    await Promise.all(
      Array.from({ length: 3 }, () => debitCoinsOn(db.client, 'u1', 300, { type: 'PURCHASE' })),
    );
    expect(db.state.notifications).toHaveLength(1);
  });

  it('is not sent for a refused spend, nor kept when the debit then fails', async () => {
    const db = makeDb({ limits: limitsWith({ monthlySpendCap: 1000 }), profiles: new Map([['u1', 5]]) });
    await expect(debitCoinsOn(db.client, 'u1', 850, { type: 'PURCHASE' })).rejects.toBeInstanceOf(
      InsufficientFundsError,
    );
    expect(db.state.notifications).toHaveLength(0);
    expect(db.state.limits.get('u1')!.spendNoticeMonth).toBeNull();
  });
});

describe('raw SQL and schema names', () => {
  it('uses real names: the lock touches no table, and the migration targets the mapped table', () => {
    const schema = readFileSync(join(process.cwd(), 'prisma/schema/auth.prisma'), 'utf8');
    const model = schema.slice(schema.indexOf('model UserPlayLimits'));
    expect(model.slice(0, model.indexOf('@@map("user_play_limits")'))).toContain('spendNoticeMonth');
    const sql = readFileSync(
      join(process.cwd(), 'prisma/migrations/20261124020000_s04_spending_budget/migration.sql'),
      'utf8',
    );
    expect(sql).toContain('ALTER TABLE "user_play_limits"');
    for (const col of ['monthlySpendCap', 'pendingSpendCap', 'pendingSpendCapAt', 'spendNoticeMonth']) {
      expect(sql).toContain(`"${col}"`);
      expect(model).toContain(col);
    }
  });

  it('queries the month total by sender, spend types and the month window', async () => {
    const calls: Row[] = [];
    const db = makeDb({ limits: limitsWith({ monthlySpendCap: 1000 }), profiles: new Map([['u1', 500]]) });
    const real = (db.client as unknown as { $transaction: (f: (t: Row) => Promise<unknown>) => Promise<unknown> })
      .$transaction;
    await real(async (t) => {
      const agg = t.coinTransaction.aggregate;
      t.coinTransaction.aggregate = (args: Row) => {
        calls.push(args);
        return agg(args);
      };
      await debitCoinsOn(db.client, 'u1', 10, { type: 'PURCHASE', tx: t as never });
    });
    expect(calls[0]).toEqual({
      where: {
        senderId: 'u1',
        type: { in: [...SPEND_TYPES] },
        createdAt: { gte: new Date('2026-11-01T00:00:00Z'), lt: new Date('2026-12-01T00:00:00Z') },
      },
      _sum: { amount: true },
    });
  });
});

describe('the error and the request', () => {
  it('has a catalog string that interpolates the amount left', () => {
    const cat = JSON.parse(readFileSync(join(process.cwd(), 'locales/en/spending-budget.json'), 'utf8'));
    expect(cat.overBudget).toBe('This would go over your monthly budget ({{remaining}} coins left)');
  });

  it('bounds the budget at 100..10,000,000 and refuses a mixed request', () => {
    const ok = (v: unknown) => playLimitsChangeSchema.safeParse(v).success;
    expect(ok({ monthlySpendCap: 100 })).toBe(true);
    expect(ok({ monthlySpendCap: 10_000_000 })).toBe(true);
    expect(ok({ monthlySpendCap: null })).toBe(true);
    expect(ok({ cancelPendingSpendCap: true })).toBe(true);
    expect(ok({ monthlySpendCap: 99 })).toBe(false);
    expect(ok({ monthlySpendCap: 10_000_001 })).toBe(false);
    expect(ok({ monthlySpendCap: 150.5 })).toBe(false);
    expect(ok({ monthlySpendCap: 500, cancelPendingSpendCap: true })).toBe(false);
    expect(ok({ cancelPendingSpendCap: false })).toBe(false);
    expect(ok({})).toBe(false);
  });
});
