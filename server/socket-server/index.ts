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
import {
  registerSynapseStormHandlers,
  handleSynapseStormDisconnect,
} from './handlers/synapse-storm';
import { registerRmhTypeHandlers, handleRmhTypeDisconnect } from './handlers/rmhtype';
import { registerRmhStudyHandlers, handleRmhStudyDisconnect } from './handlers/rmhstudy';
import {
  registerKowloonKnockoutHandlers,
  handleKowloonKnockoutDisconnect,
} from './handlers/kowloon-knockout';
import { registerStudioJamHandlers } from './handlers/studio-jam';
import { initializeCasino, listCasinoRooms, CASINO_SHUTDOWN_REFUNDS, CASINO_SHUTDOWN_DEADLINE_MS } from '../../features/casino/server';
import { registerLightsOutHandlers, handleLightsOutDisconnect } from './handlers/lights-out';
import { registerVelumHandlers, handleVelumDisconnect } from './handlers/velum';
import { registerLaundrySortHandlers, handleLaundrySortDisconnect } from './handlers/laundry-sort';
import {
  registerGabrielsHornHandlers,
  handleGabrielsHornDisconnect,
} from './handlers/gabriels-horn';
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

import { createAuthCache, createSessionAuth } from '../shared/session-auth';

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

// Discord Activity identity cache (positive results only, same TTL/bound as sessions).
interface CachedAuth {
  userId: string;
  userName: string;
  avatarUrl: string | null;
}
const discordAuthCache = createAuthCache<CachedAuth>();

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

// ─── Discord Activity identity (X10) ─────────────────────────────
//
// An Activity is served from Discord's proxy origin (https://<app-id>
// .discordsays.com), so a cookie scoped to rmhstudios.com is never sent with
// its requests and Better Auth has no session there — for linked accounts as
// much as for anyone else. Without a second identity path, every `slice:*`
// handler answers `auth_required` inside a Discord call.
//
// The token is verified against Discord, server-side, every time. A
// client-supplied Discord user id is never read from anywhere: the id used
// below is the one Discord itself returns for the bearer token.

const DISCORD_API = 'https://discord.com/api/v10';
const DISCORD_VERIFY_TIMEOUT_MS = 5_000;

/**
 * What a verified Discord Activity token resolves to.
 *
 * `userId` is a real site user id when the Discord account is linked, and
 * `null` for a guest — which is the whole distinction `X10` draws. A guest's
 * name and avatar URL live in this object, in memory, for at most
 * the shared auth-cache TTL (60 s) plus the life of the socket. They are never written
 * to a table, and the avatar is referenced at Discord's CDN rather than copied
 * into our storage.
 */
interface DiscordIdentity {
  userId: string | null;
  name: string;
  avatarUrl: string | null;
  /** Absolute epoch-ms at which the Discord token itself stops being valid. */
  expiresAt: number;
}

/** Discord's own default-avatar formula, mirrored from `lib/discord-sdk.ts`. */
function discordAvatarUrl(id: string, avatar: string | null, discriminator: string): string {
  if (avatar) return `https://cdn.discordapp.com/avatars/${id}/${avatar}.png?size=128`;
  const index =
    discriminator === '0' || !discriminator
      ? Number(BigInt(id) >> 22n) % 6
      : Number(discriminator) % 5;
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

/**
 * Verify a Discord Activity access token and resolve who it belongs to.
 *
 * Uses `/oauth2/@me` rather than `/users/@me` (which is what
 * `server/rmhbox/auth.ts` calls) for one reason that matters: its response
 * carries the **application** the token was issued for, so the check below can
 * refuse a perfectly valid Discord token minted for somebody else's app.
 * `/users/@me` cannot tell those apart — any Discord OAuth token in the world
 * passes it — and a hub that seats whoever presents one has no audience
 * binding at all. It also returns the token's own absolute expiry and the user
 * in the same round trip, so this is one outbound call, not two.
 *
 * No client secret is involved: the code→token exchange (the only operation
 * that needs one) stays in `app/routes/api/discord/token.ts` on the web tier.
 * This is the verify half, and verification is Bearer-only.
 */
async function verifyDiscordActivityToken(token: string): Promise<DiscordIdentity | null> {
  const appId = config.DISCORD_ACTIVITY_CLIENT_ID;
  // Fail closed: with no application id there is nothing to bind the token to,
  // and accepting it would mean trusting any Discord app's token.
  if (!appId) return null;

  const res = await fetch(`${DISCORD_API}/oauth2/@me`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(DISCORD_VERIFY_TIMEOUT_MS),
  });
  if (!res.ok) return null;

  const info = (await res.json()) as {
    application?: { id?: string };
    expires?: string;
    user?: {
      id?: string;
      username?: string;
      global_name?: string | null;
      avatar?: string | null;
      discriminator?: string;
    };
  };

  if (info?.application?.id !== appId) return null;

  const expiresAt = Date.parse(info?.expires ?? '');
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;

  const user = info?.user;
  if (!user?.id || typeof user.id !== 'string') return null;

  const name = user.global_name || user.username || 'Guest';
  const avatarUrl = discordAvatarUrl(user.id, user.avatar ?? null, user.discriminator ?? '0');

  // Linked account → a real site identity, indistinguishable downstream from a
  // session login: their scores count and their seat gets the reconnect grace.
  const pool = getAuthPool();
  if (pool) {
    const result = await pool.query(
      `SELECT a."userId", u."name", u."image"
       FROM "account" a
       JOIN "user" u ON u."id" = a."userId"
       WHERE a."providerId" = 'discord' AND a."accountId" = $1
       LIMIT 1`,
      [user.id],
    );
    if (result.rows.length > 0) {
      const row = result.rows[0];
      return {
        userId: row.userId,
        name: row.name || name,
        avatarUrl: row.image || avatarUrl,
        expiresAt,
      };
    }
  }

  // No linked account → a guest. Deliberately NOT given a synthetic id: an id
  // is the thing every persistence path keys on, and minting one here is how a
  // "we store nothing about guests" rule quietly becomes untrue.
  return { userId: null, name, avatarUrl, expiresAt };
}

