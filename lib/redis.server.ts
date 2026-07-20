/**
 * Optional Redis backplane (server-only).
 *
 * Provides cross-instance pub/sub, a rate-limit primitive, and a tiny cache
 * helper. Entirely optional: when `REDIS_URL` is unset (or Redis is
 * unreachable) every helper degrades to a no-op/null so callers fall back to
 * their in-process behaviour. This is what makes SSE, rate limits, and the
 * ranking cache correct across multiple instances without becoming a hard
 * dependency for single-instance / local dev.
 *
 * Cache vs. state split (rewrite R0-T2). `REDIS_URL` is the CACHE plane — it is
 * evictable (`allkeys-lru`), so pub/sub transport and cache reads/writes
 * (redisGetJSON/SetJSON/Del) live here. `REDIS_STATE_URL`, when set, is a
 * separate durable plane (`noeviction` + AOF) for keys we cannot afford to lose
 * to eviction: rate-limit counters, the view/counter buffers, presence sets,
 * and dirty-set drains. When `REDIS_STATE_URL` is unset the state helpers reuse
 * the main connection, so behaviour is byte-identical to before this split —
 * the second plane is opt-in via config + the `redis-state` compose service.
 */

import Redis from 'ioredis';

const URL = process.env.REDIS_URL || process.env.REDIS_CONNECTION_STRING;
const STATE_URL = process.env.REDIS_STATE_URL;

let publisher: Redis | null = null;
let subscriber: Redis | null = null;
// Durable-state plane. Equals `publisher` unless REDIS_STATE_URL points
// elsewhere, in which case it's a dedicated connection to the noeviction Redis.
let statePublisher: Redis | null = null;
let initialized = false;

// channel -> local handlers fed by the shared subscriber connection.
const channelHandlers = new Map<string, Set<(data: unknown) => void>>();

function init(): void {
  if (initialized) return;
  initialized = true;
  if (!URL) return;

  try {
    const opts = {
      // Cap reconnect/backoff so a Redis outage never wedges a request path.
      maxRetriesPerRequest: 2,
      retryStrategy: (times: number) => Math.min(times * 200, 2000),
      lazyConnect: false,
      // Bound the TCP connect so an unroutable or misconfigured host fails fast
      // instead of sitting in ioredis's 10s default.
      connectTimeout: 2000,
      // REJECT commands while disconnected instead of buffering them. ioredis
      // defaults this to true, which queues commands until a connection is
      // (re)established — and because retryStrategy above ALWAYS returns a delay
      // (it never returns null to stop retrying), the client reconnects forever,
      // so a queued command never settles. The `try/catch -> return null` in
      // redisGetJSON/redisSetJSON then never runs and the caller's await hangs
      // instead of degrading, which defeats this module's "entirely optional"
      // contract (see the file docblock).
      //
      // Observed in production: with Redis unreachable, the anonymous homepage
      // fanned out ~40 L2 reads via getUserDisplayMap and blocked ~28s, while
      // Postgres sat idle and every route that skips Redis (/login, /api/health)
      // served in ~50ms. Failing the command fast makes those reads a cache miss
      // that falls through to Postgres, which is the intended degraded path.
      enableOfflineQueue: false,
    };
    publisher = new Redis(URL, opts);
    // The subscriber is NOT a request-path connection: it holds long-lived
    // channel subscriptions that ioredis re-issues automatically on reconnect.
    // Keep ITS offline queue enabled so a subscribe() issued while the link is
    // down is replayed rather than rejected — otherwise a transient blip would
    // silently drop this process's SSE fan-out. Only the command planes below
    // (publisher / statePublisher) need to fail fast.
    subscriber = publisher.duplicate({ enableOfflineQueue: true });

    // Durable-state plane: a dedicated connection only when REDIS_STATE_URL is
    // set AND differs from the cache URL; otherwise reuse `publisher` so nothing
    // changes for single-Redis deployments.
    if (STATE_URL && STATE_URL !== URL) {
      statePublisher = new Redis(STATE_URL, opts);
      statePublisher.on('error', (e) => console.error('[redis] state error:', e?.message));
    } else {
      statePublisher = publisher;
    }

    publisher.on('error', (e) => console.error('[redis] publisher error:', e?.message));
    subscriber.on('error', (e) => console.error('[redis] subscriber error:', e?.message));

    subscriber.on('message', (channel: string, message: string) => {
      const set = channelHandlers.get(channel);
      if (!set || set.size === 0) return;
      let data: unknown;
      try {
        data = JSON.parse(message);
      } catch {
        return;
      }
      for (const handler of set) {
        try {
          handler(data);
        } catch (err) {
          console.error('[redis] handler threw:', err);
        }
      }
    });
  } catch (err) {
    console.error('[redis] init failed; falling back to in-process:', err);
    publisher = null;
    subscriber = null;
    statePublisher = null;
  }
}

