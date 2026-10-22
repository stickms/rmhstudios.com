/**
 * The signed-in first-page cache (15s fresh + 45s stale) must never serve a
 * permission or moderation fact that has since changed (03-rules 1.3).
 *
 * Each case warms the cache, mutates the world, then reads again WITHIN the TTL
 * and asserts the page is correct without having been re-assembled: the cache
 * still does its job, the reconcile step only removes what is no longer allowed.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { evalWhere, type Row } from './where-eval';

const w = vi.hoisted(() => ({
  posts: [] as Record<string, unknown>[],
  following: [] as string[],
  circles: [] as string[],
  hidden: [] as string[],
  mutedTags: [] as string[],
  mutedWords: [] as string[],
}));

const db = vi.hoisted(() => ({
  rMHark: { findMany: vi.fn() },
  rMHarkRepost: { findMany: vi.fn(async () => []) },
  rMHarkReaction: { groupBy: vi.fn(async () => []), findMany: vi.fn(async () => []) },
  userProfile: { findUnique: vi.fn() },
  follow: { findMany: vi.fn() },
  closeFriend: { findMany: vi.fn() },
  $queryRaw: vi.fn(async () => []),
}));

vi.mock('@/lib/prisma.server', () => ({ prisma: db }));
vi.mock('../../prisma.server', () => ({ prisma: db }));
vi.mock('../../social/follow-graph.server', () => ({ getFollowingIds: async () => w.following }));
vi.mock('../../moderation.server', () => ({
  getHiddenAuthorIds: async () => w.hidden,
  getBlockedAuthorIds: async () => w.hidden,
}));
vi.mock('../signals.server', () => ({
  getSignals: async () => ({ lessAuthors: [], mutedTags: w.mutedTags, followedTags: [] }),
}));
vi.mock('../personalize.server', () => ({ buildInterestProfile: async () => null }));
vi.mock('../../user-display.server', () => ({ getUserDisplayMap: async () => new Map() }));
vi.mock('../../blog', () => ({ getAllPosts: async () => [] }));
vi.mock('../audience.server', async () => {
  const actual = await vi.importActual<typeof import('../audience.server')>('../audience.server');
  return { ...actual, circleOwnerIds: async () => w.circles };
});

import { getTimeline, invalidateViewerFeedPages } from '../timeline';
import { apiCache, viewerFeedCache, VIEWER_FEED_PREFIX } from '../../cache';

const NOW = Date.now();
const VIEWER = 'viewer';

function post(id: string, over: Row = {}): Row {
  return {
    id,
    userId: 'author',
    content: `content of ${id}`,
    createdAt: new Date(NOW - Number(id.replace(/\D/g, '') || 1) * 1000),
    audience: 'PUBLIC',
    deletedAt: null,
    communityId: null,
    threadRootId: null,
    likeCount: 0,
    commentCount: 0,
    repostCount: 0,
    viewCount: 0,
    imageUrls: [],
    imageAlts: [],
    original: null,
    poll: null,
    likes: [],
    reposts: [],
    bookmarks: [],
    unlocks: [],
    hashtags: [],
    ...over,
  };
}

const assemblies = () => db.rMHark.findMany.mock.calls.filter((c: unknown[]) => {
    const a = c[0] as { take?: number; where: { id?: unknown } };
    return a.take !== undefined && !a.where.id;
  }).length;

async function read(surface: 'foryou' | 'following' = 'foryou', userId = VIEWER) {
  const page = await getTimeline({ userId, surface, filter: 'all', cursor: null, limit: 20, search: null });
  // Ranking may reorder (followed authors boost); order is not what is under test.
  return page.items.filter((i) => i.type === 'rmhark').map((i) => i.id).sort();
}

beforeEach(() => {
  apiCache.invalidatePrefix('');
  Object.assign(w, { following: ['friend'], circles: [], hidden: [], mutedTags: [], mutedWords: [] });
  w.posts = [post('p1'), post('p2', { userId: 'friend' }), post('p3')];
  db.rMHark.findMany.mockReset();
  db.rMHark.findMany.mockImplementation(async (a: { where: Row; take?: number }) => {
    const hits = w.posts.filter((p) => evalWhere(p, a.where));
    hits.sort((x, y) => (y.createdAt as Date).getTime() - (x.createdAt as Date).getTime());
    return hits.slice(0, a.take ?? hits.length);
  });
  db.follow.findMany.mockReset();
  db.follow.findMany.mockImplementation(async (a: { where: { followingId: { in: string[] } } }) =>
    w.following.filter((id) => a.where.followingId.in.includes(id)).map((followingId) => ({ followingId })),
  );
  db.closeFriend.findMany.mockReset();
  db.closeFriend.findMany.mockImplementation(async (a: { where: { ownerId: { in: string[] } } }) =>
    w.circles.filter((id) => a.where.ownerId.in.includes(id)).map((ownerId) => ({ ownerId })),
  );
  db.userProfile.findUnique.mockReset();
  db.userProfile.findUnique.mockImplementation(async () => ({ mutedWords: w.mutedWords }));
});

describe('signed-in first page cache: correctness against the live database', () => {
  it('serves the cached page without re-assembling (the cache still works)', async () => {
    expect(await read()).toEqual(['p1', 'p2', 'p3']);
    const before = assemblies();
    expect(await read()).toEqual(['p1', 'p2', 'p3']);
    expect(assemblies()).toBe(before);
  });

  it('keeps the page in the per-viewer cache, the only path back out of which is the reconcile', async () => {
    await read();
    const key = `${VIEWER_FEED_PREFIX}foryou:all:${VIEWER}:20`;
    expect(viewerFeedCache.get(key)).toBeDefined();
    // The router and the producer agree: nothing else holds a `feed:` page for this viewer.
    expect(VIEWER_FEED_PREFIX).toBe('feed:v3:');
  });

  it('a block applied while the page sits in the per-viewer cache still hides the post', async () => {
    await read();
    expect(viewerFeedCache.size).toBeGreaterThan(0);
    w.hidden = ['author'];
    expect(await read()).toEqual(['p2']);
  });

  it('never serves one viewer the page cached for another', async () => {
    await read('foryou', 'viewer');
    const before = assemblies();
    await read('foryou', 'someone-else');
    expect(assemblies()).toBeGreaterThan(before);
  });

  it('drops a post whose author was blocked or muted after caching', async () => {
    await read();
    w.hidden = ['friend'];
    expect(await read()).toEqual(['p1', 'p3']);
  });

  it('drops a post deleted (by anyone) after caching', async () => {
    await read();
    w.posts[0].deletedAt = new Date();
    expect(await read()).toEqual(['p2', 'p3']);
  });

  it('never serves a post that is in a (private) community from a cached page', async () => {
    await read();
    w.posts[0].communityId = 'private-community';
    expect(await read()).toEqual(['p2', 'p3']);
  });

  it('drops a post whose audience was tightened after caching', async () => {
    await read();
    w.posts[2].audience = 'PRIVATE';
    expect(await read()).toEqual(['p1', 'p2']);
  });

  it('drops a FOLLOWERS post after the viewer unfollows its author', async () => {
    w.posts[1].audience = 'FOLLOWERS';
    expect(await read()).toContain('p2');
    w.following = [];
    expect(await read()).not.toContain('p2');
  });

  it('drops a CIRCLE post after the author removes the viewer from the circle', async () => {
    w.posts[0].audience = 'CIRCLE';
    w.circles = ['author'];
    expect(await read()).toContain('p1');
    w.circles = [];
    expect(await read()).not.toContain('p1');
  });

  it('Following: an unfollowed author disappears from the cached page', async () => {
    expect(await read('following')).toEqual(['p2']);
    w.following = [];
    expect(await read('following')).toEqual([]);
  });

  it('applies a muted tag and a muted word that were added after caching', async () => {
    await read();
    w.posts[0].hashtags = [{ hashtag: { tag: 'spoilers' } }];
    w.mutedTags = ['spoilers'];
    w.mutedWords = ['content of p3'];
    apiCache.invalidate(`muted-words:${VIEWER}`);
    expect(await read()).toEqual(['p2']);
  });

  it('re-assembles when a paywalled post on the page was unlocked after caching', async () => {
    const page = () =>
      getTimeline({ userId: VIEWER, surface: 'foryou', filter: 'all', cursor: null, limit: 20, search: null });
    w.posts[0].unlockPrice = 50;
    expect((await page()).items.find((i) => i.id === 'p1')?.locked).toBe(true);
    const before = assemblies();
    w.posts[0].unlocks = [{ id: 'u1' }];
    const again = await page();
    expect(assemblies()).toBeGreaterThan(before);
    expect(again.items.find((i) => i.id === 'p1')?.locked).toBeFalsy();
  });

  it('costs one primary-key read on a warm public page (no follow / circle reads)', async () => {
    await read();
    db.rMHark.findMany.mockClear();
    db.follow.findMany.mockClear();
    db.closeFriend.findMany.mockClear();
    await read();
    expect(db.rMHark.findMany).toHaveBeenCalledTimes(1);
    expect(db.follow.findMany).not.toHaveBeenCalled();
    expect(db.closeFriend.findMany).not.toHaveBeenCalled();
  });

  it('invalidateViewerFeedPages forces the next read to re-assemble', async () => {
    await read();
    const before = assemblies();
    w.posts.push(post('p0'));
    await invalidateViewerFeedPages(VIEWER);
    // The helper clears the sizes the app uses (15, 20); this test used 20.
    expect(await read()).toContain('p0');
    expect(assemblies()).toBeGreaterThan(before);
  });
});
