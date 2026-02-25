/**
 * RmhTube — Standalone WebSocket Server
 *
 * Runs as a separate Node.js process on port 7003.
 * Handles all RmhTube room, video sync, queue, and chat events.
 *
 * External URL: ws://rmhstudios.com/rmhtube-ws
 * Internal:     http://localhost:7003 with path "/rmhtube-ws/"
 */

import 'dotenv/config';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { Server } from 'socket.io';
import { config } from './config';
import { authMiddleware } from './auth';
import { RoomManager } from './room-manager';
import { SyncEngine } from './sync-engine';
import { MediaQueue } from './media-queue';
import { ChatHandler } from './chat-handler';
import { ReconnectionHandler } from './reconnection';
import { cleanupRateLimits } from './rate-limit';
import { disconnectPrisma } from './prisma-client';
import { logger } from './logger';

// ─── Health-check HTTP handler ───────────────────────────────────

function requestHandler(req: IncomingMessage, res: ServerResponse): void {
  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
    return;
  }
  res.writeHead(404);
  res.end();
}

// ─── HTTP + Socket.io Server ─────────────────────────────────────

const httpServer = createServer(requestHandler);

const io = new Server(httpServer, {
  path: config.SOCKET_PATH,
  cors: {
    origin: config.CORS_ORIGIN,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  maxHttpBufferSize: config.MAX_HTTP_BUFFER_SIZE,
  pingInterval: config.PING_INTERVAL_MS,
  pingTimeout: config.PING_TIMEOUT_MS,
  connectionStateRecovery: {
    maxDisconnectionDuration: config.DISCONNECT_GRACE_PERIOD_MS,
    skipMiddlewares: false,
  },
});

// ─── Auth middleware ──────────────────────────────────────────────

io.use(authMiddleware);

// ─── Service layer bootstrap ─────────────────────────────────────

const roomManager   = new RoomManager(io);
const syncEngine    = new SyncEngine(io, roomManager);
const mediaQueue    = new MediaQueue(io, roomManager, syncEngine);
const chatHandler   = new ChatHandler(io, roomManager);
const reconnection  = new ReconnectionHandler(io, roomManager);

// ─── Connection handler ──────────────────────────────────────────

io.on('connection', (socket) => {
  const userId = socket.data.userId as string;
  const userName = socket.data.userName as string;
  logger.info({ event: 'connection', userId, userName, socketId: socket.id });

  // Attempt reconnection to an existing room first
  reconnection.attemptReconnect(socket);

  // Register domain event handlers
  roomManager.handleConnection(socket);
  syncEngine.handleConnection(socket);
  mediaQueue.handleConnection(socket);
  chatHandler.handleConnection(socket);

  socket.on('disconnect', (reason) => {
    logger.info({ event: 'disconnect', userId, userName, socketId: socket.id, reason });
    roomManager.handleDisconnect(socket);
    reconnection.handleDisconnect(socket);
    cleanupRateLimits(socket.id);
  });
});

// ─── Periodic tasks ──────────────────────────────────────────────

syncEngine.startHeartbeat();
roomManager.startGarbageCollector();

// ─── Graceful shutdown ───────────────────────────────────────────

function shutdown(signal: string): void {
  logger.info({ event: 'shutdown_initiated', signal });

  io.close(() => {
    logger.info({ event: 'sockets_closed' });
  });

  syncEngine.stopHeartbeat();
  roomManager.stopGarbageCollector();

  httpServer.close(() => {
    logger.info({ event: 'http_server_closed' });
    disconnectPrisma().finally(() => {
      process.exit(0);
    });
  });

  setTimeout(() => {
    logger.error({ event: 'forced_shutdown', reason: 'timeout' });
    process.exit(1);
  }, config.SHUTDOWN_TIMEOUT_MS);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// ─── Restore rooms from DB, then start listening ─────────────────

roomManager.restoreRoomsFromDb()
  .then(() => {
    httpServer.listen(config.PORT, () => {
      logger.info({ event: 'server_started', port: config.PORT, socketPath: config.SOCKET_PATH });
    });
  })
  .catch((err) => {
    logger.error({ event: 'db_restore_failed', error: String(err) });
    // Start anyway — rooms will be loaded on-demand when users join
    httpServer.listen(config.PORT, () => {
      logger.info({ event: 'server_started', port: config.PORT, socketPath: config.SOCKET_PATH, note: 'db_restore_failed' });
    });
  });
