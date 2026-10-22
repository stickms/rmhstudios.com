/**
 * Every comment read must apply the parent post's visibility.
 *
 * GET /api/rmharks/:id/comment, the comment likers / reposters lists, the thread
 * summary and the comment translation used to answer for ANY post id, so a
 * PRIVATE / FOLLOWERS / CIRCLE / deleted post's thread (text, commenter identities,
 * likers) was readable by anyone holding an id. A viewer who may not see the post
 * now gets 404, the same answer as a post that does not exist.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Post = {
  userId: string;
  audience: 'PUBLIC' | 'FOLLOWERS' | 'PRIVATE' | 'SUPPORTERS' | 'CIRCLE';
  deletedAt: Date | null;
};

const h = vi.hoisted(() => ({
  viewer: null as string | null,
  post: null as null | { userId: string; audience: string; deletedAt: Date | null },
  following: [] as string[],
  circleOwners: [] as string[],
  hidden: [] as string[],
  queries: 0,
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: async () => (h.viewer ? { user: { id: h.viewer }, session: {} } : null),
    },
  },
}));
vi.mock('@/lib/rate-limit.server', () => ({ withRateLimitAsync: async () => null }));
vi.mock('@/lib/moderation.server', () => ({
  getHiddenAuthorIds: async () => h.hidden,
  getBlockedAuthorIds: async () => h.hidden,
}));
vi.mock('@/lib/prisma.server', () => {
  const count = <T>(v: T) => {
    h.queries += 1;
    return v;
  };
  const prisma = {
    rMHark: { findUnique: async () => count(h.post) },
    rMHarkComment: {
      findUnique: async () => count({ rmhark: h.post }),
      findMany: async () => count([]),
    },
    rMHarkCommentLike: { findMany: async () => count([]) },
    rMHarkCommentRepost: { findMany: async () => count([]) },
    follow: {
      findUnique: async () => count(h.following.includes(h.post?.userId ?? '') ? { id: 'f' } : null),
    },
    closeFriend: {
      findUnique: async () => count(h.circleOwners.includes(h.post?.userId ?? '') ? { ownerId: 'o' } : null),
    },
    creatorMembership: { findUnique: async () => count(null) },
    $queryRaw: async () => [],
  };
  return { prisma };
});

import { Route as ThreadRoute } from '../../../app/routes/api/rmharks/$id/comment';
import { Route as LikersRoute } from '../../../app/routes/api/rmharks/$id/comment/$commentId/like';
import { Route as RepostersRoute } from '../../../app/routes/api/rmharks/$id/comment/$commentId/repost';

type Handler = (a: { request: Request; params: Record<string, string> }) => Promise<Response>;
const get = (route: unknown, params: Record<string, string>) =>
  (route as { options: { server: { handlers: { GET: Handler } } } }).options.server.handlers.GET({
    request: new Request('https://x.test/x', { headers: { 'cf-connecting-ip': '1.1.1.1', cookie: 'better-auth.session_token=t' } }),
    params,
  });

const endpoints: [string, () => Promise<Response>][] = [
  ['comment thread', () => get(ThreadRoute, { id: 'p1' })],
  ['comment likers', () => get(LikersRoute, { id: 'p1', commentId: 'c1' })],
  ['comment reposters', () => get(RepostersRoute, { id: 'p1', commentId: 'c1' })],
];

function setup(post: Post | null, viewer: string | null) {
  h.post = post;
  h.viewer = viewer;
}

beforeEach(() => {
  h.following = [];
  h.circleOwners = [];
  h.hidden = [];
  h.queries = 0;
});

describe.each(endpoints)('%s', (_name, call) => {
  const pub: Post = { userId: 'author', audience: 'PUBLIC', deletedAt: null };

  it('serves a PUBLIC post to anyone', async () => {
    setup(pub, null);
    expect((await call()).status).toBe(200);
    setup(pub, 'stranger');
    expect((await call()).status).toBe(200);
  });

  it.each([
    ['PRIVATE', { ...pub, audience: 'PRIVATE' as const }],
    ['FOLLOWERS (viewer does not follow)', { ...pub, audience: 'FOLLOWERS' as const }],
    ['CIRCLE (viewer not in circle)', { ...pub, audience: 'CIRCLE' as const }],
    ['deleted', { ...pub, deletedAt: new Date() }],
    ['missing', null],
  ])('404s for a %s post', async (_label, post) => {
    setup(post, 'stranger');
    expect((await call()).status).toBe(404);
    setup(post, null);
    expect((await call()).status).toBe(404);
  });

  it('404s when the post author is blocked or muted by the viewer', async () => {
    setup(pub, 'stranger');
    h.hidden = ['author'];
    expect((await call()).status).toBe(404);
  });

  it('allows the author, a follower and a circle member where the audience says so', async () => {
    setup({ ...pub, audience: 'PRIVATE' }, 'author');
    expect((await call()).status).toBe(200);
    h.following = ['author'];
    setup({ ...pub, audience: 'FOLLOWERS' }, 'follower');
    expect((await call()).status).toBe(200);
    h.circleOwners = ['author'];
    setup({ ...pub, audience: 'CIRCLE' }, 'friend');
    expect((await call()).status).toBe(200);
  });
});

describe('query cost of the gate', () => {
  it('thread GET on a public post: one extra read (the post row)', async () => {
    setup({ userId: 'author', audience: 'PUBLIC', deletedAt: null }, 'stranger');
    h.queries = 0;
    await get(ThreadRoute, { id: 'p1' });
    // post row + top-level comments page; the reply walk has no roots to expand.
    expect(h.queries).toBe(2);
  });
});