/** True when a Redis backplane is configured and clients were created. */
export function redisEnabled(): boolean {
  init();
  return !!publisher && !!subscriber;
}

/**
 * Publish a JSON message to a channel. Returns false (so callers can fall back
 * to local delivery) when Redis isn't available.
 */
export function redisPublish(channel: string, data: unknown): boolean {
  init();
  if (!publisher) return false;
  publisher
    .publish(channel, JSON.stringify(data))
    .catch((e) => console.error('[redis] publish failed:', e?.message));
  return true;
}

/**
 * Subscribe a handler to a channel. Multiple handlers share a single Redis
 * SUBSCRIBE (ref-counted); the returned function unsubscribes that handler.
 */
export function redisSubscribe(channel: string, handler: (data: unknown) => void): () => void {
  init();
  if (!subscriber) return () => {};

  let set = channelHandlers.get(channel);
  if (!set) {
    set = new Set();
    channelHandlers.set(channel, set);
    subscriber
      .subscribe(channel)
      .catch((e) => console.error('[redis] subscribe failed:', e?.message));
  }
  set.add(handler);

  return () => {
    const s = channelHandlers.get(channel);
    if (!s) return;
    s.delete(handler);
    if (s.size === 0) {
      channelHandlers.delete(channel);
      subscriber?.unsubscribe(channel).catch(() => {});
    }
  };
}

/**
 * Fixed-window limiter as one atomic script: INCR the counter, stamp the window
 * TTL only on the first hit (count == 1), and return the new count plus the
 * remaining TTL in a single round-trip. Replaces the old INCR → PEXPIRE → PTTL
 * sequence (3 sequential awaits, and a race window where the key could persist
 * with no expiry if a request died between INCR and PEXPIRE).
 */
