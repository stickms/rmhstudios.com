import { afterEach, describe, expect, it, vi } from 'vitest';
import { yieldToMain } from '@/lib/scheduler';

/**
 * `globalThis.scheduler` does not exist under Node, so the fallback branch is
 * what runs by default here and the native branch has to be installed by hand.
 * Both are asserted, because the whole point of the module is preferring one
 * over the other — a regression that silently always took `setTimeout` would
 * still pass every "does it resolve" test.
 */
type SchedulerHost = { scheduler?: { yield?: () => Promise<void> } };

const host = globalThis as SchedulerHost;

function installScheduler(impl: () => Promise<void>) {
  host.scheduler = { yield: impl };
}

afterEach(() => {
  delete host.scheduler;
  vi.restoreAllMocks();
});

describe('yieldToMain', () => {
  it('resolves', async () => {
    await expect(yieldToMain()).resolves.toBeUndefined();
  });

  it('uses scheduler.yield() when the platform provides it', async () => {
    const native = vi.fn(() => Promise.resolve());
    installScheduler(native);
    const timeout = vi.spyOn(globalThis, 'setTimeout');

    await yieldToMain();

    expect(native).toHaveBeenCalledTimes(1);
    // The point of preferring it: no timer is posted, so the continuation keeps
    // its place in the queue instead of going to the back of it.
    expect(timeout).not.toHaveBeenCalled();
  });

  it('falls back to a macrotask when scheduler.yield() is absent', async () => {
    delete host.scheduler;
    const timeout = vi.spyOn(globalThis, 'setTimeout');

    await expect(yieldToMain()).resolves.toBeUndefined();

    expect(timeout).toHaveBeenCalledTimes(1);
    expect(timeout.mock.calls[0]?.[1]).toBe(0);
  });

  it('falls back when `scheduler` exists but has no yield (older Chromium)', async () => {
    host.scheduler = {};
    const timeout = vi.spyOn(globalThis, 'setTimeout');

    await expect(yieldToMain()).resolves.toBeUndefined();

    expect(timeout).toHaveBeenCalledTimes(1);
  });

  it('actually yields — work queued before the call runs before the continuation', async () => {
    delete host.scheduler;
    const order: string[] = [];
    setTimeout(() => order.push('queued-before'), 0);

    await yieldToMain();
    order.push('after-yield');

    expect(order).toEqual(['queued-before', 'after-yield']);
  });
});