/** Verified Discord identity → `socket.data`. Returns true when it authenticated. */
async function applyDiscordActivityToken(
  socket: import('socket.io').Socket,
  token: string,
): Promise<boolean> {
  const cached = discordAuthCache.get(`d:${token}`);
  if (cached) {
    if (cached.userId) {
      socket.data.userId = cached.userId;
      socket.data.userName = cached.userName;
      socket.data.avatarUrl = cached.avatarUrl;
    } else {
      socket.data.discordGuest = { name: cached.userName, avatarUrl: cached.avatarUrl };
    }
    return true;
  }

  const identity = await verifyDiscordActivityToken(token);
  if (!identity) return false;

  if (identity.userId) {
    socket.data.userId = identity.userId;
    socket.data.userName = identity.name;
    socket.data.avatarUrl = identity.avatarUrl;
  } else {
    // The ONLY place a guest identity exists. `socket.data.userId` stays unset,
    // which is what keeps every persistence path (leaderboards, runs, the
    // `User` table) from having anything to write.
    socket.data.discordGuest = { name: identity.name, avatarUrl: identity.avatarUrl };
  }

  // A guest carries a null userId; the cache replays it as a guest rather than
  // as an account. The cache never outlives the Discord token's own expiry.
  discordAuthCache.set(
    `d:${token}`,
    { userId: identity.userId as string, userName: identity.name, avatarUrl: identity.avatarUrl },
    identity.expiresAt,
  );
  return true;
}

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

io.use(softAuthMiddleware);

// ─── Connection handler ─────────────────────────────────────────

io.on('connection', (socket) => {
  const userId = (socket.data.userId as string) || 'anonymous';
  const userName = (socket.data.userName as string) || 'Player';
  logger.info({ event: 'connection', userId, userName, socketId: socket.id });

  // Register all game handlers
  registerFeatureHandlers(io, socket, 'slice-it');
  registerNeonDriftwayHandlers(io, socket);
  registerSynapseStormHandlers(io, socket);
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
  registerLaundrySortHandlers(io, socket);
  registerGabrielsHornHandlers(io, socket);
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
    // their stakes and emptied their tables before calling io.close().
    if (!shuttingDown) handleMatchmakingDisconnect(socket);
    void handleCallDisconnect(io, socket);
    void handleGroupCallDisconnect(io, socket);
    handleControllerDisconnect(io, socket);
    if (!shuttingDown) handleSynapseStormDisconnect(io, socket);
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
    handleLaundrySortDisconnect(io, socket);
    handleGabrielsHornDisconnect(io, socket);
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
  const casinoRefunds = Promise.allSettled(CASINO_SHUTDOWN_REFUNDS.map(([game, run]) => refundCasino(game, run)));

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

// Taken before `listen`, so the sweep below can tell rooms the previous process
// left behind from rooms this one opens while the sweep is still running.
const bootedAt = new Date();

void adapterReady.then(() => httpServer.listen(config.PORT, () => {
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
