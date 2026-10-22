import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { AsyncLocalStorage } from 'node:async_hooks';
import { Pool } from 'pg';
// Aliased: this module already exports a `recordQuery` (the budget counter below).
import { recordQuery as recordQueryMetric } from './perf/process-metrics';
import { guardPool } from './perf/process-guards';

/* ─── BIGINT columns ─────────────────────────────────────────────────────────
 *
 * Coin balances, ledger amounts and vault stakes are BIGINT, which Prisma reads
 * as a JS `bigint` — and `JSON.stringify` THROWS on a bigint. Call sites convert
 * with `Number()` where the type checker sees them, but an aggregate spread into
 * `Response.json` is invisible to it. So teach bigint to serialize, once, in the
 * module every database-reading process loads: as a number while it is exact
 * (every coin amount — MAX_TRANSACTION is 1e13), as a string past 2^53 so a
 * value is never silently rounded.
 */
const bigintProto = BigInt.prototype as unknown as { toJSON?: () => number | string };
bigintProto.toJSON ??= function (this: bigint) {
  return this <= BigInt(Number.MAX_SAFE_INTEGER) && this >= BigInt(Number.MIN_SAFE_INTEGER)
    ? Number(this)
    : this.toString();
};

const globalForPrisma = global as unknown as { prisma: PrismaClient; prismaRead: PrismaClient };

/* ─── Query budget (E3) ─────────────────────────────────────────────────────
 *
 * There is no ceiling on what a single request may cost. One unbounded
 * `findMany` in a new feature, or an accidental N+1 inside a `.map()`, degrades
 * the whole site — and the only reason nobody notices is that the symptom
 * (pool exhaustion, everything queueing behind the saturated pool) shows up far
 * from the cause.
 *
 * So: count the queries a request issues, and say something when the count is
 * absurd. This deliberately does NOT throw by default. The first release exists
 * to PRODUCE the list of offenders — the breach lines are the N+1 inventory,
 * delivered for free — and a guard that 500s a page the day it ships is a guard
 * that gets reverted. Set DATABASE_QUERY_BUDGET_ENFORCE=1 to make it throw once
 * the log is quiet.
 */

/** One request's query tally. */
export interface QueryBudget {
  /** What the scope is (route path, job name) — the log's only handle on WHERE. */
  label: string;
  /** Queries allowed before a breach is reported. */
  max: number;
  /** Queries issued so far. */
  count: number;
  /** True once `count` passed `max` (so the breach is reported exactly once). */
  breached: boolean;
  /** `model.operation` → count. The N+1 shows up here as one huge entry. */
  ops: Map<string, number>;
}

/**
 * Queries one request may issue before it is called out.
 *
 * Generous on purpose. The anonymous homepage assembly alone runs ~32 queries
 * (see server/nitro/warmup.ts), so anything under that would fire on the site's
 * most-loaded page on day one and teach everyone to ignore the log line. 40
 * catches the pathological cases — the unbounded loop, the per-item lookup —
 * and nothing else. Raise via DATABASE_QUERY_BUDGET.
 */
export const DEFAULT_QUERY_BUDGET = 40;

/** How many offending operations to name in a breach line. */
const BREACH_TOP_N = 5;

const budgetStorage = new AsyncLocalStorage<QueryBudget>();

