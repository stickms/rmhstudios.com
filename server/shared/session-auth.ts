/**
 * One Better Auth session check for every Node realtime hub (audit D2, step 1).
 *
 * socket-server (soft auth), rmhbox and rmhtube (hard auth) used to each carry
 * their own copy of: token extraction, the `session JOIN user` lookup, the
 * expiry check and a 60 s bounded positive-result cache. They now share this.
 *
 * What every hub accepts today is exactly ONE credential form: the raw Better
 * Auth session token in the socket.io handshake `auth.token`. No hub reads the
 * cookie, a bearer header or a `?token=` query, so none is accepted here —
 * widening the accepted forms is a security change, not a dedupe. The
 * extraction is isolated in {@link extractSessionToken} so that change is one
 * function when it is made deliberately.
 *
 * What differs per hub is only the *policy* around the result, which stays in
 * each hub's adapter: socket-server ignores any non-`ok` outcome (anonymous is
 * allowed), rmhbox/rmhtube map `expired` -> SESSION_EXPIRED, `not_found` ->
 * AUTH_FAILED, `no_token` -> AUTH_REQUIRED. The one cosmetic per-hub difference,
 * the fallback display name when `user.name` is empty ('Player' vs 'Viewer'),
 * is the `defaultName` option.
 *
 * Discord Activity OAuth is a different credential and stays in the hubs; they
 * reuse {@link SessionAuth.getPool} for the linked-account lookup and
 * {@link createAuthCache} for their cache so the TTL/bound live in one place.
 */

import { Pool } from 'pg';
import { guardPool } from '../../lib/perf/process-guards';

/** Strictest TTL any hub used: a revoked session is honoured for at most this. */
export const AUTH_CACHE_TTL_MS = 60_000;
export const AUTH_CACHE_MAX_ENTRIES = 10_000;
const AUTH_CACHE_GC_MS = 30_000;

// ─── Bounded TTL cache ──────────────────────────────────────────

export interface AuthCache<T> {
  /** Hit only while inside the TTL AND before the entry's own `expiresAt`. */
  get(key: string): T | null;
  /** `expiresAt` is ms epoch (POSITIVE_INFINITY when only the TTL bounds it). */
  set(key: string, value: T, expiresAt: number): void;
  clear(): void;
  readonly size: number;
}

export function createAuthCache<T>(): AuthCache<T> {
  const map = new Map<string, { value: T; expiresAt: number; cachedAt: number }>();

  const gc = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of map) {
      if (now - entry.cachedAt >= AUTH_CACHE_TTL_MS || entry.expiresAt <= now) map.delete(key);
    }
  }, AUTH_CACHE_GC_MS);
  gc.unref();

  return {
    get(key) {
      const now = Date.now();
      const hit = map.get(key);
      if (hit && now - hit.cachedAt < AUTH_CACHE_TTL_MS && hit.expiresAt > now) return hit.value;
      return null;
    },
    set(key, value, expiresAt) {
      // Bounded: evict oldest at capacity rather than letting a token space
      // nobody controls grow forever (same discipline as shared/rate-limit.ts).
      if (map.size >= AUTH_CACHE_MAX_ENTRIES) {
        const oldest = map.keys().next().value;
        if (oldest !== undefined) map.delete(oldest);
      }
      map.set(key, { value, expiresAt, cachedAt: Date.now() });
    },
    clear() {
      map.clear();
    },
    get size() {
      return map.size;
    },
  };
}

// ─── Token extraction ───────────────────────────────────────────

/** The part of a socket.io handshake the session check reads. */
export interface SessionHandshake {
  auth?: Record<string, unknown> | null;
}

/** Raw session token from `handshake.auth.token`, or null when absent/non-string/empty. */
export function extractSessionToken(handshake: SessionHandshake | undefined): string | null {
  const token = handshake?.auth?.token;
  return typeof token === 'string' && token ? token : null;
}

// ─── Session resolution ─────────────────────────────────────────

export interface ResolvedSession {
  userId: string;
  name: string;
  image: string | null;
  token: string;
  /** ms epoch — the session row's own expiry. */
  expiresAt: number;
}

export type SessionLookup =
  | { status: 'ok'; session: ResolvedSession }
  | { status: 'no_token' }
  | { status: 'not_found' }
  | { status: 'expired' }
  /** No DATABASE_URL (and no injected pool): nothing can be validated. */
  | { status: 'unavailable' };

type QueryPool = Pick<Pool, 'query' | 'end'>;

export interface SessionAuthOptions {
  /** Pool label for guardPool logs ('socket-server' | 'rmhbox' | 'rmhtube'). */
  service: string;
  databaseUrl?: string;
  /** Display name when `user.name` is empty. */
  defaultName: string;
  /** Test seam: a pool-like object to use instead of creating one. */
  pool?: QueryPool;
}

export interface SessionAuth {
  resolveSocketSession(handshake: SessionHandshake | undefined): Promise<SessionLookup>;
  /** The shared auth pool (null without a database) — for hub-specific lookups. */
  getPool(): QueryPool | null;
  /** Test-only: drop cached sessions. */
  resetCache(): void;
  close(): Promise<void>;
}

export function createSessionAuth(opts: SessionAuthOptions): SessionAuth {
  let pool: QueryPool | null = opts.pool ?? null;
  const cache = createAuthCache<ResolvedSession>();

  function getPool(): QueryPool | null {
    if (!pool && opts.databaseUrl) {
      // guardPool: an idle client dropped by a Postgres restart must not crash the hub.
      pool = guardPool(
        new Pool({
          connectionString: opts.databaseUrl,
          // perf: one session lookup per connect, 4 is plenty; override with AUTH_DB_POOL_SIZE.
          max: Number(process.env.AUTH_DB_POOL_SIZE) || 4,
          idleTimeoutMillis: 30_000,
          connectionTimeoutMillis: 5_000,
        }),
        { service: opts.service, pool: 'auth' },
      );
    }
    return pool;
  }

  return {
    getPool,
    async resolveSocketSession(handshake) {
      const token = extractSessionToken(handshake);
      if (!token) return { status: 'no_token' };

      const key = `s:${token}`;
      const cached = cache.get(key);
      if (cached) return { status: 'ok', session: cached };

      const db = getPool();
      if (!db) return { status: 'unavailable' };

      const result = await db.query(
        `SELECT s."userId", s."expiresAt", u."name", u."image"
         FROM "session" s
         JOIN "user" u ON u."id" = s."userId"
         WHERE s."token" = $1
         LIMIT 1`,
        [token],
      );
      if (result.rows.length === 0) return { status: 'not_found' };

      const row = result.rows[0];
      const expiresAt = new Date(row.expiresAt).getTime();
      if (expiresAt <= Date.now()) return { status: 'expired' };

      const session: ResolvedSession = {
        userId: row.userId,
        name: row.name || opts.defaultName,
        image: row.image || null,
        token,
        expiresAt,
      };
      cache.set(key, session, expiresAt);
      return { status: 'ok', session };
    },
    resetCache: () => cache.clear(),
    async close() {
      if (pool) {
        const p = pool;
        pool = null;
        await p.end();
      }
    },
  };
}
