/**
 * An in-memory stand-in for the slice of Prisma the RMHType challenge code reads and writes (s11-12). It understands
 * the `where` shapes that code uses: equality, `{ in }`, `{ gt, gte, lt, lte }`, `OR`, `NOT` and `{ not }`. Each write is
 * synchronous inside its method, so two concurrent compare-and-set calls interleave exactly as Postgres would order
 * them: one wins the row, the other sees the changed status.
 */
type Row = Record<string, unknown>;

export interface FakeChallengeDb {
  challenges: Row[];
  users: Row[];
  follows: { followerId: string; followingId: string }[];
  blocks: { blockerId: string; blockedId: string }[];
  optOuts: Row[];
  prefs: Row[];
  ghosts: Row[];
  matchPlayers: Row[];
  notifications: Row[];
  locks: string[];
  nextId: number;
}

export function newFakeChallengeDb(): FakeChallengeDb {
  return {
    challenges: [],
    users: [],
    follows: [],
    blocks: [],
    optOuts: [],
    prefs: [],
    ghosts: [],
    matchPlayers: [],
    notifications: [],
    locks: [],
    nextId: 1,
  };
}

function cmp(value: unknown, cond: unknown): boolean {
  if (cond !== null && typeof cond === 'object' && !(cond instanceof Date) && !Array.isArray(cond)) {
    const c = cond as Record<string, unknown>;
    const t = (v: unknown) => (v instanceof Date ? v.getTime() : (v as number));
    if ('in' in c) return (c.in as unknown[]).includes(value);
    if ('not' in c) return value !== c.not;
    if ('gt' in c && !(t(value) > t(c.gt))) return false;
    if ('gte' in c && !(t(value) >= t(c.gte))) return false;
    if ('lt' in c && !(t(value) < t(c.lt))) return false;
    if ('lte' in c && !(t(value) <= t(c.lte))) return false;
    return true;
  }
  if (cond instanceof Date && value instanceof Date) return cond.getTime() === value.getTime();
  return value === cond;
}

export function matches(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  for (const [key, cond] of Object.entries(where)) {
    if (key === 'OR') {
      if (!(cond as Row[]).some((w) => matches(row, w))) return false;
    } else if (key === 'AND') {
      if (!(cond as Row[]).every((w) => matches(row, w))) return false;
    } else if (key === 'NOT') {
      if (matches(row, cond as Row)) return false;
    } else if (!cmp(row[key], cond)) return false;
  }
  return true;
}

export function makeChallengePrisma(db: FakeChallengeDb) {
  const userOf = (id: unknown) => db.users.find((u) => u.id === id) ?? null;
  const join = (c: Row) => ({
    ...c,
    challenger: userOf(c.challengerId),
    opponent: userOf(c.opponentId),
  });

  const rmhTypeChallenge = {
    findUnique: async ({ where }: { where: { id: string } }) => {
      const row = db.challenges.find((c) => c.id === where.id);
      return row ? join(row) : null;
    },
    findMany: async ({ where, take }: { where?: Row; take?: number }) =>
      db.challenges
        .filter((c) => matches(c, where))
        .slice(0, take ?? 1000)
        .map(join),
    count: async ({ where }: { where?: Row }) => db.challenges.filter((c) => matches(c, where)).length,
    create: async ({ data }: { data: Row }) => {
      const row: Row = {
        id: `ch${db.nextId++}`,
        status: 'pending',
        opponentWpm: null,
        opponentAccuracy: null,
        opponentTimeMs: null,
        outcome: null,
        finished: null,
        raceStartedAt: null,
        settledAt: null,
        createdAt: new Date(),
        ...data,
      };
      db.challenges.push(row);
      return row;
    },
    updateMany: async ({ where, data }: { where?: Row; data: Row }) => {
      // Yield first, so two concurrent callers have both read before either writes.
      await Promise.resolve();
      const hits = db.challenges.filter((c) => matches(c, where));
      for (const row of hits) Object.assign(row, data);
      return { count: hits.length };
    },
  };

  const tx = {
    rmhTypeChallenge,
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => userOf(where.id),
      findMany: async ({ where }: { where?: Row }) => db.users.filter((u) => matches(u, where)),
    },
    userBlock: {
      findFirst: async ({ where }: { where?: Row }) => db.blocks.find((b) => matches(b, where)) ?? null,
      findMany: async ({ where }: { where?: Row }) => db.blocks.filter((b) => matches(b, where)),
    },
    follow: {
      count: async ({ where }: { where?: Row }) => db.follows.filter((f) => matches(f, where)).length,
    },
    notificationPreference: {
      findUnique: async ({ where }: { where: { userId: string } }) =>
        db.prefs.find((p) => p.userId === where.userId) ?? null,
    },
    rmhTypeChallengeOptOut: {
      findUnique: async ({ where }: { where: { userId: string } }) =>
        db.optOuts.find((o) => o.userId === where.userId) ?? null,
      upsert: async ({ where, create }: { where: { userId: string }; create: Row }) => {
        if (!db.optOuts.some((o) => o.userId === where.userId)) db.optOuts.push({ ...create, createdAt: new Date() });
        return {};
      },
      deleteMany: async ({ where }: { where: Row }) => {
        const before = db.optOuts.length;
        db.optOuts = db.optOuts.filter((o) => !matches(o, where));
        return { count: before - db.optOuts.length };
      },
    },
    rmhTypeGhost: {
      findUnique: async ({ where }: { where: { userId_passageId: { userId: string; passageId: string } } }) =>
        db.ghosts.find(
          (g) => g.userId === where.userId_passageId.userId && g.passageId === where.userId_passageId.passageId,
        ) ?? null,
      findMany: async ({ where }: { where?: Row }) => db.ghosts.filter((g) => matches(g, where)),
    },
    rmhTypeMatchPlayer: {
      findFirst: async ({ where }: { where?: Row }) => {
        const { match: _match, ...rest } = (where ?? {}) as Row;
        return db.matchPlayers.find((p) => matches(p, rest)) ?? null;
      },
    },
    notification: {
      create: async ({ data }: { data: Row }) => {
        db.notifications.push(data);
        return data;
      },
    },
    // The advisory lock: record the key; the in-memory fake has no second connection to block.
    $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      if (strings.join('?').includes('pg_advisory_xact_lock')) db.locks.push(String(values[0]));
      return 1;
    },
  };

  return {
    ...tx,
    $transaction: async <T>(fn: (t: typeof tx) => Promise<T>) => fn(tx),
  };
}
