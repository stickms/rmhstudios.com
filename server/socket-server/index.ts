/**
 * Socket Server — Main Entry Point
 *
 * Unified WebSocket server for all mini-games and real-time apps.
 * Runs as a separate Node.js process on port 7001.
 *
 * Games: Slice It, Neon Driftway, Synapse Storm, RMH Type, RMH Study, Altair
 */

import 'dotenv/config';
import { installProcessGuards } from '../../lib/perf/process-guards';

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { Server } from 'socket.io';
import { config } from './config';
import { logger } from './logger';
import { protocolGuard, protocolLogger } from '../shared/protocol';
import { disconnectPrisma, getPrismaClient } from './prisma-client';
import { warmPrismaClient } from '../shared/prisma-client';
import { cleanupRateLimits } from './rate-limit';
import { attachRedisAdapter } from '../shared/redis-adapter';
import { instrumentHub, handleInternalMetrics } from '../../lib/perf/hub';

// ─── Game Handlers ──────────────────────────────────────────────
import {
  registerNeonDriftwayHandlers,
  handleNeonDriftwayDisconnect,
} from './handlers/neon-driftway';
import { registerRmhTypeHandlers, handleRmhTypeDisconnect } from './handlers/rmhtype';
import { registerRmhStudyHandlers, handleRmhStudyDisconnect } from './handlers/rmhstudy';
import {
  registerKowloonKnockoutHandlers,
  handleKowloonKnockoutDisconnect,
} from './handlers/kowloon-knockout';
import { registerStudioJamHandlers } from './handlers/studio-jam';
import {
  initializeCasino,
  listCasinoRooms,
  restoreCasinoTables,
  closeCasinoTableStore,
  CASINO_SHUTDOWN_REFUNDS,
  CASINO_SHUTDOWN_DEADLINE_MS,
} from '../../features/casino/server';
import { registerLightsOutHandlers, handleLightsOutDisconnect } from './handlers/lights-out';
import { registerVelumHandlers, handleVelumDisconnect } from './handlers/velum';
import { registerGlobeSetHandlers, handleGlobeSetDisconnect } from './handlers/globeset';
import { registerTf2GameHandlers, handleTf2GameDisconnect } from './handlers/tf2-game';
import { registerTf2P2pHandlers, handleTf2P2pDisconnect } from './handlers/tf2-p2p';
import { registerFeatureHandlers, handleFeatureDisconnects } from './features';
import { registerSpacesHandlers, handleSpacesDisconnect } from './handlers/spaces';
import { registerPartyHandlers, handlePartyDisconnect } from './handlers/party';
import { registerMatchmakingHandlers, handleMatchmakingDisconnect } from './handlers/matchmaking';
import { registerCallHandlers, handleCallDisconnect } from './handlers/call';
import {
  registerGroupCallHandlers,
  handleGroupCallDisconnect,
  reconcileOrphanedGroupCalls,
  startCommunityMembershipSweep,
} from './handlers/group-call';
import { registerControllerHandlers, handleControllerDisconnect } from './handlers/controller';
import {
  registerVibeRoomHandlers,
  handleVibeRoomDisconnect,
  initVibeRoomInstanceCheck,
} from './handlers/vibe-room';

// Log + count instead of dying on a stray rejection (lib/perf/process-guards.ts).
installProcessGuards({ service: 'socket-server' });

// ─── Startup validation ─────────────────────────────────────────

if (!config.CORS_ORIGIN) {
  logger.error({
    event: 'fatal_missing_cors',
    message: 'SOCKET_CORS_ORIGIN environment variable is required',
  });
  process.exit(1);
}

// ─── Auth middleware (soft — authenticates if token present) ─────

import { createSessionAuth } from '../shared/session-auth';
import { applyDiscordActivityToken as applyDiscordToken } from './discord-activity';

// The Better Auth session check (token -> session JOIN user, expiry, bounded
// 60 s positive cache, pool) is shared by every hub: server/shared/session-auth.ts.
// Soft-auth semantics stay here, so every non-`ok` outcome leaves the socket anonymous.
const sessionAuth = createSessionAuth({
  service: 'socket-server',
  databaseUrl: config.DATABASE_URL,
  defaultName: 'Player',
});

