/**
 * Posts in a PRIVATE community are members-only, on every post-level read:
 * by id, through reposts / likes / profile lists / comments, and from a cached
 * feed page. A non-member and an anonymous viewer get what a missing post gets.
 * (WS4 rule: membership = a row in community_member, any role.)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { evalWhere, type Row } from './where-eval';

const h = vi.hoisted(() => ({
  community: null as null | { isPrivate: boolean; members: { id: string }[] },
  post: null as null | {
    userId: string;
    audience: string;
    deletedAt: Date | null;
    communityId: string | null;
  },
  viewer: null as string | null,
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
  getHiddenAuthorIds: async () => [],
  getBlockedAuthorIds: async () => [],
}));
vi.mock('@/lib/social/follow-graph.server', () => ({ getFollowingIds: async () => [] }));
vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    rMHark: {
      findUnique: async () => {
        h.queries += 1;
        return h.post;
      },
    },
    community: {
      findUnique: async () => {
        h.queries += 1;
        // Members are only selected for a signed-in viewer (`members: false` otherwise).
        return h.community ? { ...h.community, members: h.viewer ? h.community.members : undefined } : null;
      },
    },
    closeFriend: { findMany: async () => [] },
    rMHarkLike: { findMany: async () => [] },
    rMHarkComment: { findMany: async () => [] },
    $queryRaw: async () => [],
  },
}));

import {
  canReadThread,
  canViewPost,
  communityVisibleWhere,
  viewerVisiblePostWhere,
} from '../audience.server';
import { Route as PostLikers } from '../../../app/routes/api/rmharks/$id/like';
import { Route as CommentThread } from '../../../app/routes/api/rmharks/$id/comment';

type TestPost = {
  userId: string;
  audience: 'PUBLIC' | 'FOLLOWERS' | 'PRIVATE' | 'SUPPORTERS' | 'CIRCLE';
  deletedAt: Date | null;
  communityId: string | null;
};
const post = (over: Partial<TestPost> = {}): TestPost => ({
  userId: 'author',
  audience: 'PUBLIC',
  deletedAt: null,
  communityId: 'c1',
  ...over,
});

type Role = 'non-member' | 'anonymous' | 'member';
const asRole = (role: Role) => {
  h.viewer = role === 'anonymous' ? null : 'viewer';
  h.community = {
    isPrivate: true,
    members: role === 'member' ? [{ id: 'm1' }] : [],
  };
};

beforeEach(() => {
  h.community = { isPrivate: true, members: [] };
  h.post = post();
  h.viewer = null;
  h.queries = 0;
});

describe('canViewPost / canReadThread', () => {
  it.each([
    ['non-member', false],
    ['anonymous', false],
    ['member', true],
  ] as [Role, boolean][])('private community, public post: %s -> %s', async (role, allowed) => {
    asRole(role);
    expect(await canViewPost(post(), h.viewer)).toBe(allowed);
    expect(await canReadThread(post(), h.viewer)).toBe(allowed);
  });

  it('a public community, or no community, is unaffected (and costs no query)', async () => {
    h.community = { isPrivate: false, members: [] };
    expect(await canViewPost(post(), null)).toBe(true);
    h.queries = 0;
    expect(await canViewPost(post({ communityId: null }), null)).toBe(true);
    expect(h.queries).toBe(0);
  });

  it('membership does not override the post audience', async () => {
    asRole('member');
    expect(await canViewPost(post({ audience: 'PRIVATE' }), 'viewer')).toBe(false);
  });
});

describe('by id and comments (routes)', () => {
  type Handler = (a: { request: Request; params: Record<string, string> }) => Promise<Response>;
  const get = (route: unknown) =>
    (route as { options: { server: { handlers: { GET: Handler } } } }).options.server.handlers.GET({
      request: new Request('https://x.test/x', { headers: { 'cf-connecting-ip': '1.1.1.1', cookie: 'better-auth.session_token=t' } }),
      params: { id: 'p1' },
    });

  it.each([
    ['non-member', 404],
    ['anonymous', 404],
    ['member', 200],
  ] as [Role, number][])('post likers + comment thread, %s -> %s', async (role, status) => {
    asRole(role);
    expect((await get(PostLikers)).status).toBe(status);
    expect((await get(CommentThread)).status).toBe(status);
  });
});

describe('query-side fragment (profile lists, tags, explore, quotes, likes, reposts)', () => {
  const rows: Row[] = [
    { id: 'plain' },
    { id: 'public-community', community: { isPrivate: false, members: [] } },
    { id: 'private-nonmember', community: { isPrivate: true, members: [{ userId: 'other' }] } },
    { id: 'private-member', community: { isPrivate: true, members: [{ userId: 'viewer' }] } },
  ];
  const visible = (viewer: string | null) =>
    rows.filter((r) => evalWhere(r, communityVisibleWhere(viewer))).map((r) => r.id);

  it('anonymous: no private-community post', () => {
    expect(visible(null)).toEqual(['plain', 'public-community']);
  });
  it('non-member: same as anonymous', () => {
    expect(visible('stranger')).toEqual(['plain', 'public-community']);
  });
  it('member: also sees their private community', () => {
    expect(visible('viewer')).toEqual(['plain', 'public-community', 'private-member']);
  });

  it('viewerVisiblePostWhere (likes / reposts) carries the rule', async () => {
    const liked = rows.map((r) => ({ id: r.id, rmhark: { audience: 'PUBLIC', userId: 'a', deletedAt: null, ...r } }));
    for (const [viewer, expected] of [
      [null, ['plain', 'public-community']],
      ['viewer', ['plain', 'public-community', 'private-member']],
    ] as [string | null, string[]][]) {
      const where = { rmhark: await viewerVisiblePostWhere(viewer) };
      expect(liked.filter((l) => evalWhere(l, where)).map((l) => l.id)).toEqual(expected);
    }
  });
});
