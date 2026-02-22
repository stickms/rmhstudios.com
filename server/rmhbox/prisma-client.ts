/**
 * RMHbox — Standalone Server Prisma Client
 *
 * Creates a dedicated PrismaClient instance for the standalone RMHbox
 * WebSocket server process. This runs outside of Next.js, so we create
 * our own client with the pg adapter.
 *
 * Used by LeaderboardService for async match result persistence.
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { logger } from './logger';

let prismaInstance: PrismaClient | null = null;

/**
 * Returns a singleton PrismaClient for the standalone server.
 * Lazily initialized on first call.
 */
export function getPrismaClient(): PrismaClient {
  if (!prismaInstance) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      logger.error({ event: 'prisma_client_no_db_url', message: 'DATABASE_URL not set' });
      throw new Error('DATABASE_URL environment variable is required');
    }

    const adapter = new PrismaPg({ connectionString });
    prismaInstance = new PrismaClient({
      adapter,
      log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    });

    logger.info({ event: 'prisma_client_created', message: 'Standalone server Prisma client initialized' });
  }
  return prismaInstance;
}

/**
 * Gracefully disconnect the Prisma client (call during shutdown).
 */
export async function disconnectPrisma(): Promise<void> {
  if (prismaInstance) {
    await prismaInstance.$disconnect();
    prismaInstance = null;
    logger.info({ event: 'prisma_client_disconnected' });
  }
}