/** The shared auth pool (null without DATABASE_URL); also serves the Discord account lookup. */
function getAuthPool() {
  return sessionAuth.getPool();
}

/**
 * Better Auth session token → `socket.data`. Returns true when it authenticated.
 */
async function applySessionToken(socket: import('socket.io').Socket): Promise<boolean> {
  const result = await sessionAuth.resolveSocketSession(socket.handshake);
  if (result.status !== 'ok') return false;
  socket.data.userId = result.session.userId;
  socket.data.userName = result.session.name;
  socket.data.avatarUrl = result.session.image;
  socket.data.sessionToken = result.session.token;
  return true;
}

const applyDiscordActivityToken = (socket: import('socket.io').Socket, token: string) =>
  applyDiscordToken(socket, token, {
    appId: config.DISCORD_ACTIVITY_CLIENT_ID,
    getPool: getAuthPool,
    logger,
  });

/**
 * Soft auth: a connection is always allowed; a credential, if present and
 * valid, attaches an identity.
 *
 * Two credentials are accepted, in order of strength. A Better Auth session
 * token wins — it is a real site session. A Discord Activity token is tried
 * only when there is no usable session, because inside an Activity iframe that
 * is the common case rather than the exception.
 *
 * Neither one failing is an error: an anonymous socket is a supported state for
 * this hub (legacy games) and always was.
 */
async function softAuthMiddleware(
  socket: import('socket.io').Socket,
  next: (err?: import('socket.io').ExtendedError) => void,
): Promise<void> {
  const discordToken = socket.handshake.auth?.discordToken;

  try {
    await applySessionToken(socket);
    if (!socket.data.userId && typeof discordToken === 'string' && discordToken) {
      await applyDiscordActivityToken(socket, discordToken);
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
  // Process metrics for the admin performance page (compose-network only; see
  // lib/perf/hub.ts).
  if (handleInternalMetrics(_req, res)) return;
  if (_req.url === '/health' && _req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
    return;
  }
  // The casino lobbies, read-only, for callers with no socket.
  //
  // A socket connection needs a session token, so a signed-out visitor cannot
  // ask for the room list the normal way — which is why /predictions used to
  // bounce them to /login rather than show them anything. The web tier proxies
  // this from `/api/casino/rooms` (server-to-server, so the browser stays
  // same-origin and this port needs no CORS of its own).
  //
  // Only `privacy === 'public'` rooms are serialized, by the same
  // `listPublicRooms()` the socket handler emits — no player identities, no
  // hands, no balances, nothing a lobby browser could not already see.
  if (_req.url === '/internal/casino-rooms' && _req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    });
    res.end(
      JSON.stringify(listCasinoRooms()),
    );
    return;
  }
  res.writeHead(404);
  res.end();
}

// ─── HTTP + Socket.io Server ────────────────────────────────────

/** Set by shutdown(); read by the disconnect fan-out below. */
let shuttingDown = false;

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
  // Resume a briefly-dropped connection (network blip, tab sleep) without a
  // full re-handshake: Socket.IO restores the socket's id, rooms, data, and
  // replays missed packets. rmhbox/rmhtube already enable this; socket-server
  // did not, so every blip forced a fresh connection + auth round-trip.
  connectionStateRecovery: {},
});

// Opt-in Redis backplane (REDIS_URL); in-memory adapter otherwise. Awaited before listen().
const adapterReady = attachRedisAdapter(io, logger);

// Metrics: connection/room gauges + inbound-event counters (lib/perf/hub.ts).
instrumentHub(io, 'socket');

// ─── Auth middleware ────────────────────────────────────────────

// Protocol version first (no DB round-trip): an outdated tab is told so instead of
// silently no-op'ing mid-match (server/shared/protocol.ts, E2). Lenient: a client that
// sends no version still gets in.
io.use(protocolGuard(protocolLogger(logger)));
io.use(softAuthMiddleware);

// ─── Connection handler ─────────────────────────────────────────

