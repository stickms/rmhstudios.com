import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The pool refund sweep (F20).
 *
 * A pool that fails and quietly keeps the coins is the fastest way to lose
 * economy trust, so the refund path is tested before the happy path and in more
 * depth. What these tests actually exercise is the two independent guards that
 * make the sweep safe to re-run:
 *
 *   1. the conditional claim — `updateMany ... WHERE refundedAt IS NULL`, which
 *      is modelled below as a synchronous check-and-write exactly as Postgres
 *      performs it, so a losing runner matches zero rows; and
 *   2. the ledger idempotency key, modelled by a fake ledger that rejects a
 *      repeated key the way `coinTransaction.idempotencyKey`'s unique index does.
 *
 * The fake transaction has real rollback semantics (snapshot/restore on throw),
 * because "the credit failed, so the claim must unwind" is the property that
 * decides whether a mid-sweep failure is retryable or a silent loss.
 */

interface PoolRow {
  id: string;
  creatorId: string;
  purpose: string;
  targetId: string | null;
  goalCoins: number;
  raised: number;
  expiresAt: Date;
  settledAt: Date | null;
  refundedAt: Date | null;
}

interface ContribRow {
  id: bigint;
  poolId: string;
  userId: string;
  coins: number;
  refundedAt: Date | null;
  createdAt: Date;
}

const store = vi.hoisted(() => {
  const s = {
    pools: [] as PoolRow[],
    contributions: [] as ContribRow[],
    /** Coins credited back, per user. */
    credited: new Map<string, number>(),
    /** Coins debited, per user. */
    debited: new Map<string, number>(),
    /** Every idempotency key the ledger has seen — the unique index. */
    keys: new Set<string>(),
    /** Set to a contribution id to make its credit throw once. */
    failCreditFor: null as bigint | null,
    nextId: 1n,
  };
  return s;
});

/** Deep-ish snapshot for transaction rollback. */
function snapshot() {
  return {
    pools: store.pools.map((p) => ({ ...p })),
    contributions: store.contributions.map((c) => ({ ...c })),
    credited: new Map(store.credited),
    debited: new Map(store.debited),
    keys: new Set(store.keys),
  };
}
function restore(snap: ReturnType<typeof snapshot>) {
  store.pools = snap.pools;
  store.contributions = snap.contributions;
  store.credited = snap.credited;
  store.debited = snap.debited;
  store.keys = snap.keys;
}

const prismaMock = vi.hoisted(() => {
  const matchPool = (p: PoolRow, where: Record<string, unknown>): boolean => {
    if (where.id !== undefined && p.id !== where.id) return false;
    if (where.settledAt === null && p.settledAt !== null) return false;
    if (where.refundedAt === null && p.refundedAt !== null) return false;
    if (where.creatorId !== undefined && p.creatorId !== where.creatorId) return false;
    const exp = where.expiresAt as { lte?: Date; gt?: Date } | undefined;
    if (exp?.lte && p.expiresAt.getTime() > exp.lte.getTime()) return false;
    if (exp?.gt && p.expiresAt.getTime() <= exp.gt.getTime()) return false;
    return true;
  };
  const matchContrib = (c: ContribRow, where: Record<string, unknown>): boolean => {
    if (where.id !== undefined && c.id !== where.id) return false;
    if (where.poolId !== undefined && c.poolId !== where.poolId) return false;
    if (where.refundedAt === null && c.refundedAt !== null) return false;
    return true;
  };

  return {
    pool: {
      findMany: vi.fn(
        async ({ where, take }: { where: Record<string, unknown>; take?: number }) => {
          const rows = store.pools
            .filter((p) => matchPool(p, where))
            .sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime());
          return (take ? rows.slice(0, take) : rows).map((p) => ({ ...p }));
        },
      ),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const p = store.pools.find((x) => x.id === where.id);
        return p ? { ...p, contributions: [] } : null;
      }),
      // The atomic conditional update: predicate and write are one step.
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: Record<string, unknown>;
          data: Record<string, unknown>;
        }) => {
          const hits = store.pools.filter((p) => matchPool(p, where));
          for (const p of hits) Object.assign(p, data);
          return { count: hits.length };
        },
      ),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: { raised?: { increment: number } };
        }) => {
          const p = store.pools.find((x) => x.id === where.id);
          if (!p) throw new Error('not found');
          if (data.raised?.increment) p.raised += data.raised.increment;
          return { ...p };
        },
      ),
      count: vi.fn(
        async ({ where }: { where: Record<string, unknown> }) =>
          store.pools.filter((p) => matchPool(p, where)).length,
      ),
      create: vi.fn(
        async ({ data }: { data: Omit<PoolRow, 'settledAt' | 'refundedAt' | 'raised'> }) => {
          // `raised` is a default, so it must not also appear in `data` — the
          // spread would overwrite it and the default would be dead code.
          const row: PoolRow = { raised: 0, settledAt: null, refundedAt: null, ...data };
          store.pools.push(row);
          return { ...row };
        },
      ),
    },
    poolContribution: {
      findMany: vi.fn(
        async ({ where, take }: { where: Record<string, unknown>; take?: number }) => {
          const rows = store.contributions
            .filter((c) => matchContrib(c, where))
            .sort((a, b) => (a.id < b.id ? -1 : 1));
          return (take ? rows.slice(0, take) : rows).map((c) => ({ ...c }));
        },
      ),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: Record<string, unknown>;
          data: Record<string, unknown>;
        }) => {
          const hits = store.contributions.filter((c) => matchContrib(c, where));
          for (const c of hits) Object.assign(c, data);
          return { count: hits.length };
        },
      ),
      count: vi.fn(
        async ({ where }: { where: Record<string, unknown> }) =>
          store.contributions.filter((c) => matchContrib(c, where)).length,
      ),
      create: vi.fn(
        async ({ data }: { data: Omit<ContribRow, 'id' | 'refundedAt' | 'createdAt'> }) => {
          const row: ContribRow = {
            id: store.nextId++,
            refundedAt: null,
            createdAt: new Date(),
            ...data,
          };
          store.contributions.push(row);
          return { ...row };
        },
      ),
    },
    userProfile: {
      findUnique: vi.fn(async ({ where }: { where: { userId: string } }) => ({
        coins:
          1000 - (store.debited.get(where.userId) ?? 0) + (store.credited.get(where.userId) ?? 0),
      })),
    },
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => ({ id: where.id })),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const snap = snapshot();
      try {
        return await fn(prismaMock);
      } catch (err) {
        restore(snap);
        throw err;
      }
    }),
  };
});