function budgetMax(): number {
  const raw = parseInt(process.env.DATABASE_QUERY_BUDGET || '', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_QUERY_BUDGET;
}

/** True when a breach should throw rather than only log. Off by default. */
function budgetEnforced(): boolean {
  const raw = process.env.DATABASE_QUERY_BUDGET_ENFORCE;
  return raw === '1' || raw === 'true';
}

/** Thrown only when DATABASE_QUERY_BUDGET_ENFORCE is on. */
export class QueryBudgetExceededError extends Error {
  readonly code = 'QUERY_BUDGET_EXCEEDED';
  constructor(
    readonly label: string,
    readonly count: number,
    readonly max: number,
  ) {
    super(`Query budget exceeded for ${label}: ${count} queries (max ${max})`);
    this.name = 'QueryBudgetExceededError';
  }
}

/** A fresh budget for a scope. Exported for tests and for hook-shaped hosts. */
export function createQueryBudget(label: string, max = budgetMax()): QueryBudget {
  return { label, max, count: 0, breached: false, ops: new Map() };
}

/** The budget for the current async context, if any. */
export function currentQueryBudget(): QueryBudget | undefined {
  return budgetStorage.getStore();
}

/**
 * Run `fn` with a fresh query budget in scope.
 *
 * The right entry point wherever a continuation exists — a job handler, a
 * server function, a test.
 */
export function withQueryBudget<T>(label: string, fn: () => T, max?: number): T {
  return budgetStorage.run(createQueryBudget(label, max), fn);
}

/**
 * Bind the current async context to a new budget, and return it.
 *
 * For hook-shaped hosts with no continuation to wrap — Nitro's `request` hook
 * (server/nitro/otel.ts). Same caveat as `enterTrace`: `enterWith` attaches the
 * store to whatever async resource is current, so it can outlive its request.
 * For a counter whose worst failure is attributing a stray query to the
 * previous request's label, that is an acceptable trade; it would not be for
 * anything that gates access.
 */
export function enterQueryBudget(label: string, max?: number): QueryBudget {
  const budget = createQueryBudget(label, max);
  budgetStorage.enterWith(budget);
  return budget;
}

/** The `model.operation` entries with the highest counts — the N+1, named. */
export function topQueryOps(budget: QueryBudget, limit = BREACH_TOP_N): string[] {
  return [...budget.ops.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([op, n]) => `${op}×${n}`);
}

/**
 * Count one query against the ambient budget.
 *
 * A no-op outside a budgeted scope, which is the common case for workers and
 * scripts — the whole mechanism costs one `AsyncLocalStorage.getStore()` there.
 */
export function recordQuery(model: string | undefined, operation: string): void {
  const budget = budgetStorage.getStore();
  if (!budget) return;

  const key = `${model ?? 'raw'}.${operation}`;
  budget.ops.set(key, (budget.ops.get(key) ?? 0) + 1);
  budget.count += 1;

  if (budget.count <= budget.max || budget.breached) return;

  // Report the FIRST crossing only. A request that runs 4,000 queries should
  // produce one line naming the offender, not 3,960 lines burying it.
  budget.breached = true;
  console.warn(
    '[db:query-budget]',
    JSON.stringify({
      label: budget.label,
      count: budget.count,
      max: budget.max,
      top: topQueryOps(budget),
      enforced: budgetEnforced(),
    }),
  );

  if (budgetEnforced()) {
    throw new QueryBudgetExceededError(budget.label, budget.count, budget.max);
  }
}

/**
 * Close out a scope: emit the final tally when it breached, then return it.
 *
 * The breach line above fires at the crossing, when the total is still unknown;
 * this one carries the number that answers "how bad".
 */
export function reportQueryBudget(budget: QueryBudget | undefined): QueryBudget | undefined {
  if (!budget || !budget.breached) return budget;
  console.warn(
    '[db:query-budget:final]',
    JSON.stringify({
      label: budget.label,
      count: budget.count,
      max: budget.max,
      top: topQueryOps(budget),
    }),
  );
  return budget;
}

/**
 * The counting seam.
 *
 * A Prisma client extension rather than the `$use` middleware the E3 sketch
 * shows: `$use` was removed in Prisma 6, and a top-level `$allOperations`
 * covers raw queries too, which `$use` never did. The extended client is cast
 * back to `PrismaClient` so every existing annotation and every `typeof prisma`
 * in the codebase keeps its meaning — the only client members `$extends` drops
 * are `$on` and `$use`, neither of which this repo calls.
 */
const queryBudgetExtension = Prisma.defineExtension({
  name: 'query-budget',
  query: {
    async $allOperations({ model, operation, args, query }) {
      recordQuery(model, operation);
      // Time the query for the admin performance page (lib/perf). Wall time of
      // `query(args)` includes waiting for a pool connection, which is the point:
      // a slow op and a starved pool both show up here. The recorder swallows its
      // own errors and a failed query is re-thrown untouched.
      const startedAt = performance.now();
      try {
        const result = await query(args);
        recordQueryMetric({
          op: `${model ?? 'raw'}.${operation}`,
          durationMs: performance.now() - startedAt,
          ok: true,
          label: budgetStorage.getStore()?.label,
        });
        return result;
      } catch (error) {
        recordQueryMetric({
          op: `${model ?? 'raw'}.${operation}`,
          durationMs: performance.now() - startedAt,
          ok: false,
          label: budgetStorage.getStore()?.label,
        });
        throw error;
      }
    },
  },
});

/* ─── Unbounded-read guard (OPT-50) ─────────────────────────────────────────
 *
 * `schema.prisma` is 252 models. A `findMany` with no `select` returns every
 * scalar column — on wide models (posts with bodies, users with settings blobs)
 * that is the dominant cost of the query — and one with no `take` returns every
 * row that matches. Both are invisible at the call site, and today a deliberate
 * unbounded read of a small config table looks exactly like an accidental
 * unbounded read of `rmhark`.
 *
 * So: make them visible. This WARNS, it does not throw — some unbounded reads
 * are correct, and a guard that breaks a page the day it ships is a guard that
 * gets reverted. Same reasoning as the query budget above, and the same
 * intended use: the log is the inventory to work through.
 */

/** `model → call site` pairs already reported, so a hot loop logs once. */
const reportedUnboundedReads = new Set<string>();

/**
 * The frames worth showing.
 *
 * A raw `new Error().stack` taken from inside a client extension opens with
 * Prisma's own machinery, which names no call site at all — so drop
 * `node_modules` and node internals and keep the first application frames.
 * Falls back to the raw trace if that filter leaves nothing.
 */
function callSite(): string {
  const frames = new Error().stack?.split('\n').slice(2) ?? [];
  const app = frames.filter((f) => !f.includes('node_modules') && !f.includes('node:internal'));
  return (app.length > 0 ? app : frames).slice(0, 3).join('\n');
}

/**
 * Report one unbounded read, unless we are in production or have said it before.
 *
 * Exported as the guard's testable seam: the extension below is a two-line
 * wrapper around it, and this is where the "development only" rule actually
 * lives. Returns whether it warned.
 */
export function reportUnboundedRead(
  model: string | undefined,
  args: { select?: unknown; take?: unknown },
): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  if (args.select !== undefined || args.take !== undefined) return false;

  const where = callSite();
  const seen = `${model ?? 'unknown'}|${where}`;
  if (reportedUnboundedReads.has(seen)) return false;
  reportedUnboundedReads.add(seen);

  console.warn(`[prisma] unbounded findMany on ${model ?? 'unknown model'} — no select, no take`);
  if (where) console.warn(where);
  return true;
}

