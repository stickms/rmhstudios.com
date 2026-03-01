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

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import type { Logger } from './logger';

export function createServerPrismaClient(logger: Logger): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    logger.error({ event: 'prisma_client_no_db_url', message: 'DATABASE_URL not set' });
    throw new Error('DATABASE_URL environment variable is required');
  }

  const adapter = new PrismaPg({
    connectionString,
    options: {
      max: parseInt(process.env.SERVER_DB_POOL_SIZE || '5', 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    },
  });

  const client = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

  logger.info({ event: 'prisma_client_created' });
  return client;
}

export async function disconnectPrisma(client: PrismaClient, logger: Logger): Promise<void> {
  await client.$disconnect();
  logger.info({ event: 'prisma_client_disconnected' });
}
