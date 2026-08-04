/**
 * Cover for `deduplicateReposts`, whose trailing-window check was rewritten to
 * stop allocating a sliced+mapped array per item. Behaviour must be identical,
 * so the cases below pin the window semantics rather than the implementation.
 */

import { describe, it, expect } from 'vitest';
import { deduplicateReposts } from '@/lib/feed/dedupe';
import type { FeedItem } from '@/lib/feed-types';

const post = (id: string): FeedItem =>
  ({ id, type: 'rmhark', createdAt: '2026-01-01T00:00:00.000Z' }) as FeedItem;

const repost = (id: string, underlying: string): FeedItem =>
  ({
    id,
    type: 'rmhark',
    createdAt: '2026-01-01T00:00:00.000Z',
    actualId: underlying,
    repostedBy: { id: 'u1' },
  }) as unknown as FeedItem;

/** The pre-rewrite implementation, kept as the behavioural reference. */
function reference(items: FeedItem[], windowSize = 2): FeedItem[] {
  const result: FeedItem[] = [];
  for (const item of items) {
    if (item.repostedBy) {
      const underlyingId = item.actualId ?? item.id;
      const recentIds = result.slice(-windowSize).map((i) => i.actualId ?? i.id);
      if (recentIds.includes(underlyingId)) continue;
    }
    result.push(item);
  }
  return result;
}

describe('deduplicateReposts', () => {
  it('drops a repost of a post already inside the trailing window', () => {
    const items = [post('a'), repost('r1', 'a')];
    expect(deduplicateReposts(items).map((i) => i.id)).toEqual(['a']);
  });

  it('keeps a repost once the original has fallen out of the window', () => {
    // window = 2, so 'a' is out of view by the time the repost arrives.
    const items = [post('a'), post('b'), post('c'), repost('r1', 'a')];
    expect(deduplicateReposts(items).map((i) => i.id)).toEqual(['a', 'b', 'c', 'r1']);
  });

  it('never drops a non-repost, even against an identical id in the window', () => {
    const items = [post('a'), post('a')];
    expect(deduplicateReposts(items)).toHaveLength(2);
  });

  it('compares reposts against other reposts of the same underlying post', () => {
    const items = [repost('r1', 'x'), repost('r2', 'x')];
    expect(deduplicateReposts(items).map((i) => i.id)).toEqual(['r1']);
  });

  it('honours a custom window size', () => {
    const items = [post('a'), post('b'), post('c'), repost('r1', 'a')];
    expect(deduplicateReposts(items, 1).map((i) => i.id)).toEqual(['a', 'b', 'c', 'r1']);
    expect(deduplicateReposts(items, 4).map((i) => i.id)).toEqual(['a', 'b', 'c']);
    // A zero window compares against nothing, so every repost survives. The
    // old code read the window with `slice(-windowSize)`, and since `-0 === 0`
    // that returned the whole array — meaning zero behaved as "compare against
    // everything". Deliberately corrected; no caller passes 0.
    expect(deduplicateReposts(items, 0).map((i) => i.id)).toEqual(['a', 'b', 'c', 'r1']);
  });

  it('returns an empty list unchanged', () => {
    expect(deduplicateReposts([])).toEqual([]);
  });

  it('matches the previous implementation on randomized feeds', () => {
    let seed = 987654321;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

    for (let trial = 0; trial < 400; trial++) {
      const ids = ['a', 'b', 'c', 'd'];
      const len = 1 + Math.floor(rnd() * 10);
      const items: FeedItem[] = [];
      for (let i = 0; i < len; i++) {
        const target = ids[Math.floor(rnd() * ids.length)];
        items.push(rnd() < 0.5 ? post(target) : repost(`r${i}`, target));
      }
      // windowSize >= 1: at 0 the old `slice(-0)` quirk made the window the
      // entire feed, which the rewrite intentionally corrects (see dedupe.ts).
      const windowSize = 1 + Math.floor(rnd() * 4);
      expect(deduplicateReposts(items, windowSize)).toEqual(reference(items, windowSize));
    }
  });
});
