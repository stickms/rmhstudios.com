/**
 * RMHbox — Standalone WebSocket Server
 *
 * Runs as a separate Node.js process on port 7676.
 * Handles all RMHbox lobby, game, and leaderboard events
 * independently from the main Socket.io server (port 7001).
 *
 * External URL: ws://rmhstudios.com/rmhbox
 * Internal:     http://localhost:7676 with path "/rmhbox/"
 *
 * Caddy/nginx reverse-proxies `/rmhbox` WebSocket upgrades
 * to this process.
 */

import 'dotenv/config';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { Server } from 'socket.io';
import { config } from './config';
import { authMiddleware } from './auth';
import { LobbyManager } from './lobby-manager';
import { GameCoordinator } from './game-coordinator';
import { ReconnectionHandler } from './reconnection';
import { ChatHandler } from './chat';
import { VoteManager } from './vote-manager';
import { LeaderboardService } from './leaderboard';
import { StateSyncService } from './state-sync';
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

// ─── Auth middleware (applied server-wide — no namespace) ────────

io.use(authMiddleware);

// ─── Service layer bootstrap ────────────────────────────────────

const lobbyManager    = new LobbyManager(io);
const stateSyncService = new StateSyncService(io, lobbyManager);
const leaderboard     = new LeaderboardService();
const gameCoordinator = new GameCoordinator(io, lobbyManager, stateSyncService, leaderboard);
const voteManager     = new VoteManager(io, lobbyManager, gameCoordinator);
const chatHandler     = new ChatHandler(io, lobbyManager);
const reconnection    = new ReconnectionHandler(io, lobbyManager, stateSyncService);

// ─── Connection handler ─────────────────────────────────────────

io.on('connection', (socket) => {
  const userId = socket.data.userId as string;
  const userName = socket.data.userName as string;
  logger.info({ event: 'connection', userId, userName, socketId: socket.id });

  // Attempt reconnection to an existing lobby first
  reconnection.attemptReconnect(socket);

  // Register domain event handlers
  lobbyManager.handleConnection(socket);
  gameCoordinator.handleConnection(socket);
  voteManager.handleConnection(socket);
  chatHandler.handleConnection(socket);
  leaderboard.handleConnection(socket);

  socket.on('disconnect', (reason) => {
    logger.info({ event: 'disconnect', userId, userName, socketId: socket.id, reason });
    lobbyManager.handleDisconnect(socket);
    gameCoordinator.handleDisconnect(socket);
    reconnection.handleDisconnect(socket);
    cleanupRateLimits(socket.id);
  });
});

// ─── Periodic tasks ─────────────────────────────────────────────

// Heartbeat: send state snapshots to all in-game lobbies
stateSyncService.startHeartbeat();

// Garbage collector: clean up idle/empty lobbies
lobbyManager.startGarbageCollector();

// ─── Graceful shutdown ──────────────────────────────────────────

function shutdown(signal: string): void {
  logger.info({ event: 'shutdown_initiated', signal });

  // Stop accepting new connections
  io.close(() => {
    logger.info({ event: 'sockets_closed' });
  });

  // Stop periodic tasks
  stateSyncService.stopHeartbeat();
  lobbyManager.stopGarbageCollector();

  // Let in-flight events drain
  httpServer.close(() => {
    logger.info({ event: 'http_server_closed' });
    // Disconnect Prisma client before exiting
    disconnectPrisma().finally(() => {
      process.exit(0);
    });
  });

  // Force-kill after timeout
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
