/**
 * Shared Prisma Client factory for standalone WebSocket servers.
 *
 * Each server process (socket-server, rmhbox, rmhtube) should call
 * `createServerPrismaClient()` once at startup. The factory configures
 * the pg adapter with sensible pool defaults for long-running servers.
 *
 * Usage:
 *   import { createServerPrismaClient, disconnectPrisma } from '../shared/prisma-client';
 *   const prisma = createServerPrismaClient(logger);
 *   // on shutdown:
 *   await disconnectPrisma(prisma, logger);
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { recordQuery, setGauge } from '../../lib/perf/process-metrics';
import type { Logger } from './logger';

/**
 * Times every query for the hub's `/internal/metrics` (the same idea as the web
 * tier's extension in lib/prisma.server.ts). There is no request budget here, so
 * slow queries carry no route label. The recorder never throws and a failed query
 * is re-thrown untouched.
 */
const queryTimingExtension = Prisma.defineExtension({
  name: 'query-timing',
  query: {
    async $allOperations({ model, operation, args, query }) {
      const op = `${model ?? 'raw'}.${operation}`;
      const startedAt = performance.now();
      try {
        const result = await query(args);
        recordQuery({ op, durationMs: performance.now() - startedAt, ok: true });
        return result;
      } catch (error) {
        recordQuery({ op, durationMs: performance.now() - startedAt, ok: false });
        throw error;
      }
    },
  },
});

export function createServerPrismaClient(logger: Logger): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    logger.error({ event: 'prisma_client_no_db_url', message: 'DATABASE_URL not set' });
    throw new Error('DATABASE_URL environment variable is required');
  }

  const max = parseInt(process.env.SERVER_DB_POOL_SIZE || '5', 10);
  const poolConfig = {
    connectionString,
    max,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  };
  // The pool is built here (PrismaPg 7 accepts a `pg.Pool`) so its counters can be
  // read as gauges; `disposeExternalPool` keeps `$disconnect` ending it as before.
  const pool = new Pool(poolConfig);
  const adapter = new PrismaPg(pool, { disposeExternalPool: true });
  // PrismaPg only adopts the pool when `instanceof pg.Pool` held for its own copy
  // of `pg`; if not, fall back to the plain config (no gauges) rather than hand it
  // a Pool it would read as a config object.
  const pooled = (adapter as unknown as { externalPool?: Pool | null }).externalPool === pool;
  if (pooled) {
    setGauge('db.pool.total', () => pool.totalCount);
    setGauge('db.pool.idle', () => pool.idleCount);
    setGauge('db.pool.waiting', () => pool.waitingCount);
    setGauge('db.pool.max', () => max);
  }

  const client = new PrismaClient({
    adapter: pooled ? adapter : new PrismaPg(poolConfig),
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

  logger.info({ event: 'prisma_client_created' });
  // Cast back to PrismaClient, as lib/prisma.server.ts does: `$extends` returns a
  // structurally richer type that no call site here names.
  return client.$extends(queryTimingExtension) as unknown as PrismaClient;
}

export async function disconnectPrisma(client: PrismaClient, logger: Logger): Promise<void> {
  await client.$disconnect();
  logger.info({ event: 'prisma_client_disconnected' });
}
