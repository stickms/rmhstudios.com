/**
 * Socket Server — Main Entry Point
 *
 * Unified WebSocket server for all mini-games and real-time apps.
 * Runs as a separate Node.js process on port 7001.
 *
 * Games: Slice It, Neon Driftway, Synapse Storm, RMH Type, RMH Study, Altair
 */

import 'dotenv/config';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { Server } from 'socket.io';
import { config } from './config';
import { logger } from './logger';
import { disconnectPrisma } from './prisma-client';
import { cleanupRateLimits } from './rate-limit';

// ─── Game Handlers ──────────────────────────────────────────────
import { registerSliceItHandlers, handleSliceItDisconnect } from './handlers/slice-it';
import { registerNeonDriftwayHandlers, handleNeonDriftwayDisconnect } from './handlers/neon-driftway';
import { registerSynapseStormHandlers, handleSynapseStormDisconnect } from './handlers/synapse-storm';
import { registerRmhTypeHandlers, handleRmhTypeDisconnect } from './handlers/rmhtype';
import { registerRmhStudyHandlers, handleRmhStudyDisconnect } from './handlers/rmhstudy';
import { registerAltairHandlers, handleAltairDisconnect } from './handlers/altair';

// ─── Startup validation ─────────────────────────────────────────

if (!config.CORS_ORIGIN) {
  logger.error({ event: 'fatal_missing_cors', message: 'SOCKET_CORS_ORIGIN environment variable is required' });
  process.exit(1);
}

// ─── Auth middleware (soft — authenticates if token present) ─────

import { Pool } from 'pg';

let authPool: Pool | null = null;

function getAuthPool(): Pool | null {
  if (!config.DATABASE_URL) return null;
  if (!authPool) {
    authPool = new Pool({
      connectionString: config.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
  }
  return authPool;
}

async function softAuthMiddleware(
  socket: import('socket.io').Socket,
  next: (err?: import('socket.io').ExtendedError) => void,
): Promise<void> {
  const token = socket.handshake.auth?.token;

  // No token → allow connection but without user data (legacy games)
  if (!token || typeof token !== 'string') {
    return next();
  }

  const pool = getAuthPool();
  if (!pool) {
    return next();
  }

  try {
    const result = await pool.query(
      `SELECT s."userId", s."expiresAt", u."name", u."image"
       FROM "session" s
       JOIN "user" u ON u."id" = s."userId"
       WHERE s."token" = $1
       LIMIT 1`,
      [token],
    );

    if (result.rows.length > 0) {
      const row = result.rows[0];
      const expiresAt = new Date(row.expiresAt);
      if (expiresAt > new Date()) {
        socket.data.userId = row.userId;
        socket.data.userName = row.name || 'Player';
        socket.data.avatarUrl = row.image || null;
        socket.data.sessionToken = token;
      }
    }

    next();
  } catch (err) {
    logger.warn({ event: 'soft_auth_error', error: String(err) });
    // Still allow connection — auth is optional for legacy games
    next();
  }
}

// ─── Health-check HTTP handler ──────────────────────────────────

function requestHandler(_req: IncomingMessage, res: ServerResponse): void {
  if (_req.url === '/health' && _req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
    return;
  }
  res.writeHead(404);
  res.end();
}

// ─── HTTP + Socket.io Server ────────────────────────────────────

const httpServer = createServer(requestHandler);

const io = new Server(httpServer, {
  path: config.SOCKET_PATH,
  cors: {
    origin: config.CORS_ORIGIN.split(','),
    methods: ['GET', 'POST'],
    credentials: true,
  },
  maxHttpBufferSize: config.MAX_HTTP_BUFFER_SIZE,
  pingInterval: config.PING_INTERVAL_MS,
  pingTimeout: config.PING_TIMEOUT_MS,
});

// ─── Auth middleware ────────────────────────────────────────────

io.use(softAuthMiddleware);

// ─── Connection handler ─────────────────────────────────────────

io.on('connection', (socket) => {
  const userId = (socket.data.userId as string) || 'anonymous';
  const userName = (socket.data.userName as string) || 'Player';
  logger.info({ event: 'connection', userId, userName, socketId: socket.id });

  // Register all game handlers
  registerSliceItHandlers(io, socket);
  registerNeonDriftwayHandlers(io, socket);
  registerSynapseStormHandlers(io, socket);
  registerRmhTypeHandlers(io, socket);
  registerRmhStudyHandlers(io, socket);
  registerAltairHandlers(io, socket);

  // Disconnect cleanup
  socket.on('disconnect', (reason) => {
    logger.info({ event: 'disconnect', userId, socketId: socket.id, reason });

    handleSynapseStormDisconnect(io, socket);
    handleSliceItDisconnect(io, socket);
    handleNeonDriftwayDisconnect(io, socket);
    handleRmhTypeDisconnect(io, socket);
    handleRmhStudyDisconnect(io, socket);
    handleAltairDisconnect(io, socket);

    cleanupRateLimits(socket.id);
  });
});

// ─── Graceful shutdown ──────────────────────────────────────────

function shutdown(signal: string): void {
  logger.info({ event: 'shutdown_initiated', signal });

  io.close(() => {
    logger.info({ event: 'sockets_closed' });
  });

  httpServer.close(() => {
    logger.info({ event: 'http_server_closed' });
    const cleanup = Promise.all([
      disconnectPrisma(),
      authPool ? authPool.end() : Promise.resolve(),
    ]);
    cleanup.finally(() => process.exit(0));
  });

  setTimeout(() => {
    logger.error({ event: 'forced_shutdown', reason: 'timeout' });
    process.exit(1);
  }, config.SHUTDOWN_TIMEOUT_MS);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// ─── Start listening ────────────────────────────────────────────

httpServer.listen(config.PORT, () => {
  logger.info({ event: 'server_started', port: config.PORT, socketPath: config.SOCKET_PATH });
});
