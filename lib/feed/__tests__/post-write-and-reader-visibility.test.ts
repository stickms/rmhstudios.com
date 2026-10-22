/**
 * Round 5: post-level WRITES and the remaining post READERS apply the same
 * rule as the timeline (deleted, audience, hidden author, private community).
 *
 * Adding (like, react, bookmark / save, vote, unlock, quote, mention-notify)
 * needs a readable post; undoing stays allowed. Readers that reach a post by id
 * or through a saved / bookmarked row (bookmarks list, saves, thread, developer
 * API, link previews) filter in the query or per post.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { evalWhere, type Row } from './where-eval';

type Audience = 'PUBLIC' | 'FOLLOWERS' | 'PRIVATE' | 'SUPPORTERS' | 'CIRCLE';
type Post = {
  id: string;
  userId: string;
  audience: Audience;
  deletedAt: Date | null;
  communityId: string | null;
  community: null | { isPrivate: boolean; members: { userId: string }[] };
  content: string;
  unlockPrice: number | null;
  poll?: unknown;
  [extra: string]: unknown;
};

const h = vi.hoisted(() => ({
  viewer: 'viewer' as string | null,
  posts: [] as unknown[],
  hidden: [] as string[],
  existing: false,
  writes: [] as string[],
  mentionNotified: [] as string[],
}));

const posts = () => h.posts as Post[];
const byId = (id: string) => posts().find((p) => p.id === id) ?? null;

vi.mock('@/lib/auth', () => ({
  auth: {
    api: { getSession: async () => (h.viewer ? { user: { id: h.viewer, name: 'V' }, session: {} } : null) },
  },
}));
vi.mock('@/lib/rate-limit.server', () => ({ withRateLimitAsync: async () => null }));
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: () => ({ allowed: true }),
  getClientIp: () => '1.1.1.1',
}));
vi.mock('@/lib/moderation.server', () => ({ getHiddenAuthorIds: async () => h.hidden }));
vi.mock('@/lib/social/follow-graph.server', () => ({ getFollowingIds: async () => [] }));
vi.mock('@/lib/notifications.server', () => ({
  createNotification: async (n: { userId: string }) => {
    h.mentionNotified.push(n.userId);
  },
  removeNotification: async () => {},
}));
vi.mock('@/lib/social/engagement-effects.server', () => ({ enqueueProgression: async () => {} }));
vi.mock('@/lib/feed-sse', () => ({
  feedEventBus: { publish: () => {}, publishPostEngagement: () => {} },
}));
vi.mock('@/lib/xp/engine.server', () => ({ awardXp: async () => {} }));
vi.mock('@/lib/quests/engine.server', () => ({ progressQuests: async () => {} }));
vi.mock('@/lib/economy/ledger.server', () => ({ transferCoins: async () => {} }));
vi.mock('@/lib/feed/map-feed-item.server', () => ({
  applyLock: (i: unknown) => i,
  loadBoundedReactionSummaries: async () => new Map(),
  rmharkIncludeLite: () => ({}),
  mapRmharksWithBoundedReactions: async (rows: { id: string }[]) => rows.map((r) => ({ id: r.id })),
}));
vi.mock('@/lib/communities/starboard.server', () => ({
  isStarEmoji: () => false,
  recordStarToggle: async () => {},
}));
vi.mock('@/lib/prisma.server', () => {
  const write = (name: string) => async () => {
    h.writes.push(name);
    return { id: 'x', likeCount: 1, repostCount: 1 };
  };
  const find = (rows: () => Row[]) => async (a: { where?: Row; take?: number }) =>
    rows().filter((r) => evalWhere(r, a.where)).slice(0, a.take ?? 1000);
  const prisma = {
    rMHark: {
      findUnique: async (a: { where: { id: string } }) => byId(a.where.id),
      findMany: find(() => h.posts as Row[]),
      update: write('post.update'),
    },
    community: {
      findUnique: async (a: { where: { id: string } }) => {
        const p = posts().find((x) => x.communityId === a.where.id);
        if (!p?.community) return null;
        return {
          isPrivate: p.community.isPrivate,
          members: h.viewer ? p.community.members.filter((m) => m.userId === h.viewer) : undefined,
        };
      },
    },
    rMHarkLike: {
      findUnique: async () => (h.existing ? { id: 'l1' } : null),
      create: write('like.create'),
      delete: write('like.delete'),
    },
    rMHarkReaction: {
      findUnique: async () => (h.existing ? { id: 'x1' } : null),
      findMany: async () => [],
      groupBy: async () => [],
      create: write('react.create'),
      delete: write('react.delete'),
    },
    savedItem: {
      findUnique: async () => (h.existing ? { id: 's1' } : null),
      findMany: async () => [{ id: 's1', entityId: 'p1', entityType: 'rmhark', createdAt: new Date(), folderId: null }],
      create: write('save.create'),
      delete: write('save.delete'),
      upsert: write('save.upsert'),
    },
    rMHarkPollOption: {
      findUnique: async () => ({ id: 'o1', poll: { rmheetId: 'p1', multiSelect: true, id: 'poll1', closesAt: null } }),
      findMany: async () => [{ id: 'o1', voteCount: 1 }],
      update: write('option.update'),
      updateMany: write('option.updateMany'),
    },
    rMHarkPollVote: {
      findUnique: async () => (h.existing ? { id: 'v1' } : null),
      findMany: async () => [],
      create: write('vote.create'),
      delete: write('vote.delete'),
      deleteMany: write('vote.deleteMany'),
    },
    postUnlock: { findUnique: async () => null, create: write('unlock.create') },
    user: {
      findMany: async () => [{ id: 'mentioned' }],
      findUnique: async () => ({ name: 'n' }),
    },
    follow: { findUnique: async () => null },
    closeFriend: { findUnique: async () => null, findMany: async () => [] },
    creatorMembership: { findUnique: async () => null },
    // handle->user lookup for @mentions is a raw index-backed query (lib/handles/lookup.server.ts)
    $queryRaw: async () => [{ id: 'mentioned', handle: 'mentioned' }],
    $transaction: async (ops: unknown) => {
      h.writes.push('transaction');
      if (typeof ops === 'function') return (ops as (tx: unknown) => unknown)(prisma);
      return (ops as unknown[]).map(() => ({ likeCount: 1, repostCount: 1 }));
    },
  };
  return { prisma };
});

import { Route as LikeRoute } from '../../../app/routes/api/rmharks/$id/like';
import { Route as ReactRoute } from '../../../app/routes/api/rmharks/$id/react';
import { Route as BookmarkRoute } from '../../../app/routes/api/rmharks/$id/bookmark';
import { Route as VoteRoute } from '../../../app/routes/api/rmharks/$id/vote';
import { Route as UnlockRoute } from '../../../app/routes/api/rmharks/$id/unlock';
import { Route as SavesRoute } from '../../../app/routes/api/saves/index';
import { Route as V1Post } from '../../../app/routes/api/v1/posts/$id';
import { notifyMentions } from '../notify-mentions.server';
import { listBookmarks } from '../../bookmarks.server';
import { hydrateSaves } from '../../saves/saves.server';
import { getThread } from '../thread.server';
import { postCardShowsContent } from '../../og/post-visibility';

vi.mock('@/lib/api/with-developer-api.server', () => ({
  apiOptions: () => new Response(null),
  withDeveloperApi: async (
    _r: Request,
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

const mk = (id: string, over: Partial<Post> = {}): Post => ({
  id,
  userId: 'author',
  audience: 'PUBLIC',
  deletedAt: null,
  communityId: null,
  community: null,
  content: `content ${id}`,
  unlockPrice: null,
  createdAt: new Date(),
  likeCount: 0,
  commentCount: 0,
  repostCount: 0,
  viewCount: 0,
  likes: [],
  reposts: [],
  unlocks: [],
  poll: null,
  original: null,
  user: {
    id: 'author',
    name: 'A',
    image: null,
    username: 'a',
    handle: 'a',
    isVerified: false,
    isAdmin: false,
    isBot: false,
    profile: null,
    inventory: [],
  },
  ...over,
});
const privateCommunity = { isPrivate: true, members: [{ userId: 'someone-else' }] };

type Handler = (a: { request: Request; params: Record<string, string> }) => Promise<Response>;
const call = (route: unknown, method: string, params: Record<string, string>, body?: unknown) =>
  (route as { options: { server: { handlers: Record<string, Handler> } } }).options.server.handlers[method]({
    request: new Request('https://x.test/x', {
      method,
      headers: { 'cf-connecting-ip': '1.1.1.1', cookie: 'better-auth.session_token=t', 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    params,
  });

/** Posts a viewer who is not the author, a follower, a circle member or a member cannot read. */
const hiddenPosts: [string, Post | null][] = [
  ['PRIVATE', mk('p1', { audience: 'PRIVATE' })],
  ['FOLLOWERS (not followed)', mk('p1', { audience: 'FOLLOWERS' })],
  ['CIRCLE (not a member)', mk('p1', { audience: 'CIRCLE' })],
  ['deleted', mk('p1', { deletedAt: new Date() })],
  ['in a private community (non-member)', mk('p1', { communityId: 'c1', community: privateCommunity })],
  ['missing', null],
];

