import { describe, it, expect, beforeEach } from 'vitest';

/**
 * The shared escrow primitive (`lib/economy/escrow-core.ts`) — money.
 *
 * Pools, community goals and wagers all pay out of escrow through it, so the
 * properties that stop a double payment are tested here once, against a fake
 * with the two guards production relies on:
 *
 *   1. the claim — a conditional update modelled as one synchronous
 *      check-and-write, so a losing runner matches nothing; and
 *   2. the ledger key — a repeated key is a replay that moves no coins, the way
 *      `coinTransaction.idempotencyKey`'s unique index and `execute()` behave.
 *
 * Transactions snapshot and restore on throw, because "the credit failed, so
 * its claim unwinds" is what makes a failed refund retryable rather than lost.
 */

import {
  holdEscrow,
  readSettledKeys,
  refundEscrow,
  settleEscrow,
  type EscrowLedger,
  type EscrowRefundPlan,
  type EscrowTxRunner,
} from '@/lib/economy/escrow-core';
import type { Db } from '@/lib/economy/ledger-core';

interface Movement {
  key: string;
}

interface Holding {
  id: number;
  userId: string;
  coins: number;
  refundedAt: number | null;
}

interface State {
  balances: Map<string, number>;
  keys: Set<string>;
  holdings: Holding[];
  escrowOpen: boolean;
  escrowRefunded: boolean;
}

let state: State;
/** Credit keys that throw once (a ledger outage mid-sweep). */
let failOnce: Set<string>;

function clone(s: State): State {
  return {
    balances: new Map(s.balances),
    keys: new Set(s.keys),
    holdings: s.holdings.map((h) => ({ ...h })),
    escrowOpen: s.escrowOpen,
    escrowRefunded: s.escrowRefunded,
  };
}

/** The fake transaction handle is the state itself. */
type Tx = 'tx';

const runner: EscrowTxRunner<Tx> = {
  async $transaction(fn) {
    const snap = clone(state);
    try {
      return await fn('tx');
    } catch (err) {
      state = snap;
      throw err;
    }
  },
};

const ledger: EscrowLedger<Tx, Movement> = {
  async debit(_tx, userId, amount, m) {
    if (state.keys.has(m.key)) return;
    const bal = state.balances.get(userId) ?? 0;
    if (bal < amount) throw new Error('INSUFFICIENT_COINS');
    state.balances.set(userId, bal - amount);
    state.keys.add(m.key);
  },
  async credit(_tx, userId, amount, m) {
    if (state.keys.has(m.key)) return;
    if (failOnce.delete(m.key)) throw new Error('ledger unavailable');
    state.balances.set(userId, (state.balances.get(userId) ?? 0) + amount);
    state.keys.add(m.key);
  },
};

const bal = (u: string) => state.balances.get(u) ?? 0;

function plan(overrides: Partial<EscrowRefundPlan<Tx, Movement, number>> = {}) {
  const p: EscrowRefundPlan<Tx, Movement, number> = {
    batchSize: 2,
    outstanding: async (take) =>
      state.holdings
        .filter((h) => h.refundedAt === null)
        .slice(0, take)
        .map((h) => ({ id: h.id, userId: h.userId, coins: h.coins })),
    claim: async (_tx, h) => {
      const row = state.holdings.find((r) => r.id === h.id && r.refundedAt === null);
      if (!row) return false;
      row.refundedAt = 1;
      return true;
    },
    movement: (h) => ({ key: `refund:${h.id}` }),
    remaining: async () => state.holdings.filter((h) => h.refundedAt === null).length,
    markRefunded: async () => {
      if (state.escrowRefunded) return false;
      state.escrowRefunded = true;
      return true;
    },
    ...overrides,
  };
  return p;
}

function claimOpen(): () => Promise<boolean> {
  return async () => {
    if (!state.escrowOpen) return false;
    state.escrowOpen = false;
    return true;
  };
}