io.on('connection', (socket) => {
  const userId = (socket.data.userId as string) || 'anonymous';
  const userName = (socket.data.userName as string) || 'Player';
  logger.info({ event: 'connection', userId, userName, socketId: socket.id });

  // Register all game handlers
  registerFeatureHandlers(io, socket, 'slice-it');
  registerNeonDriftwayHandlers(io, socket);
  registerFeatureHandlers(io, socket, 'synapse-storm');
  registerRmhTypeHandlers(io, socket);
  registerRmhStudyHandlers(io, socket);
  registerFeatureHandlers(io, socket, 'altair');
  registerKowloonKnockoutHandlers(io, socket);
  registerStudioJamHandlers(io, socket); // F13: self-cleans on disconnect
  registerFeatureHandlers(io, socket, 'casino'); // blackjack, holdem, baccarat, roulette (features/casino/server)
  registerLightsOutHandlers(io, socket);
  registerFeatureHandlers(io, socket, 'doctrine');
  registerVelumHandlers(io, socket);
  registerFeatureHandlers(io, socket, 'dream-rift');
  registerFeatureHandlers(io, socket, 'laundry-sort');
  registerFeatureHandlers(io, socket, 'gabriels-horn');
  registerGlobeSetHandlers(io, socket);
  // TF2: the server browser and P2P signaling — every match runs in a player's browser.
  registerTf2GameHandlers(io, socket);
  // TF2 peer-to-peer rooms: signaling (and a capped relay fallback) only — the match runs in the host's browser.
  registerTf2P2pHandlers(io, socket);
  // Feature-sliced handlers (redesign A1 step 3; features/<id>/server/, listed in ./features.ts):
  // Balatro multiplayer — signalling, relay fallback, the seat directory, matchmaking/party/invites;
  // Hearthworks multiplayer — room list, signalling, relay fallback, host migration (the world runs in the host's browser).
  registerFeatureHandlers(io, socket);

  // Platform expansion (§4, §5): live Spaces + cross-game party.
  registerSpacesHandlers(io, socket);
  registerPartyHandlers(io, socket);
  registerMatchmakingHandlers(io, socket);
  registerCallHandlers(io, socket);
  registerGroupCallHandlers(io, socket);
  registerControllerHandlers(io, socket);
  // Vibes Discord Activity room: one room per Activity instance, host picks the vibe.
  registerVibeRoomHandlers(io, socket);

  // Disconnect cleanup
  socket.on('disconnect', (reason) => {
    logger.info({ event: 'disconnect', userId, socketId: socket.id, reason });

    handleSpacesDisconnect(io, socket);
    handlePartyDisconnect(io, socket);
    // During shutdown io.close() disconnects everyone at once. Handlers whose
    // disconnect only holds in-memory state for a reconnect (grace windows,
    // queue seats, lobby cleanup timers) are skipped — the process is going
    // away. Everything that persists state (calls, resumable games) still runs.
    // The casino handlers still run too, but find nothing: shutdown() refunded
    // their stakes (or, for durable blackjack tables, saved them) and emptied
    // their tables before calling io.close().
    if (!shuttingDown) handleMatchmakingDisconnect(socket);
    void handleCallDisconnect(io, socket);
    void handleGroupCallDisconnect(io, socket);
    handleControllerDisconnect(io, socket);
    handleVibeRoomDisconnect(io, socket);
    handleFeatureDisconnects(io, socket, 'synapse-storm', shuttingDown);
    handleFeatureDisconnects(io, socket, 'slice-it');
    if (!shuttingDown) handleNeonDriftwayDisconnect(io, socket);
    if (!shuttingDown) handleRmhTypeDisconnect(io, socket);
    handleRmhStudyDisconnect(io, socket);
    handleFeatureDisconnects(io, socket, 'altair');
    handleKowloonKnockoutDisconnect(io, socket);
    handleFeatureDisconnects(io, socket, 'casino');
    handleLightsOutDisconnect(io, socket);
    handleFeatureDisconnects(io, socket, 'doctrine');
    handleVelumDisconnect(io, socket);
    handleFeatureDisconnects(io, socket, 'dream-rift');
    handleFeatureDisconnects(io, socket, 'laundry-sort');
    handleFeatureDisconnects(io, socket, 'gabriels-horn');
    handleGlobeSetDisconnect(io, socket);
    handleTf2GameDisconnect(io, socket);
    handleTf2P2pDisconnect(io, socket);
    handleFeatureDisconnects(io, socket);

    cleanupRateLimits(socket.id);
  });
});

