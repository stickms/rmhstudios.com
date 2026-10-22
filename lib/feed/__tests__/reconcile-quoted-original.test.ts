/**
 * Review item 8: a cached first page is re-checked at serve time, and that must
 * include the ORIGINAL a quote card carries, not just the top-level post. A quoted
 * post that has since gone private, been deleted or whose author was blocked must
 * not keep showing its text from the cache.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FeedItem } from '@/lib/feed-types';

const w = vi.hoisted(() => ({
  quoted: [] as Record<string, unknown>[],
  blocked: [] as string[],
  blockLookupFails: false,
}));

vi.mock('../../prisma.server', () => ({
  prisma: {
    rMHark: {
      findMany: async (a: { select: Record<string, unknown> }) =>
        a.select.hashtags
          ? [
              {
                id: 'quote-post',
                userId: 'author',
                audience: 'PUBLIC',
                deletedAt: null,
                communityId: null,
                hashtags: [],
                unlocks: [],
              },
            ]
          : w.quoted,
    },
    follow: { findMany: async () => [] },
    closeFriend: { findMany: async () => [] },
  },
}));
vi.mock('../../moderation.server', () => ({
  getHiddenAuthorIds: async () => [],
  getBlockedAuthorIds: async () => {
    if (w.blockLookupFails) throw new Error('db down');
    return w.blocked;
  },
}));
vi.mock('../signals.server', () => ({
  getSignals: async () => ({ lessAuthors: [], mutedTags: [], followedTags: [] }),
}));

import { reconcileCachedPage } from '../page-reconcile.server';

const card = (): FeedItem =>
  ({
    id: 'quote-post',
    type: 'rmhark',
    content: 'my quote',
    createdAt: new Date().toISOString(),
    user: { id: 'author' },
    original: {
      id: 'orig',
      type: 'rmhark',
      content: 'SECRET TEXT',
      likeCount: 9,
      user: { id: 'oa' },
    },
  }) as unknown as FeedItem;

const origRow = (over: Record<string, unknown> = {}) => ({
  id: 'orig',
  userId: 'oa',
  audience: 'PUBLIC',
  deletedAt: null,
  unlockPrice: 0,
  isSensitive: false,
  communityId: null,
  community: null,
  ...over,
});

async function originalText(): Promise<string | undefined> {
  const r = await reconcileCachedPage([card()], 'viewer', 'foryou');
  return r.items[0].original?.content;
}

beforeEach(() => {
  w.quoted = [origRow()];
  w.blocked = [];
  w.blockLookupFails = false;
});

describe('reconcile re-checks the quoted original', () => {
  it('keeps a still-public original', async () => {
    expect(await originalText()).toBe('SECRET TEXT');
  });

  it.each([
    ['gone private', { audience: 'PRIVATE' }],
    ['FOLLOWERS-only now', { audience: 'FOLLOWERS' }],
    ['moved into a private community', { communityId: 'c', community: { isPrivate: true } }],
    ['deleted', { deletedAt: new Date() }],
  ])('withholds the text once the original is %s', async (_l, over) => {
    w.quoted = [origRow(over)];
    expect(await originalText()).not.toContain('SECRET');
  });

  it('withholds an original that no longer exists', async () => {
    w.quoted = [];
    expect(await originalText()).not.toContain('SECRET');
  });

  it('withholds an original whose author the viewer blocked', async () => {
    w.blocked = ['oa'];
    expect(await originalText()).not.toContain('SECRET');
  });

  it('keeps the quote itself', async () => {
    const r = await reconcileCachedPage([card()], 'viewer', 'foryou');
    expect(r.items).toHaveLength(1);
    expect(r.items[0].content).toBe('my quote');
  });

  it('rejects when the block lookup fails, even for a page with no quoted original', async () => {
    w.blockLookupFails = true;
    const plain = { ...card(), original: undefined } as FeedItem;
    await expect(reconcileCachedPage([plain], 'viewer', 'foryou')).rejects.toThrow('db down');
  });

  it('drops a cached post by a blocked author (not only quoted originals)', async () => {
    w.blocked = ['author'];
    const plain = { ...card(), original: undefined } as FeedItem;
    const r = await reconcileCachedPage([plain], 'viewer', 'foryou');
    expect(r.items).toHaveLength(0);
  });
});