beforeEach(() => {
  failOnce = new Set();
  state = {
    balances: new Map([
      ['a', 100],
      ['b', 100],
      ['c', 100],
    ]),
    keys: new Set(),
    holdings: [],
    escrowOpen: true,
    escrowRefunded: false,
  };
  // Three contributions, held the way the features hold them.
  let id = 0;
  for (const [userId, coins] of [
    ['a', 10],
    ['b', 20],
    ['c', 30],
  ] as const) {
    id += 1;
    state.holdings.push({ id, userId, coins, refundedAt: null });
  }
});

describe('holdEscrow', () => {
  it('debits the holder once per key', async () => {
    await holdEscrow('tx', ledger, { userId: 'a', amount: 10, movement: { key: 'hold:1' } });
    await holdEscrow('tx', ledger, { userId: 'a', amount: 10, movement: { key: 'hold:1' } });
    expect(bal('a')).toBe(90);
  });

  it('propagates an overdraft from the ledger', async () => {
    await expect(holdEscrow('tx', ledger, { userId: 'a', amount: 1000, movement: { key: 'hold:x' } })).rejects.toThrow(
      'INSUFFICIENT_COINS',
    );
    expect(bal('a')).toBe(100);
  });
});

describe('settleEscrow', () => {
  const pay = { userId: 'b', amount: 60, movement: { key: 'settle:p1' } };

  it('pays the beneficiary when the claim wins', async () => {
    const ok = await runner.$transaction((tx) => settleEscrow(tx, ledger, { claim: claimOpen(), credits: [pay] }));
    expect(ok).toBe(true);
    expect(bal('b')).toBe(160);
  });

  it('a second settle loses the claim and pays nothing', async () => {
    await settleEscrow('tx', ledger, { claim: claimOpen(), credits: [pay] });
    const again = await settleEscrow('tx', ledger, { claim: claimOpen(), credits: [pay] });
    expect(again).toBe(false);
    expect(bal('b')).toBe(160);
  });

  it('a settle whose claim is re-won (restored row) is still stopped by the key', async () => {
    await settleEscrow('tx', ledger, { claim: claimOpen(), credits: [pay] });
    state.escrowOpen = true; // e.g. a row resurrected from a backup
    await settleEscrow('tx', ledger, { claim: claimOpen(), credits: [pay] });
    expect(bal('b')).toBe(160);
  });

  it('never credits before the claim, and unwinds the claim if a credit throws', async () => {
    failOnce.add('settle:p1');
    await expect(
      runner.$transaction((tx) => settleEscrow(tx, ledger, { claim: claimOpen(), credits: [pay] })),
    ).rejects.toThrow('ledger unavailable');
    expect(state.escrowOpen).toBe(true);
    expect(bal('b')).toBe(100);

    let claimedFirst = false;
    await settleEscrow('tx', ledger, {
      claim: async () => {
        claimedFirst = bal('b') === 100;
        return claimOpen()();
      },
      credits: () => [pay],
    });
    expect(claimedFirst).toBe(true);
    expect(bal('b')).toBe(160);
  });

  it('pays every credit of a multi-payout close, in order', async () => {
    await settleEscrow('tx', ledger, {
      claim: claimOpen(),
      credits: [
        { userId: 'a', amount: 5, movement: { key: 'r:a' } },
        { userId: 'c', amount: 7, movement: { key: 'r:c' } },
      ],
    });
    expect([bal('a'), bal('c')]).toEqual([105, 107]);
  });
});

