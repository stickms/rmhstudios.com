import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * WagerMatch lifecycle guards — money.
 *
 * Every transition is a compare-and-swap on the status the transaction read, and
 * only stakes actually in escrow are refunded. The fake `updateMany` applies its
 * predicate and write as one step, exactly as Postgres does under READ COMMITTED,
 * so a "racing" call is modelled by mutating the row between the read and the
 * write (a stale `findUnique`).
 */

vi.mock('@/lib/prisma.server', () => ({ prisma: {} }));
vi.mock('@/lib/notifications.server', () => ({ createNotification: vi.fn(async () => {}) }));
vi.mock('@/lib/user-display', () => ({ userDisplaySelect: {}, resolveUser: (u: unknown) => u }));

import { adjudicateWager, cancelWager, settleWager } from '@/lib/wager/wager.server';

type Row = {
  id: string;
  challengerId: string;
  opponentId: string | null;
  stakeCoins: number;
  potCoins: number;
  rakeBps: number;
  status: string;
  [k: string]: unknown;
};

const state = { match: null as Row | null, credits: new Map<string, number>(), keys: new Set<string>() };
/** When set, the next `findUnique` returns this stale copy instead of the row. */
let staleRead: Row | null = null;

function matches(row: Row, where: Record<string, unknown>): boolean {
  const s = where.status as string | { in: string[] } | undefined;
  if (typeof s === 'string' && row.status !== s) return false;
  if (s && typeof s === 'object' && !s.in.includes(row.status)) return false;
  return true;
}

const db = {
  wagerMatch: {
    findUnique: vi.fn(async () => {
      if (staleRead) {
        const r = staleRead;
        staleRead = null;
        return { ...r };
      }
      return state.match ? { ...state.match } : null;
    }),
    updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      if (!state.match || !matches(state.match, where)) return { count: 0 };
      Object.assign(state.match, data);
      return { count: 1 };
    }),
    update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => Object.assign(state.match!, data)),
  },
  userProfile: {
    upsert: vi.fn(async ({ where, update }: { where: { userId: string }; update: { coins?: { increment: number } } }) => {
      const inc = update.coins?.increment ?? 0;
      state.credits.set(where.userId, (state.credits.get(where.userId) ?? 0) + inc);
      return {};
    }),
  },
  coinTransaction: {
    create: vi.fn(async ({ data }: { data: { idempotencyKey: string | null } }) => {
      if (data.idempotencyKey) {
        if (state.keys.has(data.idempotencyKey)) throw Object.assign(new Error('dup'), { code: 'P2002' });
        state.keys.add(data.idempotencyKey);
      }
      return {};
    }),
  },
  $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(db)),
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- structural fake client
const DB = db as any;

function seed(over: Partial<Row>) {
  state.match = {
    id: 'm1',
    challengerId: 'alice',
    opponentId: 'bob',
    stakeCoins: 100,
    potCoins: 200,
    rakeBps: 0,
    status: 'ACCEPTED',
    ...over,
  };
}

beforeEach(() => {
  state.match = null;
  state.credits = new Map();
  state.keys = new Set();
  staleRead = null;
  vi.clearAllMocks();
});

describe('admin void', () => {
  it('does not refund an EXPIRED match again (no coin minting)', async () => {
    seed({ status: 'EXPIRED', potCoins: 0 });
    await adjudicateWager({ matchId: 'm1', winnerId: null, adminId: 'admin' }, DB);
    expect(state.credits.size).toBe(0);
    expect(state.match!.status).toBe('EXPIRED');
  });

  it('refunds only the challenger on an OPEN challenge with a named opponent', async () => {
    seed({ status: 'OPEN', potCoins: 100 });
    await adjudicateWager({ matchId: 'm1', winnerId: null, adminId: 'admin' }, DB);
    expect(state.credits.get('alice')).toBe(100);
    expect(state.credits.has('bob')).toBe(false);
    expect(state.match!.status).toBe('CANCELLED');
  });

  it('refunds both stakes on an ACCEPTED match', async () => {
    seed({ status: 'ACCEPTED' });
    await adjudicateWager({ matchId: 'm1', winnerId: null, adminId: 'admin' }, DB);
    expect(state.credits.get('alice')).toBe(100);
    expect(state.credits.get('bob')).toBe(100);
  });
});

describe('settleWager', () => {
  it('pays once when a second settle read the match before the first committed', async () => {
    seed({ status: 'LIVE' });
    const stale = { ...state.match! };
    await settleWager({ matchId: 'm1', winnerId: 'alice', source: 'agreement' }, DB);
    staleRead = stale; // the racing settle saw LIVE
    const second = await settleWager({ matchId: 'm1', winnerId: 'bob', source: 'authoritative' }, DB);
    expect(second.settled).toBe(false);
    expect(state.credits.get('alice')).toBe(200);
    expect(state.credits.has('bob')).toBe(false);
    expect(state.match!.winnerId).toBe('alice');
  });
});

describe('cancelWager', () => {
  it('cannot cancel a challenge accepted between the check and the write', async () => {
    seed({ status: 'OPEN', opponentId: null, potCoins: 100 });
    staleRead = { ...state.match! }; // cancelWager's pre-check sees OPEN
    // ...and inside the transaction the accept has landed.
    state.match!.status = 'ACCEPTED';
    state.match!.opponentId = 'bob';
    state.match!.potCoins = 200;
    await expect(cancelWager({ matchId: 'm1', userId: 'alice' }, DB)).rejects.toMatchObject({
      code: 'NOT_OPEN',
    });
    expect(state.match!.status).toBe('ACCEPTED');
    expect(state.credits.size).toBe(0);
  });
});
