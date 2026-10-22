/**
 * Review items 10 and 11 on the timeline.
 *
 *  10. A repost whose post lives in a community (a private one above all) must
 *      not reach a timeline: the main post queries require `communityId: null`,
 *      the repost queries did not, so a member's repost of a private-community
 *      post reached their followers' feeds and, if the post's audience is PUBLIC,
 *      anonymous visitors.
 *  11. A quote card must not carry the quoted post's text unless the viewer may
 *      see it (shared rule: lib/feed/quoted-original.ts).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const store = vi.hoisted(() => ({
  posts: [] as Record<string, unknown>[],
  reposts: [] as Record<string, unknown>[],
  following: [] as string[],
  circleOwners: [] as string[],
  blocked: [] as string[],
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
    const at = (r: Row) => (r.createdAt as Date).getTime();
    const id = (r: Row) => r.id as string;
    hits.sort((a, b) => at(b) - at(a) || (id(a) < id(b) ? 1 : id(a) > id(b) ? -1 : 0));
    return hits.slice(0, args.take ?? hits.length);
  };
}

vi.mock('@/lib/prisma.server', () => ({ prisma: db }));
vi.mock('../../prisma.server', () => ({ prisma: db }));
vi.mock('../../social/follow-graph.server', () => ({
  getFollowingIds: vi.fn(async () => store.following),
}));
vi.mock('../../moderation.server', () => ({
  getHiddenAuthorIds: vi.fn(async () => []),
  getBlockedAuthorIds: vi.fn(async () => store.blocked),
}));
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
  apiCache.invalidatePrefix('');
  db.rMHark.findMany.mockImplementation(fakeFindMany(() => store.posts));
  db.rMHarkRepost.findMany.mockImplementation(fakeFindMany(() => store.reposts));
  seq = 0;
  store.posts = [];
  store.reposts = [];
  store.following = ['friend'];
  store.circleOwners = [];
  store.blocked = [];
});

function repostOf(p: Row, by = 'friend'): Row {
  seq += 1;
  return {
    id: `r${seq}`,
    userId: by,
    createdAt: new Date(NOW - seq * 1000),
    rmhark: p,
  };
}

async function items(userId: string | null, surface: 'foryou' | 'following') {
  const page = await getTimeline({
    userId,
    surface,
    filter: 'all',
    cursor: null,
    limit: 50,
    search: null,
  });
  return page.items.filter((i) => i.type === 'rmhark');
}

describe('reposts of community posts (item 10)', () => {
  beforeEach(() => {
    store.reposts = [
      repostOf(post({ userId: 'author', content: 'in-community', communityId: 'c-private' })),
      repostOf(post({ userId: 'author', content: 'plain' })),
    ];
  });

  it.each(['following', 'foryou'] as const)('%s feed drops the community post, keeps the plain one', async (surface) => {
    const contents = (await items(VIEWER, surface)).map((i) => i.content);
    expect(contents).toContain('plain');
    expect(contents).not.toContain('in-community');
  });

  it('an anonymous visitor does not get it either', async () => {
    const contents = (await items(null, 'foryou')).map((i) => i.content);
    expect(contents).not.toContain('in-community');
  });
});

describe('quote cards (item 11)', () => {
  const quoted = (over: Row) => ({
    id: 'orig',
    userId: 'orig-author',
    content: 'SECRET TEXT',
    createdAt: new Date(NOW - 99_000),
    audience: 'PUBLIC',
    deletedAt: null,
    unlockPrice: 0,
    isSensitive: false,
    communityId: null,
    community: null,
    likeCount: 7,
    commentCount: 7,
    repostCount: 7,
    viewCount: 7,
    imageUrls: [],
    imageAlts: [],
    ...over,
  });
  const cardOf = async (over: Row, viewer = VIEWER) => {
    store.posts = [post({ userId: viewer === VIEWER ? 'friend' : 'author', original: quoted(over) })];
    const [it] = await items(viewer, 'following');
    return it.original!;
  };

  it('shows a public original', async () => {
    expect((await cardOf({})).content).toBe('SECRET TEXT');
  });

  it.each([
    ['FOLLOWERS', { audience: 'FOLLOWERS' }],
    ['PRIVATE', { audience: 'PRIVATE' }],
    ['CIRCLE', { audience: 'CIRCLE' }],
    ['private community', { communityId: 'c', community: { isPrivate: true } }],
    ['priced', { unlockPrice: 5 }],
  ])('withholds the text of a %s original', async (_l, over) => {
    const card = await cardOf(over);
    expect(card.content).not.toContain('SECRET');
    expect(card.likeCount).toBe(0);
  });

  it('withholds the text of a blocked author', async () => {
    store.blocked = ['orig-author'];
    expect((await cardOf({})).content).not.toContain('SECRET');
  });

  it('a deleted original shows the deleted message', async () => {
    expect((await cardOf({ deletedAt: new Date() })).content).toMatch(/deleted/);
  });

  it('the viewer still sees their own private original', async () => {
    expect((await cardOf({ audience: 'PRIVATE', userId: VIEWER })).content).toBe('SECRET TEXT');
  });
});
