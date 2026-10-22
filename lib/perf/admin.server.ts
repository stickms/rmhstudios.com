// Server-side data for the admin Performance page (`/api/admin/perf*`).
//
// Everything here runs at ADMIN request time, never on a user request path, and
// is read-only. Each source (Redis, a hub, a Postgres diagnostic) fails
// independently: one that is down becomes `null` / `{ error }` in the payload
// instead of failing the page, because "the page that tells you what is broken
// 500s when something is broken" is the failure mode this guards against.

import { hostname } from 'node:os';
import { getHeapSpaceStatistics, getHeapStatistics } from 'node:v8';
import { mergeSnapshots, snapshotProcess, type ProcessSnapshot } from './process-metrics';
import type { DbDiagnostics, HubResult, PerfOverview, RedisPlaneReport, Row } from './admin-types';
import { PERF_PROC_PREFIX } from './publish.server';
import {
  redisEnabled,
  redisInfo,
  redisPing,
  redisPlanesDistinct,
  redisScanJSON,
} from '../redis.server';

export type { DbDiagnostics, HubResult, PerfOverview, RedisPlaneReport } from './admin-types';

/* ─── Overview ───────────────────────────────────────────────────────────── */

const HUBS = [
  {
    service: 'socket',
    env: 'SOCKET_INTERNAL_URL',
    port: ['SOCKET_PORT', 'PORT_SOCKET'],
    fallback: '7001',
  },
  {
    service: 'rmhbox',
    env: 'RMHBOX_INTERNAL_URL',
    port: ['RMHBOX_PORT', 'PORT_RMHBOX'],
    fallback: '7676',
  },
  {
    service: 'rmhtube',
    env: 'RMHTUBE_INTERNAL_URL',
    port: ['RMHTUBE_PORT', 'PORT_RMHTUBE'],
    fallback: '7003',
  },
] as const;

const HUB_TIMEOUT_MS = 1500;

function hubUrl(hub: (typeof HUBS)[number]): string {
  const configured = process.env[hub.env];
  if (configured) return configured.replace(/\/$/, '');
  const port = hub.port.map((name) => process.env[name]).find(Boolean) ?? hub.fallback;
  return `http://127.0.0.1:${port}`;
}

/** A published or fetched value is only trusted if it looks like a snapshot. */
function isSnapshot(value: unknown): value is ProcessSnapshot {
  const v = value as Partial<ProcessSnapshot> | null;
  return (
    !!v &&
    typeof v === 'object' &&
    v.schema === 1 &&
    typeof v.service === 'string' &&
    typeof v.pid === 'number' &&
    !!v.requests &&
    !!v.memory
  );
}

async function fetchHub(hub: (typeof HUBS)[number]): Promise<HubResult> {
  try {
    const token = process.env.INTERNAL_METRICS_TOKEN;
    const res = await fetch(`${hubUrl(hub)}/internal/metrics`, {
      signal: AbortSignal.timeout(HUB_TIMEOUT_MS),
      headers: token ? { 'x-internal-token': token } : undefined,
    });
    if (!res.ok) return { service: hub.service, error: 'unreachable' };
    const body: unknown = await res.json();
    return isSnapshot(body) ? body : { service: hub.service, error: 'unreachable' };
  } catch {
    return { service: hub.service, error: 'unreachable' };
  }
}

async function planeReport(plane: 'cache' | 'state'): Promise<RedisPlaneReport> {
  const [ping, info] = await Promise.all([redisPing(plane), redisInfo(plane)]);
  return { ping, info };
}

