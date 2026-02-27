/**
 * RmhTube — Per-Socket Rate Limiter
 *
 * Sliding window counter per socket per event type.
 */

import { config } from './config';

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const counters = new Map<string, RateLimitEntry>();

export function checkRateLimit(socketId: string, eventName: string): boolean {
  const limit = config.SOCKET_RATE_LIMITS[eventName];
  if (!limit) return true;

  const key = `${socketId}:${eventName}`;
  const now = Date.now();
  const entry = counters.get(key);

  if (!entry || now - entry.windowStart >= limit.windowMs) {
    counters.set(key, { count: 1, windowStart: now });
    return true;
  }

  if (entry.count < limit.max) {
    entry.count++;
    return true;
  }

  return false;
}

export function cleanupRateLimits(socketId: string): void {
  for (const key of counters.keys()) {
    if (key.startsWith(`${socketId}:`)) {
      counters.delete(key);
    }
  }
}
