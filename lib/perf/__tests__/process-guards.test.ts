import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { guardPool, installProcessGuards } from '../process-guards';
import { snapshotProcess } from '../process-metrics';

// These guards are what keep one stray rejection from taking a whole hub (every
// game on it) offline, and the counters are what the on-call alarms read.

const counter = (name: string) => snapshotProcess().counters[name] ?? 0;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('guardPool', () => {
  it('turns an idle-client error into a counted log line instead of a crash', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const pool = guardPool(new EventEmitter(), { service: 'test', pool: 'auth' });
    const before = counter('db.pool_error');

    // An EventEmitter with no 'error' listener throws — that throw is the crash.
    expect(() => pool.emit('error', new Error('terminating connection'))).not.toThrow();
    expect(counter('db.pool_error')).toBe(before + 1);
  });
});

describe('installProcessGuards', () => {
  it('keeps running on a rejection and exits 1 on an uncaught exception, counting both', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // Capture the listeners rather than registering them on the test runner's
    // own process, whose handlers would report the fake failures as real ones.
    const listeners = new Map<string, (...args: unknown[]) => void>();
    vi.spyOn(process, 'on').mockImplementation(((event: string, fn: (...args: unknown[]) => void) => {
      listeners.set(event, fn);
      return process;
    }) as typeof process.on);
    const exit = vi.fn();

    installProcessGuards({ service: 'test', exit });
    const rejections = counter('process.unhandled_rejection');
    const exceptions = counter('process.uncaught_exception');

    listeners.get('unhandledRejection')?.(new Error('lost await'));
    expect(counter('process.unhandled_rejection')).toBe(rejections + 1);
    expect(exit).not.toHaveBeenCalled();

    listeners.get('uncaughtException')?.(new Error('bad state'), 'uncaughtException');
    expect(counter('process.uncaught_exception')).toBe(exceptions + 1);
    expect(exit).toHaveBeenCalledWith(1);
  });
});
