/**
 * A small in-memory stand-in for the slice of Prisma + the ledger that the
 * economy tests need. Test-support only (no `.test.ts` suffix, so it is not
 * collected as a suite).
 *
 * What it models faithfully, because the money properties depend on it:
 *
 *  - `updateMany` is a synchronous check-and-write — predicate and update are one
 *    step, exactly as Postgres performs a conditional UPDATE — so a losing
 *    claimant matches zero rows.
 *  - `$transaction` snapshots every table and the ledger and RESTORES them if the
 *    callback throws. "The credit failed, so the claim must unwind" is the
 *    property that separates a retryable failure from a silent loss.
 *  - the fake ledger rejects a repeated idempotency key the way
 *    `coinTransaction.idempotencyKey`'s unique index does, and refuses to
 *    overdraw the way the conditional UPDATE in `debitCoinsOn` does.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

type Row = Record<string, any>;

function isOperator(v: unknown): v is Record<string, any> {
  return v !== null && typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v);
}

function cmp(a: any, b: any): number {
  const x = a instanceof Date ? a.getTime() : a;
  const y = b instanceof Date ? b.getTime() : b;
  return x < y ? -1 : x > y ? 1 : 0;
}

export function matches(row: Row, where: Row = {}): boolean {
  for (const [k, v] of Object.entries(where)) {
    if (k === 'OR') {
      if (!(v as Row[]).some((w) => matches(row, w))) return false;
      continue;
    }
    if (k === 'AND') {
      if (!(v as Row[]).every((w) => matches(row, w))) return false;
      continue;
    }
    const val = row[k];
    if (isOperator(v)) {
      for (const [op, arg] of Object.entries(v)) {
        if (op === 'in' && !(arg as any[]).includes(val)) return false;
        if (op === 'lt' && !(val != null && cmp(val, arg) < 0)) return false;
        if (op === 'lte' && !(val != null && cmp(val, arg) <= 0)) return false;
        if (op === 'gt' && !(val != null && cmp(val, arg) > 0)) return false;
        if (op === 'gte' && !(val != null && cmp(val, arg) >= 0)) return false;
        if (op === 'not' && cmp(val, arg) === 0) return false;
        if (op === 'equals' && cmp(val, arg) !== 0) return false;
      }
    } else if (v === null) {
      if (val != null) return false;
    } else if (cmp(val, v) !== 0) {
      return false;
    }
  }
  return true;
}

function applyData(row: Row, data: Row): void {
  for (const [k, v] of Object.entries(data)) {
    if (isOperator(v) && 'increment' in v) row[k] = (row[k] ?? 0) + v.increment;
    else if (isOperator(v) && 'decrement' in v) row[k] = (row[k] ?? 0) - v.decrement;
    else row[k] = v;
  }
}

export class Table {
  rows: Row[] = [];
  private nextNum = 1;
  constructor(
    private readonly opts: {
      bigintId?: boolean;
      defaults?: () => Row;
      /** Composite-unique lookups, e.g. `userId_itemId: ['userId', 'itemId']`. */
      compound?: Record<string, string[]>;
      unique?: string[][];
    } = {},
  ) {}

  snapshot() {
    return { rows: this.rows.map((r) => ({ ...r })), nextNum: this.nextNum };
  }
  restore(s: { rows: Row[]; nextNum: number }) {
    this.rows = s.rows;
    this.nextNum = s.nextNum;
  }
  reset() {
    this.rows = [];
    this.nextNum = 1;
  }

  insert(data: Row): Row {
    for (const cols of this.opts.unique ?? []) {
      if (this.rows.some((r) => cols.every((c) => cmp(r[c], data[c]) === 0))) {
        throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
      }
    }
    const id = data.id ?? (this.opts.bigintId ? BigInt(this.nextNum++) : `id${this.nextNum++}`);
    const row = { ...(this.opts.defaults?.() ?? {}), ...data, id };
    this.rows.push(row);
    return row;
  }

  private resolveWhere(where: Row): Row {
    const out: Row = {};
    for (const [k, v] of Object.entries(where)) {
      const cols = this.opts.compound?.[k];
      if (cols) Object.assign(out, v);
      else out[k] = v;
    }
    return out;
  }

  private find(where: Row) {
    const w = this.resolveWhere(where);
    return this.rows.filter((r) => matches(r, w));
  }

  api = {
    create: async ({ data }: { data: Row }) => ({ ...this.insert(data) }),
    createMany: async ({ data }: { data: Row[] }) => {
      for (const d of data) this.insert(d);
      return { count: data.length };
    },
    findUnique: async ({ where }: { where: Row }) => {
      const r = this.find(where)[0];
      return r ? { ...r } : null;
    },
    findUniqueOrThrow: async ({ where }: { where: Row }) => {
      const r = this.find(where)[0];
      if (!r) throw new Error('not found');
      return { ...r };
    },
    findFirst: async ({ where }: { where?: Row } = {}) => {
      const r = this.find(where ?? {})[0];
      return r ? { ...r } : null;
    },
    findMany: async ({
      where,
      take,
      orderBy,
      distinct,
    }: { where?: Row; take?: number; orderBy?: Row | Row[]; distinct?: string[] } = {}) => {
      let rows = this.find(where ?? {}).map((r) => ({ ...r }));
      const order = Array.isArray(orderBy) ? orderBy[0] : orderBy;
      if (order) {
        const [col, dir] = Object.entries(order)[0] as [string, string];
        rows.sort((a, b) => cmp(a[col], b[col]) * (dir === 'desc' ? -1 : 1));
      }
      if (distinct?.length) {
        const seen = new Set<string>();
        rows = rows.filter((r) => {
          const k = distinct.map((c) => String(r[c])).join('|');
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
      }
      return take ? rows.slice(0, take) : rows;
    },
    count: async ({ where }: { where?: Row } = {}) => this.find(where ?? {}).length,
    updateMany: async ({ where, data }: { where?: Row; data: Row }) => {
      const hits = this.find(where ?? {});
      for (const r of hits) applyData(r, data);
      return { count: hits.length };
    },
    update: async ({ where, data }: { where: Row; data: Row }) => {
      const r = this.find(where)[0];
      if (!r) throw new Error('not found');
      applyData(r, data);
      return { ...r };
    },
    deleteMany: async ({ where }: { where?: Row } = {}) => {
      const hits = new Set(this.find(where ?? {}));
      this.rows = this.rows.filter((r) => !hits.has(r));
      return { count: hits.size };
    },
  };
}

export interface LedgerCall {
  kind: 'debit' | 'credit';
  userId: string;
  amount: number;
  key?: string;
  note?: string;
}

/** Balance + idempotency model of the real ledger. */
export class FakeLedger {
  balances = new Map<string, number>();
  keys = new Set<string>();
  calls: LedgerCall[] = [];
  /** Idempotency-key suffix whose credit should throw once (to test resumption). */
  failCreditKeyEndingWith: string | null = null;

  snapshot() {
    return {
      balances: new Map(this.balances),
      keys: new Set(this.keys),
      calls: [...this.calls],
    };
  }
  restore(s: ReturnType<FakeLedger['snapshot']>) {
    this.balances = s.balances;
    this.keys = s.keys;
    this.calls = s.calls;
  }
  reset() {
    this.balances = new Map();
    this.keys = new Set();
    this.calls = [];
    this.failCreditKeyEndingWith = null;
  }
  balance(userId: string) {
    return this.balances.get(userId) ?? 0;
  }

  async debit(
    userId: string,
    amount: number,
    opts: { idempotencyKey?: string; note?: string } = {},
  ) {
    if (opts.idempotencyKey && this.keys.has(opts.idempotencyKey)) {
      return { applied: false, replayed: true, transactionId: 'existing' };
    }
    if (this.balance(userId) < amount) throw new FakeInsufficientFundsError();
    if (opts.idempotencyKey) this.keys.add(opts.idempotencyKey);
    this.balances.set(userId, this.balance(userId) - amount);
    this.calls.push({ kind: 'debit', userId, amount, key: opts.idempotencyKey, note: opts.note });
    return { applied: true, replayed: false, transactionId: 't' };
  }

  async credit(
    userId: string,
    amount: number,
    opts: { idempotencyKey?: string; note?: string } = {},
  ) {
    if (opts.idempotencyKey && this.keys.has(opts.idempotencyKey)) {
      return { applied: false, replayed: true, transactionId: 'existing' };
    }
    if (
      this.failCreditKeyEndingWith &&
      opts.idempotencyKey?.endsWith(this.failCreditKeyEndingWith)
    ) {
      this.failCreditKeyEndingWith = null;
      throw new Error('ledger unavailable');
    }
    if (opts.idempotencyKey) this.keys.add(opts.idempotencyKey);
    this.balances.set(userId, this.balance(userId) + amount);
    this.calls.push({ kind: 'credit', userId, amount, key: opts.idempotencyKey, note: opts.note });
    return { applied: true, replayed: false, transactionId: 't' };
  }
}

export class FakeInsufficientFundsError extends Error {
  readonly code = 'INSUFFICIENT_FUNDS';
  constructor() {
    super('INSUFFICIENT_COINS');
    this.name = 'InsufficientFundsError';
  }
}

/** Wrap tables + ledger into a `$transaction` with real rollback semantics. */
export function makeTransaction(tables: Table[], ledger: FakeLedger, client: () => unknown) {
  return async (fn: (tx: unknown) => Promise<unknown>) => {
    const snaps = tables.map((t) => t.snapshot());
    const ledgerSnap = ledger.snapshot();
    try {
      return await fn(client());
    } catch (err) {
      tables.forEach((t, i) => t.restore(snaps[i]!));
      ledger.restore(ledgerSnap);
      throw err;
    }
  };
}