export async function collectPerfOverview(): Promise<PerfOverview> {
  const live = snapshotProcess();
  const me = { pid: live.pid, hostname: live.hostname };

  const enabled = redisEnabled();
  const distinct = enabled && redisPlanesDistinct();
  const [published, hubs, cache, state] = await Promise.all([
    enabled ? redisScanJSON<unknown>(PERF_PROC_PREFIX) : Promise.resolve([]),
    Promise.all(HUBS.map(fetchHub)),
    enabled ? planeReport('cache') : Promise.resolve(null),
    distinct ? planeReport('state') : Promise.resolve(null),
  ]);

  // The live snapshot replaces this process's own (up to 10 s stale) Redis copy,
  // and is the ONLY source when Redis is off — which is what keeps the page
  // useful in dev and when the backplane is down.
  const processes: ProcessSnapshot[] = [];
  for (const { value } of published) {
    if (!isSnapshot(value)) continue;
    if (value.pid === me.pid && value.hostname === me.hostname) continue;
    processes.push(value);
  }
  processes.push(live);
  processes.sort((a, b) => a.service.localeCompare(b.service) || a.pid - b.pid);

  return {
    generatedAt: Date.now(),
    self: { ...me, service: live.service },
    processes,
    cluster: mergeSnapshots(processes.filter((p) => p.service === 'web')),
    hubs,
    redis: { enabled, distinct, cache, state },
  };
}

/* ─── Heap ───────────────────────────────────────────────────────────────── */

/** Heap statistics for THIS worker. Deliberately not a heap snapshot (see route). */
export function collectHeap() {
  return {
    pid: process.pid,
    hostname: hostname(),
    generatedAt: Date.now(),
    heap: getHeapStatistics(),
    spaces: getHeapSpaceStatistics(),
  };
}

/* ─── Postgres diagnostics ───────────────────────────────────────────────── */

/** Per-query ceiling. Diagnostics read catalogs; none should come near it. */
const DB_QUERY_TIMEOUT_MS = 3000;
/** Diagnostics in flight at once — enough to be quick, few enough not to starve the pool. */
const DB_CONCURRENCY = 3;

/** bigint -> number, Date -> ISO string, Decimal-like -> number; recursively. */
export function plain<T>(value: T): T {
  if (typeof value === 'bigint') return Number(value) as unknown as T;
  if (value instanceof Date) return value.toISOString() as unknown as T;
  if (Array.isArray(value)) return value.map(plain) as unknown as T;
  if (value && typeof value === 'object') {
    const maybeDecimal = value as { toNumber?: () => number };
    if (typeof maybeDecimal.toNumber === 'function') return maybeDecimal.toNumber() as unknown as T;
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, plain(v)]),
    ) as T;
  }
  return value;
}

/**
 * Run one fixed diagnostic. `SET LOCAL statement_timeout` (so the DATABASE cancels
 * a runaway query, not just us) in the same transaction as the query, with a
 * Promise.race behind it for a hung connection. Null on any failure.
 *
 * The SQL passed in is always a constant in this file — never user input — which
 * is the only reason `$queryRawUnsafe` is acceptable here.
 */
async function runDiagnostic<T>(sql: string): Promise<T[] | null> {
  try {
    const { prisma } = await import('../prisma.server');
    const work = prisma.$transaction([
      prisma.$executeRawUnsafe(`SET LOCAL statement_timeout = ${DB_QUERY_TIMEOUT_MS}`),
      prisma.$queryRawUnsafe<T[]>(sql),
    ]);
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error('diagnostic timed out')),
        DB_QUERY_TIMEOUT_MS + 500,
      );
    });
    try {
      const [, rows] = await Promise.race([work, timeout]);
      return plain(rows);
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
}

