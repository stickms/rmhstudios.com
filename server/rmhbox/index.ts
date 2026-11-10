/**
 * RMHbox — Standalone WebSocket Server
 *
 * Runs as a separate Node.js process on port 7676.
 * Handles all RMHbox lobby, game, and leaderboard events
 * independently from the main Socket.io server (port 7001).
 *
 * External URL: ws://rmhstudios.com/rmhbox-ws
 * Internal:     http://localhost:7676 with path "/rmhbox-ws/"
 *
 */

import 'dotenv/config';
import { installProcessGuards } from '../../lib/perf/process-guards';

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
import { protocolGuard, protocolLogger } from '../shared/protocol';
import { attachRedisAdapter } from '../shared/redis-adapter';
import { openLobbyStore } from './lobby-store';
import { LobbyPersistence } from './lobby-persistence';
import { instrumentHub, handleInternalMetrics } from '../../lib/perf/hub';

// Log + count instead of dying on a stray rejection (lib/perf/process-guards.ts).
installProcessGuards({ service: 'rmhbox' });

if (!config.CORS_ORIGIN) {
  logger.error({ event: 'fatal_missing_cors', message: 'CORS_ORIGIN must be set (RMHBOX_CORS_ORIGIN or SOCKET_CORS_ORIGIN)' });
  process.exit(1);
}

// ─── Health-check HTTP handler ───────────────────────────────────

function requestHandler(req: IncomingMessage, res: ServerResponse): void {
  // Process metrics for the admin performance page (compose-network only; see
  // lib/perf/hub.ts).
  if (handleInternalMetrics(req, res)) return;
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

// Opt-in Redis backplane (REDIS_URL); in-memory adapter otherwise. Awaited before listen().
const adapterReady = attachRedisAdapter(io, logger);

// Metrics: connection/room gauges + inbound-event counters (lib/perf/hub.ts).
instrumentHub(io, 'rmhbox');

// ─── Auth middleware (applied server-wide — no namespace) ────────

// Protocol version first (no DB round-trip): an outdated tab is told so instead of
// silently no-op'ing mid-match (server/shared/protocol.ts, E2). Lenient: a client that
// sends no version still gets in.
io.use(protocolGuard(protocolLogger(logger)));
io.use(authMiddleware);

// ─── Service layer bootstrap ────────────────────────────────────

const lobbyManager    = new LobbyManager(io);
const stateSyncService = new StateSyncService(io, lobbyManager);
const leaderboard     = new LeaderboardService();
const gameCoordinator = new GameCoordinator(io, lobbyManager, stateSyncService, leaderboard);
const voteManager     = new VoteManager(io, lobbyManager, gameCoordinator);
const chatHandler     = new ChatHandler(io, lobbyManager);
const reconnection    = new ReconnectionHandler(
  io, lobbyManager, stateSyncService,
  (lobbyId, spectatorUserId) => gameCoordinator.getSpectatorTarget(lobbyId, spectatorUserId),
);

// ─── Durable lobbies (opt-in) ───────────────────────────────────
// Off unless RMHBOX_DURABLE_LOBBIES=1 and REDIS_STATE_URL is reachable at boot
// (lobby-store.ts). When on, stored lobbies are restored before listen() and
// every lobby is written back in shutdown(). Unset: lobbyPersistence stays
// null, no hook is installed and the hub behaves exactly as before.

let lobbyPersistence: LobbyPersistence | null = null;
const durableReady = openLobbyStore(logger).then(async (store) => {
  if (!store) return;
  const persistence = new LobbyPersistence(store, lobbyManager, logger);
  lobbyPersistence = persistence;
  persistence.attach();
  await persistence.restore();
});

// ─── Connection handler ─────────────────────────────────────────

io.on('connection', (socket) => {
  const userId = socket.data.userId as string;
  const userName = socket.data.userName as string;
  logger.info({ event: 'connection', userId, userName, socketId: socket.id });

  // Attempt reconnection to an existing lobby first
  reconnection.attemptReconnect(socket);
  gameCoordinator.handleReconnect(socket);

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

let shuttingDown = false;

function shutdown(signal: string): void {
  // A second signal must not re-run teardown or arm a second force-exit timer.
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ event: 'shutdown_initiated', signal });

  // Closing the server disconnects every socket: those disconnects must not
  // start grace windows, and running games' timers must not keep firing
  // (lobbies are in-memory and die with the process, unless durable lobbies
  // are on — then they are written to the store just below).
  lobbyManager.shuttingDown = true;
  for (const lobbyId of Array.from(lobbyManager.getLobbies().keys())) {
    gameCoordinator.teardownLobby(lobbyId);
    voteManager.cancelVote(lobbyId);
  }

  // Durable lobbies: write every lobby now; exit waits for it (bounded by the
  // forced-shutdown timer below). Null when the feature is off.
  const lobbiesSaved = lobbyPersistence?.shutdown() ?? null;

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
    const exit = () => {
      disconnectPrisma().finally(() => {
        process.exit(0);
      });
    };
    if (lobbiesSaved) void lobbiesSaved.finally(exit);
    else exit();
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

void Promise.all([adapterReady, durableReady.catch((err: unknown) => {
  // openLobbyStore and restore never throw; this is belt and braces — the hub must always start.
  logger.warn({ event: 'durable_lobbies_boot_failed', error: String(err) });
})]).then(() =>
  httpServer.listen(config.PORT, () => {
    logger.info({ event: 'server_started', port: config.PORT, socketPath: config.SOCKET_PATH });
  }),
);
