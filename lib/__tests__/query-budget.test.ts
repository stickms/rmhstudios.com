/**
 * E3 — the per-request query budget and the read-replica seam.
 *
 * These test the parts of `lib/prisma.server.ts` that have no database in them:
 * the AsyncLocalStorage scoping, the counting, when a breach is reported (and
 * how loudly), and the fallback that makes `prismaRead` safe to adopt before a
 * replica exists.
 *
 * `lib/prisma.server.ts` constructs a PrismaClient at module scope and THROWS
 * without DATABASE_URL, so every import here is dynamic and preceded by the env
 * the module needs. Nothing connects — `PrismaPg` builds a pg Pool lazily and
 * no query is ever issued.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const FAKE_DSN = 'postgresql://budget-test:budget-test@127.0.0.1:1/budget-test';

/** Import the module fresh, with a controlled environment. */
async function loadPrismaModule(env: Record<string, string | undefined> = {}) {
  vi.resetModules();
  // The module memoises its clients on `globalThis` outside production (the
  // dev-server hot-reload guard), and `resetModules` does not touch globals —
  // so without this every "fresh" import would hand back the FIRST load's
  // clients and the replica assertions below would pass or fail at random.
  const globals = globalThis as unknown as Record<string, unknown>;
  delete globals.prisma;
  delete globals.prismaRead;
  process.env.DATABASE_URL = FAKE_DSN;
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return import('@/lib/prisma.server');
}

const SAVED = {
  DATABASE_URL: process.env.DATABASE_URL,
  DATABASE_REPLICA_URL: process.env.DATABASE_REPLICA_URL,
  DATABASE_QUERY_BUDGET: process.env.DATABASE_QUERY_BUDGET,
  DATABASE_QUERY_BUDGET_ENFORCE: process.env.DATABASE_QUERY_BUDGET_ENFORCE,
};