vi.mock('@/lib/prisma.server', () => ({ prisma: prismaMock }));

/**
 * A ledger that enforces what the real one enforces: a repeated idempotency key
 * is a no-op that reports `replayed`, never a second movement.
 */
vi.mock('@/lib/economy/ledger.server', () => ({
  InsufficientFundsError: class InsufficientFundsError extends Error {
    readonly code = 'INSUFFICIENT_FUNDS';
  },
  creditCoins: vi.fn(
    async (userId: string, amount: number, opts: { idempotencyKey?: string } = {}) => {
      if (opts.idempotencyKey && store.keys.has(opts.idempotencyKey)) {
        return { applied: false, replayed: true, transactionId: 'existing' };
      }
      if (
        store.failCreditFor !== null &&
        opts.idempotencyKey?.endsWith(String(store.failCreditFor))
      ) {
        throw new Error('ledger unavailable');
      }
      if (opts.idempotencyKey) store.keys.add(opts.idempotencyKey);
      store.credited.set(userId, (store.credited.get(userId) ?? 0) + amount);
      return { applied: true, replayed: false, transactionId: 't' };
    },
  ),
  debitCoins: vi.fn(
    async (userId: string, amount: number, opts: { idempotencyKey?: string } = {}) => {
      if (opts.idempotencyKey && store.keys.has(opts.idempotencyKey)) {
        return { applied: false, replayed: true, transactionId: 'existing' };
      }
      if (opts.idempotencyKey) store.keys.add(opts.idempotencyKey);
      store.debited.set(userId, (store.debited.get(userId) ?? 0) + amount);
      return { applied: true, replayed: false, transactionId: 't' };
    },
  ),
}));

vi.mock('@/lib/user-display', () => ({
  userDisplaySelect: {},
  resolveUser: () => ({ name: 'X', handle: 'x' }),
}));

import {
  refundExpiredPools,
  refundPool,
  contribute,
  PoolError,
  poolRefundRefId,
} from '@/lib/commerce/pools.server';

const PAST = new Date(Date.now() - 60_000);
const FUTURE = new Date(Date.now() + 3_600_000);

function seedPool(over: Partial<PoolRow> = {}): PoolRow {
  const row: PoolRow = {
    id: 'p1',
    creatorId: 'creator',
    purpose: 'creator-tip',
    targetId: 'target',
    goalCoins: 1000,
    raised: 0,
    expiresAt: PAST,
    settledAt: null,
    refundedAt: null,
    ...over,
  };
  store.pools.push(row);
  return row;
}