const RATE_LIMIT_LUA = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[1]))
end
return {count, redis.call('PTTL', KEYS[1])}
`;

/**
 * Atomic fixed-window rate limit backed by Redis (shared across instances).
 * Returns null when Redis is unavailable so the caller can fall back to the
 * in-process limiter.
 */
export async function redisRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<{
  allowed: boolean;
  retryAfter: number;
  limit: number;
  remaining: number;
  reset: number;
} | null> {
  init();
  if (!statePublisher) return null;
  try {
    const k = `rl:${key}`;
    // Single round-trip: INCR, set the window TTL on the first hit only, and
    // read the remaining TTL back — atomically, so concurrent requests can't
    // race between the INCR and the PEXPIRE and leave a key with no expiry.
    const res = (await statePublisher.eval(RATE_LIMIT_LUA, 1, k, String(windowMs))) as [
      number,
      number,
    ];
    const count = Number(res[0]);
    const ttl = Number(res[1]);
    const reset = Date.now() + (ttl > 0 ? ttl : windowMs);
    if (count > limit) {
      return {
        allowed: false,
        retryAfter: Math.ceil((ttl > 0 ? ttl : windowMs) / 1000),
        limit,
        remaining: 0,
        reset,
      };
    }
    return { allowed: true, retryAfter: 0, limit, remaining: Math.max(0, limit - count), reset };
  } catch (e) {
    console.error('[redis] rate limit failed:', (e as Error)?.message);
    return null;
  }
}

/** Get a JSON value from the shared cache, or null. No-op when Redis is off. */
export async function redisGetJSON<T>(key: string): Promise<T | null> {
  init();
  if (!publisher) return null;
  try {
    const raw = await publisher.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** Set a JSON value with a TTL (ms). No-op when Redis is off. */
export async function redisSetJSON(key: string, value: unknown, ttlMs: number): Promise<void> {
  init();
  if (!publisher) return;
  try {
    await publisher.set(key, JSON.stringify(value), 'PX', ttlMs);
  } catch {
    /* best-effort */
  }
}

/** Delete one or more keys. No-op when Redis is off. */
export async function redisDel(...keys: string[]): Promise<void> {
  init();
  if (!publisher || keys.length === 0) return;
  try {
    await publisher.del(...keys);
  } catch {
    /* best-effort */
  }
}

/**
 * Atomically add `by` to a counter and return the new value, setting a TTL on
 * first touch so orphaned counters self-expire. Returns null when Redis is off
 * so callers can fall back (e.g. write straight to Postgres).
 */
export async function redisIncrBy(key: string, by: number, ttlMs?: number): Promise<number | null> {
  init();
  if (!statePublisher) return null;
  try {
    const next = await statePublisher.incrby(key, by);
    if (ttlMs && next === by) await statePublisher.pexpire(key, ttlMs);
    return next;
  } catch {
    return null;
  }
}

/**
 * Presence: mark a member active in a time-bucketed set with a TTL, and count
 * distinct active members across the recent buckets. Used to compute an
 * "online now" count without hammering Postgres. No-op / null without Redis.
 */
export async function redisPresenceMark(
  member: string,
  bucketKey: string,
  ttlMs: number,
): Promise<boolean> {
  init();
  if (!statePublisher) return false;
  try {
    await statePublisher.sadd(bucketKey, member);
    await statePublisher.pexpire(bucketKey, ttlMs);
    return true;
  } catch {
    return false;
  }
}

/** Count distinct members across the given presence buckets. Null without Redis. */
export async function redisPresenceCount(bucketKeys: string[]): Promise<number | null> {
  init();
  if (!statePublisher || bucketKeys.length === 0) return null;
  try {
    if (bucketKeys.length === 1) return await statePublisher.scard(bucketKeys[0]);
    // Only the cardinality is needed, so union in-memory (SUNION) rather than
    // materializing a temp key (SUNIONSTORE) that then needs a PEXPIRE and later
    // eviction — one command, no extra write, nothing to clean up.
    const members = await statePublisher.sunion(...bucketKeys);
    return members.length;
  } catch {
    return null;
  }
}

/**
 * Pop up to `max` members from a Redis set (used to drain buffered counter
 * keys for flushing). Returns [] without Redis. Uses SPOP which is atomic.
 */
export async function redisSpop(key: string, max: number): Promise<string[]> {
  init();
  if (!statePublisher) return [];
  try {
    const res = await statePublisher.spop(key, max);
    return Array.isArray(res) ? res : res ? [res] : [];
  } catch {
    return [];
  }
}

/** Add a member to a set (used to track which counters are dirty). No-op without Redis. */
export async function redisSadd(key: string, member: string): Promise<void> {
  init();
  if (!statePublisher) return;
  try {
    await statePublisher.sadd(key, member);
  } catch {
    /* best-effort */
  }
}

/** GETDEL: atomically read and clear a key (drain a buffered counter). Null without Redis. */
export async function redisGetDel(key: string): Promise<string | null> {
  init();
  if (!statePublisher) return null;
  try {
    // GETDEL is available on Redis 6.2+ (prod runs 7.4).
    return await statePublisher.getdel(key);
  } catch {
    return null;
  }
}
