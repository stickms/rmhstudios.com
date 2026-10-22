// Publishes this process's metrics snapshot to Redis so ONE admin request can see
// every web worker (and the jobs worker).
//
// WHY REDIS: the web tier is a node-cluster of separate processes with separate
// memory — an admin request lands on one worker and could otherwise only report
// that worker. Each process writes its own `snapshotProcess()` JSON under
// `perf:proc:<service>:<hostname>:<pid>` with a 30 s TTL (three missed publishes),
// so a crashed worker's entry ages out by itself and the page never lists ghosts.
// The admin endpoint then SCANs the prefix (`redisScanJSON`).
//
// COST: one JSON.stringify of a few tens of KB and one SET every 10 s per process,
// off the request path, on an unref'd timer. No Redis → nothing is scheduled at
// all. Redis is imported lazily so a missing REDIS_URL / ioredis problem can never
// stop a process from booting (same reasoning as server/nitro/otel.ts).
//
// Relative imports only: this is loaded by a Nitro plugin and by the jobs worker.

import { hostname } from 'node:os';
import { setGauge, snapshotProcess } from './process-metrics';

/** Key prefix for per-process snapshots; the admin endpoint scans for it. */
export const PERF_PROC_PREFIX = 'perf:proc:';
/** How often a process publishes. */
export const PERF_PUBLISH_INTERVAL_MS = 10_000;
/** Entry lifetime — three intervals, so one lost publish does not drop a process. */
export const PERF_PUBLISH_TTL_MS = 30_000;

const STARTED = Symbol.for('rmh.perf.publisher');

/** Idempotent. Publishes every 10 s while Redis is configured. */
export function startPerfPublisher(service: string): void {
  const g = globalThis as unknown as Record<symbol, boolean | undefined>;
  if (g[STARTED]) return;
  g[STARTED] = true;

  const key = `${PERF_PROC_PREFIX}${service}:${hostname()}:${process.pid}`;
  const timer = setInterval(() => {
    void (async () => {
      try {
        const redis = await import('../redis.server');
        if (!redis.redisEnabled()) return;
        await redis.redisSetJSON(key, snapshotProcess(), PERF_PUBLISH_TTL_MS);
      } catch {
        // Best-effort: a failed publish just means a stale or missing row.
      }
    })();
  }, PERF_PUBLISH_INTERVAL_MS);
  timer.unref();
}

/**
 * Expose the Prisma pools as gauges (`db.pool.*`, `db.replica.pool.*`).
 *
 * `lib/prisma.server.ts` throws at import when DATABASE_URL is unset, so it is
 * loaded lazily and a failure is swallowed — gauges are simply absent.
 */
export function registerPrismaPoolGauges(): void {
  void import('../prisma.server')
    .then(({ dbPoolStats }) => {
      for (const field of ['total', 'idle', 'waiting', 'max'] as const) {
        setGauge(`db.pool.${field}`, () => dbPoolStats().primary?.[field]);
        setGauge(`db.replica.pool.${field}`, () => dbPoolStats().replica?.[field]);
      }
    })
    .catch(() => {
      // No database configured in this process.
    });
}