const adds: [string, () => Promise<Response>, string][] = [
  ['like', () => call(LikeRoute, 'POST', { id: 'p1' }), 'like.create'],
  ['react', () => call(ReactRoute, 'POST', { id: 'p1' }, { emoji: '👍' }), 'react.create'],
  ['bookmark', () => call(BookmarkRoute, 'POST', { id: 'p1' }), 'save.create'],
  ['poll vote', () => call(VoteRoute, 'POST', { id: 'p1' }, { optionId: 'o1' }), 'vote.create'],
  ['save (/api/saves)', () => call(SavesRoute, 'POST', {}, { entityType: 'rmhark', entityId: 'p1' }), 'save.upsert'],
];

beforeEach(() => {
  h.viewer = 'viewer';
  h.posts = [mk('p1')];
  h.hidden = [];
  h.existing = false;
  h.writes = [];
  h.mentionNotified = [];
});

describe.each(adds)('%s (add)', (_n, run, writeName) => {
  it('works on a readable post', async () => {
    expect((await run()).status).toBe(200);
    expect(h.writes.some((w) => w === writeName || w === 'transaction')).toBe(true);
  });

  it.each(hiddenPosts)('404s and writes nothing on a %s post', async (_l, post) => {
    h.posts = post ? [post] : [];
    expect((await run()).status).toBe(404);
    expect(h.writes).toEqual([]);
  });

  it('404s for a blocked author and for an anonymous viewer of a private-community post', async () => {
    h.hidden = ['author'];
    expect((await run()).status).toBe(404);
    expect(h.writes).toEqual([]);
  });

  it('lets a community MEMBER act on a private-community post', async () => {
    h.hidden = [];
    h.posts = [mk('p1', { communityId: 'c1', community: { isPrivate: true, members: [{ userId: 'viewer' }] } })];
    expect((await run()).status).toBe(200);
  });
});

