import { describe, it, expect, vi, afterEach } from 'vitest';
import { boundedFlush } from '../shutdown';

afterEach(() => vi.useRealTimers());

describe('boundedFlush', () => {
  it('resolves as soon as the flush settles, even if it rejects', async () => {
    await expect(boundedFlush(Promise.resolve(), 10_000)).resolves.toBeUndefined();
    await expect(boundedFlush(Promise.reject(new Error('db')), 10_000)).resolves.toBeUndefined();
  });

  it('gives up after its bound when the flush hangs', async () => {
    vi.useFakeTimers();
    let settled = false;
    const p = boundedFlush(new Promise(() => {}), 500).then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(499);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    await p;
    expect(settled).toBe(true);
  });
});