function seedContribution(userId: string, coins: number, poolId = 'p1'): ContribRow {
  const row: ContribRow = {
    id: store.nextId++,
    poolId,
    userId,
    coins,
    refundedAt: null,
    createdAt: new Date(),
  };
  store.contributions.push(row);
  row.poolId = poolId;
  const pool = store.pools.find((p) => p.id === poolId);
  if (pool) pool.raised += coins;
  return row;
}

beforeEach(() => {
  store.pools = [];
  store.contributions = [];
  store.credited = new Map();
  store.debited = new Map();
  store.keys = new Set();
  store.failCreditFor = null;
  store.nextId = 1n;
  vi.clearAllMocks();
});

describe('refundExpiredPools — the money-back guarantee', () => {
  it('returns every contribution and marks the pool refunded', async () => {
    seedPool();
    seedContribution('alice', 300);
    seedContribution('bob', 200);

    const result = await refundExpiredPools();

    expect(result.contributionsRefunded).toBe(2);
    expect(result.coinsReturned).toBe(500);
    expect(result.poolsRefunded).toBe(1);
    expect(store.credited.get('alice')).toBe(300);
    expect(store.credited.get('bob')).toBe(200);
    expect(store.pools[0].refundedAt).not.toBeNull();
  });

  it('is idempotent — a second run pays nobody a second time', async () => {
    seedPool();
    seedContribution('alice', 300);
    seedContribution('bob', 200);

    await refundExpiredPools();
    const afterFirst = new Map(store.credited);
    const second = await refundExpiredPools();

    expect(second.contributionsRefunded).toBe(0);
    expect(second.coinsReturned).toBe(0);
    expect(store.credited).toEqual(afterFirst);
  });

  it('resumes a partial sweep without double-paying the already-refunded', async () => {
    seedPool();
    const a = seedContribution('alice', 300);
    seedContribution('bob', 200);
    // Simulate a crash after alice was paid but before the pool was marked.
    a.refundedAt = new Date();
    store.keys.add(poolRefundRefId(a.id));
    store.credited.set('alice', 300);

    const result = await refundExpiredPools();

    expect(result.contributionsRefunded).toBe(1); // only bob
    expect(store.credited.get('alice')).toBe(300); // unchanged
    expect(store.credited.get('bob')).toBe(200);
    expect(store.pools[0].refundedAt).not.toBeNull();
  });

  it('two concurrent sweeps still pay each contribution exactly once', async () => {
    seedPool();
    seedContribution('alice', 300);
    seedContribution('bob', 200);

    const [r1, r2] = await Promise.all([refundExpiredPools(), refundExpiredPools()]);

    expect(r1.contributionsRefunded + r2.contributionsRefunded).toBe(2);
    expect(store.credited.get('alice')).toBe(300);
    expect(store.credited.get('bob')).toBe(200);
  });

  it('leaves a contribution unrefunded when its credit fails, so it retries', async () => {
    seedPool();
    const a = seedContribution('alice', 300);
    seedContribution('bob', 200);
    store.failCreditFor = a.id;

    const first = await refundExpiredPools();
    // The claim must have unwound with the failed credit.
    expect(store.contributions.find((c) => c.id === a.id)?.refundedAt).toBeNull();
    expect(store.credited.get('alice')).toBeUndefined();
    expect(first.poolsRefunded).toBe(0); // nothing may be marked while money is owed
    expect(store.pools[0].refundedAt).toBeNull();

    // Recover and re-run: alice is paid and the pool closes out.
    store.failCreditFor = null;
    const second = await refundExpiredPools();
    expect(store.credited.get('alice')).toBe(300);
    expect(store.credited.get('bob')).toBe(200);
    expect(second.poolsRefunded).toBe(1);
  });

  it('never marks a pool refunded while a contribution is still owed', async () => {
    seedPool();
    const a = seedContribution('alice', 300);
    store.failCreditFor = a.id;

    await refundExpiredPools();

    expect(store.pools[0].refundedAt).toBeNull();
  });

  it('ignores pools that have not expired yet', async () => {
    seedPool({ expiresAt: FUTURE });
    seedContribution('alice', 300);

    const result = await refundExpiredPools();

    expect(result.contributionsRefunded).toBe(0);
    expect(store.credited.size).toBe(0);
  });

  it('ignores pools that already settled', async () => {
    seedPool({ settledAt: new Date() });
    seedContribution('alice', 300);

    const result = await refundExpiredPools();

    expect(result.contributionsRefunded).toBe(0);
    expect(store.credited.size).toBe(0);
  });

  it('ignores pools already refunded', async () => {
    seedPool({ refundedAt: new Date() });
    const result = await refundExpiredPools();
    expect(result.contributionsRefunded).toBe(0);
  });

  it('carries on past a failing pool and reports it', async () => {
    seedPool({ id: 'bad' });
    seedContribution('alice', 100, 'bad');
    seedPool({ id: 'good' });
    seedContribution('bob', 100, 'good');
    // Make the bad pool's only contribution throw non-recoverably.
    prismaMock.poolContribution.updateMany.mockImplementationOnce(async () => {
      throw new Error('deadlock');
    });

    const result = await refundExpiredPools();

    expect(result.failed).toBe(1);
    expect(store.credited.get('bob')).toBe(100);
  });

  it('uses a refund key that is unique per contribution', () => {
    expect(poolRefundRefId(1n)).toBe('pool-refund:1');
    expect(poolRefundRefId(2n)).not.toBe(poolRefundRefId(1n));
  });

  it('zeroes the escrowed total once the pool is refunded', async () => {
    seedPool();
    seedContribution('alice', 300);
    await refundExpiredPools();
    expect(store.pools[0].raised).toBe(0);
  });

  it('refundPool is safe to call directly and twice', async () => {
    seedPool();
    seedContribution('alice', 300);

    const first = await refundPool('p1');
    const second = await refundPool('p1');

    expect(first.contributionsRefunded).toBe(1);
    expect(second.contributionsRefunded).toBe(0);
    expect(store.credited.get('alice')).toBe(300);
  });
});