describe('undo stays allowed on a post that became private', () => {
  beforeEach(() => {
    h.posts = [mk('p1', { audience: 'PRIVATE' })];
    h.existing = true;
  });
  it('unlike, un-bookmark, un-vote', async () => {
    expect((await call(LikeRoute, 'POST', { id: 'p1' })).status).toBe(200);
    expect((await call(BookmarkRoute, 'POST', { id: 'p1' })).status).toBe(200);
    expect((await call(VoteRoute, 'POST', { id: 'p1' }, { optionId: 'o1' })).status).toBe(200);
  });
  it('un-react succeeds and returns no reactions', async () => {
    const res = await call(ReactRoute, 'POST', { id: 'p1' }, { emoji: '👍' });
    expect(res.status).toBe(200);
    expect((await res.json()).reactions).toEqual([]);
  });
});

describe('unlock (returned the text of ANY post, free or already unlocked)', () => {
  it('serves a readable free post', async () => {
    expect((await call(UnlockRoute, 'POST', { id: 'p1' })).status).toBe(200);
  });
  it.each(hiddenPosts)('404s on a %s post (and charges nothing)', async (_l, post) => {
    h.posts = post ? [{ ...post, unlockPrice: 50 }] : [];
    expect((await call(UnlockRoute, 'POST', { id: 'p1' })).status).toBe(404);
    expect(h.writes).toEqual([]);
  });
});

