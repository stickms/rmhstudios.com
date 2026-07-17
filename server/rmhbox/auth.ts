import { Pool } from 'pg';
import { config } from './config';
import type { Socket } from 'socket.io';
import type { ExtendedError } from 'socket.io';

// ─── Database connection pool ────────────────────────────────────

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: config.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
  }
  return pool;
}

// ─── Identity resolution ─────────────────────────────────────────

interface ValidatedIdentity {
  userId: string;
  userName: string;
  avatarUrl: string | null;
}

// Distinct outcomes so the middleware can surface an expired session as
// SESSION_EXPIRED (a valid row past its expiry) vs AUTH_FAILED (no such token).
// On success the session's own expiry is returned alongside the identity so the
// auth cache can honour it (see below).
async function validateSessionToken(
  token: string,
): Promise<{ identity: ValidatedIdentity; expiresAt: number } | 'expired' | null> {
  const db = getPool();
  const result = await db.query(
    `SELECT s."userId", s."expiresAt", u."name", u."image"
     FROM "session" s
     JOIN "user" u ON u."id" = s."userId"
     WHERE s."token" = $1
     LIMIT 1`,
    [token],
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  const expiresAt = new Date(row.expiresAt);
  if (expiresAt < new Date()) return 'expired';

  return {
    identity: {
      userId: row.userId,
      userName: row.name || 'Player',
      avatarUrl: row.image || null,
    },
    expiresAt: expiresAt.getTime(),
  };
}

/**
 * Validates a Discord OAuth2 access token by calling Discord's API,
 * then resolves to a linked site account if one exists, otherwise
 * falls back to a transient Discord identity (userId = "discord:<id>").
 */
async function validateDiscordToken(discordToken: string): Promise<ValidatedIdentity | null> {
  const userRes = await fetch('https://discord.com/api/v10/users/@me', {
    headers: { Authorization: `Bearer ${discordToken}` },
  });

  if (!userRes.ok) return null;

  const discordUser = await userRes.json();
  const discordId: string = discordUser.id;
  const discordName: string = discordUser.global_name || discordUser.username;
  const discordAvatar: string | null = discordUser.avatar
    ? `https://cdn.discordapp.com/avatars/${discordId}/${discordUser.avatar}.png`
    : null;

  // Check if this Discord account is linked to a site user
  const db = getPool();
  const result = await db.query(
    `SELECT a."userId", u."name", u."image"
     FROM "account" a
     JOIN "user" u ON u."id" = a."userId"
     WHERE a."providerId" = 'discord' AND a."accountId" = $1
     LIMIT 1`,
    [discordId],
  );

  if (result.rows.length > 0) {
    const row = result.rows[0];
    return {
      userId: row.userId,
      userName: row.name || discordName,
      avatarUrl: row.image || discordAvatar,
    };
  }

  // No linked account — use Discord identity directly
  return {
    userId: `discord:${discordId}`,
    userName: discordName,
    avatarUrl: discordAvatar,
  };
}

// ─── Identity auth cache ─────────────────────────────────────────
//
// Hard auth validates every connection: the session path runs a `SELECT ...
// FROM session` and the Discord path makes an outbound Discord API call plus an
// `account` lookup — per socket. A reconnection storm (deploy, network blip)
// would fan out N of these on the max-10 pool (and N Discord calls). Cache
// positive validations for a short TTL in a bounded Map (same discipline as
// server/socket-server/index.ts) so repeated reconnects from the same clients
// reuse the result. Keys are namespaced by auth kind ("s:" session, "d:"
// Discord) so the two token spaces never collide. Only successful validations
// are cached; missing / failed / expired tokens fall through and keep their
// exact accept/reject outcome. A revoked session/token is honoured for at most
// AUTH_CACHE_TTL_MS.
const AUTH_CACHE_TTL_MS = 60_000;
const AUTH_CACHE_MAX_ENTRIES = 10_000;
// expiresAt: ms epoch for sessions; POSITIVE_INFINITY for Discord identities
// (their staleness is bounded solely by the TTL, not a session-row expiry).
interface CachedIdentity {
  identity: ValidatedIdentity;
  expiresAt: number;
  cachedAt: number;
}
const authCache = new Map<string, CachedIdentity>();

const authCacheGc = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of authCache) {
    if (now - entry.cachedAt >= AUTH_CACHE_TTL_MS || entry.expiresAt <= now) {
      authCache.delete(key);
    }
  }
}, 30_000);
authCacheGc.unref();

