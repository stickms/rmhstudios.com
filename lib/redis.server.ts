/**
 * Optional Redis backplane (server-only).
 *
 * Provides cross-instance pub/sub, a rate-limit primitive, and a tiny cache
 * helper. Entirely optional: when `REDIS_URL` is unset (or Redis is
 * unreachable) every helper degrades to a no-op/null so callers fall back to
 * their in-process behaviour. This is what makes SSE, rate limits, and the
 * ranking cache correct across multiple instances without becoming a hard
 * dependency for single-instance / local dev.
 */

import Redis from 'ioredis';

const URL = process.env.REDIS_URL || process.env.REDIS_CONNECTION_STRING;

let publisher: Redis | null = null;
let subscriber: Redis | null = null;
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
    };
    publisher = new Redis(URL, opts);
    subscriber = publisher.duplicate();

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
  publisher.publish(channel, JSON.stringify(data)).catch((e) => console.error('[redis] publish failed:', e?.message));
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
    subscriber.subscribe(channel).catch((e) => console.error('[redis] subscribe failed:', e?.message));
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
 * Atomic fixed-window rate limit backed by Redis (shared across instances).
 * Returns null when Redis is unavailable so the caller can fall back to the
 * in-process limiter.
 */
export async function redisRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<{ allowed: boolean; retryAfter: number; limit: number; remaining: number; reset: number } | null> {
  init();
  if (!publisher) return null;
  try {
    const k = `rl:${key}`;
    const count = await publisher.incr(k);
    if (count === 1) await publisher.pexpire(k, windowMs);
    const ttl = await publisher.pttl(k);
    const reset = Date.now() + (ttl > 0 ? ttl : windowMs);
    if (count > limit) {
      return { allowed: false, retryAfter: Math.ceil((ttl > 0 ? ttl : windowMs) / 1000), limit, remaining: 0, reset };
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
  if (!publisher) return null;
  try {
    const next = await publisher.incrby(key, by);
    if (ttlMs && next === by) await publisher.pexpire(key, ttlMs);
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
  ttlMs: number
): Promise<boolean> {
  init();
  if (!publisher) return false;
  try {
    await publisher.sadd(bucketKey, member);
    await publisher.pexpire(bucketKey, ttlMs);
    return true;
  } catch {
    return false;
  }
}

/** Count distinct members across the given presence buckets. Null without Redis. */
export async function redisPresenceCount(bucketKeys: string[]): Promise<number | null> {
  init();
  if (!publisher || bucketKeys.length === 0) return null;
  try {
    if (bucketKeys.length === 1) return await publisher.scard(bucketKeys[0]);
    return await publisher.sunionstore(`presence:tmp:${bucketKeys.join(':')}`, ...bucketKeys)
      .then(async (n) => {
        // sunionstore returns the cardinality of the resulting set.
        await publisher!.pexpire(`presence:tmp:${bucketKeys.join(':')}`, 5_000);
        return n;
      });
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
  if (!publisher) return [];
  try {
    const res = await publisher.spop(key, max);
    return Array.isArray(res) ? res : res ? [res] : [];
  } catch {
    return [];
  }
}

/** Add a member to a set (used to track which counters are dirty). No-op without Redis. */
export async function redisSadd(key: string, member: string): Promise<void> {
  init();
  if (!publisher) return;
  try {
    await publisher.sadd(key, member);
  } catch {
    /* best-effort */
  }
}

/** GETDEL: atomically read and clear a key (drain a buffered counter). Null without Redis. */
export async function redisGetDel(key: string): Promise<string | null> {
  init();
  if (!publisher) return null;
  try {
    // GETDEL is available on Redis 6.2+ (prod runs 7.4).
    return await publisher.getdel(key);
  } catch {
    return null;
  }
}
