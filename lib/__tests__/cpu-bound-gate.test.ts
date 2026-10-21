/**
 * The CPU-bound endpoints' shared plumbing (WS6): the admission gate that keeps
 * sharp/resvg from monopolising the libuv threadpool, and the card cache that
 * de-duplicates concurrent renders.
 */
import { describe, expect, it } from 'vitest';
import { Resvg } from '@resvg/resvg-js';
import { CpuGateFullError, createCpuGate } from '@/lib/images/cpu-gate.server';
import { createCardCache, rasterizeSvg } from '@/lib/og/shared.server';
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

describe('createCardCache', () => {
  it('renders a cold key once for any number of concurrent callers', async () => {
    const cache = createCardCache({ max: 10, ttlMs: 60_000 });
    let renders = 0;
    const produce = async () => {
      renders++;
      await new Promise((r) => setTimeout(r, 10));
      return Buffer.from('png');
    };
    const out = await Promise.all(Array.from({ length: 8 }, () => cache.getOrRender('k', produce)));
    expect(renders).toBe(1);
    expect(out.every((b) => b.toString() === 'png')).toBe(true);
    // ...and the next caller is a plain hit.
    await cache.getOrRender('k', produce);
    expect(renders).toBe(1);
  });

  it('does not cache a failed render, and the next caller retries', async () => {
    const cache = createCardCache({ max: 10, ttlMs: 60_000 });
    let n = 0;
    const flaky = async () => {
      if (n++ === 0) throw new Error('fonts down');
      return Buffer.from('ok');
    };
    await expect(cache.getOrRender('k', flaky)).rejects.toThrow('fonts down');
    expect((await cache.getOrRender('k', flaky)).toString()).toBe('ok');
  });

  it('keys are independent and the store is bounded', async () => {
    const cache = createCardCache({ max: 2, ttlMs: 60_000 });
    for (const k of ['a', 'b', 'c']) await cache.getOrRender(k, async () => Buffer.from(k));
    expect(cache.size).toBe(2);
  });
});

describe('rasterizeSvg', () => {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><rect width="120" height="60" fill="#fff"/><circle cx="40" cy="30" r="20" fill="rgba(0,0,0,0.5)"/></svg>';

  it('produces the same PNG bytes as the synchronous rasteriser it replaced', async () => {
    const sync = Buffer.from(new Resvg(svg, { fitTo: { mode: 'width', value: 120 } }).render().asPng());
    const async_ = await rasterizeSvg(svg, 120);
    expect(async_.equals(sync)).toBe(true);
  });
});

describe('postStoryCacheKey', () => {
  const base = { id: 'p1', content: 'hello', authorName: 'A', authorHandle: 'a', authorImage: null };

  it('changes with every drawn field, so an edit or a hidden body is never served stale', () => {
    const k = postStoryCacheKey(base);
    expect(postStoryCacheKey({ ...base })).toBe(k);
    expect(postStoryCacheKey({ ...base, content: '' })).not.toBe(k); // content warning applied
    expect(postStoryCacheKey({ ...base, content: 'hello!' })).not.toBe(k); // edited
    expect(postStoryCacheKey({ ...base, authorName: 'B' })).not.toBe(k);
    expect(postStoryCacheKey({ ...base, authorImage: '/x.png' })).not.toBe(k);
  });
});