describe('refundEscrow', () => {
  it('returns every holding once and marks the escrow', async () => {
    const r = await refundEscrow(runner, ledger, plan());
    expect(r).toEqual({ refunded: 3, coinsReturned: 60, skipped: 0, marked: true });
    expect([bal('a'), bal('b'), bal('c')]).toEqual([110, 120, 130]);
  });

  it('a second refund run pays nobody and does not re-mark', async () => {
    await refundEscrow(runner, ledger, plan());
    const again = await refundEscrow(runner, ledger, plan());
    expect(again).toEqual({ refunded: 0, coinsReturned: 0, skipped: 0, marked: false });
    expect([bal('a'), bal('b'), bal('c')]).toEqual([110, 120, 130]);
  });

  it('a holding claimed by a concurrent run is skipped, not paid', async () => {
    const p = plan();
    const r = await refundEscrow(runner, ledger, {
      ...p,
      // The page was read before the other runner claimed holding 2.
      outstanding: async (take) => {
        const page = await p.outstanding(take);
        state.holdings[1]!.refundedAt = 1;
        return page;
      },
    });
    expect(r.skipped).toBeGreaterThanOrEqual(1);
    expect(bal('b')).toBe(100);
  });

  it('resumes after a credit fails mid-sweep, paying each holding exactly once', async () => {
    failOnce.add('refund:2');
    await expect(refundEscrow(runner, ledger, plan())).rejects.toThrow('ledger unavailable');

    // Holding 1 is paid and stays paid; holding 2's claim unwound with its
    // credit; the escrow is not marked while anything is owed.
    expect(state.holdings.map((h) => h.refundedAt !== null)).toEqual([true, false, false]);
    expect(state.escrowRefunded).toBe(false);
    expect(bal('a')).toBe(110);
    expect(bal('b')).toBe(100);

    const resumed = await refundEscrow(runner, ledger, plan());
    expect(resumed).toEqual({ refunded: 2, coinsReturned: 50, skipped: 0, marked: true });
    expect([bal('a'), bal('b'), bal('c')]).toEqual([110, 120, 130]);
  });

  it('a holding whose claim is lost after it was paid cannot be paid again', async () => {
    await refundEscrow(runner, ledger, plan());
    // A restored backup clears the claim; the ledger key still holds.
    for (const h of state.holdings) h.refundedAt = null;
    state.escrowRefunded = false;
    await refundEscrow(runner, ledger, plan());
    expect([bal('a'), bal('b'), bal('c')]).toEqual([110, 120, 130]);
  });

  it('stops after a page with no progress only when asked to', async () => {
    // Claims always lose: a pathological page that never drains.
    let pages = 0;
    const stuck = plan({
      outstanding: async (take) => {
        pages += 1;
        return pages > 5 ? [] : state.holdings.slice(0, take).map((h) => ({ ...h }));
      },
      claim: async () => false,
    });
    await refundEscrow(runner, ledger, { ...stuck, stopWhenNoProgress: true });
    expect(pages).toBe(1);

    pages = 0;
    await refundEscrow(runner, ledger, stuck);
    expect(pages).toBe(6);
  });
});

describe('readSettledKeys', () => {
  function fakeDb(rows: { idempotencyKey: string | null }[]) {
    const calls: unknown[] = [];
    const db = {
      coinTransaction: {
        findMany: async (args: unknown) => {
          calls.push(args);
          return rows;
        },
      },
    } as unknown as Db;
    return { db, calls };
  }

  it('makes no query for no keys', async () => {
    const { db, calls } = fakeDb([]);
    expect(await readSettledKeys(db, new Map())).toEqual([]);
    expect(calls).toEqual([]);
  });

  it('returns the values of the keys the ledger holds, in row order', async () => {
    const { db, calls } = fakeDb([
      { idempotencyKey: 'bj-return:s2' },
      { idempotencyKey: null },
      { idempotencyKey: 'bj-payout:s1' },
    ]);
    const byKey = new Map([
      ['bj-payout:s1', 's1:paid'],
      ['bj-return:s1', 's1:returned'],
      ['bj-return:s2', 's2:returned'],
    ]);
    expect(await readSettledKeys(db, byKey)).toEqual(['s2:returned', 's1:paid']);
    expect(calls).toEqual([
      {
        where: { idempotencyKey: { in: ['bj-payout:s1', 'bj-return:s1', 'bj-return:s2'] } },
        select: { idempotencyKey: true },
      },
    ]);
  });
});
