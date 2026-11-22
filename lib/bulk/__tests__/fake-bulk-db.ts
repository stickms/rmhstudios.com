/**
 * A small in-memory stand-in for the tables the bulk runner touches, with just enough of Prisma's `where` language
 * (equality, `lt/lte/gt/gte/in/not`, `OR`) and of `$transaction` (an interactive callback that rolls back when it
 * throws) to run `runBulkOperation` end to end without a database.
 */

type Row = Record<string, unknown>;

function cmp(a: unknown, b: unknown): number {
  const x = a instanceof Date ? a.getTime() : (a as number | string);
  const y = b instanceof Date ? b.getTime() : (b as number | string);
  return x < y ? -1 : x > y ? 1 : 0;
}

function matchesField(value: unknown, cond: unknown): boolean {
  if (cond === null) return value === null || value === undefined;
  if (cond instanceof Date) return value instanceof Date && value.getTime() === cond.getTime();
  if (typeof cond === 'object') {
    const c = cond as Record<string, unknown>;
    return Object.entries(c).every(([op, arg]) => {
      if (value === null || value === undefined) return op === 'not' ? arg !== null : false;
      switch (op) {
        case 'lt':
          return cmp(value, arg) < 0;
        case 'lte':
          return cmp(value, arg) <= 0;
        case 'gt':
          return cmp(value, arg) > 0;
        case 'gte':
          return cmp(value, arg) >= 0;
        case 'in':
          return (arg as unknown[]).includes(value);
        case 'not':
          return arg === null ? value !== null : value !== arg;
        default:
          throw new Error(`fake db: unsupported operator ${op}`);
      }
    });
  }
  return value === cond;
}

export function matches(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'OR') return (cond as Row[]).some((w) => matches(row, w));
    if (key === 'AND') return (cond as Row[]).every((w) => matches(row, w));
    return matchesField(row[key], cond);
  });
}

function apply(row: Row, data: Row) {
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      const v = value as Record<string, number>;
      if ('increment' in v) row[key] = (row[key] as number) + v.increment;
      else if ('decrement' in v) row[key] = (row[key] as number) - v.decrement;
      else row[key] = value;
    } else row[key] = value;
  }
}

export interface FakeState {
  bulkOperation: Row[];
  rMHarkLike: Row[];
  rMHarkRepost: Row[];
  rMHark: Row[];
  notification: Row[];
  savedItem: Row[];
  syncTombstone: Row[];
}

type Hook = (table: string, args: Row) => void;

export function createFakeDb(initial: Partial<FakeState> = {}) {
  const state: FakeState = {
    bulkOperation: [],
    rMHarkLike: [],
    rMHarkRepost: [],
    rMHark: [],
    notification: [],
    savedItem: [],
    syncTombstone: [],
    ...initial,
  };
  /** Called before every findMany, so a test can interleave another actor between a read and the write that follows. */
  const hooks: { beforeFindMany: Hook | null } = { beforeFindMany: null };
  const calls: { table: string; method: string; args: Row }[] = [];

  function table(name: keyof FakeState) {
    return {
      findUnique: async (args: { where: Row }) => {
        calls.push({ table: name, method: 'findUnique', args });
        return state[name].find((r) => matches(r, args.where)) ?? null;
      },
      findFirst: async (args: { where: Row }) => state[name].find((r) => matches(r, args.where)) ?? null,
      findMany: async (args: { where?: Row; orderBy?: Row; take?: number }) => {
        calls.push({ table: name, method: 'findMany', args: args as Row });
        hooks.beforeFindMany?.(name, args as Row);
        let rows = state[name].filter((r) => matches(r, args.where));
        const key = args.orderBy ? Object.keys(args.orderBy)[0] : null;
        if (key) {
          const dir = (args.orderBy as Record<string, string>)[key] === 'desc' ? -1 : 1;
          rows = [...rows].sort((a, b) => cmp(a[key], b[key]) * dir);
        }
        if (args.take !== undefined) rows = rows.slice(0, args.take);
        return rows.map((r) => {
          const out: Row = { ...r };
          if (name === 'rMHarkLike' || name === 'rMHarkRepost') {
            out.rmhark = { content: state.rMHark.find((p) => p.id === r.rmheetId)?.content ?? '' };
          }
          return out;
        });
      },
      count: async (args: { where?: Row }) => state[name].filter((r) => matches(r, args.where)).length,
      updateMany: async (args: { where: Row; data: Row }) => {
        calls.push({ table: name, method: 'updateMany', args });
        const rows = state[name].filter((r) => matches(r, args.where));
        for (const r of rows) apply(r, args.data);
        return { count: rows.length };
      },
      deleteMany: async (args: { where: Row }) => {
        calls.push({ table: name, method: 'deleteMany', args });
        const keep = state[name].filter((r) => !matches(r, args.where));
        const count = state[name].length - keep.length;
        state[name] = keep;
        return { count };
      },
    };
  }

  let seq = 0;
  const db = {
    bulkOperation: {
      ...table('bulkOperation'),
      create: async (args: { data: Row }) => {
        const row = opRow({ id: `op-new-${(seq += 1)}`, createdAt: new Date(), ...args.data });
        state.bulkOperation.push(row);
        return { ...row };
      },
    },
    rMHarkLike: table('rMHarkLike'),
    rMHarkRepost: table('rMHarkRepost'),
    rMHark: table('rMHark'),
    notification: table('notification'),
    savedItem: table('savedItem'),
    syncTombstone: {
      ...table('syncTombstone'),
      createMany: async (args: { data: Row[] }) => {
        state.syncTombstone.push(...args.data.map((d) => ({ ...d })));
        return { count: args.data.length };
      },
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const before = structuredClone(state);
      try {
        return await fn(db);
      } catch (error) {
        (Object.keys(before) as (keyof FakeState)[]).forEach((k) => {
          state[k] = before[k];
        });
        throw error;
      }
    },
  };
  return { db, state, hooks, calls };
}

/** A bulk operation row with sensible defaults. */
export function opRow(over: Row = {}): Row {
  return {
    id: 'op1',
    userId: 'u1',
    kind: 'unlike-posts',
    filter: {},
    status: 'PENDING',
    total: 0,
    processed: 0,
    error: null,
    createdAt: new Date(Date.now() - 60_000),
    finishedAt: null,
    heartbeatAt: null,
    cursorId: null,
    reclaims: 0,
    claimedAt: null,
    reclaimedAt: null,
    ...over,
  };
}
