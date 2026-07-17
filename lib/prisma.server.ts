import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  // PrismaPg wraps a pg Pool — configure pool sizing for predictable behaviour under load.
  // perf audit §2/§4: the web container serves every page + API request from this
  // single pool, so the old default of 10 was trivially exhausted under concurrency
  // (a feed read holds several connections) and everything else then queued for the
  // full connectionTimeoutMillis. Default raised to 20 (override via
  // DATABASE_POOL_SIZE — see .env.example / deploy/postgres/postgresql.tuning.conf),
  // and the acquire timeout lowered from 10s→5s so overload FAILS FAST instead of
  // piling up multi-second waits behind an already-saturated pool.
  const adapter = new PrismaPg({
    connectionString,
    max: parseInt(process.env.DATABASE_POOL_SIZE || '20', 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });
}

export const prisma = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
