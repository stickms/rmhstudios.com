/**
 * Shared Per-Socket Rate Limiter for all standalone WebSocket servers.
 *
 * Implements a sliding-window counter per socket per event type with
 * bounded memory (MAX_ENTRIES). Prevents abuse while keeping memory
 * predictable under load.
 *
 * Counters are nested as socketId → Map<eventName, entry>. This makes
 * per-socket cleanup (called once per disconnecting socket) O(1) — we drop
 * the socket's whole bucket — instead of scanning the entire counter map.
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
  // socketId → (eventName → entry). Nesting keeps cleanup(socketId) O(1).
  const bySocket = new Map<string, Map<string, RateLimitEntry>>();
  // Running total of individual event entries across all sockets, so the
  // MAX_ENTRIES memory bound stays exact without scanning the nested maps.
  let totalEntries = 0;

  // Periodic GC to remove expired entries and cap memory
  const gcTimer = setInterval(() => {
    const now = Date.now();
    for (const [socketId, events] of bySocket) {
      for (const [eventName, entry] of events) {
        // Max window among all rules is unknown here; 120s certainly clears any
        // live window, matching the previous flat-map GC threshold.
        if (now - entry.windowStart >= 120_000) {
          events.delete(eventName);
          totalEntries--;
        }
      }
      if (events.size === 0) bySocket.delete(socketId);
    }
  }, 30_000);
  if (gcTimer && typeof gcTimer === 'object' && 'unref' in gcTimer) {
    gcTimer.unref();
  }

  return {
    check(socketId: string, eventName: string): boolean {
      const limit = rules[eventName];
      if (!limit) return true;

      const now = Date.now();
      let events = bySocket.get(socketId);
      const entry = events?.get(eventName);

      if (!entry || now - entry.windowStart >= limit.windowMs) {
        // Evict the oldest socket bucket if at capacity (Map preserves insertion
        // order). Never evict the socket we're about to write to.
        if (!entry && totalEntries >= MAX_ENTRIES) {
          const oldest = bySocket.keys().next().value;
          if (oldest !== undefined && oldest !== socketId) {
            const bucket = bySocket.get(oldest);
            if (bucket) {
              totalEntries -= bucket.size;
              bySocket.delete(oldest);
            }
          }
        }
        if (!events) {
          events = new Map();
          bySocket.set(socketId, events);
        }
        if (!entry) totalEntries++; // brand-new event slot for this socket
        events.set(eventName, { count: 1, windowStart: now });
        return true;
      }

      if (entry.count < limit.max) {
        entry.count++;
        return true;
      }

      return false;
    },

    cleanup(socketId: string): void {
      // O(1): drop this socket's entire bucket instead of scanning all keys.
      const events = bySocket.get(socketId);
      if (events) {
        totalEntries -= events.size;
        bySocket.delete(socketId);
      }
    },

    reset(): void {
      bySocket.clear();
      totalEntries = 0;
    },
  };
}
