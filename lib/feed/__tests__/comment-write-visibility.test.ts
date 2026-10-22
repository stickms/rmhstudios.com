/**
 * A viewer who cannot read a thread must not be able to write to it, and the
 * post-level likers / reposters lists and the developer-API comments GET follow
 * the same rule (`canReadThread`: not deleted, audience, hidden author).
 *
 * Adding (comment, like, repost, react, view) needs a readable thread. Undoing
 * (unlike, un-repost, un-react) stays allowed so an old action can always be
 * removed after the post became private; the un-react answer carries no roster.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type PostRow = { userId: string; audience: string; deletedAt: Date | null };

const h = vi.hoisted(() => ({
  viewer: 'viewer' as string | null,
  post: null as null | { userId: string; audience: string; deletedAt: Date | null },
  hidden: [] as string[],
  existing: false,
  writes: [] as string[],
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: async () => (h.viewer ? { user: { id: h.viewer }, session: {} } : null),
    },
  },
}));
vi.mock('@/lib/rate-limit.server', () => ({ withRateLimitAsync: async () => null }));
vi.mock('@/lib/moderation.server', () => ({ getHiddenAuthorIds: async () => h.hidden }));
vi.mock('@/lib/social/follow-graph.server', () => ({ getFollowingIds: async () => [] }));
vi.mock('@/lib/notifications.server', () => ({
  createNotification: async () => {},
  removeNotification: async () => {},
}));
vi.mock('@/lib/social/engagement-effects.server', () => ({ enqueueProgression: async () => {} }));
vi.mock('@/lib/feed/notify-mentions.server', () => ({ notifyMentions: async () => {} }));
vi.mock('@/lib/feed-sse', () => ({ feedEventBus: { publish: () => {}, publishPostEngagement: () => {} } }));
vi.mock('@/lib/api/with-developer-api.server', () => ({
  apiOptions: () => new Response(null),
  withDeveloperApi: async (
    _req: Request,
    fn: (c: {
      userId: string | null;
      json: (b: unknown, s?: number) => Response;
      error: (c: string, m: string, s: number) => Response;
    }) => Promise<Response>,
  ) =>
    fn({
      userId: h.viewer,
      json: (b, s = 200) => Response.json(b, { status: s }),
      error: (_c, m, s) => Response.json({ error: m }, { status: s }),
    }),
}));
vi.mock('@/lib/prisma.server', () => {
  const write = (name: string) => async () => {
    h.writes.push(name);
    return { id: 'x', likeCount: 1, commentCount: 1 };
  };
  const prisma = {
    rMHark: {
      findUnique: async () => h.post,
      update: write('post.update'),
    },
    rMHarkComment: {
      findUnique: async () => ({
        id: 'c1',
        deletedAt: null,
        userId: 'commenter',
        rmhark: h.post,
      }),
      findMany: async () => [],
      create: write('comment.create'),
      update: write('comment.update'),
      updateMany: write('comment.updateMany'),
    },
    rMHarkCommentLike: {
      findUnique: async () => (h.existing ? { id: 'l1' } : null),
      findMany: async () => [],
      create: write('like.create'),
      delete: write('like.delete'),
    },
    rMHarkCommentRepost: {
      findUnique: async () => (h.existing ? { id: 'r1' } : null),
      findMany: async () => [],
      create: write('repost.create'),
      delete: write('repost.delete'),
    },
    rMHarkCommentReaction: {
      findUnique: async () => (h.existing ? { id: 'x1' } : null),
      findMany: async () => [{ emoji: '👍', userId: 'someone-else' }],
      create: write('react.create'),
      delete: write('react.delete'),
    },
    rMHarkCommentView: { createMany: write('view.createMany') },
    rMHarkLike: { findMany: async () => [] },
    rMHarkRepost: { findMany: async () => [] },
    follow: { findUnique: async () => null },
    closeFriend: { findUnique: async () => null },
    creatorMembership: { findUnique: async () => null },
    $transaction: async (ops: unknown[]) => {
      h.writes.push('transaction');
      return ops.map(() => ({ likeCount: 1, commentCount: 1 }));
    },
  };
  return { prisma };
});

import { Route as LikeRoute } from '../../../app/routes/api/rmharks/$id/comment/$commentId/like';
import { Route as RepostRoute } from '../../../app/routes/api/rmharks/$id/comment/$commentId/repost';
import { Route as ViewRoute } from '../../../app/routes/api/rmharks/$id/comment/$commentId/view';
import { Route as ReactRoute } from '../../../app/routes/api/comments/$commentId/react';
import { Route as PostLikersRoute } from '../../../app/routes/api/rmharks/$id/like';
import { Route as PostRepostersRoute } from '../../../app/routes/api/rmharks/$id/repost';
import { Route as V1Comments } from '../../../app/routes/api/v1/posts/$id/comments';
import { createComment } from '../../social/engagement.server';

type Handler = (a: { request: Request; params: Record<string, string> }) => Promise<Response>;
const call = (route: unknown, method: 'GET' | 'POST', params: Record<string, string>, body?: unknown) =>
  (route as { options: { server: { handlers: Record<string, Handler> } } }).options.server.handlers[
    method
  ]({
    request: new Request('https://x.test/x', {
      method,
      headers: { 'cf-connecting-ip': '1.1.1.1', cookie: 'better-auth.session_token=t', 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    params,
  });

const pub: PostRow = { userId: 'author', audience: 'PUBLIC', deletedAt: null };
const hiddenPosts: [string, PostRow | null][] = [
  ['PRIVATE', { ...pub, audience: 'PRIVATE' }],
  ['FOLLOWERS (not followed)', { ...pub, audience: 'FOLLOWERS' }],
  ['CIRCLE (not a member)', { ...pub, audience: 'CIRCLE' }],
  ['deleted', { ...pub, deletedAt: new Date() }],
  ['missing', null],
];

const adds: [string, () => Promise<Response>, string][] = [
  ['comment like', () => call(LikeRoute, 'POST', { id: 'p1', commentId: 'c1' }), 'like.create'],
  ['comment repost', () => call(RepostRoute, 'POST', { id: 'p1', commentId: 'c1' }), 'repost.create'],
  ['comment view', () => call(ViewRoute, 'POST', { id: 'p1', commentId: 'c1' }), 'view.createMany'],
  ['comment react', () => call(ReactRoute, 'POST', { commentId: 'c1' }, { emoji: '👍' }), 'react.create'],
];

beforeEach(() => {
  h.viewer = 'viewer';
  h.post = pub;
  h.hidden = [];
  h.existing = false;
  h.writes = [];
});

describe.each(adds)('%s (add)', (_n, run, writeName) => {
  it('works on a readable thread', async () => {
    expect((await run()).status).toBe(200);
    expect(h.writes.some((w) => w === writeName || w === 'transaction')).toBe(true);
  });

  it.each(hiddenPosts)('404s and writes nothing on a %s post', async (_l, post) => {
    h.post = post;
    expect((await run()).status).toBe(404);
    expect(h.writes).toEqual([]);
  });

  it('404s when the post author is blocked by the viewer', async () => {
    h.hidden = ['author'];
    expect((await run()).status).toBe(404);
    expect(h.writes).toEqual([]);
  });
});

describe('undo stays allowed on a thread that became private', () => {
  beforeEach(() => {
    h.post = { ...pub, audience: 'PRIVATE' };
    h.existing = true;
  });

  it('unlike / un-repost succeed', async () => {
    expect((await call(LikeRoute, 'POST', { id: 'p1', commentId: 'c1' })).status).toBe(200);
    expect((await call(RepostRoute, 'POST', { id: 'p1', commentId: 'c1' })).status).toBe(200);
  });

  it('un-react succeeds and returns no reactor roster', async () => {
    const res = await call(ReactRoute, 'POST', { commentId: 'c1' }, { emoji: '👍' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reacted).toBe(false);
    expect(body.reactions).toEqual([]);
  });
});

describe('createComment (the service behind the web route and the developer API)', () => {
  it('creates on a readable post', async () => {
    const r = await createComment({ userId: 'viewer', postId: 'p1', content: 'hi' });
    expect(r.found).toBe(true);
  });

  it.each(hiddenPosts)('refuses on a %s post and writes nothing', async (_l, post) => {
    h.post = post;
    const r = await createComment({ userId: 'viewer', postId: 'p1', content: 'hi' });
    expect(r.found).toBe(false);
    expect(h.writes).toEqual([]);
  });
});

describe.each([
  ['post likers', () => call(PostLikersRoute, 'GET', { id: 'p1' })],
  ['post reposters', () => call(PostRepostersRoute, 'GET', { id: 'p1' })],
  ['v1 comments', () => call(V1Comments, 'GET', { id: 'p1' })],
])('%s (read)', (_n, run) => {
  it('serves a public post', async () => {
    expect((await run()).status).toBe(200);
  });

  it.each(hiddenPosts)('404s for a %s post', async (_l, post) => {
    h.post = post;
    expect((await run()).status).toBe(404);
  });

  it('404s for a blocked author', async () => {
    h.hidden = ['author'];
    expect((await run()).status).toBe(404);
  });
});

describe('v1 comments: audience gate consistent with the rest', () => {
  it('lets the author read their own private post', async () => {
    h.post = { ...pub, audience: 'PRIVATE' };
    h.viewer = 'author';
    expect((await call(V1Comments, 'GET', { id: 'p1' })).status).toBe(200);
  });
});
