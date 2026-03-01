/**
 * Shared Per-Socket Rate Limiter for all standalone WebSocket servers.
 *
 * Implements a sliding-window counter per socket per event type with
 * bounded memory (MAX_ENTRIES). Prevents abuse while keeping memory
 * predictable under load.
 *
 * Usage:
 *   import { createRateLimiter } from '../shared/rate-limit';
 *   const rl = createRateLimiter(rateLimitConfig);
 *   if (!rl.check(socket.id, 'rmhbox:lobby:create')) { ... }
 *   // on disconnect:
 *   rl.cleanup(socket.id);
 */

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

interface RateLimitRule {
  max: number;
  windowMs: number;
}

export interface RateLimiter {
  check(socketId: string, eventName: string): boolean;
  cleanup(socketId: string): void;
  reset(): void;
}

const MAX_ENTRIES = 50_000;

export function createRateLimiter(
  rules: Record<string, RateLimitRule>,
): RateLimiter {
  const counters = new Map<string, RateLimitEntry>();

  // Periodic GC to remove expired entries and cap memory
  const gcTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of counters) {
      // Find the max window among all rules to determine if entry is certainly expired
      if (now - entry.windowStart >= 120_000) {
        counters.delete(key);
      }
    }
  }, 30_000);
  if (gcTimer && typeof gcTimer === 'object' && 'unref' in gcTimer) {
    gcTimer.unref();
  }

  return {
    check(socketId: string, eventName: string): boolean {
      const limit = rules[eventName];
      if (!limit) return true;

      const key = `${socketId}:${eventName}`;
      const now = Date.now();
      const entry = counters.get(key);

      if (!entry || now - entry.windowStart >= limit.windowMs) {
        // Evict oldest if at capacity
        if (counters.size >= MAX_ENTRIES) {
          const oldest = counters.keys().next().value;
          if (oldest !== undefined) counters.delete(oldest);
        }
        counters.set(key, { count: 1, windowStart: now });
        return true;
      }

      if (entry.count < limit.max) {
        entry.count++;
        return true;
      }

      return false;
    },

    cleanup(socketId: string): void {
      // Use prefix scan — O(n) but only on disconnect
      for (const key of counters.keys()) {
        if (key.startsWith(`${socketId}:`)) {
          counters.delete(key);
        }
      }
    },

    reset(): void {
      counters.clear();
    },
  };
}
