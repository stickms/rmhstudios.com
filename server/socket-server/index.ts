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
import { registerAltairHandlers, handleAltairDisconnect } from './handlers/altair';
import {
  registerKowloonKnockoutHandlers,
  handleKowloonKnockoutDisconnect,
} from './handlers/kowloon-knockout';
import {
  registerRochesterOffensiveHandlers,
  handleRochesterOffensiveDisconnect,
} from './handlers/rochester-offensive';
import { registerRmhMusicHandlers, handleRmhMusicDisconnect } from './handlers/rmhmusic';
import {
  registerBlackjackHandlers,
  handleBlackjackDisconnect,
  initializeBlackjackPublicTable,
} from './handlers/blackjack';
import {
  registerHoldemHandlers,
  handleHoldemDisconnect,
  initializeHoldem,
} from './handlers/holdem';
import {
  registerBaccaratHandlers,
  handleBaccaratDisconnect,
  initializeBaccarat,
} from './handlers/baccarat';
import {
  registerRouletteHandlers,
  handleRouletteDisconnect,
  initializeRoulette,
} from './handlers/roulette';
import { registerLightsOutHandlers, handleLightsOutDisconnect } from './handlers/lights-out';
import { registerDoctrineHandlers, handleDoctrineDisconnect } from './handlers/doctrine';
import { registerVelumHandlers, handleVelumDisconnect } from './handlers/velum';
import { registerDreamRiftHandlers, handleDreamRiftDisconnect } from './handlers/dream-rift';
import {
  registerRmhFarmingSimHandlers,
  handleRmhFarmingSimDisconnect,
} from './handlers/rmh-farming-sim';
import { registerLaundrySortHandlers, handleLaundrySortDisconnect } from './handlers/laundry-sort';
import {
  registerGabrielsHornHandlers,
  handleGabrielsHornDisconnect,
} from './handlers/gabriels-horn';
import {
  registerMassiveMarchHandlers,
  handleMassiveMarchDisconnect,
} from './handlers/massive-march';
import { registerBumsRushHandlers, handleBumsRushDisconnect } from './handlers/bums-rush';
import { registerSpacesHandlers, handleSpacesDisconnect } from './handlers/spaces';
import { registerPartyHandlers, handlePartyDisconnect } from './handlers/party';
import { registerCallHandlers, handleCallDisconnect } from './handlers/call';
import { registerGroupCallHandlers, handleGroupCallDisconnect } from './handlers/group-call';

// ─── Startup validation ─────────────────────────────────────────

