/**
 * The response micro-cache's three guarantees that do not depend on a route
 * remembering to opt out: apiCache invalidation anywhere invalidates it, a
 * `?x=1..N` sweep cannot flush it, and repeated params keep their order.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearResponseCache,
  responseCacheKey,
  withResponseCache,
} from '@/lib/api/response-cache.server';
import { apiCache } from '@/lib/cache';

const req = (path: string) => new Request(`https://rmhstudios.com${path}`);
let runs = 0;
const produce = () => async () => {
  runs++;
  return Response.json({ n: runs });
};
const get = (path: string) => withResponseCache(responseCacheKey(req(path)), 10_000, produce());

beforeEach(() => {
  clearResponseCache();
  runs = 0;
});

describe('generation invalidation', () => {
  it('serves a repeat from memory', async () => {
    await get('/api/x');
    await get('/api/x');
    expect(runs).toBe(1);
  });

  it('any apiCache.invalidate / invalidatePrefix / dropLocal drops the entry', async () => {
    for (const inv of [
      () => apiCache.invalidate('some:key'),
      () => apiCache.invalidatePrefix('some:'),
      () => apiCache.dropLocal('some:key'),
      () => apiCache.dropLocalPrefix('some:'),
    ]) {
      clearResponseCache();
      runs = 0;
      await get('/api/x');
      inv();
      await get('/api/x');
      expect(runs).toBe(2);
    }
  });

  it('does not store a response whose handler ran across an invalidation', async () => {
    await withResponseCache(responseCacheKey(req('/api/slow')), 10_000, async () => {
      runs++;
      apiCache.invalidate('written:meanwhile'); // a write lands while the handler runs
      return Response.json({ stale: true });
    });
    await get('/api/slow');
    expect(runs).toBe(2); // the first body was not cached
    await get('/api/slow');
    expect(runs).toBe(2); // the second, produced after the write, is
  });
});

describe('key sweep', () => {
  it('caps the variants one path can hold, so ?x=1..600 cannot flush other paths', async () => {
    await get('/api/keep');
    for (let i = 1; i <= 600; i++) await get(`/api/sweep?x=${i}`);
    const before = runs;
    await get('/api/keep');
    expect(runs).toBe(before); // still cached
    // Only the first 20 variants of the swept path were stored.
    runs = 0;
    for (let i = 1; i <= 20; i++) await get(`/api/sweep?x=${i}`);
    expect(runs).toBe(0);
    await get('/api/sweep?x=21');
    await get('/api/sweep?x=21');
    expect(runs).toBe(2); // beyond the cap: served uncached
  });
});

describe('responseCacheKey', () => {
  it('sorts by name only: repeated params keep their order', () => {
    expect(responseCacheKey(req('/a?d=hard&d=easy'))).not.toBe(
      responseCacheKey(req('/a?d=easy&d=hard')),
    );
    expect(responseCacheKey(req('/a?b=1&a=2'))).toBe(responseCacheKey(req('/a?a=2&b=1')));
  });
});