function getCachedIdentity(key: string): ValidatedIdentity | null {
  const now = Date.now();
  const cached = authCache.get(key);
  if (cached && now - cached.cachedAt < AUTH_CACHE_TTL_MS && cached.expiresAt > now) {
    return cached.identity;
  }
  return null;
}

function cacheIdentity(key: string, identity: ValidatedIdentity, expiresAt: number): void {
  if (authCache.size >= AUTH_CACHE_MAX_ENTRIES) {
    const oldest = authCache.keys().next().value;
    if (oldest !== undefined) authCache.delete(oldest);
  }
  authCache.set(key, { identity, expiresAt, cachedAt: Date.now() });
}

/**
 * Test-only: clear the in-process auth cache. The cache is a module-level
 * singleton, so unit tests that exercise the DB path must reset it between
 * cases (otherwise a prior test's cached success short-circuits the DB call).
 */
export function __resetAuthCache(): void {
  authCache.clear();
}

// ─── Socket.io middleware ────────────────────────────────────────

export async function authMiddleware(
  socket: Socket,
  next: (err?: ExtendedError) => void,
): Promise<void> {
  const { token, discordToken, channelId, guildId } = socket.handshake.auth ?? {};

  try {
    // Discord Activity path: validate the OAuth2 access token from the Discord SDK
    if (discordToken && typeof discordToken === 'string') {
      let identity = getCachedIdentity(`d:${discordToken}`);
      if (!identity) {
        identity = await validateDiscordToken(discordToken);
        if (!identity) return next(new Error('AUTH_FAILED'));
        cacheIdentity(`d:${discordToken}`, identity, Number.POSITIVE_INFINITY);
      }

      socket.data.userId = identity.userId;
      socket.data.userName = identity.userName;
      socket.data.avatarUrl = identity.avatarUrl;
      // Voice-channel context for auto-connecting players in the same voice chat.
      socket.data.discordChannelId = typeof channelId === 'string' ? channelId : null;
      socket.data.discordGuildId = typeof guildId === 'string' ? guildId : null;
      return next();
    }

    // Better Auth session token path (site-login users)
    if (!token || typeof token !== 'string') {
      return next(new Error('AUTH_REQUIRED'));
    }

    // Cache hit: reuse a recently-validated, still-unexpired session, skip the DB.
    const cachedIdentity = getCachedIdentity(`s:${token}`);
    if (cachedIdentity) {
      socket.data.userId = cachedIdentity.userId;
      socket.data.userName = cachedIdentity.userName;
      socket.data.avatarUrl = cachedIdentity.avatarUrl;
      socket.data.sessionToken = token;
      return next();
    }

    const result = await validateSessionToken(token);
    if (result === 'expired') return next(new Error('SESSION_EXPIRED'));
    if (!result) return next(new Error('AUTH_FAILED'));

    socket.data.userId = result.identity.userId;
    socket.data.userName = result.identity.userName;
    socket.data.avatarUrl = result.identity.avatarUrl;
    socket.data.sessionToken = token;
    cacheIdentity(`s:${token}`, result.identity, result.expiresAt);
    next();
  } catch (err) {
    console.error(
      JSON.stringify({
        level: 'error',
        timestamp: new Date().toISOString(),
        event: 'auth_validation_error',
        error: String(err),
      }),
    );
    next(new Error('AUTH_FAILED'));
  }
}

// ─── Cleanup ─────────────────────────────────────────────────────

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
