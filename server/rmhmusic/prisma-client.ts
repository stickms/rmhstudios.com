/**
 * RMHMusic — Prisma Client
 *
 * RMHMusic is not a standalone server: it is mounted inside the socket-server
 * hub (server/CLAUDE.md), so it reuses the hub client rather than building a
 * second connection pool in the same process.
 */
export { getPrismaClient, disconnectPrisma } from '../socket-server/prisma-client';
