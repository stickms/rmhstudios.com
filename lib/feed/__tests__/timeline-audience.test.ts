/**
 * The timeline must never serve a post the viewer is not allowed to see.
 *
 * Two regressions this pins, both found by running the real queries against a
 * seeded database (WS2, docs/server-perf-2026-10-21):
 *
 *  1. KEYSET vs AUDIENCE. `keysetWhere` and `audienceWhere` both return a
 *     top-level `{ OR: [...] }`, and the For-You query spread them into one
 *     object. On every cursored page the keyset's `OR` replaced the audience
 *     `OR`, so page 2+ of a signed-in feed returned strangers' PRIVATE,
 *     FOLLOWERS and CIRCLE posts.
 *  2. FOLLOWING SURFACE. It only excluded PRIVATE, so a followed author's
 *     CIRCLE (close-friends) posts reached every follower, and its repost query
 *     checked nothing but `deletedAt`, so a repost of a non-public post reached
 *     the reposter's followers.
 *
 * The Prisma double below evaluates the `where` fragments the timeline builds
 * (AND / OR / NOT, equality, in / notIn, lt / gt / not), so these assert on the
 * rows a real database would return, not on the shape of the query.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const store = vi.hoisted(() => ({
  posts: [] as Record<string, any>[],
  reposts: [] as Record<string, any>[],
  following: [] as string[],
  circleOwners: [] as string[],
}));

const db = vi.hoisted(() => ({
  rMHark: { findMany: vi.fn() },
  rMHarkRepost: { findMany: vi.fn() },
  rMHarkReaction: { groupBy: vi.fn(async () => []), findMany: vi.fn(async () => []) },
  userProfile: { findUnique: vi.fn(async () => ({ mutedWords: [] })) },
  $queryRaw: vi.fn(async () => []),
}));

/** `findMany` over fixture rows: filter by `where`, order newest-first, `take`. */
function fakeFindMany(rows: () => Row[]) {
  return async (args: { where?: Row; take?: number }) => {
    const hits = rows().filter((r) => evalWhere(r, args.where));
    hits.sort(
      (a, b) =>
        b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0),
    );
    return hits.slice(0, args.take ?? hits.length);
  };
}

vi.mock('@/lib/prisma.server', () => ({ prisma: db }));
vi.mock('../../prisma.server', () => ({ prisma: db }));
vi.mock('../../social/follow-graph.server', () => ({
  getFollowingIds: vi.fn(async () => store.following),
}));
vi.mock('../../moderation.server', () => ({ getHiddenAuthorIds: vi.fn(async () => []) }));
vi.mock('../signals.server', () => ({
  getSignals: vi.fn(async () => ({ lessAuthors: [], mutedTags: [], followedTags: [] })),
}));
vi.mock('../personalize.server', () => ({ buildInterestProfile: vi.fn(async () => null) }));
vi.mock('../../user-display.server', () => ({ getUserDisplayMap: vi.fn(async () => new Map()) }));
vi.mock('../../blog', () => ({ getAllPosts: vi.fn(async () => []) }));
vi.mock('../audience.server', async () => {
  const actual = await vi.importActual<typeof import('../audience.server')>('../audience.server');
  return { ...actual, circleOwnerIds: vi.fn(async () => store.circleOwners) };
});

import { getTimeline } from '../timeline';
import { encodeCursor } from '../cursor';
import { apiCache } from '../../cache';
import { evalWhere, type Row } from './where-eval';

const NOW = Date.now();
let seq = 0;
function post(over: Row): Row {
  seq += 1;
  return {
    id: `p${String(seq).padStart(4, '0')}`,
    userId: 'author',
    content: `post ${seq}`,
    createdAt: new Date(NOW - seq * 1000),
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
    ...over,
  };
}

const VIEWER = 'viewer';

beforeEach(() => {
  // The signed-in first page is cached per viewer; start every case cold.
  apiCache.invalidatePrefix('');
  db.rMHark.findMany.mockImplementation(fakeFindMany(() => store.posts));
  db.rMHarkRepost.findMany.mockImplementation(fakeFindMany(() => store.reposts));
  seq = 0;
  store.posts = [];
  store.reposts = [];
  store.following = ['friend'];
  store.circleOwners = [];
});

