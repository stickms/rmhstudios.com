import { describe, expect, it } from 'vitest';
import { ApiCache, apiCache, estimateBytes } from '@/lib/cache';

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
    apiCache.set('feed:v2:foryou:all:u1:20', 1, 1000);
    apiCache.set('other:k', 2, 1000);
    expect(apiCache.get('feed:v2:foryou:all:u1:20')).toBe(1);
    apiCache.invalidatePrefix('feed:v2:');
    expect(apiCache.get('feed:v2:foryou:all:u1:20')).toBeUndefined();
    expect(apiCache.get('other:k')).toBe(2);
  });
});