const unboundedReadExtension = Prisma.defineExtension({
  name: 'unbounded-read-guard',
  query: {
    $allModels: {
      async findMany({ model, args, query }) {
        reportUnboundedRead(model, (args ?? {}) as { select?: unknown; take?: unknown });
        return query(args);
      },
    },
  },
});

/* ─── Clients ───────────────────────────────────────────────────────────── */

/**
 * Compose the extensions onto a raw client, and cast back.
 *
 * Additive: the budget extension stays first (it counts `$allOperations`,
 * including the raw queries no per-model hook sees), and the dev-only guard is
 * layered on top rather than replacing it. In production the guard is not
 * composed at all, so it costs nothing there — not even the `NODE_ENV` read.
 *
 * The cast is the same one the budget extension has always needed, for the same
 * reason: every existing annotation and every `typeof prisma` in the codebase
 * keeps its meaning, and the only client members `$extends` drops are `$on` and
 * `$use`, neither of which this repo calls.
 */
function withExtensions(client: PrismaClient): PrismaClient {
  const budgeted = client.$extends(queryBudgetExtension);
  const extended =
    process.env.NODE_ENV === 'production' ? budgeted : budgeted.$extends(unboundedReadExtension);
  return extended as unknown as PrismaClient;
}

/**
 * The pg pools behind the two clients, kept so the admin performance page can
 * read `totalCount` / `idleCount` / `waitingCount`. PrismaPg builds its pool
 * privately when handed a config, so the pool is constructed here and handed in
 * instead (PrismaPg 7 accepts a `pg.Pool` and, with `disposeExternalPool`, ends
 * it on `$disconnect` exactly as it ends its own).
 */
