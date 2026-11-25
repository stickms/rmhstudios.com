/**
 * An in-memory stand-in for the slice of Prisma and the ledger that `placeTrade` and `sellShares` touch.
 * Test-support only (no `.test.ts` suffix). It models what the money properties depend on:
 *
 *  - a conditional `updateMany` is one synchronous check-and-write;
 *  - the write that locks the market (`updateMany` on `status: 'OPEN'`) holds a mutex until the
 *    enclosing transaction ends, so concurrent transactions on one market queue the way a row lock does;
 *  - `$transaction` restores every table when its callback throws.
 */

export interface FakeMarket {
  id: string;
  title: string;
  description: string | null;
  status: string;
  isAiGenerated: boolean;
  resolverKey: string | null;
  subjectUrl: string | null;
  qYes: number;
  qNo: number;
  b: number;
  volume: number;
  closesAt: Date | null;
  resolvedAt: Date | null;
  createdAt: Date;
  creatorId: string | null;
}

export interface FakePosition {
  id: string;
  predictionId: string;
  userId: string;
  yesShares: number;
  noShares: number;
  spent: number;
  received: number;
  settled: boolean;
  lastP: number | null;
}

export interface FakeLedgerRow {
  userId: string;
  amount: number;
  type?: string;
  entityType?: string;
  entityId?: string;
  note?: string;
  idempotencyKey?: string;
}

export interface FakeState {
  market: FakeMarket;
  positions: FakePosition[];
  ledger: FakeLedgerRow[];
  balances: Record<string, number>;
  /** Every write, in order, by name. */
  writes: string[];
}

type Where = Record<string, unknown>;

export function makeMarket(over: Partial<FakeMarket> = {}): FakeMarket {
  return {
    id: 'm1',
    title: 'Will it rain tomorrow?',
    description: null,
    status: 'OPEN',
    isAiGenerated: false,
    resolverKey: null,
    subjectUrl: null,
    qYes: 60,
    qNo: 20,
    b: 120,
    volume: 0,
    closesAt: null,
    resolvedAt: null,
    createdAt: new Date('2026-12-01T00:00:00Z'),
    creatorId: null,
    ...over,
  };
}

export function makePosition(over: Partial<FakePosition> = {}): FakePosition {
  return {
    id: 'pos-u1',
    predictionId: 'm1',
    userId: 'u1',
    yesShares: 40,
    noShares: 0,
    spent: 25,
    received: 0,
    settled: false,
    lastP: null,
    ...over,
  };
}