// ─── Graceful shutdown ──────────────────────────────────────────
// (`shuttingDown` is declared near the top of the file: the disconnect
// fan-out above reads it.)

function shutdown(signal: string): void {
  // A second signal must not re-close or arm a second force-exit timer.
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ event: 'shutdown_initiated', signal });

  // Armed first, so nothing below can leave the process without a deadline.
  setTimeout(() => {
    logger.error({ event: 'forced_shutdown', reason: 'timeout' });
    process.exit(1);
  }, config.SHUTDOWN_TIMEOUT_MS);

  // Casino stakes live only in this process. Each module claims every stake
  // that is debited but unsettled (bets in a round in progress, Hold'em stacks
  // and pot contributions) SYNCHRONOUSLY inside this call and marks its tables
  // dead, so it must run before io.close(): the disconnect fan-out that follows
  // then finds nothing to cash out, and no payout timer can pay a refunded
  // stake. The credits themselves are awaited below, before Prisma closes.
  // Bounded to half the force-exit window (Docker's default 10s stop grace —
  // the socket service sets no stop_grace_period) so the pool still closes.
  const casinoDeadlineMs = Math.min(CASINO_SHUTDOWN_DEADLINE_MS, config.SHUTDOWN_TIMEOUT_MS / 2);
  const refundCasino = (game: string, run: (deadlineMs: number) => Promise<unknown>) => {
    try {
      return run(casinoDeadlineMs);
    } catch (err) {
      // A throw here must not stop the other tables, or io.close() below.
      logger.error({ event: 'casino_shutdown_error', game, error: String(err) });
      return Promise.resolve();
    }
  };
  // With CASINO_DURABLE_TABLES=1 blackjack's entry saves its tables to the store instead of refunding
  // them; the store's connection closes once every entry has settled.
  const casinoRefunds = Promise.allSettled(
    CASINO_SHUTDOWN_REFUNDS.map(([game, run]) => refundCasino(game, run)),
  ).then(() => closeCasinoTableStore());

  io.close(() => {
    logger.info({ event: 'sockets_closed' });
  });

  const httpClosed = new Promise<void>((resolve) => {
    httpServer.close(() => {
      logger.info({ event: 'http_server_closed' });
      resolve();
    });
  });

  // Prisma closes only after the refunds have landed (or hit their deadline).
  void Promise.all([casinoRefunds, httpClosed])
    .then(() =>
      Promise.all([disconnectPrisma(), sessionAuth.close()]),
    )
    .catch((err: unknown) => logger.error({ event: 'shutdown_cleanup_error', error: String(err) }))
    .finally(() => process.exit(0));
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// ─── Start listening ────────────────────────────────────────────

// Logs once if the Activity bot token (the vibe room's instance check) is not configured.
initVibeRoomInstanceCheck();

// Taken before `listen`, so the sweep below can tell rooms the previous process
// left behind from rooms this one opens while the sweep is still running.
const bootedAt = new Date();

// Durable casino tables (CASINO_DURABLE_TABLES=1) come back before the hub accepts a connection, so a
// reconnecting player finds the seat already there. Off (the default) this resolves at once.
void adapterReady.then(() => restoreCasinoTables(io)).then(() => httpServer.listen(config.PORT, () => {
  logger.info({ event: 'server_started', port: config.PORT, socketPath: config.SOCKET_PATH });
  if (config.DATABASE_URL) void warmPrismaClient(getPrismaClient(), logger);
  initializeCasino(io);
}));

// Close group-call rows a previous process died holding. History hygiene only:
// it runs after `listen` and never fails the boot, because every other feature
// on this hub must not wait on (or die with) a database that is briefly away.
// Whatever it misses is swept on the next start.
reconcileOrphanedGroupCalls(bootedAt).catch((err: unknown) => {
  logger.warn({ event: 'group_call_orphan_reconciliation_failed', error: String(err) });
});

// Community removals happen in the web tier, which cannot reach this process;
// this is how a removed member leaves the community's voice room.
startCommunityMembershipSweep(io);
