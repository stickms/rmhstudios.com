import { describe, expect, it } from 'vitest';
import type { FeedItem } from '@/lib/feed-types';
import { toGroupPosts } from '@/lib/games/group-posts';

const post = (o: Partial<FeedItem> & { id: string }): FeedItem => ({
  type: 'rmhark',
  createdAt: '2026-11-01T00:00:00.000Z',
  content: 'hello',
  user: { id: 'u', name: 'Ann', handle: 'ann', image: null },
  likeCount: 2,
  commentCount: 1,
  ...o,
});

describe('toGroupPosts', () => {
  it('maps a plain post to its author, text and counts', () => {
    expect(toGroupPosts([post({ id: 'a' })])).toEqual([
      {
        id: 'a',
        content: 'hello',
        createdAt: '2026-11-01T00:00:00.000Z',
        author: { id: 'u', name: 'Ann', handle: 'ann', image: null },
        likeCount: 2,
        commentCount: 1,
      },
    ]);
  });

  it('leaves out locked, sensitive, deleted, pending, reposted and non-rmhark items', () => {
    const items = [
      post({ id: 'locked', locked: true }),
      post({ id: 'nsfw', isSensitive: true }),
      post({ id: 'gone', deletedAt: '2026-11-01T00:00:00.000Z' }),
      post({ id: 'pending', pending: true }),
      post({ id: 'repost', repostedBy: { id: 'x' } }),
      post({ id: 'news', type: 'news' }),
      post({ id: 'empty', content: '  ' }),
      post({ id: 'ok' }),
    ];
    expect(toGroupPosts(items).map((p) => p.id)).toEqual(['ok']);
  });

  it('truncates long text with an ellipsis and caps the list', () => {
    const long = 'x'.repeat(400);
    const [p] = toGroupPosts([post({ id: 'l', content: long })]);
    expect(p.content).toHaveLength(281);
    expect(p.content.endsWith('…')).toBe(true);
    const many = Array.from({ length: 20 }, (_, i) => post({ id: String(i) }));
    expect(toGroupPosts(many, 5)).toHaveLength(5);
  });

  it('falls back to zero counts', () => {
    const [p] = toGroupPosts([post({ id: 'z', likeCount: undefined, commentCount: undefined })]);
    expect([p.likeCount, p.commentCount]).toEqual([0, 0]);
  });
});