export function makeFakeDb(
  initial: { market?: FakeMarket; positions?: FakePosition[]; balances?: Record<string, number> } = {},
) {
  const state: FakeState = {
    market: initial.market ?? makeMarket(),
    positions: initial.positions ?? [makePosition()],
    ledger: [],
    balances: initial.balances ?? { u1: 100, u2: 100 },
    writes: [],
  };
  let lockTail: Promise<void> = Promise.resolve();

  const matchesWhere = (row: Record<string, unknown>, where: Where): boolean => {
    for (const [k, v] of Object.entries(where)) {
      if (v && typeof v === 'object' && 'gte' in (v as object)) {
        if (!((row[k] as number) >= ((v as { gte: number }).gte as number))) return false;
      } else if (row[k] !== v) return false;
    }
    return true;
  };
  const applyData = (row: Record<string, unknown>, data: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(data)) {
      if (v === undefined) continue;
      if (v && typeof v === 'object' && 'increment' in (v as object)) {
        row[k] = (row[k] as number) + (v as { increment: number }).increment;
      } else if (v && typeof v === 'object' && 'decrement' in (v as object)) {
        row[k] = (row[k] as number) - (v as { decrement: number }).decrement;
      } else row[k] = v;
    }
  };

  function makeTx(onLock: (release: () => void) => void) {
    const marketView = (id: string) => (id === state.market.id ? { ...state.market } : null);
    return {
      coinTransaction: {
        findUnique: async ({ where }: { where: { idempotencyKey: string } }) => {
          const row = state.ledger.find((l) => l.idempotencyKey === where.idempotencyKey);
          // `CoinTransaction.amount` is a BigInt column: a reader that puts it in a JSON body throws.
          return row ? { id: 'tx', amount: BigInt(row.amount) } : null;
        },
      },
      userProfile: { upsert: async () => ({}) },
      prediction: {
        findUnique: async ({ where }: { where: { id: string } }) => marketView(where.id),
        findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
          const m = marketView(where.id);
          if (!m) throw new Error('not found');
          return { ...m, creator: null, positions: state.positions.map((p) => ({ ...p })) };
        },
        updateMany: async ({ where, data }: { where: Where; data: Record<string, unknown> }) => {
          // The lock: wait for any earlier transaction that holds this market, then hold it.
          const prev = lockTail;
          let release!: () => void;
          lockTail = new Promise<void>((res) => (release = res));
          await prev;
          onLock(release);
          state.writes.push('prediction.lock');
          if (!matchesWhere(state.market as unknown as Record<string, unknown>, where)) return { count: 0 };
          applyData(state.market as unknown as Record<string, unknown>, data);
          return { count: 1 };
        },
        update: async ({ data }: { data: Record<string, unknown> }) => {
          state.writes.push('prediction.update');
          applyData(state.market as unknown as Record<string, unknown>, data);
          return { ...state.market };
        },
      },
      predictionPosition: {
        findUnique: async ({ where }: { where: { predictionId_userId: { userId: string } } }) => {
          const p = state.positions.find((x) => x.userId === where.predictionId_userId.userId);
          return p ? { ...p } : null;
        },
        updateMany: async ({ where, data }: { where: Where; data: Record<string, unknown> }) => {
          const rows = state.positions.filter((p) => matchesWhere(p as unknown as Record<string, unknown>, where));
          for (const r of rows) applyData(r as unknown as Record<string, unknown>, data);
          if (rows.length) state.writes.push('position.updateMany');
          return { count: rows.length };
        },
        upsert: async ({
          where,
          create,
          update,
        }: {
          where: { predictionId_userId: { userId: string } };
          create: Partial<FakePosition>;
          update: Record<string, unknown>;
        }) => {
          state.writes.push('position.upsert');
          const existing = state.positions.find((x) => x.userId === where.predictionId_userId.userId);
          if (existing) applyData(existing as unknown as Record<string, unknown>, update);
          else state.positions.push(makePosition({ ...create, id: `pos-${create.userId}` }));
          return {};
        },
      },
    };
  }

  const db = {
    $transaction: async <T>(cb: (tx: ReturnType<typeof makeTx>) => Promise<T>): Promise<T> => {
      // The snapshot is taken when the lock is acquired: before that a transaction has written nothing,
      // and a snapshot from before a rival committed would undo the rival's work on rollback.
      type Snapshot = {
        market: FakeMarket;
        positions: FakePosition[];
        ledger: FakeLedgerRow[];
        balances: Record<string, number>;
      };
      // Assigned inside the lock callback, which control-flow analysis cannot see: hence the widening cast.
      let snapshot = null as Snapshot | null;
      let release: (() => void) | null = null;
      const tx = makeTx((r) => {
        release = r;
        snapshot = structuredClone({
          market: state.market,
          positions: state.positions,
          ledger: state.ledger,
          balances: state.balances,
        });
      });
      try {
        return await cb(tx);
      } catch (err) {
        if (snapshot) {
          const s = snapshot;
          state.market = s.market;
          state.positions = s.positions;
          state.ledger = s.ledger;
          state.balances = s.balances;
        }
        throw err;
      } finally {
        (release as (() => void) | null)?.();
      }
    },
  };

  const ledger = {
    creditCoins: async (
      userId: string,
      amount: number,
      opts: Omit<FakeLedgerRow, 'userId' | 'amount'> & { tx?: unknown },
    ) => {
      const { tx: _tx, ...rest } = opts;
      // As the real ledger does inside a caller's transaction: a key it already holds is answered as a
      // replay and nothing is credited (it throws only when it loses the insert race, which a fake cannot).
      if (rest.idempotencyKey && state.ledger.some((l) => l.idempotencyKey === rest.idempotencyKey)) {
        return { applied: false, replayed: true, transactionId: 'tx' };
      }
      state.writes.push('ledger.credit');
      state.ledger.push({ userId, amount, ...rest });
      state.balances[userId] = (state.balances[userId] ?? 0) + amount;
      return { applied: true, replayed: false, transactionId: 'tx' };
    },
    debitCoins: async (
      userId: string,
      amount: number,
      opts: Omit<FakeLedgerRow, 'userId' | 'amount'> & { tx?: unknown },
    ) => {
      const { tx: _tx, ...rest } = opts;
      state.writes.push('ledger.debit');
      state.ledger.push({ userId, amount: -amount, ...rest });
      state.balances[userId] = (state.balances[userId] ?? 0) - amount;
      return { applied: true, replayed: false, transactionId: 'tx' };
    },
    getBalance: async (userId: string) => state.balances[userId] ?? 0,
  };

  return { state, db, ledger };
}
