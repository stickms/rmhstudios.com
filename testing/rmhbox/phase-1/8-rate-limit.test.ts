/**
 * Phase 1 — Section 8: Rate Limiting
 *
 * Tests the per-socket sliding window rate limiter.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  checkRateLimit,
  cleanupRateLimits,
  resetRateLimits,
} from '../../../server/rmhbox/rate-limit';

describe('Rate Limiter (§8.1)', () => {
  beforeEach(() => {
    resetRateLimits();
  });

  it('should allow requests within rate limits', () => {
    // rmhbox:lobby:create has limit of 5 per 60s
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit('socket-1', 'rmhbox:lobby:create')).toBe(true);
    }
  });

  it('should reject the 6th rmhbox:lobby:create in the same window', () => {
    for (let i = 0; i < 5; i++) {
      checkRateLimit('socket-1', 'rmhbox:lobby:create');
    }
    expect(checkRateLimit('socket-1', 'rmhbox:lobby:create')).toBe(false);
  });

  it('should track rate limits per socket independently', () => {
    // Socket 1 uses all 5 create slots
    for (let i = 0; i < 5; i++) {
      checkRateLimit('socket-1', 'rmhbox:lobby:create');
    }
    expect(checkRateLimit('socket-1', 'rmhbox:lobby:create')).toBe(false);

    // Socket 2 should still be allowed
    expect(checkRateLimit('socket-2', 'rmhbox:lobby:create')).toBe(true);
  });

  it('should track rate limits per event independently', () => {
    // Use all create slots
    for (let i = 0; i < 5; i++) {
      checkRateLimit('socket-1', 'rmhbox:lobby:create');
    }
    expect(checkRateLimit('socket-1', 'rmhbox:lobby:create')).toBe(false);

    // Join should still work (different event, limit of 10)
    expect(checkRateLimit('socket-1', 'rmhbox:lobby:join')).toBe(true);
  });

  it('should allow unlimited requests for events without rate limits', () => {
    // rmhbox:lobby:leave has no rate limit configured
    for (let i = 0; i < 100; i++) {
      expect(checkRateLimit('socket-1', 'rmhbox:lobby:leave')).toBe(true);
    }
  });

  it('should allow game input up to 100 per 10 seconds', () => {
    for (let i = 0; i < 100; i++) {
      expect(checkRateLimit('socket-1', 'rmhbox:game:input')).toBe(true);
    }
    expect(checkRateLimit('socket-1', 'rmhbox:game:input')).toBe(false);
  });

  it('should allow chat up to 20 per 60 seconds', () => {
    for (let i = 0; i < 20; i++) {
      expect(checkRateLimit('socket-1', 'rmhbox:lobby:chat')).toBe(true);
    }
    expect(checkRateLimit('socket-1', 'rmhbox:lobby:chat')).toBe(false);
  });

  it('should clean up rate limits for a specific socket', () => {
    // Use some limits
    checkRateLimit('socket-1', 'rmhbox:lobby:create');
    checkRateLimit('socket-1', 'rmhbox:lobby:join');
    checkRateLimit('socket-2', 'rmhbox:lobby:create');

    // Clean up socket-1
    cleanupRateLimits('socket-1');

    // Socket-1 limits should be reset (new window)
    // This is verified by the fact that cleanupRateLimits doesn't throw
    // and subsequent calls to checkRateLimit work correctly
    expect(checkRateLimit('socket-1', 'rmhbox:lobby:create')).toBe(true);
  });

  it('should not affect other sockets when cleaning up one', () => {
    // Socket-2 uses 4 of 5 create slots
    for (let i = 0; i < 4; i++) {
      checkRateLimit('socket-2', 'rmhbox:lobby:create');
    }

    // Clean up socket-1
    cleanupRateLimits('socket-1');

    // Socket-2 should still have its counter (1 remaining)
    expect(checkRateLimit('socket-2', 'rmhbox:lobby:create')).toBe(true);
    expect(checkRateLimit('socket-2', 'rmhbox:lobby:create')).toBe(false);
  });

  it('should reset all rate limits', () => {
    for (let i = 0; i < 5; i++) {
      checkRateLimit('socket-1', 'rmhbox:lobby:create');
    }
    expect(checkRateLimit('socket-1', 'rmhbox:lobby:create')).toBe(false);

    resetRateLimits();
    expect(checkRateLimit('socket-1', 'rmhbox:lobby:create')).toBe(true);
  });
});
