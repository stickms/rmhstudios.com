/**
 * Keyed real-time bus with a transparent Redis backplane (server-only).
 *
 * Always fans out through a local EventEmitter; Redis (when configured) is just
 * the cross-instance transport that feeds that emitter. This keeps single-
 * delivery semantics in both modes:
 *   - Redis on:  publish → Redis → every instance's subscriber → local emitter.
 *   - Redis off: publish → local emitter directly.
 *
 * A subscription is what creates the per-channel Redis SUBSCRIBE, so a message
 * only reaches an instance that actually has a listener for that key.
 */

import { EventEmitter } from 'events';
import { redisEnabled, redisPublish, redisSubscribe } from '@/lib/redis.server';

export interface RealtimeBus<T> {
  publish(key: string, payload: T): void;
  subscribe(key: string, listener: (payload: T) => void): () => void;
}

export function createBus<T>(namespace: string): RealtimeBus<T> {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(1000);

  const channel = (key: string) => `rt:${namespace}:${key}`;
  // Ref-counted Redis subscriptions per key (one SUBSCRIBE per active key).
  const redisSubs = new Map<string, { count: number; off: () => void }>();

  function publish(key: string, payload: T): void {
    if (redisEnabled()) {
      // Delivered back to this (and every) instance via the subscriber; on
      // transport failure, fall back to a direct local emit.
      const sent = redisPublish(channel(key), payload);
      if (!sent) emitter.emit(key, payload);
    } else {
      emitter.emit(key, payload);
    }
  }

  function subscribe(key: string, listener: (payload: T) => void): () => void {
    emitter.on(key, listener);

    if (redisEnabled()) {
      const existing = redisSubs.get(key);
      if (existing) {
        existing.count++;
      } else {
        const off = redisSubscribe(channel(key), (data) => emitter.emit(key, data as T));
        redisSubs.set(key, { count: 1, off });
      }
    }

    return () => {
      emitter.off(key, listener);
      const entry = redisSubs.get(key);
      if (entry) {
        entry.count--;
        if (entry.count <= 0) {
          entry.off();
          redisSubs.delete(key);
        }
      }
    };
  }

  return { publish, subscribe };
}
