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
