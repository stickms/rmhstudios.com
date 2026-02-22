/**
 * Phase 1 — Server-Side Validated Wrapper & Logger Tests
 *
 * Tests the validated() wrapper from server/rmhbox/schemas.ts
 * and the structured logger.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { resetRateLimits } from '../../../server/rmhbox/rate-limit';
import { logger } from '../../../server/rmhbox/logger';

// We need to test validated() but it uses imports that need mocking
// Test the logger directly and validated() via integration

describe('Structured Logger', () => {
  it('should log info with structured JSON', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logger.info({ event: 'test_event', userId: 'user-1', data: { key: 'value' } });

    expect(spy).toHaveBeenCalledTimes(1);
    const logOutput = JSON.parse(spy.mock.calls[0][0]);
    expect(logOutput.level).toBe('info');
    expect(logOutput.event).toBe('test_event');
    expect(logOutput.userId).toBe('user-1');
    expect(logOutput.timestamp).toBeDefined();
    spy.mockRestore();
  });

  it('should log warn with structured JSON', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    logger.warn({ event: 'rate_limited', socketId: 'socket-1' });

    expect(spy).toHaveBeenCalledTimes(1);
    const logOutput = JSON.parse(spy.mock.calls[0][0]);
    expect(logOutput.level).toBe('warn');
    expect(logOutput.event).toBe('rate_limited');
    spy.mockRestore();
  });

  it('should log error with structured JSON', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger.error({ event: 'auth_error', error: 'Connection failed' });

    expect(spy).toHaveBeenCalledTimes(1);
    const logOutput = JSON.parse(spy.mock.calls[0][0]);
    expect(logOutput.level).toBe('error');
    expect(logOutput.event).toBe('auth_error');
    spy.mockRestore();
  });

  it('should include ISO timestamp in all log entries', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logger.info({ event: 'timestamp_test' });

    const logOutput = JSON.parse(spy.mock.calls[0][0]);
    expect(logOutput.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    spy.mockRestore();
  });
});

describe('Server Config', () => {
  it('should export config with correct default values', async () => {
    const { config } = await import('../../../server/rmhbox/config');

    expect(config.PORT).toBe(7676);
    expect(config.SOCKET_PATH).toBe('/rmhbox/');
    expect(config.MAX_HTTP_BUFFER_SIZE).toBe(1_048_576);
    expect(config.PING_INTERVAL_MS).toBe(25_000);
    expect(config.PING_TIMEOUT_MS).toBe(20_000);
    expect(config.ROOM_CODE_LENGTH).toBe(6);
    expect(config.DEFAULT_MAX_PLAYERS).toBe(8);
    expect(config.MIN_PLAYERS).toBe(2);
    expect(config.ABSOLUTE_MAX_PLAYERS).toBe(16);
    expect(config.HEARTBEAT_INTERVAL_MS).toBe(10_000);
    expect(config.DISCONNECT_GRACE_PERIOD_MS).toBe(120_000);
    expect(config.VOTE_DURATION_SECONDS).toBe(30);
    expect(config.VOTE_CANDIDATE_COUNT).toBe(5);
    expect(config.SHUTDOWN_TIMEOUT_MS).toBe(10_000);
  });

  it('should define rate limits for known events', async () => {
    const { config } = await import('../../../server/rmhbox/config');

    expect(config.SOCKET_RATE_LIMITS).toBeDefined();
    expect(config.SOCKET_RATE_LIMITS['rmhbox:lobby:create']).toBeDefined();
    expect(config.SOCKET_RATE_LIMITS['rmhbox:lobby:join']).toBeDefined();
    expect(config.SOCKET_RATE_LIMITS['rmhbox:lobby:chat']).toBeDefined();
    expect(config.SOCKET_RATE_LIMITS['rmhbox:game:input']).toBeDefined();
  });
});
