/**
 * `/api/v1/me/feeds*` and `/api/v1/feeds/{id}/posts`, driven through the real developer-API wrapper, the real v1
 * adapters, the real `replaceListMembers` and the real serialiser. Prisma and the site's feed reader are stand-ins
 * (the reader has its own suite), so this file holds the wiring: scopes, 404 for a private feed of someone else,
 * `readableByOthers` on both fields, 409 for a query kind, quiet counts through the serialiser and the members write.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOf, type TestHandler } from '@/lib/__tests__/api-handlers-of';

interface FeedRowT {
  id: string;
  ownerId: string;
  kind: string;
  name: string;
  description: string | null;
  visibility: 'PRIVATE' | 'UNLISTED' | 'PUBLIC';
  isPublic: boolean;
  pinned: boolean;
  tags: string[];
  keywords: string[];
  query: string | null;
  types: string[];
  notify: boolean;
  subscriberCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const h = vi.hoisted(() => ({
  scopes: [] as string[],
  feeds: [] as unknown[],
  members: [] as { feedId: string; handle: string }[],
  users: [] as {
    id: string;
    handle: string | null;
    banReason?: string | null;
    bannedUntil?: Date | null;
    deletionScheduledAt?: Date | null;
  }[],
  blocked: [] as string[],
  posts: [] as Record<string, unknown>[],
  pageIds: [] as string[],
  readCalls: [] as unknown[],
  setPeople: [] as { feedId: string; userIds: string[] }[],
  left: [] as { feedId: string; userId: string }[],
}));

vi.mock('@/lib/db/advisory-lock.server', () => ({ lockKey: async () => undefined }));

vi.mock('@/lib/api/developer-auth.server', async (orig) => ({
  ...(await orig<typeof import('@/lib/api/developer-auth.server')>()),
  authenticateApiKey: async () => ({
    ok: true,
    userId: 'owner_1',
    tier: 'starter',
    keyId: 'key_1',
    scopes: h.scopes,
    testMode: false,
    allowedCidrs: [],
    rateLimitPerMinute: null,
  }),
  touchApiKeyLastUsed: () => undefined,
}));
vi.mock('@/lib/redis.server', () => ({ redisRateLimit: async () => null, redisIncrBy: async () => null }));
vi.mock('@/lib/api/usage.server', () => ({ recordUsage: vi.fn() }));
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => ({ options: config }),
}));
vi.mock('@/lib/moderation.server', () => ({ getBlockedAuthorIds: async () => h.blocked }));
vi.mock('@/lib/feeds/feeds.server', async (orig) => ({
  ...(await orig<typeof import('@/lib/feeds/feeds.server')>()),
  readFeedPage: async (src: unknown, viewerId: string | null, opts: unknown) => {
    h.readCalls.push({ src, viewerId, opts });
    return { page: h.pageIds.map((id) => ({ id, createdAt: new Date('2026-11-20T10:00:00Z') })), nextCursor: null };
  },
  setFeedPeople: async (feedId: string, userIds: string[]) => {
    h.setPeople.push({ feedId, userIds });
  },
}));

vi.mock('@/lib/prisma.server', () => {
  const rows = () => h.feeds as FeedRowT[];
  return {
    prisma: {
      customFeed: {
        findMany: vi.fn(async ({ where, take }: { where: { ownerId: string; kind?: string }; take: number }) =>
          rows()
            .filter((r) => r.ownerId === where.ownerId && (!where.kind || r.kind === where.kind))
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
            .slice(0, take),
        ),
        findFirst: vi.fn(
          async ({ where }: { where: { id: string; ownerId?: string; kind?: string } }) =>
            rows().find(
              (r) =>
                r.id === where.id &&
                (where.ownerId === undefined || r.ownerId === where.ownerId) &&
                (where.kind === undefined || r.kind === where.kind),
            ) ?? null,
        ),
        findUnique: vi.fn(
          async ({ where }: { where: { id: string } }) => rows().find((r) => r.id === where.id) ?? null,
        ),
      },
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          listLeave: {
            findMany: async ({ where }: { where: { feedId: string; userId: { in: string[] } } }) =>
              h.left.filter((l) => l.feedId === where.feedId && where.userId.in.includes(l.userId)),
          },
        }),
      customFeedMember: {
        findMany: vi.fn(async ({ where }: { where: { feedId: string } }) =>
          h.members.filter((m) => m.feedId === where.feedId).map((m) => ({ user: { handle: m.handle } })),
        ),
      },
      user: {
        findMany: vi.fn(async ({ where }: { where: { handle: { in: string[] } } }) => {
          const wanted = where.handle.in.map((x) => x.toLowerCase());
          return h.users.filter((u) => u.handle && wanted.includes(u.handle.toLowerCase()));
        }),
      },
      rMHark: {
        findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
          h.posts.filter((p) => where.id.in.includes(p.id as string)),
        ),
      },
    },
  };
});

const routes = {
  mine: handlersOf<TestHandler>((await import('../../../../app/routes/api/v1/me/feeds')).Route),
  one: handlersOf<TestHandler>((await import('../../../../app/routes/api/v1/me/feeds/$id')).Route),
  members: handlersOf<TestHandler>((await import('../../../../app/routes/api/v1/me/feeds/$id/members')).Route),
  posts: handlersOf<TestHandler>((await import('../../../../app/routes/api/v1/feeds/$id/posts')).Route),
};

const { KEY_PREFIX } = await import('@/lib/api/developer-auth.server');
const BEARER = `Bearer ${KEY_PREFIX}${'k'.repeat(24)}`;
const req = (path: string, init: RequestInit = {}) =>
  new Request(`https://x.test${path}`, { ...init, headers: { authorization: BEARER, ...(init.headers ?? {}) } });
const get = (handler: TestHandler, path: string, params: Record<string, string> = {}) =>
  handler({ request: req(path), params });
const put = (handler: TestHandler, path: string, body: unknown, params: Record<string, string> = {}) =>
  handler({
    request: req(path, { method: 'PUT', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
    params,
  });

function feed(over: Partial<FeedRowT> & { id: string }): FeedRowT {
  return {
    ownerId: 'owner_1',
    kind: 'feed',
    name: 'Rust',
    description: null,
    visibility: 'PRIVATE',
    isPublic: false,
    pinned: false,
    tags: ['rust'],
    keywords: [],
    query: null,
    types: [],
    notify: false,
    subscriberCount: 0,
    createdAt: new Date('2026-11-19T09:00:00Z'),
    updatedAt: new Date('2026-11-19T09:00:00Z'),
    ...over,
  };
}

function post(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    content: `text of ${id}`,
    createdAt: new Date('2026-11-20T10:00:00Z'),
    likeCount: 7,
    commentCount: 2,
    repostCount: 1,
    viewCount: 40,
    imageUrls: [],
    imageAlts: [],
    gifUrl: null,
    gifAlt: null,
    isSensitive: false,
    contentWarning: null,
    pinnedCommentId: null,
    user: { id: 'author_1', name: 'Ada', handle: 'ada', image: null, profile: { hideCountsOnMine: false } },
    ...over,
  };
}

beforeEach(() => {
  h.scopes = ['read:feeds', 'read:posts', 'write:feeds'];
  h.feeds = [];
  h.members = [];
  h.users = [];
  h.blocked = [];
  h.posts = [];
  h.pageIds = [];
  h.readCalls = [];
  h.setPeople = [];
  h.left = [];
});

describe('GET /api/v1/me/feeds', () => {
  it('lists the key owner feeds of every kind and nobody else', async () => {
    h.feeds = [
      feed({ id: 'f1' }),
      feed({ id: 'f2', kind: 'list', createdAt: new Date('2026-11-20T09:00:00Z') }),
      feed({ id: 'f3', kind: 'search', query: 'rust' }),
      feed({ id: 'other', ownerId: 'someone_else' }),
    ];
    const res = await get(routes.mine.GET!, '/api/v1/me/feeds');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.map((f: { id: string }) => f.id)).toEqual(['f2', 'f1', 'f3']);
    expect(body.data[0]).toMatchObject({ kind: 'list', visibility: 'PRIVATE', subscribers: 0 });
    expect(body.nextCursor).toBeNull();
  });

  it('filters by kind and pages by cursor', async () => {
    h.feeds = [
      feed({ id: 'a', createdAt: new Date('2026-11-18T00:00:00Z') }),
      feed({ id: 'b', createdAt: new Date('2026-11-19T00:00:00Z') }),
      feed({ id: 'c', kind: 'list' }),
    ];
    const only = await (await get(routes.mine.GET!, '/api/v1/me/feeds?kind=list')).json();
    expect(only.data.map((f: { id: string }) => f.id)).toEqual(['c']);
    const first = await (await get(routes.mine.GET!, '/api/v1/me/feeds?kind=feed&limit=1')).json();
    expect(first.data).toHaveLength(1);
    expect(first.nextCursor).toMatch(/\|/);
  });

  it('rejects a bad kind, a bad limit and a malformed cursor', async () => {
    expect((await get(routes.mine.GET!, '/api/v1/me/feeds?kind=nope')).status).toBe(400);
    expect((await get(routes.mine.GET!, '/api/v1/me/feeds?limit=500')).status).toBe(400);
    expect((await get(routes.mine.GET!, '/api/v1/me/feeds?cursor=junk')).status).toBe(400);
  });

  it('needs read:feeds', async () => {
    h.scopes = ['read:posts'];
    expect((await get(routes.mine.GET!, '/api/v1/me/feeds')).status).toBe(403);
  });
});

describe('GET /api/v1/me/feeds/{id}', () => {
  it('returns the feed with its members handles', async () => {
    h.feeds = [feed({ id: 'l1', kind: 'list' })];
    h.members = [{ feedId: 'l1', handle: 'ada' }];
    const res = await get(routes.one.GET!, '/api/v1/me/feeds/l1', { id: 'l1' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: 'l1', members: ['ada'] });
  });

  it("is a 404 for another member's feed, even a public one", async () => {
    h.feeds = [feed({ id: 'x', ownerId: 'someone_else', isPublic: true, visibility: 'PUBLIC' })];
    expect((await get(routes.one.GET!, '/api/v1/me/feeds/x', { id: 'x' })).status).toBe(404);
  });
});

describe('GET /api/v1/feeds/{id}/posts', () => {
  it("is a 404, not a 403, for another member's private feed", async () => {
    h.feeds = [feed({ id: 'p', ownerId: 'someone_else' })];
    const res = await get(routes.posts.GET!, '/api/v1/feeds/p/posts', { id: 'p' });
    expect(res.status).toBe(404);
    expect(h.readCalls).toHaveLength(0);
  });

  it('is a 404 for a missing feed', async () => {
    expect((await get(routes.posts.GET!, '/api/v1/feeds/zzz/posts', { id: 'zzz' })).status).toBe(404);
  });

  it('reads a public feed through the site reader with the key owner as viewer', async () => {
    h.feeds = [feed({ id: 'pub', ownerId: 'someone_else', isPublic: true, visibility: 'PUBLIC' })];
    h.posts = [post('p1'), post('p2')];
    h.pageIds = ['p2', 'p1'];
    const res = await get(routes.posts.GET!, '/api/v1/feeds/pub/posts?limit=10', { id: 'pub' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.map((p: { id: string }) => p.id)).toEqual(['p2', 'p1']);
    expect(h.readCalls[0]).toMatchObject({ viewerId: 'owner_1', opts: { pageSize: 10 } });
    expect(body.data[0].metrics).toEqual({ likes: 7, comments: 2, reposts: 1, views: 40 });
  });

  it('reads an UNLISTED list and a legacy isPublic row by id', async () => {
    h.feeds = [
      feed({ id: 'un', ownerId: 'someone_else', kind: 'list', visibility: 'UNLISTED', isPublic: false }),
      feed({ id: 'old', ownerId: 'someone_else', visibility: 'PRIVATE', isPublic: true }),
    ];
    expect((await get(routes.posts.GET!, '/api/v1/feeds/un/posts', { id: 'un' })).status).toBe(200);
    expect((await get(routes.posts.GET!, '/api/v1/feeds/old/posts', { id: 'old' })).status).toBe(200);
  });

  it('is a 404 when the feed owner and the key owner block each other', async () => {
    h.feeds = [feed({ id: 'pub', ownerId: 'someone_else', isPublic: true, visibility: 'PUBLIC' })];
    h.blocked = ['someone_else'];
    expect((await get(routes.posts.GET!, '/api/v1/feeds/pub/posts', { id: 'pub' })).status).toBe(404);
  });

  it('answers 409 not_a_timeline for a saved search and a keyword alert', async () => {
    h.feeds = [feed({ id: 's', kind: 'search', query: 'rust' }), feed({ id: 'a', kind: 'alert', query: 'rust' })];
    for (const id of ['s', 'a']) {
      const res = await get(routes.posts.GET!, `/api/v1/feeds/${id}/posts`, { id });
      expect(res.status).toBe(409);
      expect((await res.json()).error.code).toBe('not_a_timeline');
    }
  });

  it('withholds the counts of an author who hides them from strangers (quiet counts)', async () => {
    h.feeds = [feed({ id: 'pub', ownerId: 'someone_else', isPublic: true, visibility: 'PUBLIC' })];
    h.posts = [
      post('q1', {
        user: { id: 'author_1', name: 'Ada', handle: 'ada', image: null, profile: { hideCountsOnMine: true } },
      }),
    ];
    h.pageIds = ['q1'];
    const body = await (await get(routes.posts.GET!, '/api/v1/feeds/pub/posts', { id: 'pub' })).json();
    expect(body.data[0].metrics).toEqual({ likes: null, comments: null, reposts: null, views: null });
  });

  it('drops posts by banned or deleted authors', async () => {
    h.feeds = [feed({ id: 'mine' })];
    const base = { id: 'a', name: 'A', handle: 'a', image: null, profile: null };
    h.posts = [
      post('ok'),
      post('banned', { user: { ...base, id: 'u2', bannedUntil: new Date(Date.now() + 86_400_000) } }),
      post('gone', { user: { ...base, id: 'u3', deletionScheduledAt: new Date() } }),
    ];
    h.pageIds = ['ok', 'banned', 'gone'];
    const body = await (await get(routes.posts.GET!, '/api/v1/feeds/mine/posts', { id: 'mine' })).json();
    expect(body.data.map((p: { id: string }) => p.id)).toEqual(['ok']);
  });

  it('needs read:feeds and read:posts', async () => {
    h.feeds = [feed({ id: 'mine' })];
    h.scopes = ['read:feeds'];
    expect((await get(routes.posts.GET!, '/api/v1/feeds/mine/posts', { id: 'mine' })).status).toBe(403);
    h.scopes = ['read:posts'];
    expect((await get(routes.posts.GET!, '/api/v1/feeds/mine/posts', { id: 'mine' })).status).toBe(403);
  });
});

describe('PUT /api/v1/me/feeds/{id}/members', () => {
  const user = (id: string, handle: string | null, extra: Record<string, unknown> = {}) => ({ id, handle, ...extra });

  it('replaces the members and reports skipped handles', async () => {
    h.feeds = [feed({ id: 'l1', kind: 'list' })];
    h.users = [
      user('u_ada', 'Ada'),
      user('u_blk', 'blocked'),
      user('u_ban', 'banned', { bannedUntil: new Date(Date.now() + 86_400_000) }),
      user('u_del', 'deleted', { banReason: 'account_deleted' }),
      user('u_sch', 'leaving', { deletionScheduledAt: new Date() }),
    ];
    h.blocked = ['u_blk'];
    const res = await put(
      routes.members.PUT!,
      '/api/v1/me/feeds/l1/members',
      { handles: ['@ada', 'ADA', 'blocked', 'banned', 'deleted', 'leaving', 'nobody'] },
      { id: 'l1' },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.members).toEqual(['Ada']);
    expect(body.skipped).toEqual([
      { handle: 'blocked', reason: 'blocked' },
      { handle: 'banned', reason: 'not_found' },
      { handle: 'deleted', reason: 'not_found' },
      { handle: 'leaving', reason: 'not_found' },
      { handle: 'nobody', reason: 'not_found' },
    ]);
    expect(h.setPeople).toEqual([{ feedId: 'l1', userIds: ['u_ada'] }]);
  });

  it('skips a member who left the list as `left`, in the order asked, and never stores them', async () => {
    h.feeds = [feed({ id: 'l1', kind: 'list' })];
    h.users = [user('u_ada', 'Ada'), user('u_gus', 'gus'), user('u_blk', 'blocked')];
    h.blocked = ['u_blk'];
    h.left = [{ feedId: 'l1', userId: 'u_gus' }];
    const res = await put(
      routes.members.PUT!,
      '/api/v1/me/feeds/l1/members',
      { handles: ['blocked', 'gus', 'ada', 'nobody'] },
      { id: 'l1' },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.members).toEqual(['Ada']);
    expect(body.memberCount).toBe(1);
    expect(body.skipped).toEqual([
      { handle: 'blocked', reason: 'blocked' },
      { handle: 'gus', reason: 'left' },
      { handle: 'nobody', reason: 'not_found' },
    ]);
    expect(h.setPeople).toEqual([{ feedId: 'l1', userIds: ['u_ada'] }]);
  });

  it('a left member on another list is not skipped here', async () => {
    h.feeds = [feed({ id: 'l1', kind: 'list' })];
    h.users = [user('u_gus', 'gus')];
    h.left = [{ feedId: 'l2', userId: 'u_gus' }];
    const res = await put(routes.members.PUT!, '/api/v1/me/feeds/l1/members', { handles: ['gus'] }, { id: 'l1' });
    expect((await res.json()).skipped).toEqual([]);
    expect(h.setPeople).toEqual([{ feedId: 'l1', userIds: ['u_gus'] }]);
  });

  it('clears a list with an empty array', async () => {
    h.feeds = [feed({ id: 'l1', kind: 'list' })];
    const res = await put(routes.members.PUT!, '/api/v1/me/feeds/l1/members', { handles: [] }, { id: 'l1' });
    expect(res.status).toBe(200);
    expect(h.setPeople).toEqual([{ feedId: 'l1', userIds: [] }]);
  });

  it('accepts 500 handles and refuses 501', async () => {
    h.feeds = [feed({ id: 'l1', kind: 'list' })];
    const handles = (n: number) => Array.from({ length: n }, (_, i) => `user${i}`);
    expect(
      (await put(routes.members.PUT!, '/api/v1/me/feeds/l1/members', { handles: handles(500) }, { id: 'l1' })).status,
    ).toBe(200);
    const over = await put(routes.members.PUT!, '/api/v1/me/feeds/l1/members', { handles: handles(501) }, { id: 'l1' });
    expect(over.status).toBe(400);
    expect(h.setPeople).toHaveLength(1);
  });

  it('refuses a feed that is not a list and a list of another member, as 404, changing nothing', async () => {
    h.feeds = [feed({ id: 'f1', kind: 'feed' }), feed({ id: 'l2', kind: 'list', ownerId: 'someone_else' })];
    for (const id of ['f1', 'l2', 'missing']) {
      const res = await put(routes.members.PUT!, `/api/v1/me/feeds/${id}/members`, { handles: ['ada'] }, { id });
      expect(res.status).toBe(404);
    }
    expect(h.setPeople).toEqual([]);
  });

  it('validates the body', async () => {
    h.feeds = [feed({ id: 'l1', kind: 'list' })];
    for (const body of [{}, { handles: 'ada' }, { handles: [''] }, { handles: ['a'], extra: 1 }]) {
      expect((await put(routes.members.PUT!, '/api/v1/me/feeds/l1/members', body, { id: 'l1' })).status).toBe(400);
    }
  });

  it('needs write:feeds', async () => {
    h.feeds = [feed({ id: 'l1', kind: 'list' })];
    h.scopes = ['read:feeds'];
    expect((await put(routes.members.PUT!, '/api/v1/me/feeds/l1/members', { handles: [] }, { id: 'l1' })).status).toBe(
      403,
    );
  });
});