type TrackedPools = {
  primary?: { pool: Pool; max: number };
  replica?: { pool: Pool; max: number };
};
// On `globalThis` for the same reason the clients are: outside production a
// hot-reload re-evaluates this module but reuses the cached clients, and the
// re-evaluated copy must still find their pools.
const trackedPools = ((globalThis as { __rmhDbPools?: TrackedPools }).__rmhDbPools ??= {});

export interface DbPoolStat {
  total: number;
  idle: number;
  waiting: number;
  max: number;
}

/** Live connection-pool counters; `replica` is absent without DATABASE_REPLICA_URL. */
export function dbPoolStats(): { primary: DbPoolStat | null; replica?: DbPoolStat } {
  const read = (t?: { pool: Pool; max: number }): DbPoolStat | null =>
    t
      ? {
          total: t.pool.totalCount,
          idle: t.pool.idleCount,
          waiting: t.pool.waitingCount,
          max: t.max,
        }
      : null;
  const replica = read(trackedPools.replica);
  return { primary: read(trackedPools.primary), ...(replica ? { replica } : {}) };
}

function createAdapter(
  connectionString: string,
  poolSize: number,
  role: 'primary' | 'replica',
): PrismaPg {
  // PrismaPg wraps a pg Pool — configure pool sizing for predictable behaviour under load.
  // perf audit §2/§4: the web container serves every page + API request from this
  // single pool, so the old default of 10 was trivially exhausted under concurrency
  // (a feed read holds several connections) and everything else then queued for the
  // full connectionTimeoutMillis. Default raised to 20 (override via
  // DATABASE_POOL_SIZE — see .env.example / deploy/postgres/postgresql.tuning.conf),
  // and the acquire timeout lowered from 10s→5s so overload FAILS FAST instead of
  // piling up multi-second waits behind an already-saturated pool.
  //
  // perf: server-side timeouts, so ONE slow query or a stuck transaction cannot
  // hold a pool slot indefinitely (every other request then fails the 5s acquire
  // above). pg sends these as startup parameters on each new connection.
  //   DATABASE_STATEMENT_TIMEOUT_MS      cancel any single statement past N ms
  //   DATABASE_IDLE_TX_TIMEOUT_MS        kill a session left idle inside a tx past N ms
  // OFF by default (unset/0) so scripts, jobs and cron workers that import this
  // module keep today's behaviour; docker-compose.yml turns them on for `web`
  // only. Code that legitimately exceeds them opts out per transaction with
  // `SET LOCAL statement_timeout = …` / `SET LOCAL idle_in_transaction_session_timeout = 0`
  // (see lib/ops/cohorts.server.ts, lib/kaikai-debt/ledger.server.ts).
  // NOTE: PgBouncer in transaction mode (compose `pgbouncer` profile) IGNORES
  // startup parameters, so behind a pooler these have no effect; the equivalent
  // there is `ALTER ROLE <app role> SET statement_timeout = …` (and likewise
  // idle_in_transaction_session_timeout), which applies server-side regardless.
  const statementTimeout = optionalMs('DATABASE_STATEMENT_TIMEOUT_MS');
  const idleTxTimeout = optionalMs('DATABASE_IDLE_TX_TIMEOUT_MS');
  const poolConfig = {
    connectionString,
    max: poolSize,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    ...(statementTimeout ? { statement_timeout: statementTimeout } : {}),
    ...(idleTxTimeout ? { idle_in_transaction_session_timeout: idleTxTimeout } : {}),
  };
  const pool = guardPool(new Pool(poolConfig), { pool: `prisma:${role}` });
  const adapter = new PrismaPg(pool, { disposeExternalPool: true });
  // PrismaPg recognises a pool with `instanceof pg.Pool`; if a duplicate `pg`
  // copy ever made that fail it would treat our Pool as a config object. The
  // private `externalPool` field is only set when recognition worked — if it did
  // not, discard this pool (nothing has connected) and use the original config path.
  if ((adapter as unknown as { externalPool?: Pool | null }).externalPool !== pool) {
    void pool.end().catch(() => {});
    return new PrismaPg(poolConfig);
  }
  trackedPools[role] = { pool, max: poolSize };
  return adapter;
}

