/**
 * Review items 11 and 13 on GET /api/profile/:id/rmharks.
 *
 *  13. The own-posts tab ignored blocks: a viewer who blocked an author (or was
 *      blocked by them) still got their posts here. It now answers empty.
 *  11. The profile's copy of the quote-card mapper returned the quoted post's text
 *      for any original, and ignored `deletedAt`. It uses the shared rule now.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  blocked: [] as string[],
  original: null as Record<string, unknown> | null,
  userFindCalls: 0,
}));

vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: async () => ({ user: { id: 'viewer' }, session: {} }) } },
}));
vi.mock('@/lib/rate-limit.server', () => ({ withRateLimitAsync: async () => null }));
vi.mock('@/lib/moderation.server', () => ({
  getHiddenAuthorIds: async () => h.blocked,
  getBlockedAuthorIds: async () => h.blocked,
}));
vi.mock('@/lib/social/follow-graph.server', () => ({ getFollowingIds: async () => [] }));
vi.mock('@/lib/feed/map-feed-item.server', async (orig) => ({
  ...(await orig<typeof import('@/lib/feed/map-feed-item.server')>()),
  loadBoundedReactionSummaries: async () => new Map(),
}));
vi.mock('@/lib/prisma.server', () => {
  const user = { id: 'author', name: 'A', image: null, handle: 'a', username: 'a' };
  const post = () => ({
    id: 'p1',
    userId: 'author',
    content: 'quote text',
    createdAt: new Date(),
    audience: 'PUBLIC',
    deletedAt: null,
    expiresAt: null,
    likeCount: 0,
    commentCount: 0,
    repostCount: 0,
    viewCount: 0,
    unlockPrice: 0,
    imageUrls: [],
    imageAlts: [],
    user,
    likes: [],
    reposts: [],
    unlocks: [],
    poll: null,
    original: h.original,
  });
  return {
    prisma: {
      user: {
        findUnique: async () => {
          h.userFindCalls += 1;
          return { id: 'author' };
        },
      },
      follow: { findUnique: async () => null },
      closeFriend: { findMany: async () => [] },
      rMHark: { findMany: async () => [post()], findFirst: async () => null },
      rMHarkRepost: { findMany: async () => [] },
    },
  };
});

import { Route } from '../../../app/routes/api/profile/$id/rmharks';

const GET = (
  Route as unknown as {
    options: {
      server: {
        handlers: {
          GET: (a: { request: Request; params: Record<string, string> }) => Promise<Response>;
        };
      };
    };
  }
).options.server.handlers.GET;

async function load() {
  const request = new Request('https://x.test/api/profile/author/rmharks', {
    headers: { 'cf-connecting-ip': String(Math.random()), cookie: 'better-auth.session_token=t' },
  });
  const res = await GET({ request, params: { id: 'author' } });
  return (await res.json()) as { items: { original?: { content: string } }[] };
}

const original = (over: Record<string, unknown> = {}) => ({
  id: 'orig',
  userId: 'oa',
  content: 'SECRET TEXT',
  createdAt: new Date(),
  audience: 'PUBLIC',
  deletedAt: null,
  unlockPrice: 0,
  isSensitive: false,
  communityId: null,
  community: null,
  likeCount: 1,
  commentCount: 1,
  repostCount: 1,
  viewCount: 1,
  imageUrls: [],
  imageAlts: [],
  user: { id: 'oa', name: 'O', image: null, handle: 'o', username: 'o' },
  ...over,
});

beforeEach(() => {
  h.blocked = [];
  h.original = null;
});

describe('profile own posts: blocks (item 13)', () => {
  it('serves the posts normally', async () => {
    expect((await load()).items).toHaveLength(1);
  });
  it('answers empty when the viewer and the author have a block between them', async () => {
    h.blocked = ['author'];
    expect((await load()).items).toEqual([]);
  });
});

describe('profile quote cards (item 11)', () => {
  it('shows a public original', async () => {
    h.original = original();
    expect((await load()).items[0].original?.content).toBe('SECRET TEXT');
  });
  it.each([
    ['FOLLOWERS', { audience: 'FOLLOWERS' }],
    ['PRIVATE', { audience: 'PRIVATE' }],
    ['CIRCLE', { audience: 'CIRCLE' }],
    ['private community', { communityId: 'c', community: { isPrivate: true } }],
  ])('withholds the text of a %s original', async (_l, over) => {
    h.original = original(over);
    expect((await load()).items[0].original?.content).not.toContain('SECRET');
  });
  it('shows the deleted message, not the text, for a deleted original', async () => {
    h.original = original({ deletedAt: new Date() });
    const c = (await load()).items[0].original?.content ?? '';
    expect(c).not.toContain('SECRET');
    expect(c).toMatch(/deleted/);
  });
  it('withholds the text of a blocked author', async () => {
    h.blocked = ['oa'];
    h.original = original();
    expect((await load()).items[0].original?.content).not.toContain('SECRET');
  });
});
