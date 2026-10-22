import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MAX_TRANSACTION } from '@/lib/economy/ledger-core';

/*
 * The vault (#18). Regression cover for the whale bug — a 1.5B stake's
 * interest crossed the ledger's old 10M per-move cap and the claim 500'd — and
 * for auto-reinvest's compounding.
 */

interface Row {
  userId: string;
  principal: bigint;
  accrued: bigint;
  autoReinvest: boolean;
  lastAccrued: Date;
}

const state: { row: Row | null; credited: number[] } = { row: null, credited: [] };

const tx = {
  coinStake: {
    findUnique: vi.fn(async () => state.row),
    update: vi.fn(async ({ data }: { data: Partial<Record<keyof Row, unknown>> }) => {
      state.row = {
        ...state.row!,
        ...Object.fromEntries(
          Object.entries(data).map(([k, v]) => [k, typeof v === 'number' ? BigInt(v) : v]),
        ),
      } as Row;
      return state.row;
    }),
    create: vi.fn(),
    upsert: vi.fn(),
  },
};

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    $transaction: (fn: (t: typeof tx) => unknown) => fn(tx),
    coinStake: { findUnique: async () => state.row },
  },
}));
vi.mock('@/lib/economy/ledger.server', async () => {
  const core = await import('@/lib/economy/ledger-core');
  return {
    MAX_TRANSACTION: core.MAX_TRANSACTION,
    // Mirror the real ledger's amount guard, so the cap is what's under test.
    creditCoins: vi.fn(async (_u: string, amount: number) => {
      if (!Number.isInteger(amount) || amount <= 0 || amount > core.MAX_TRANSACTION) {
        throw new core.InvalidAmountError(amount);
      }
      state.credited.push(amount);
      return { applied: true, replayed: false, transactionId: 't' };
    }),
    debitCoins: vi.fn(),
    getBalance: vi.fn(async () => 0),
  };
});

import {
  STAKING_APR,
  compoundedInterest,
  getStake,
  setAutoReinvest,
  withdraw,
} from '@/lib/staking/staking.server';

const DAY = 24 * 60 * 60 * 1000;

function stake(principal: number, ageDays: number, extra: Partial<Row> = {}): void {
  state.row = {
    userId: 'u',
    principal: BigInt(principal),
    accrued: 0n,
    autoReinvest: false,
    lastAccrued: new Date(Date.now() - ageDays * DAY),
    ...extra,
  };
}

beforeEach(() => {
  state.row = null;
  state.credited = [];
});

describe('withdraw — large stakes', () => {
  it('pays out a whale-sized interest claim in full', async () => {
    stake(1_500_000_000, 90);
    const { paidOut } = await withdraw('u', 0);
    // ~44M after 90 days at 12% — over the old 10M cap that made this throw.
    expect(paidOut).toBeGreaterThan(10_000_000);
    expect(state.credited).toEqual([paidOut]);
    expect(state.row!.accrued).toBe(0n);
  });

  it('withdraws a principal far above the old cap', async () => {
    stake(1_500_000_000, 0);
    const { paidOut, stake: after } = await withdraw('u', 1_500_000_000);
    expect(paidOut).toBeGreaterThanOrEqual(1_500_000_000);
    expect(after.principal).toBe(0);
  });
});

describe('auto-reinvest', () => {
  it('compounds, and does not depend on how often it is rolled', () => {
    const p = 1_000_000_000;
    const once = compoundedInterest(p, 0, 60 * DAY);
    const half = compoundedInterest(p, 0, 30 * DAY);
    const twice = half + compoundedInterest(p + half, 0, 30 * DAY);
    expect(Math.abs(once - twice)).toBeLessThanOrEqual(1);
    // Beats simple interest over the same window.
    expect(once).toBeGreaterThan(Math.floor((p * STAKING_APR * 60) / 365));
  });

  it('turning it on moves waiting interest into principal', async () => {
    stake(1_000_000, 0, { accrued: 5_000n });
    const v = await setAutoReinvest('u', true);
    expect(v).toMatchObject({ principal: 1_005_000, accrued: 0, autoReinvest: true });
  });

  it('grows principal instead of claimable interest, and that growth is withdrawable', async () => {
    stake(1_000_000_000, 30, { autoReinvest: true });
    const view = await getStake('u');
    expect(view.accrued).toBe(0);
    expect(view.principal).toBeGreaterThan(1_000_000_000);

    const { paidOut } = await withdraw('u', view.principal);
    expect(paidOut).toBeGreaterThanOrEqual(view.principal);
    expect(paidOut).toBeLessThanOrEqual(MAX_TRANSACTION);
  });
});
