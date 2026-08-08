/**
 * Phase 1 — Server-Side Validated Wrapper & Logger Tests
 *
 * Tests the validated() wrapper from server/rmhbox/schemas.ts
 * and the structured logger.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger } from '../../../server/rmhbox/logger';
import { PEER_GRACE_MS } from '../../../lib/shared/realtime/types';

// We need to test validated() but it uses imports that need mocking
// Test the logger directly and validated() via integration

describe('Structured Logger', () => {
  // The suite runs at LOG_LEVEL=silent (testing/setup/vitest.setup.ts) so that
  // the phase-3…6 game loops don't bury a run in JSON. This is the one place
  // that asserts on the output, so it turns the logger back on for itself.
  const SUITE_LEVEL = process.env.LOG_LEVEL;
  beforeEach(() => {
    process.env.LOG_LEVEL = 'debug';
  });
  afterEach(() => {
    if (SUITE_LEVEL === undefined) delete process.env.LOG_LEVEL;
    else process.env.LOG_LEVEL = SUITE_LEVEL;
  });
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

  it('drops entries below LOG_LEVEL, and keeps errors at warn', () => {
    process.env.LOG_LEVEL = 'warn';
    const info = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    logger.info({ event: 'below_the_floor' });
    logger.error({ event: 'above_the_floor' });

    expect(info).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledTimes(1);
    info.mockRestore();
    error.mockRestore();
  });

  it('writes nothing at all at LOG_LEVEL=silent — what the test suite runs at', () => {
    process.env.LOG_LEVEL = 'silent';
    const sinks = (['log', 'warn', 'error', 'debug'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {}),
    );

    logger.debug({ event: 'x' });
    logger.info({ event: 'x' });
    logger.warn({ event: 'x' });
    logger.error({ event: 'x' });

    for (const sink of sinks) expect(sink).not.toHaveBeenCalled();
    for (const sink of sinks) sink.mockRestore();
  });

  it('reads the level per call, so a level change takes effect without a re-import', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

    process.env.LOG_LEVEL = 'silent';
    logger.info({ event: 'dropped' });
    process.env.LOG_LEVEL = 'info';
    logger.info({ event: 'kept' });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(spy.mock.calls[0][0]).event).toBe('kept');
    spy.mockRestore();
  });
});

describe('Server Config', () => {
  it('should export config with correct default values', async () => {
    const { config } = await import('../../../server/rmhbox/config');

    expect(config.PORT).toBe(7676);
    expect(config.SOCKET_PATH).toBe('/rmhbox-ws/');
    expect(config.MAX_HTTP_BUFFER_SIZE).toBe(1_048_576);
    expect(config.PING_INTERVAL_MS).toBe(25_000);
    expect(config.PING_TIMEOUT_MS).toBe(20_000);
    expect(config.ROOM_CODE_LENGTH).toBe(6);
    expect(config.DEFAULT_MAX_PLAYERS).toBe(8);
    expect(config.MIN_PLAYERS).toBe(2);
    expect(config.ABSOLUTE_MAX_PLAYERS).toBe(16);
    expect(config.HEARTBEAT_INTERVAL_MS).toBe(10_000);
    expect(config.DISCONNECT_GRACE_PERIOD_MS).toBe(PEER_GRACE_MS);
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
