/**
 * RMHbox — Per-Socket Rate Limiter
 *
 * Implements a sliding window counter per socket per event type.
 * Prevents abuse by limiting how frequently a single socket can
 * emit specific events.
 *
 * Reference: docs/rmhbox/design-spec/core.md §24
 */

import { config } from './config';

// ─── Rate Limit State ────────────────────────────────────────────

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

/** Map keyed by `${socketId}:${eventName}` → sliding window state */
const counters = new Map<string, RateLimitEntry>();

// ─── Public API ──────────────────────────────────────────────────

/**
 * Check whether a socket is within its rate limit for a given event.
 *
 * @param socketId - The Socket.io socket ID
 * @param eventName - The event name (e.g. 'rmhbox:lobby:create')
 * @returns `true` if the request is allowed, `false` if rate limited
 */
export function checkRateLimit(socketId: string, eventName: string): boolean {
  const limit = config.SOCKET_RATE_LIMITS[eventName];
  if (!limit) return true; // No rate limit configured for this event

  const key = `${socketId}:${eventName}`;
  const now = Date.now();
  const entry = counters.get(key);

  if (!entry || now - entry.windowStart >= limit.windowMs) {
    // Start a new window
    counters.set(key, { count: 1, windowStart: now });
    return true;
  }

  if (entry.count < limit.max) {
    entry.count++;
    return true;
  }

  // Rate limited
  return false;
}

/**
 * Clean up all rate limit counters for a disconnected socket.
 * Called when a socket disconnects to free memory.
 *
 * @param socketId - The Socket.io socket ID to clean up
 */
export function cleanupRateLimits(socketId: string): void {
  for (const key of counters.keys()) {
    if (key.startsWith(`${socketId}:`)) {
      counters.delete(key);
    }
  }
}

/**
 * Reset all rate limit counters. Primarily used in testing.
 */
export function resetRateLimits(): void {
  counters.clear();
}