beforeEach(() => {
  delete process.env.DATABASE_REPLICA_URL;
  delete process.env.DATABASE_QUERY_BUDGET;
  delete process.env.DATABASE_QUERY_BUDGET_ENFORCE;
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const [key, value] of Object.entries(SAVED)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('query budget — scoping', () => {
  it('is inert outside a scope, so workers and scripts pay nothing', async () => {
    const { currentQueryBudget, recordQuery } = await loadPrismaModule();
    expect(currentQueryBudget()).toBeUndefined();
    // The whole point: an uncounted query must not throw, warn, or allocate.
    expect(() => recordQuery('User', 'findMany')).not.toThrow();
  });

  it('counts every query issued inside a scope', async () => {
    const { withQueryBudget, recordQuery, currentQueryBudget } = await loadPrismaModule();

    const count = withQueryBudget('GET /test', () => {
      recordQuery('User', 'findUnique');
      recordQuery('Post', 'findMany');
      recordQuery(undefined, 'queryRaw');
      return currentQueryBudget()?.count;
    });

    expect(count).toBe(3);
  });

  it('does not leak between sibling scopes', async () => {
    const { withQueryBudget, recordQuery, currentQueryBudget } = await loadPrismaModule();

    const first = withQueryBudget('a', () => {
      recordQuery('User', 'findMany');
      recordQuery('User', 'findMany');
      return currentQueryBudget()?.count;
    });
    const second = withQueryBudget('b', () => {
      recordQuery('User', 'findMany');
      return currentQueryBudget()?.count;
    });

    expect(first).toBe(2);
    expect(second).toBe(1);
  });

  it('survives an await — the counter follows the async context', async () => {
    const { withQueryBudget, recordQuery, currentQueryBudget } = await loadPrismaModule();

    const count = await withQueryBudget('GET /async', async () => {
      recordQuery('User', 'findMany');
      await Promise.resolve();
      recordQuery('Post', 'findMany');
      await new Promise((resolve) => setTimeout(resolve, 1));
      recordQuery('Post', 'findMany');
      return currentQueryBudget()?.count;
    });

    expect(count).toBe(3);
  });

  it('enterQueryBudget binds the current context, for hook-shaped hosts', async () => {
    const { enterQueryBudget, recordQuery, currentQueryBudget } = await loadPrismaModule();

    // What server/nitro/otel.ts does: no continuation to wrap, so the store is
    // attached to the current async resource instead.
    await new Promise<void>((resolve) => {
      enterQueryBudget('GET /nitro');
      recordQuery('User', 'findMany');
      expect(currentQueryBudget()?.label).toBe('GET /nitro');
      expect(currentQueryBudget()?.count).toBe(1);
      resolve();
    });
  });
});

describe('query budget — breach reporting', () => {
  it('logs on the crossing and never throws by default', async () => {
    const { withQueryBudget, recordQuery } = await loadPrismaModule({
      DATABASE_QUERY_BUDGET: '3',
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() =>
      withQueryBudget('GET /feed', () => {
        for (let i = 0; i < 10; i++) recordQuery('Post', 'findMany');
      }),
    ).not.toThrow();

    const breaches = warn.mock.calls.filter((call) => call[0] === '[db:query-budget]');
    // Exactly one line for ten queries over a budget of three: a request that
    // runs 4,000 queries must not produce 3,997 log lines.
    expect(breaches).toHaveLength(1);
    const payload = JSON.parse(String(breaches[0][1]));
    expect(payload.label).toBe('GET /feed');
    expect(payload.count).toBe(4);
    expect(payload.max).toBe(3);
    expect(payload.enforced).toBe(false);
  });

  it('names the worst offender, which is the N+1', async () => {
    const { withQueryBudget, recordQuery, currentQueryBudget, topQueryOps } =
      await loadPrismaModule({ DATABASE_QUERY_BUDGET: '5' });
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const top = withQueryBudget('GET /profile', () => {
      recordQuery('User', 'findUnique');
      for (let i = 0; i < 40; i++) recordQuery('Post', 'findUnique');
      return topQueryOps(currentQueryBudget()!, 2);
    });

    expect(top[0]).toBe('Post.findUnique×40');
    expect(top[1]).toBe('User.findUnique×1');
  });

  it('throws only when DATABASE_QUERY_BUDGET_ENFORCE is on', async () => {
    const { withQueryBudget, recordQuery, QueryBudgetExceededError } = await loadPrismaModule({
      DATABASE_QUERY_BUDGET: '2',
      DATABASE_QUERY_BUDGET_ENFORCE: '1',
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() =>
      withQueryBudget('GET /runaway', () => {
        for (let i = 0; i < 5; i++) recordQuery('Post', 'findMany');
      }),
    ).toThrow(QueryBudgetExceededError);
  });

  it('reportQueryBudget emits the final tally only for a scope that breached', async () => {
    const { withQueryBudget, recordQuery, currentQueryBudget, reportQueryBudget } =
      await loadPrismaModule({ DATABASE_QUERY_BUDGET: '2' });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    withQueryBudget('GET /quiet', () => {
      recordQuery('User', 'findMany');
      reportQueryBudget(currentQueryBudget());
    });
    expect(warn.mock.calls.filter((c) => c[0] === '[db:query-budget:final]')).toHaveLength(0);

    withQueryBudget('GET /loud', () => {
      for (let i = 0; i < 9; i++) recordQuery('Post', 'findMany');
      reportQueryBudget(currentQueryBudget());
    });
    const finals = warn.mock.calls.filter((c) => c[0] === '[db:query-budget:final]');
    expect(finals).toHaveLength(1);
    // The crossing line reported 3; the final one reports how bad it got.
    expect(JSON.parse(String(finals[0][1])).count).toBe(9);
  });

  it('defaults generously enough to clear the anonymous homepage', async () => {
    const { DEFAULT_QUERY_BUDGET } = await loadPrismaModule();
    // server/nitro/warmup.ts documents the anon homepage assembly at ~32
    // queries. A ceiling at or below that fires on the site's busiest page from
    // day one and teaches everyone to ignore the log line.
    expect(DEFAULT_QUERY_BUDGET).toBeGreaterThan(32);
  });
});

describe('read replica', () => {
  it('falls back to the primary when DATABASE_REPLICA_URL is unset', async () => {
    const mod = await loadPrismaModule({ DATABASE_REPLICA_URL: undefined });
    // The fallback is what lets call sites adopt prismaRead now, with zero
    // behaviour change, so standing up a replica is an env var rather than an
    // audit of every read in the codebase.
    expect(mod.prismaRead).toBe(mod.prisma);
    expect(mod.hasReadReplica).toBe(false);
  });

  it('routes to a separate client when a replica is configured', async () => {
    const mod = await loadPrismaModule({
      DATABASE_REPLICA_URL: 'postgresql://replica:replica@127.0.0.1:2/replica',
    });
    expect(mod.prismaRead).not.toBe(mod.prisma);
    expect(mod.hasReadReplica).toBe(true);
  });
});