describe('@mention notifications', () => {
  const run = () =>
    notifyMentions({
      content: 'hello @mentioned',
      author: { id: 'author', name: 'A', image: null, handle: 'a' },
      postId: 'p1',
      entityType: 'rmhark',
      entityId: 'p1',
      link: '/x',
      timestamp: new Date().toISOString(),
    });

  it('notifies on a public post', async () => {
    await run();
    expect(h.mentionNotified).toEqual(['mentioned']);
  });
  it.each(hiddenPosts.filter(([, p]) => p && !p.deletedAt))(
    'does not carry the text of a %s post to the mentioned user',
    async (_l, post) => {
      h.posts = [post as Post];
      await run();
      expect(h.mentionNotified).toEqual([]);
    },
  );
});

describe('readers', () => {
  const store = () => [
    mk('pub'),
    mk('priv', { audience: 'PRIVATE' }),
    mk('gone', { deletedAt: new Date() }),
    mk('comm', { communityId: 'c1', community: privateCommunity }),
    mk('comm-mine', { communityId: 'c2', community: { isPrivate: true, members: [{ userId: 'viewer' }] } }),
  ];

  it('bookmarks list: only posts still readable by the viewer', async () => {
    h.posts = store();
    const saved = ['pub', 'priv', 'gone', 'comm', 'comm-mine'];
    const { prisma } = await import('@/lib/prisma.server');
    (prisma.savedItem.findMany as unknown as (a?: unknown) => Promise<unknown>) = async () =>
      saved.map((entityId) => ({ id: `s-${entityId}`, entityId }));
    const out = await listBookmarks('viewer', {});
    // The lite mapper is mocked to ids; the include-based mapper reads real fields.
    expect(out.items.map((i) => i.id).sort()).toEqual(['comm-mine', 'pub']);
  });

  it('saved items hydrate to tombstones when the post is no longer readable', async () => {
    h.posts = store();
    const rows = ['pub', 'priv', 'gone', 'comm', 'comm-mine'].map((entityId) => ({
      id: `s-${entityId}`,
      entityType: 'rmhark',
      entityId,
      folderId: null,
      createdAt: new Date(),
    }));
    const out = await hydrateSaves('viewer', rows);
    const live = out.filter((o) => !o.tombstone).map((o) => o.entityId).sort();
    expect(live).toEqual(['comm-mine', 'pub']);
  });

  it('thread by id returns null for a thread the viewer cannot read', async () => {
    h.posts = [mk('priv', { audience: 'PRIVATE' })];
    expect(await getThread('priv', 'viewer')).toBeNull();
    h.posts = [mk('comm', { communityId: 'c1', community: privateCommunity })];
    expect(await getThread('comm', null)).toBeNull();
    h.posts = [mk('pub')];
    expect(await getThread('pub', 'viewer')).not.toBeNull();
  });

  it.each([
    ['PRIVATE', mk('p1', { audience: 'PRIVATE' })],
    ['private community', mk('p1', { communityId: 'c1', community: privateCommunity })],
    ['deleted', mk('p1', { deletedAt: new Date() })],
  ])('developer API GET /v1/posts/:id 404s for a %s post', async (_l, post) => {
    h.posts = [post];
    expect((await call(V1Post, 'GET', { id: 'p1' })).status).toBe(404);
  });

  it('link-preview cards never show a private-community post', () => {
    expect(postCardShowsContent({ audience: 'PUBLIC', community: { isPrivate: true } })).toBe(false);
    expect(postCardShowsContent({ audience: 'PUBLIC', community: { isPrivate: false } })).toBe(true);
    expect(postCardShowsContent({ audience: 'PUBLIC', community: null })).toBe(true);
  });
});
