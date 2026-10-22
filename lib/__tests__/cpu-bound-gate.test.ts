/**
 * The CPU-bound endpoints' shared plumbing (WS6): the admission gate that keeps
 * sharp from monopolising the libuv threadpool, and the story-card cache key.
 */
import { describe, expect, it } from 'vitest';
import { CpuGateFullError, createCpuGate } from '@/lib/images/cpu-gate.server';
import { postStoryCacheKey } from '@/lib/og/post-story.server';

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

describe('createCpuGate', () => {
  it('never runs more than `limit` jobs at once and keeps arrival order', async () => {
    const gate = createCpuGate(2, 10);
    let active = 0;
    let peak = 0;
    const started: number[] = [];
    const jobs = Array.from({ length: 6 }, (_, i) =>
      gate.run(async () => {
        started.push(i);
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 5));
        active--;
        return i;
      }),
    );
    expect(await Promise.all(jobs)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(peak).toBe(2);
    expect(started).toEqual([0, 1, 2, 3, 4, 5]);
    expect(gate.stats).toEqual({ active: 0, queued: 0 });
  });

  it('releases the slot when a job throws', async () => {
    const gate = createCpuGate(1, 10);
    await expect(gate.run(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    expect(await gate.run(async () => 'ok')).toBe('ok');
    expect(gate.stats.active).toBe(0);
  });

  it('rejects past the queue bound instead of queueing without limit', async () => {
    const gate = createCpuGate(1, 2);
    let release!: () => void;
    const hold = new Promise<void>((r) => (release = r));
    const running = gate.run(() => hold);
    const q1 = gate.run(async () => 1);
    const q2 = gate.run(async () => 2);
    await tick();
    await expect(gate.run(async () => 3)).rejects.toBeInstanceOf(CpuGateFullError);
    release();
    await Promise.all([running, q1, q2]);
  });
});

describe('postStoryCacheKey', () => {
  const base = {
    id: 'p1',
    content: 'hello',
    authorName: 'A',
    authorHandle: 'a',
    authorImage: null,
  };

  it('changes with every drawn field, so an edit or a hidden body is never served stale', () => {
    const k = postStoryCacheKey(base);
    expect(postStoryCacheKey({ ...base })).toBe(k);
    expect(postStoryCacheKey({ ...base, content: '' })).not.toBe(k); // content warning applied
    expect(postStoryCacheKey({ ...base, content: 'hello!' })).not.toBe(k); // edited
    expect(postStoryCacheKey({ ...base, authorName: 'B' })).not.toBe(k);
    expect(postStoryCacheKey({ ...base, authorImage: '/x.png' })).not.toBe(k);
  });

  it('keys on the drawn text, not a raw prefix that emoji stripping shifts', () => {
    // 400 emoji are stripped before drawing, so the drawn body is the tail.
    const pad = '😀'.repeat(400);
    expect(postStoryCacheKey({ ...base, content: `${pad} first` })).not.toBe(
      postStoryCacheKey({ ...base, content: `${pad} second` }),
    );
  });
});
