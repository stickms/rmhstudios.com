import { describe, expect, it } from 'vitest';
import {
  STORIES_PAGE_SIZE,
  aggregatePublished,
  decodeStoryCursor,
  encodeStoryCursor,
  pageStories,
  sortStories,
  type StoryIndexRow,
} from '@/lib/reading/stories-index';

const row = (slug: string, latest: string, count = 1): StoryIndexRow => ({
  slug,
  title: slug.toUpperCase(),
  summary: '',
  count,
  latest,
});

describe('aggregatePublished', () => {
  it('counts published articles only and takes the newest published date', () => {
    const out = aggregatePublished([
      { storyId: 's1', status: 'PUBLISHED', date: '2026-12-01' },
      { storyId: 's1', status: 'PUBLISHED', date: '2026-12-10' },
      { storyId: 's1', status: 'DRAFT', date: '2026-12-20' },
    ]);
    expect(out).toEqual([{ storyId: 's1', count: 2, latest: '2026-12-10' }]);
  });

  it('drops a story with no published article', () => {
    const out = aggregatePublished([
      { storyId: 's1', status: 'DRAFT', date: '2026-12-01' },
      { storyId: 's1', status: 'HIDDEN', date: '2026-12-02' },
      { storyId: 's2', status: 'PUBLISHED', date: '2026-11-30' },
    ]);
    expect(out.map((a) => a.storyId)).toEqual(['s2']);
  });
});

describe('sortStories', () => {
  it('orders by newest article first, then slug', () => {
    const sorted = sortStories([row('b', '2026-12-01'), row('c', '2026-12-09'), row('a', '2026-12-01')]);
    expect(sorted.map((r) => r.slug)).toEqual(['c', 'a', 'b']);
  });
});

describe('pageStories', () => {
  const all = sortStories(
    Array.from({ length: 75 }, (_, i) =>
      row(`s${String(i).padStart(2, '0')}`, `2026-12-${String(1 + (i % 28)).padStart(2, '0')}`),
    ),
  );

  it('pages 30 at a time with a cursor that continues exactly where the page ended', () => {
    const first = pageStories(all, null);
    expect(first.stories).toHaveLength(STORIES_PAGE_SIZE);
    expect(first.nextCursor).toBe(encodeStoryCursor(first.stories.at(-1)!));
    const second = pageStories(all, first.nextCursor);
    const third = pageStories(all, second.nextCursor);
    expect(third.stories).toHaveLength(15);
    expect(third.nextCursor).toBeNull();
    const slugs = [...first.stories, ...second.stories, ...third.stories].map((r) => r.slug);
    expect(slugs).toEqual(all.map((r) => r.slug));
  });

  it('has no next page when the list fits', () => {
    expect(pageStories(all.slice(0, 30), null).nextCursor).toBeNull();
  });

  it('ignores a malformed cursor', () => {
    expect(decodeStoryCursor('nonsense')).toBeNull();
    expect(pageStories(all, 'nonsense').stories[0]).toEqual(all[0]);
  });
});
