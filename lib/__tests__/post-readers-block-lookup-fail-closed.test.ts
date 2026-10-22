/**
 * Readers of OTHER PEOPLE'S POSTS must fail when the block lookup fails.
 * `getHiddenAuthorIds` catches and returns [] (right for a feed's mutes, wrong
 * for blocks): used by these readers it turned a database hiccup into "nobody is
 * blocked" and served a blocker's posts to the blocked viewer. They use
 * `getHiddenAuthorIdsStrict` now. The mocks below model exactly that failure:
 * the fail-open variant resolves [], the strict one rejects.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/moderation.server', () => ({
  getHiddenAuthorIds: async () => [],
  // Healthy here on purpose: only the reader's OWN block lookup is the failure
  // under test, so a reader that still used the fail-open variant resolves.
  getBlockedAuthorIds: async () => [],
  getHiddenAuthorIdsStrict: async (id: string | null) => {
    if (!id) return [];
    throw new Error('block lookup down');
  },
}));

// Any model method answers something harmless: an empty list, or one row that
// satisfies whatever the reader reads off it.
vi.mock('@/lib/prisma.server', () => {
  const row = {
    id: 'r1',
    userId: 'owner',
    ownerId: 'owner',
    code: 'c',
    kind: 'garden',
    title: 't',
    updatedAt: new Date(),
    payload: {},
    user: { id: 'owner' },
    audience: 'PUBLIC',
    communityId: null,
    deletedAt: null,
    expiresAt: null,
    isPublic: true,
    guestbookMode: 'everyone',
  };
  const model = new Proxy(
    {},
    {
      get: (_t, method: string) => async () =>
        method === 'findMany' || method === 'groupBy'
          ? []
          : method === 'count'
            ? 0
            : method === 'findFirst'
              ? null // no block row: blockedEitherWay stays false
              : row,
    },
  );
  const db = new Proxy({}, { get: () => model });
  return { prisma: db, prismaRead: db };
});
vi.mock('@/lib/cached.server', () => ({
  cached: (_k: string, _ttl: number, fn: () => Promise<unknown>) => fn(),
  invalidateCached: async () => {},
}));

const DOWN = 'block lookup down';

describe('a failed block lookup rejects the read', () => {
  it('tag feed', async () => {
    const { listTagFeed } = await import('@/lib/tags.server');
    await expect(listTagFeed('rmh', { viewerId: 'v' })).rejects.toThrow(DOWN);
  });

  it('explore', async () => {
    const { listExplore } = await import('@/lib/explore.server');
    await expect(listExplore('v')).rejects.toThrow(DOWN);
  });

  it('quotes', async () => {
    const { listQuotes } = await import('@/lib/feed/quotes.server');
    await expect(listQuotes('p1', 'v', null)).rejects.toThrow(DOWN);
  });

  it('QOTD answers', async () => {
    const { listAnswers } = await import('@/lib/posts-plus/qotd.server');
    await expect(listAnswers('2026-10-22', 'v')).rejects.toThrow(DOWN);
  });

  it('guestbook', async () => {
    const { readGuestbook } = await import('@/lib/guestbook/guestbook.server');
    await expect(readGuestbook('owner', 'v', null)).rejects.toThrow(DOWN);
  });

  it('reading highlights', async () => {
    const { getDocBundle } = await import('@/lib/reading/highlights.server');
    await expect(getDocBundle('book' as never, 'k', 'v')).rejects.toThrow(DOWN);
  });

  it('reading shelves', async () => {
    const { getPublicShelves } = await import('@/lib/reading/shelves.server');
    await expect(getPublicShelves('owner', 'v')).rejects.toThrow(DOWN);
  });

  it('world snapshots (view and postcard gate)', async () => {
    const { viewSnapshot, leavePostcard } = await import('@/lib/worlds/snapshots.server');
    await expect(viewSnapshot('c', 'v')).rejects.toThrow(DOWN);
    await expect(leavePostcard('c', 'v', 'hello')).rejects.toThrow(DOWN);
  });

  it('universal search (posts)', async () => {
    const { universalSearch } = await import('@/lib/search/universal.server');
    await expect(
      universalSearch({ query: 'hello', tab: 'posts' as never, viewerId: 'v', signedIn: true }),
    ).rejects.toThrow(DOWN);
  });
});
