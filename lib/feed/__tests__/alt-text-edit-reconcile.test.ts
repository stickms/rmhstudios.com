/**
 * Describe images after posting (sprint 05 #16): a cached timeline page is served with the image descriptions as they
 * are NOW, on the post and on a quoted original, and a card whose images are withheld stays without them.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FeedItem } from '@/lib/feed-types';

const h = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
}));

vi.mock('@/lib/prisma.server', () => {
  const prisma = {
    rMHark: {
      findMany: vi.fn(
        async ({
          where,
        }: {
          where: {
            id: {
              in: string[];
            };
          };
        }) => h.rows.filter((r) => where.id.in.includes(r.id as string)),
      ),
    },
    follow: {
      findMany: vi.fn(async () => []),
    },
    closeFriend: {
      findMany: vi.fn(async () => []),
    },
  };
  return {
    prisma,
    default: prisma,
  };
});
vi.mock('@/lib/moderation.server', () => ({
  getHiddenAuthorIds: async () => [],
  getBlockedAuthorIds: async () => [],
}));
vi.mock('@/lib/feed/signals.server', () => ({
  getSignals: async () => ({
    lessAuthors: [],
    mutedTags: [],
    followedTags: [],
  }),
}));
vi.mock('@/lib/feed/repost-mutes.server', () => ({
  getRepostMutedIds: async () => [],
}));

import { reconcileCachedPage } from '@/lib/feed/page-reconcile.server';

const row = (id: string, imageAlts: string[]) => ({
  id,
  userId: 'author',
  audience: 'PUBLIC',
  deletedAt: null,
  communityId: null,
  unlockPrice: null,
  isSensitive: false,
  imageAlts,
  hashtags: [],
  unlocks: [],
  community: null,
  user: {
    profile: {
      hideCountsOnMine: false,
    },
  },
});

const card = (id: string, extra: Partial<FeedItem> = {}): FeedItem =>
  ({
    id,
    type: 'rmhark',
    createdAt: '2026-01-01T00:00:00.000Z',
    content: 'hello',
    imageUrls: ['/a.png', '/b.png'],
    imageAlts: [],
    likeCount: 0,
    commentCount: 0,
    repostCount: 0,
    viewCount: 0,
    ...extra,
  }) as unknown as FeedItem;

beforeEach(() => {
  h.rows = [];
});

describe('reconcileCachedPage image descriptions', () => {
  it('serves a cached card with the descriptions the author has written since', async () => {
    h.rows = [row('p1', ['A red door', 'Two cats'])];
    const out = await reconcileCachedPage([card('p1')], 'viewer', 'foryou');
    expect(out.items[0]!.imageAlts).toEqual(['A red door', 'Two cats']);
    expect(out.needsRefresh).toBe(false);
  });

  it('pads a short stored list so it stays aligned with the images', async () => {
    h.rows = [row('p1', ['Only the first'])];
    const out = await reconcileCachedPage([card('p1')], 'viewer', 'foryou');
    expect(out.items[0]!.imageAlts).toEqual(['Only the first', '']);
  });

  it('updates a quoted original too', async () => {
    h.rows = [row('p1', []), row('q1', ['Quoted description', ''])];
    const quoting = card('p1', {
      imageUrls: undefined,
      imageAlts: undefined,
      original: card('q1'),
    });
    const out = await reconcileCachedPage([quoting], 'viewer', 'foryou');
    expect(out.items[0]!.original!.imageAlts).toEqual(['Quoted description', '']);
  });

  it('leaves a card without visible images alone', async () => {
    h.rows = [row('p1', ['A red door'])];
    const locked = card('p1', {
      imageUrls: undefined,
      imageAlts: undefined,
      locked: true,
    } as Partial<FeedItem>);
    const out = await reconcileCachedPage([locked], 'viewer', 'foryou');
    expect(out.items[0]!.imageAlts).toBeUndefined();
    expect(out.items[0]!.imageUrls).toBeUndefined();
  });
});
