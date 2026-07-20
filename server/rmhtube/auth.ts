/**
 * RmhTube WebSocket Authentication Middleware
 *
 * Validates Better Auth session tokens against PostgreSQL on every
 * new connection. Attaches userId, userName, and avatarUrl to
 * socket.data for downstream handlers.
 */

import { Pool } from 'pg';
import { config } from './config';
import type { Socket } from 'socket.io';
import type { ExtendedError } from 'socket.io';

// ─── Database connection pool (shared across auth checks) ───────

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

// ─── Session validation ─────────────────────────────────────────

interface ValidatedSession {
  userId: string;
  userName: string;
  avatarUrl: string | null;
  expiresAt: Date;
}

async function validateSessionToken(token: string): Promise<ValidatedSession | null> {
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
  return {
    userId: row.userId,
    userName: row.name || 'Viewer',
    avatarUrl: row.image || null,
    expiresAt: new Date(row.expiresAt),
  };
}

// ─── Session-token auth cache ───────────────────────────────────
//
// Hard auth validates the Better Auth session token against Postgres on every
// new connection. A reconnection storm (deploy, network blip, tab wake) would
// otherwise fire one `SELECT ... FROM session` per socket on the max-10 auth
// pool. Cache validated sessions for a short TTL in a bounded Map (same
// bounded-map discipline as server/socket-server/index.ts) so repeated
// reconnects from the same clients don't hammer the pool. Only positive,
// still-valid sessions are cached; missing/failed/expired tokens fall through
// to the DB, so accept/reject outcomes are unchanged. A revoked or expired
// session is honoured for at most AUTH_CACHE_TTL_MS.
const AUTH_CACHE_TTL_MS = 60_000;
const AUTH_CACHE_MAX_ENTRIES = 10_000;
const authCache = new Map<string, { session: ValidatedSession; cachedAt: number }>();

const authCacheGc = setInterval(() => {
  const now = Date.now();
  for (const [token, entry] of authCache) {
    if (now - entry.cachedAt >= AUTH_CACHE_TTL_MS || entry.session.expiresAt.getTime() <= now) {
      authCache.delete(token);
    }
  }
}, 30_000);
authCacheGc.unref();

// ─── Socket.io middleware ───────────────────────────────────────

export async function authMiddleware(
  socket: Socket,
  next: (err?: ExtendedError) => void,
): Promise<void> {
  const token = socket.handshake.auth?.token;

  if (!token || typeof token !== 'string') {
    return next(new Error('AUTH_REQUIRED'));
  }

  try {
    const now = Date.now();

    // Cache hit: reuse a recently-validated, still-unexpired session, skip the DB.
    const cached = authCache.get(token);
    if (
      cached &&
      now - cached.cachedAt < AUTH_CACHE_TTL_MS &&
      cached.session.expiresAt.getTime() > now
    ) {
      socket.data.userId = cached.session.userId;
      socket.data.userName = cached.session.userName;
      socket.data.avatarUrl = cached.session.avatarUrl;
      socket.data.sessionToken = token;
      return next();
    }

    const session = await validateSessionToken(token);

    if (!session) {
      return next(new Error('AUTH_FAILED'));
    }

    if (session.expiresAt < new Date()) {
      return next(new Error('SESSION_EXPIRED'));
    }

    socket.data.userId = session.userId;
    socket.data.userName = session.userName;
    socket.data.avatarUrl = session.avatarUrl;
    socket.data.sessionToken = token;

    // Cache the validated session (bounded: evict oldest at capacity).
    if (authCache.size >= AUTH_CACHE_MAX_ENTRIES) {
      const oldest = authCache.keys().next().value;
      if (oldest !== undefined) authCache.delete(oldest);
    }
    authCache.set(token, { session, cachedAt: now });

    next();
  } catch (err) {
    console.error(
      JSON.stringify({
        level: 'error',
        service: 'rmhtube',
        timestamp: new Date().toISOString(),
        event: 'auth_validation_error',
        error: String(err),
      }),
    );
    next(new Error('AUTH_FAILED'));
  }
}

// ─── Cleanup ────────────────────────────────────────────────────

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
