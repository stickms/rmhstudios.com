import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createBatchWriter } from '../batch-writer';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('createBatchWriter', () => {
  it('writes everything added within the interval in ONE call, in order', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const w = createBatchWriter<number>({ write, onError: vi.fn(), flushMs: 1000 });
    for (let i = 0; i < 50; i++) w.add(i);
    expect(write).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][0]).toEqual(Array.from({ length: 50 }, (_, i) => i));
    expect(w.pending).toBe(0);
  });

  it('flushes early when maxBatch rows are waiting', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const w = createBatchWriter<number>({ write, onError: vi.fn(), flushMs: 10_000, maxBatch: 3 });
    w.add(1);
    w.add(2);
    w.add(3);
    await vi.advanceTimersByTimeAsync(0);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][0]).toEqual([1, 2, 3]);
  });

  it('flush() drains immediately and writes nothing when empty', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const w = createBatchWriter<string>({ write, onError: vi.fn() });
    await w.flush();
    expect(write).not.toHaveBeenCalled();
    w.add('a');
    await w.flush();
    expect(write).toHaveBeenCalledWith(['a']);
  });

  it('reports a failed batch once and keeps working', async () => {
    const write = vi.fn().mockRejectedValueOnce(new Error('db')).mockResolvedValue(undefined);
    const onError = vi.fn();
    const w = createBatchWriter<number>({ write, onError, flushMs: 100 });
    w.add(1);
    w.add(2);
    await vi.advanceTimersByTimeAsync(100);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][1]).toBe(2);
    w.add(3);
    await vi.advanceTimersByTimeAsync(100);
    expect(write).toHaveBeenLastCalledWith([3]);
  });

  it('never runs two writes concurrently', async () => {
    let active = 0;
    let maxActive = 0;
    const write = vi.fn(async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 50));
      active--;
    });
    const w = createBatchWriter<number>({ write, onError: vi.fn(), maxBatch: 1 });
    w.add(1);
    w.add(2);
    w.add(3);
    await vi.advanceTimersByTimeAsync(500);
    expect(write).toHaveBeenCalledTimes(3);
    expect(maxActive).toBe(1);
  });
});
