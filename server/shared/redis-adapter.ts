/**
 * Opt-in Socket.IO Redis adapter (audit D2, step 2).
 *
 * Lays the cross-instance backplane only: with `REDIS_URL` set and reachable at
 * boot, room broadcasts / `io.to(room).emit` fan out through Redis pub/sub.
 * With it unset, or if the connection fails, the hub logs once and keeps the
 * default in-memory adapter — the hub must always start.
 *
 * This does NOT make a second replica safe. Room/lobby state still lives in
 * process memory (durable rooms are the next D2 slice), so do not raise
 * compose replica counts on the strength of this alone.
 *
 * Uses the cache-plane URL (`REDIS_URL`, same as lib/redis.server.ts): adapter
 * traffic is ephemeral pub/sub and needs no durability.
 */

import Redis from 'ioredis';
import { createAdapter } from '@socket.io/redis-adapter';
import type { Server } from 'socket.io';

interface AdapterLogger {
  info(entry: Record<string, unknown>): void;
  warn(entry: Record<string, unknown>): void;
}

export interface RedisAdapterHandle {
  /** True when the Redis adapter was installed. */
  enabled: boolean;
  close(): Promise<void>;
}

const CONNECT_TIMEOUT_MS = 3_000;
const DISABLED: RedisAdapterHandle = { enabled: false, close: async () => {} };

export async function attachRedisAdapter(
  io: Server,
  logger: AdapterLogger,
  url: string | undefined = process.env.REDIS_URL || process.env.REDIS_CONNECTION_STRING,
): Promise<RedisAdapterHandle> {
  if (!url) {
    logger.info({ event: 'redis_adapter_disabled', reason: 'REDIS_URL unset' });
    return DISABLED;
  }

  const pub = new Redis(url, {
    lazyConnect: true,
    connectTimeout: CONNECT_TIMEOUT_MS,
    // Boot only: give up quickly instead of retrying forever if Redis is down.
    retryStrategy: () => null,
    maxRetriesPerRequest: 1,
  });
  const sub = pub.duplicate();
  // Errors after boot must never crash the hub.
  const onError = (err: Error) => logger.warn({ event: 'redis_adapter_error', error: err.message });
  pub.on('error', onError);
  sub.on('error', onError);

  try {
    await Promise.race([
      Promise.all([pub.connect(), sub.connect()]),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('connect timeout')), CONNECT_TIMEOUT_MS + 500).unref(),
      ),
    ]);
  } catch (err) {
    logger.warn({
      event: 'redis_adapter_unavailable',
      error: err instanceof Error ? err.message : String(err),
      fallback: 'in-memory adapter',
    });
    pub.disconnect();
    sub.disconnect();
    return DISABLED;
  }

  // Connected: allow normal reconnects from here on.
  pub.options.retryStrategy = (times) => Math.min(times * 200, 5_000);
  sub.options.retryStrategy = (times) => Math.min(times * 200, 5_000);
  try {
    io.adapter(createAdapter(pub, sub));
  } catch (err) {
    logger.warn({ event: 'redis_adapter_unavailable', error: String(err), fallback: 'in-memory adapter' });
    pub.disconnect();
    sub.disconnect();
    return DISABLED;
  }
  logger.info({ event: 'redis_adapter_enabled' });
  return {
    enabled: true,
    close: async () => {
      await Promise.allSettled([pub.quit(), sub.quit()]);
      pub.disconnect();
      sub.disconnect();
    },
  };
}