async function contents(params: {
  surface: 'foryou' | 'following';
  cursor: string | null;
}): Promise<string[]> {
  const page = await getTimeline({
    userId: VIEWER,
    surface: params.surface,
    filter: 'all',
    cursor: params.cursor,
    limit: 50,
    search: null,
  });
  // Page 1 of For-You also interleaves game/app/blog announcement cards.
  return page.items.filter((i) => i.type === 'rmhark').map((i) => i.content ?? '');
}

/** A cursor older than the newest rows, so every fixture falls on a cursored page. */
const olderThanAll = () => encodeCursor(new Date(NOW + 60_000).toISOString(), 'zzzz');

describe('For-You, cursored page (keyset OR must not replace the audience OR)', () => {
  beforeEach(() => {
    store.posts = [
      post({ userId: 'stranger', content: 'public', audience: 'PUBLIC' }),
      post({ userId: 'stranger', content: 'private', audience: 'PRIVATE' }),
      post({ userId: 'stranger', content: 'circle', audience: 'CIRCLE' }),
      post({ userId: 'stranger', content: 'followers-of-stranger', audience: 'FOLLOWERS' }),
      post({ userId: 'friend', content: 'followers-of-friend', audience: 'FOLLOWERS' }),
      post({ userId: VIEWER, content: 'my-private', audience: 'PRIVATE' }),
    ];
  });

  it('serves only what the viewer may see on page 2', async () => {
    const page2 = await contents({ surface: 'foryou', cursor: olderThanAll() });
    expect(page2.sort()).toEqual(['followers-of-friend', 'my-private', 'public']);
  });

  it('serves the same rows on page 1 and page 2', async () => {
    const page1 = await contents({ surface: 'foryou', cursor: null });
    const page2 = await contents({ surface: 'foryou', cursor: olderThanAll() });
    expect(page2.sort()).toEqual(page1.sort());
  });

  it('still pages: the keyset bound is applied', async () => {
    const cursor = encodeCursor(store.posts[1].createdAt.toISOString(), store.posts[1].id);
    const rows = await contents({ surface: 'foryou', cursor });
    // Only rows strictly older than the cursor row survive (public is newer).
    expect(rows).not.toContain('public');
  });

  it('shows a close-friends post only to a member of the author circle', async () => {
    store.circleOwners = ['stranger'];
    const page2 = await contents({ surface: 'foryou', cursor: olderThanAll() });
    expect(page2).toContain('circle');
    expect(page2).not.toContain('private');
  });
});

describe('Following surface', () => {
  beforeEach(() => {
    store.posts = [
      post({ userId: 'friend', content: 'public', audience: 'PUBLIC' }),
      post({ userId: 'friend', content: 'followers', audience: 'FOLLOWERS' }),
      post({ userId: 'friend', content: 'circle', audience: 'CIRCLE' }),
      post({ userId: 'friend', content: 'supporters', audience: 'SUPPORTERS' }),
      post({ userId: 'friend', content: 'private', audience: 'PRIVATE' }),
      post({ userId: 'stranger', content: 'stranger-public', audience: 'PUBLIC' }),
    ];
  });

  it('does not hand a follower the author close-friends or supporter posts', async () => {
    const rows = await contents({ surface: 'following', cursor: null });
    expect(rows.sort()).toEqual(['followers', 'public']);
  });

  it('does show a close-friends post to a circle member', async () => {
    store.circleOwners = ['friend'];
    const rows = await contents({ surface: 'following', cursor: null });
    expect(rows.sort()).toEqual(['circle', 'followers', 'public']);
  });

  it('applies the same rule on page 2', async () => {
    const rows = await contents({ surface: 'following', cursor: olderThanAll() });
    expect(rows.sort()).toEqual(['followers', 'public']);
  });

  it('does not surface a repost of a post the viewer cannot see', async () => {
    const visible = post({ userId: 'stranger', content: 'reposted-public', audience: 'PUBLIC' });
    const hiddenFollowers = post({
      userId: 'stranger',
      content: 'reposted-followers',
      audience: 'FOLLOWERS',
    });
    const hiddenPrivate = post({
      userId: 'stranger',
      content: 'reposted-private',
      audience: 'PRIVATE',
    });
    store.posts = [];
    store.reposts = [visible, hiddenFollowers, hiddenPrivate].map((p, i) => ({
      id: `rp${i}`,
      userId: 'friend',
      createdAt: new Date(NOW - i * 500),
      rmhark: p,
    }));
    const rows = await contents({ surface: 'following', cursor: null });
    expect(rows).toEqual(['reposted-public']);
  });
});