if (!config.CORS_ORIGIN) {
  logger.error({
    event: 'fatal_missing_cors',
    message: 'SOCKET_CORS_ORIGIN environment variable is required',
  });
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

// ─── Session-token auth cache ────────────────────────────────────
//
// softAuthMiddleware validates the Better Auth session token against Postgres
// on every connection. A reconnection storm (deploy, network blip, tab wake)
// would otherwise fire one `SELECT ... FROM session` per socket on the max-10
// auth pool. Cache validated tokens for a short TTL in a bounded Map (same
// bounded-map discipline as server/shared/rate-limit.ts) so repeated reconnects
// from the same clients don't hammer the pool. Only positive validations are
// cached; tokenless connections skip the cache entirely, so soft-auth semantics
// (anonymous connections still allowed) are unchanged. A revoked session is
// honoured for at most AUTH_CACHE_TTL_MS.
interface CachedAuth {
  userId: string;
  userName: string;
  avatarUrl: string | null;
  sessionExpiresAt: number; // ms epoch — the session row's own expiry
  cachedAt: number; // ms epoch — when we validated it
}

const AUTH_CACHE_TTL_MS = 60_000;
const AUTH_CACHE_MAX_ENTRIES = 10_000;
const authCache = new Map<string, CachedAuth>();

const authCacheGc = setInterval(() => {
  const now = Date.now();
  for (const [token, entry] of authCache) {
    if (now - entry.cachedAt >= AUTH_CACHE_TTL_MS || entry.sessionExpiresAt <= now) {
      authCache.delete(token);
    }
  }
}, 30_000);
authCacheGc.unref();

function cacheAuth(key: string, entry: CachedAuth): void {
  // Bounded, same discipline as server/shared/rate-limit.ts: evict oldest at
  // capacity rather than letting a token space nobody controls grow forever.
  if (authCache.size >= AUTH_CACHE_MAX_ENTRIES) {
    const oldest = authCache.keys().next().value;
    if (oldest !== undefined) authCache.delete(oldest);
  }
  authCache.set(key, entry);
}

function readCachedAuth(key: string): CachedAuth | null {
  const now = Date.now();
  const cached = authCache.get(key);
  if (cached && now - cached.cachedAt < AUTH_CACHE_TTL_MS && cached.sessionExpiresAt > now) {
    return cached;
  }
  return null;
}

/**
 * Better Auth session token → `socket.data`. Returns true when it authenticated.
 *
 * Unchanged behaviour, lifted out of the middleware so the Discord path below
 * can be a peer rather than a special case bolted onto it.
 */
async function applySessionToken(
  socket: import('socket.io').Socket,
  token: string,
): Promise<boolean> {
  const cached = readCachedAuth(`s:${token}`);
  if (cached) {
    socket.data.userId = cached.userId;
    socket.data.userName = cached.userName;
    socket.data.avatarUrl = cached.avatarUrl;
    socket.data.sessionToken = token;
    return true;
  }

  const pool = getAuthPool();
  if (!pool) return false;

  const result = await pool.query(
    `SELECT s."userId", s."expiresAt", u."name", u."image"
     FROM "session" s
     JOIN "user" u ON u."id" = s."userId"
     WHERE s."token" = $1
     LIMIT 1`,
    [token],
  );

  if (result.rows.length === 0) return false;

  const row = result.rows[0];
  const expiresAt = new Date(row.expiresAt);
  if (expiresAt <= new Date()) return false;

  const userName = row.name || 'Player';
  const avatarUrl = row.image || null;
  socket.data.userId = row.userId;
  socket.data.userName = userName;
  socket.data.avatarUrl = avatarUrl;
  socket.data.sessionToken = token;
  cacheAuth(`s:${token}`, {
    userId: row.userId,
    userName,
    avatarUrl,
    sessionExpiresAt: expiresAt.getTime(),
    cachedAt: Date.now(),
  });
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
 * {@link AUTH_CACHE_TTL_MS} plus the life of the socket. They are never written
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
    user?: { id?: string; username?: string; global_name?: string | null; avatar?: string | null; discriminator?: string };
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
  const cached = readCachedAuth(`d:${token}`);
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

  cacheAuth(`d:${token}`, {
    // A cache row for a guest carries a null userId; `readCachedAuth` above
    // replays it as a guest rather than as an account.
    userId: identity.userId as string,
    userName: identity.name,
    avatarUrl: identity.avatarUrl,
    // The token's own expiry, absolute — the cache never outlives the
    // credential it was derived from.
    sessionExpiresAt: identity.expiresAt,
    cachedAt: Date.now(),
  });
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
  const token = socket.handshake.auth?.token;
  const discordToken = socket.handshake.auth?.discordToken;

  try {
    if (typeof token === 'string' && token) {
      await applySessionToken(socket, token);
    }
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
  // Resume a briefly-dropped connection (network blip, tab sleep) without a
  // full re-handshake: Socket.IO restores the socket's id, rooms, data, and
  // replays missed packets. rmhbox/rmhtube already enable this; socket-server
  // did not, so every blip forced a fresh connection + auth round-trip.
  connectionStateRecovery: {},
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
  registerKowloonKnockoutHandlers(io, socket);
  registerRochesterOffensiveHandlers(io, socket);
  registerRmhMusicHandlers(io, socket);
  registerBlackjackHandlers(io, socket);
  registerHoldemHandlers(io, socket);
  registerBaccaratHandlers(io, socket);
  registerRouletteHandlers(io, socket);
  registerLightsOutHandlers(io, socket);
  registerDoctrineHandlers(io, socket);
  registerVelumHandlers(io, socket);
  registerDreamRiftHandlers(io, socket);
  registerRmhFarmingSimHandlers(io, socket);
  registerLaundrySortHandlers(io, socket);
  registerGabrielsHornHandlers(io, socket);
  registerMassiveMarchHandlers(io, socket);
  registerBumsRushHandlers(io, socket);

  // Platform expansion (§4, §5): live Spaces + cross-game party.
  registerSpacesHandlers(io, socket);
  registerPartyHandlers(io, socket);
  registerCallHandlers(io, socket);
  registerGroupCallHandlers(io, socket);

  // Disconnect cleanup
  socket.on('disconnect', (reason) => {
    logger.info({ event: 'disconnect', userId, socketId: socket.id, reason });

    handleSpacesDisconnect(io, socket);
    handlePartyDisconnect(io, socket);
    void handleCallDisconnect(io, socket);
    void handleGroupCallDisconnect(io, socket);
    handleSynapseStormDisconnect(io, socket);
    handleSliceItDisconnect(io, socket);
    handleNeonDriftwayDisconnect(io, socket);
    handleRmhTypeDisconnect(io, socket);
    handleRmhStudyDisconnect(io, socket);
    handleAltairDisconnect(io, socket);
    handleKowloonKnockoutDisconnect(io, socket);
    handleRochesterOffensiveDisconnect(io, socket);
    handleRmhMusicDisconnect(io, socket);
    handleBlackjackDisconnect(io, socket);
    handleHoldemDisconnect(io, socket);
    handleBaccaratDisconnect(io, socket);
    handleRouletteDisconnect(io, socket);
    handleLightsOutDisconnect(io, socket);
    handleDoctrineDisconnect(io, socket);
    handleVelumDisconnect(io, socket);
    handleDreamRiftDisconnect(io, socket);
    handleRmhFarmingSimDisconnect(io, socket);
    handleLaundrySortDisconnect(io, socket);
    handleGabrielsHornDisconnect(io, socket);
    handleMassiveMarchDisconnect(io, socket);
    handleBumsRushDisconnect(io, socket);

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
  initializeBlackjackPublicTable(io);
  initializeHoldem(io);
  initializeBaccarat(io);
  initializeRoulette(io);
});
