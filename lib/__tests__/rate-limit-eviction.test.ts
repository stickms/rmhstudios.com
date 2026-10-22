import { afterEach, describe, expect, it, vi } from 'vitest';
import { rateLimit } from '@/lib/rate-limit';

afterEach(() => vi.useRealTimers());

describe('rateLimit in-process store eviction', () => {
  it('keeps limiting a long-window key while the store churns past capacity', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const opts = { limit: 1, windowMs: 3_600_000, prefix: 'ev-keep' };
    // Fill the store with short-window keys, then the long-window key LAST
    // (newest insert, latest expiry).
    for (let i = 0; i < 10_000; i++) {
      rateLimit(`churn-${i}`, { limit: 1, windowMs: 1_000 + i, prefix: 'ev-churn' });
    }
    rateLimit('victim', opts);
    // Churn well past capacity with new live keys that expire sooner.
    for (let i = 0; i < 12_000; i++) {
      rateLimit(`more-${i}`, { limit: 1, windowMs: 5_000, prefix: 'ev-more' });
    }
    // The long-window key must still have its counter (not reset by eviction).
    const r = rateLimit('victim', opts);
    expect(r.remaining).toBeLessThan(r.limit - 1);
  });

  it('drops expired entries first, so live ones survive a full store', () => {
    vi.useFakeTimers();
    vi.setSystemTime(2_000_000);
    for (let i = 0; i < 10_000; i++) {
      rateLimit(`old-${i}`, { limit: 1, windowMs: 1_000, prefix: 'ev-old' });
    }
    vi.setSystemTime(2_000_000 + 2_000);
    rateLimit('live', { limit: 1, windowMs: 60_000, prefix: 'ev-live' });
    for (let i = 0; i < 20; i++) {
      rateLimit(`new-${i}`, { limit: 1, windowMs: 60_000, prefix: 'ev-new' });
    }
    const r = rateLimit('live', { limit: 1, windowMs: 60_000, prefix: 'ev-live' });
    expect(r.remaining).toBeLessThan(r.limit - 1);
  });
});