/** A positive millisecond count from the environment, or undefined (= off). */
function optionalMs(envVar: string): number | undefined {
  const raw = parseInt(process.env[envVar] || '', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : undefined;
}

function poolSize(envVar: string, fallback: number): number {
  const raw = parseInt(process.env[envVar] || '', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

/**
 * Ports a transaction-mode pooler conventionally listens on. Used only to
 * recognise a likely-pooled URL for the warning below — never to change
 * behaviour, because a pooler can listen anywhere and guessing wrong either way
 * would be worse than not guessing.
 */
const POOLER_PORTS = new Set(['6432', '5433']);

/**
 * Warn when the runtime URL looks pooled but no direct URL is configured.
 *
 * Runtime traffic through PgBouncer is fine — every query this app issues is a
 * transaction-mode-safe unnamed statement (see
 * `lib/__tests__/pgbouncer-safety.test.ts`). What is NOT fine is `prisma
 * migrate` running through the pooler: its lock is a session-scoped advisory
 * lock, which transaction pooling silently discards, so two concurrent deploys
 * can migrate at once.
 *
 * `prisma.config.ts` prefers `DATABASE_DIRECT_URL`, so the correct setup is
 * automatic — this only catches the half-configured one, where someone pointed
 * `DATABASE_URL` at the pooler and never set the direct URL. It warns rather
 * than throws: a false positive (a Postgres genuinely listening on 6432) must
 * not take the site down, and the failure it guards against happens at deploy
 * time, not at boot.
 */
function warnIfPooledWithoutDirect(connectionString: string): void {
  if (process.env.DATABASE_DIRECT_URL) return;
  let port: string | null = null;
  try {
    port = new URL(connectionString).port || null;
  } catch {
    return; // not parseable as a URL — nothing to say
  }
  if (!port || !POOLER_PORTS.has(port)) return;
  console.warn(
    `[prisma] DATABASE_URL points at port ${port}, which looks like a connection pooler, ` +
      'but DATABASE_DIRECT_URL is unset. Runtime queries are safe through a pooler; ' +
      '`prisma migrate` is NOT — its advisory lock is session-scoped and transaction ' +
      'pooling drops it, so concurrent deploys can migrate simultaneously. Set ' +
      'DATABASE_DIRECT_URL to the real Postgres (see .env.example).',
  );
}

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required');
  }
  warnIfPooledWithoutDirect(connectionString);

  const client = new PrismaClient({
    adapter: createAdapter(connectionString, poolSize('DATABASE_POOL_SIZE', 20), 'primary'),
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

  return withExtensions(client);
}

function createReadClient(): PrismaClient | null {
  const replicaUrl = process.env.DATABASE_REPLICA_URL;
  if (!replicaUrl) return null;

  const client = new PrismaClient({
    // The replica gets its own pool. Sharing the primary's would defeat the
    // whole exercise: the reason to route reads away is that they were
    // competing with writes for connections.
    adapter: createAdapter(replicaUrl, poolSize('DATABASE_REPLICA_POOL_SIZE', 10), 'replica'),
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

  return withExtensions(client);
}

/** The primary. Every write, and every read that must see its own write. */
export const prisma = globalForPrisma.prisma || createPrismaClient();

/**
 * The read path — analytics, search, leaderboards, admin reports, cost
 * rollups: anything that tolerates replica lag (E3).
 *
 * **Falls back to `prisma` when `DATABASE_REPLICA_URL` is unset**, which is the
 * current production shape (one Postgres). That fallback is the point: call
 * sites can adopt `prismaRead` NOW, one at a time, with zero behaviour change,
 * so that standing up a replica later is an env var rather than an audit of
 * every read in the codebase.
 *
 * Do NOT use it for read-modify-write (`findUnique` then `update`), for
 * anything a user is about to be shown immediately after their own mutation,
 * or inside a transaction — replica lag turns all three into bugs that only
 * appear in production.
 */
export const prismaRead: PrismaClient = globalForPrisma.prismaRead || createReadClient() || prisma;

/** True when reads are actually going somewhere else. For /api/ready + tests. */
export const hasReadReplica = prismaRead !== prisma;

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaRead = prismaRead;
}
