/**
 * A small in-memory stand-in for the tables the spam-sweep code touches (not a test file: the name does not
 * end in `.test.ts`). It implements the part of Prisma's `where` language the sweep uses, and a `$transaction`
 * that rolls back when its callback throws.
 */

type Row = Record<string, unknown>;

function cmp(a: unknown, b: unknown): number {
  const x = a instanceof Date ? a.getTime() : (a as number | string);
  const y = b instanceof Date ? b.getTime() : (b as number | string);
  return x < y ? -1 : x > y ? 1 : 0;
}

function field(value: unknown, cond: unknown): boolean {
  if (cond === null) return value === null || value === undefined;
  if (cond instanceof Date) return value instanceof Date && value.getTime() === cond.getTime();
  if (typeof cond === 'object') {
    return Object.entries(cond as Row).every(([op, arg]) => {
      if (op === 'some') return true; // relation filters (engagement counters) are not modelled
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
    if (key === 'comments' || key === 'replies') return true;
    return field(row[key], cond);
  });
}

function apply(row: Row, data: Row) {
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      const v = value as Record<string, number>;
      if ('increment' in v) row[key] = ((row[key] as number) ?? 0) + v.increment!;
      else row[key] = value;
    } else row[key] = value;
  }
}

function sorted(rows: Row[], orderBy: unknown): Row[] {
  if (!orderBy) return rows;
  const keys = (Array.isArray(orderBy) ? orderBy : [orderBy]) as Record<string, string>[];
  return [...rows].sort((a, b) => {
    for (const k of keys) {
      const [name, dir] = Object.entries(k)[0]!;
      const c = cmp(a[name], b[name]) * (dir === 'desc' ? -1 : 1);
      if (c !== 0) return c;
    }
    return 0;
  });
}

export interface FakeState {
  moderationSweep: Row[];
  moderationSweepItem: Row[];
  rMHark: Row[];
  rMHarkComment: Row[];
  user: Row[];
  userStrike: Row[];
  notification: Row[];
  adminAuditLog: Row[];
}

type Name = keyof FakeState;

export function createSweepDb(initial: Partial<FakeState> = {}) {
  const state: FakeState = {
    moderationSweep: [],
    moderationSweepItem: [],
    rMHark: [],
    rMHarkComment: [],
    user: [],
    userStrike: [],
    notification: [],
    adminAuditLog: [],
    ...initial,
  };
  let seq = 0;

  function join(name: Name, row: Row, args: { include?: Row }): Row {
    const out: Row = { ...row };
    if (name === 'moderationSweep' && args.include) {
      out.subject = { ...state.user.find((u) => u.id === row.subjectId) };
      out.admin = { ...state.user.find((u) => u.id === row.adminId) };
    }
    return out;
  }

  function table(name: Name) {
    return {
      findUnique: async (args: { where: Row; include?: Row }) => {
        const r = state[name].find((x) => matches(x, args.where));
        return r ? join(name, r, args) : null;
      },
      findFirst: async (args: { where?: Row; orderBy?: unknown }) => {
        const r = sorted(
          state[name].filter((x) => matches(x, args.where)),
          args.orderBy,
        )[0];
        return r ? { ...r } : null;
      },
      findMany: async (args: { where?: Row; orderBy?: unknown; take?: number; include?: Row }) => {
        let rows = sorted(
          state[name].filter((x) => matches(x, args.where)),
          args.orderBy,
        );
        if (args.take !== undefined) rows = rows.slice(0, args.take);
        return rows.map((r) => join(name, r, args));
      },
      count: async (args: { where?: Row } = {}) => state[name].filter((x) => matches(x, args.where)).length,
      create: async (args: { data: Row; include?: Row }) => {
        const row: Row = {
          id: `${name}-${(seq += 1)}`,
          createdAt: new Date(),
          ...defaults(name),
          ...args.data,
        };
        state[name].push(row);
        return join(name, row, args);
      },
      createMany: async (args: { data: Row[]; skipDuplicates?: boolean }) => {
        let n = 0;
        for (const d of args.data) {
          const dupe =
            name === 'moderationSweepItem' &&
            state[name].some(
              (x) => x.sweepId === d.sweepId && x.entityType === d.entityType && x.entityId === d.entityId,
            );
          if (dupe && args.skipDuplicates) continue;
          state[name].push({ undone: null, ...d });
          n += 1;
        }
        return { count: n };
      },
      deleteMany: async (args: { where: Row }) => {
        const keep = state[name].filter((x) => !matches(x, args.where));
        const n = state[name].length - keep.length;
        state[name] = keep;
        return { count: n };
      },
      update: async (args: { where: Row; data: Row }) => {
        const r = state[name].find((x) => matches(x, args.where));
        if (!r) throw new Error('fake db: update of a missing row');
        apply(r, args.data);
        return { ...r };
      },
      updateMany: async (args: { where: Row; data: Row }) => {
        const rows = state[name].filter((x) => matches(x, args.where));
        for (const r of rows) apply(r, args.data);
        return { count: rows.length };
      },
    };
  }

  function defaults(name: Name): Row {
    if (name === 'moderationSweep')
      return {
        includePosts: true,
        includeReplies: true,
        withStrike: false,
        strikeId: null,
        status: 'PREVIEW',
        phase: 'remove',
        postCount: 0,
        replyCount: 0,
        removedCount: 0,
        restoredCount: 0,
        error: null,
        confirmedAt: null,
        queuedAt: null,
        finishedAt: null,
        undoneAt: null,
        undoneById: null,
        heartbeatAt: null,
        reclaims: 0,
        cursorType: null,
        cursorAt: null,
        cursorId: null,
      };
    return {};
  }

  const db = {
    moderationSweep: table('moderationSweep'),
    moderationSweepItem: table('moderationSweepItem'),
    rMHark: table('rMHark'),
    rMHarkComment: table('rMHarkComment'),
    user: table('user'),
    userStrike: table('userStrike'),
    notification: table('notification'),
    adminAuditLog: table('adminAuditLog'),
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const before = structuredClone(state);
      try {
        return await fn(db);
      } catch (error) {
        (Object.keys(before) as Name[]).forEach((k) => {
          state[k] = before[k];
        });
        throw error;
      }
    },
  };
  return { db, state };
}