const SQL = {
  activity: `
    SELECT COALESCE(state, 'unknown') AS state, COALESCE(wait_event_type, 'none') AS wait_event_type, count(*)::int AS count
    FROM pg_stat_activity WHERE datname = current_database()
    GROUP BY 1, 2 ORDER BY count DESC`,
  connections: `
    SELECT (SELECT count(*)::int FROM pg_stat_activity) AS used,
           current_setting('max_connections')::int AS max`,
  longest: `
    SELECT pid, state, (EXTRACT(EPOCH FROM (now() - COALESCE(query_start, state_change))) * 1000)::float8 AS duration_ms,
           wait_event_type, wait_event, application_name, left(query, 500) AS query
    FROM pg_stat_activity
    WHERE datname = current_database() AND pid <> pg_backend_pid()
      AND backend_type = 'client backend' AND state IS NOT NULL AND state <> 'idle'
    ORDER BY duration_ms DESC NULLS LAST LIMIT 10`,
  database: `
    SELECT xact_commit, xact_rollback, blks_hit, blks_read, deadlocks, temp_files, temp_bytes, conflicts,
           tup_returned, tup_fetched, tup_inserted, tup_updated, tup_deleted, stats_reset
    FROM pg_stat_database WHERE datname = current_database()`,
  statementsExtension: `SELECT 1 AS present FROM pg_extension WHERE extname = 'pg_stat_statements'`,
  statements: `
    SELECT left(query, 500) AS query, calls, total_exec_time, mean_exec_time, max_exec_time, rows
    FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 25`,
  tables: `
    SELECT relname AS table, pg_total_relation_size(relid)::float8 AS total_bytes, n_live_tup, n_dead_tup,
           seq_scan, idx_scan, last_autovacuum, last_autoanalyze
    FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 20`,
  seqScans: `
    SELECT relname AS table, seq_scan, COALESCE(idx_scan, 0) AS idx_scan, n_live_tup, seq_tup_read
    FROM pg_stat_user_tables
    WHERE seq_scan > COALESCE(idx_scan, 0) AND n_live_tup > 10000
    ORDER BY seq_tup_read DESC LIMIT 20`,
  // Unique and primary-key indexes are excluded: an index that never serves a read
  // can still be what enforces a constraint, so "unused" does not mean "droppable".
  unusedIndexes: `
    SELECT s.relname AS table, s.indexrelname AS index, pg_relation_size(s.indexrelid)::float8 AS bytes
    FROM pg_stat_user_indexes s JOIN pg_index i ON i.indexrelid = s.indexrelid
    WHERE s.idx_scan = 0 AND NOT i.indisunique AND NOT i.indisprimary AND pg_relation_size(s.indexrelid) > 1048576
    ORDER BY bytes DESC LIMIT 20`,
  locks: `SELECT count(*)::int AS waiting FROM pg_locks WHERE NOT granted`,
  server: `SELECT pg_database_size(current_database())::float8 AS size_bytes, version() AS version`,
} as const;

/** Run `tasks` with at most `limit` in flight. */
async function limited<T>(tasks: Array<() => Promise<T>>, limit: number): Promise<T[]> {
  const out: T[] = new Array(tasks.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, async () => {
      while (next < tasks.length) {
        const i = next++;
        out[i] = await tasks[i]();
      }
    }),
  );
  return out;
}

export async function collectDbDiagnostics(): Promise<DbDiagnostics> {
  const [
    activity,
    connections,
    longest,
    database,
    extension,
    tables,
    seqScans,
    unusedIndexes,
    locks,
    server,
  ] = await limited(
    [
      () => runDiagnostic<Row>(SQL.activity),
      () => runDiagnostic<Row>(SQL.connections),
      () => runDiagnostic<Row>(SQL.longest),
      () => runDiagnostic<Row>(SQL.database),
      () => runDiagnostic<Row>(SQL.statementsExtension),
      () => runDiagnostic<Row>(SQL.tables),
      () => runDiagnostic<Row>(SQL.seqScans),
      () => runDiagnostic<Row>(SQL.unusedIndexes),
      () => runDiagnostic<Row>(SQL.locks),
      () => runDiagnostic<Row>(SQL.server),
    ],
    DB_CONCURRENCY,
  );

  // The extension can be created without being preloaded, in which case selecting
  // from it errors — reported as available-but-unreadable rather than hidden.
  const hasStatements = !!extension && extension.length > 0;
  const statements = hasStatements
    ? { available: true, rows: await runDiagnostic<Row>(SQL.statements) }
    : { available: false };

  const dbRow = database?.[0] ?? null;
  let cacheHitRatio: number | null = null;
  if (dbRow) {
    const hit = Number(dbRow.blks_hit);
    const read = Number(dbRow.blks_read);
    cacheHitRatio = hit + read > 0 ? hit / (hit + read) : null;
  }

  let pool: unknown = null;
  try {
    pool = (await import('../prisma.server')).dbPoolStats();
  } catch {
    /* no database configured */
  }

  return {
    generatedAt: Date.now(),
    activity,
    connections: connections?.[0] ?? null,
    longestRunning: longest,
    database: dbRow ? { ...dbRow, cacheHitRatio } : null,
    statements,
    tables,
    seqScanHints: seqScans,
    unusedIndexes,
    waitingLocks: locks?.[0] ? Number(locks[0].waiting) : null,
    server: server?.[0] ?? null,
    pool,
  };
}
