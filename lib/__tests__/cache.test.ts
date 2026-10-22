import { describe, expect, it } from 'vitest';
import {
  ApiCache,
  apiCache,
  estimateBytes,
  heapShare,
  MAIN_CACHE_HEAP_SHARE,
  VIEWER_FEED_CACHE_HEAP_SHARE,
} from '@/lib/cache';

describe('ApiCache LRU', () => {
  it('evicts the least-recently-used key, not the oldest-inserted', () => {
    const c = new ApiCache({ maxEntries: 3 });
    c.set('a', 1, 1000);
    c.set('b', 2, 1000);
    c.set('c', 3, 1000);
    expect(c.get('a')).toBe(1); // refresh a
    c.set('d', 4, 1000); // evicts b
    expect(c.get('b')).toBeUndefined();
    expect(c.get('a')).toBe(1);
    expect(c.get('c')).toBe(3);
    expect(c.get('d')).toBe(4);
  });

  it('overwriting an existing key does not evict another key', () => {
    const c = new ApiCache({ maxEntries: 2 });
    c.set('a', 1, 1000);
    c.set('b', 2, 1000);
    c.set('b', 3, 1000);
    expect(c.size).toBe(2);
    expect(c.get('a')).toBe(1);
    expect(c.get('b')).toBe(3);
  });

  it('expires entries and tracks bytes', () => {
    const c = new ApiCache({ maxEntries: 10 });
    c.set('a', 'x'.repeat(100), -1);
    expect(c.get('a')).toBeUndefined();
    expect(c.bytes).toBe(0);
  });

  it('enforces the byte budget by evicting LRU entries', () => {
    const c = new ApiCache({ maxEntries: 100, maxBytes: 1000 });
    c.set('a', 'a', 1000, 400);
    c.set('b', 'b', 1000, 400);
    c.get('a');
    c.set('c', 'c', 1000, 400); // 1200 > 1000 -> evict b
    expect(c.get('b')).toBeUndefined();
    expect(c.get('a')).toBe('a');
    expect(c.get('c')).toBe('c');
    expect(c.bytes).toBe(800);
    c.invalidate('a');
    expect(c.bytes).toBe(400);
  });

  it('skips values larger than the whole budget', () => {
    const c = new ApiCache({ maxBytes: 100 });
    c.set('big', 'x', 1000, 500);
    expect(c.size).toBe(0);
  });

  it('estimates sizes monotonically and boundedly', () => {
    expect(estimateBytes('abcd')).toBeGreaterThan(estimateBytes('ab'));
    const big = Array.from({ length: 50_000 }, (_, i) => ({ id: String(i), t: 'hello' }));
    expect(estimateBytes(big)).toBeGreaterThan(estimateBytes(big.slice(0, 10)));
  });

  it('routes viewer feed keys separately but invalidatePrefix hits both', () => {
    apiCache.set('feed:v3:foryou:all:u1:20', 1, 1000);
    apiCache.set('other:k', 2, 1000);
    expect(apiCache.get('feed:v3:foryou:all:u1:20')).toBe(1);
    apiCache.invalidatePrefix('feed:v3:');
    expect(apiCache.get('feed:v3:foryou:all:u1:20')).toBeUndefined();
    expect(apiCache.get('other:k')).toBe(2);
  });

  // 2026-10-21: web workers died with "JavaScript heap out of memory" at --max-old-space-size=384. The caches'
  // budgets did not know the heap they live in, and the estimator stopped after 400 nodes, undercounting a feed
  // page ~1.8x. These pin the two halves of the fix.
  const post = (i: number) => ({
    id: `post-${i}-${'x'.repeat(20)}`,
    content: 'lorem ipsum '.repeat(12),
    createdAt: new Date(),
    updatedAt: new Date(),
    author: {
      id: `u-${i}`,
      username: 'someone',
      displayName: 'Some One',
      image: 'https://cdn.example/u.webp',
      isVerified: true,
      cosmetics: { frame: null, badge: 'gold', color: '#ffaa00' },
    },
    likeCount: 12,
    replyCount: 3,
    viewCount: 12345.5,
    liked: false,
    media: [0, 1, 2].map((k) => ({ id: `m-${i}-${k}`, url: 'https://cdn.example/m.webp', width: 1200, height: 800, blurhash: 'LEHV6nWB2yk8pyo0adR*.7kCMdnj' })),
    tags: ['a', 'b', 'c', 'd'],
    reactions: { fire: 3, laugh: 1, heart: 2, wow: 0 },
  });

  it('counts a whole feed page, not the first 400 nodes of it', () => {
    const posts = Array.from({ length: 20 }, (_, i) => post(i));
    const parts = posts.reduce((sum, p) => sum + estimateBytes(p), 0);
    const page = estimateBytes({ items: posts, nextCursor: 'c', hasMore: true });
    expect(page).toBeGreaterThanOrEqual(parts);
    expect(page).toBeLessThan(parts * 1.1);
  });

  it('extrapolates past the node budget in proportion to what is left', () => {
    const one = estimateBytes({ id: '1', t: 'hello' });
    const big = Array.from({ length: 50_000 }, (_, i) => ({ id: String(i), t: 'hello' }));
    expect(estimateBytes(big)).toBeGreaterThan(50_000 * one * 0.5);
  });

  it('sizes the caches as a share of the heap, never past their caps', () => {
    const MB = 1024 * 1024;
    // A production web worker: --max-old-space-size=384 (+ the young generation).
    const worker = 400 * MB;
    expect(heapShare(MAIN_CACHE_HEAP_SHARE, 64 * MB, worker)).toBe(Math.floor(worker * 0.08));
    expect(heapShare(VIEWER_FEED_CACHE_HEAP_SHARE, 24 * MB, worker)).toBe(Math.floor(worker * 0.04));
    // A big heap gets the old fixed budgets, no more.
    expect(heapShare(MAIN_CACHE_HEAP_SHARE, 64 * MB, 8192 * MB)).toBe(64 * MB);
    // Outside Node there is no limit to read: the cap.
    expect(heapShare(MAIN_CACHE_HEAP_SHARE, 64 * MB, null)).toBe(64 * MB);
    // Never so small the cache is useless.
    expect(heapShare(MAIN_CACHE_HEAP_SHARE, 64 * MB, 8 * MB)).toBe(2 * MB);
    // Together the caches leave most of the heap to rendering and requests.
    expect(MAIN_CACHE_HEAP_SHARE + VIEWER_FEED_CACHE_HEAP_SHARE).toBeLessThanOrEqual(0.15);
  });
});

