/**
 * RMHbox — Standalone Server Prisma Client
 * Delegates to the shared factory for consistent pool configuration.
 */
import { createServerPrismaClient, disconnectPrisma as _disconnect } from '../shared/prisma-client';
import { logger } from './logger';

let prismaInstance: ReturnType<typeof createServerPrismaClient> | null = null;

export function getPrismaClient() {
  if (!prismaInstance) {
    prismaInstance = createServerPrismaClient(logger);
  }
  return prismaInstance;
}

export async function disconnectPrisma(): Promise<void> {
  if (prismaInstance) {
    await _disconnect(prismaInstance, logger);
    prismaInstance = null;
  }
}