describe('contribute — escrow', () => {
  it('debits the contributor and records a refundable row', async () => {
    seedPool({ expiresAt: FUTURE, raised: 0 });

    const result = await contribute('p1', 'alice', 250);

    expect(store.debited.get('alice')).toBe(250);
    expect(result.raised).toBe(250);
    expect(result.settled).toBe(false);
    expect(store.contributions).toHaveLength(1);
    expect(store.contributions[0]).toMatchObject({ userId: 'alice', coins: 250, refundedAt: null });
  });

  it('settles to the beneficiary once the goal is met', async () => {
    seedPool({ expiresAt: FUTURE, goalCoins: 500, raised: 0 });

    await contribute('p1', 'alice', 300);
    const result = await contribute('p1', 'bob', 200);

    expect(result.settled).toBe(true);
    expect(store.credited.get('target')).toBe(500);
    expect(store.pools[0].settledAt).not.toBeNull();
  });

  it('a settled pool is never swept for refunds', async () => {
    seedPool({ expiresAt: FUTURE, goalCoins: 100, raised: 0 });
    await contribute('p1', 'alice', 100);
    // Time passes; the deadline goes by with the pool already settled.
    store.pools[0].expiresAt = PAST;

    const result = await refundExpiredPools();

    expect(result.contributionsRefunded).toBe(0);
    expect(store.credited.get('alice')).toBeUndefined();
    expect(store.credited.get('target')).toBe(100);
  });

  it('refuses a contribution to an expired pool', async () => {
    seedPool({ expiresAt: PAST });
    await expect(contribute('p1', 'alice', 100)).rejects.toThrow(PoolError);
    expect(store.debited.size).toBe(0);
  });

  it('refuses a contribution to a closed pool', async () => {
    seedPool({ expiresAt: FUTURE, settledAt: new Date() });
    await expect(contribute('p1', 'alice', 100)).rejects.toThrow(PoolError);
    expect(store.debited.size).toBe(0);
  });

  it('refuses a non-positive contribution', async () => {
    seedPool({ expiresAt: FUTURE });
    await expect(contribute('p1', 'alice', 0)).rejects.toThrow(PoolError);
    await expect(contribute('p1', 'alice', -50)).rejects.toThrow(PoolError);
    await expect(contribute('p1', 'alice', 1.5)).rejects.toThrow(PoolError);
  });

  it('refuses to contribute to a pool that does not exist', async () => {
    await expect(contribute('nope', 'alice', 100)).rejects.toThrow(PoolError);
  });

  it('escrow is conserved: every escrowed coin is refundable', async () => {
    seedPool({ expiresAt: FUTURE, goalCoins: 10_000, raised: 0 });
    await contribute('p1', 'alice', 300);
    await contribute('p1', 'bob', 450);
    await contribute('p1', 'alice', 100);

    const escrowed = store.contributions.reduce((s, c) => s + c.coins, 0);
    expect(escrowed).toBe(store.pools[0].raised);

    store.pools[0].expiresAt = PAST;
    const result = await refundExpiredPools();

    expect(result.coinsReturned).toBe(escrowed);
    expect(store.credited.get('alice')).toBe(400);
    expect(store.credited.get('bob')).toBe(450);
    // Everyone is whole: what they put in equals what came back.
    for (const [user, out] of store.debited) {
      expect(store.credited.get(user)).toBe(out);
    }
  });
});
