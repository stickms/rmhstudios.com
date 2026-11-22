/**
 * s09-06 pinned posts in communities: the endpoints driven through their registered handlers, with an in-memory
 * Prisma, a lock that really serialises transactions, and recorded mod-log rows and notifications.
 */
import { noticeFallbackText } from '@/lib/notifications/notice-keys';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface Post {
  id: string;
  communityId: string;
  userId: string;
  threadRootId: string | null;
  deletedAt: Date | null;
  audience: string;
}
interface Pin {
  communityId: string;
  postId: string;
  position: number;
  pinnedById: string;
}

const h = vi.hoisted(() => ({
  userId: 'mod-a' as string,
  roles: new Map<string, string>(),
  posts: [] as Array<Record<string, unknown>>,
  pins: [] as Array<Record<string, unknown>>,
  calls: [] as string[],
  logged: [] as Array<Record<string, unknown>>,
  notified: [] as Array<Record<string, unknown>>,
  chain: Promise.resolve() as Promise<unknown>,
  seq: 0,
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => ({
        user: { id: h.userId },
        session: { id: 's1', userId: h.userId },
      })),
    },
  },
}));

vi.mock('@/lib/prisma.server', () => {
  const posts = () => h.posts as unknown as Post[];
  const pins = () => h.pins as unknown as Pin[];
  const matches = (row: Record<string, unknown>, where: Record<string, unknown>) =>
    Object.entries(where).every(([k, v]) => row[k] === v);
  const sorted = (communityId: string) =>
    pins()
      .filter((p) => p.communityId === communityId)
      .sort((a, b) => a.position - b.position);
  const prisma: Record<string, unknown> = {
    community: {
      findUnique: async ({ where }: { where: { slug?: string } }) => {
        if (where.slug !== 'a') return null;
        const role = h.roles.get(`cA:${h.userId}`);
        return {
          id: 'cA',
          slug: 'a',
          name: 'Art',
          isPrivate: false,
          members: role ? [{ role }] : [],
        };
      },
    },
    rMHark: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        posts().find((p) => matches(p as unknown as Record<string, unknown>, where)) ?? null,
      findUnique: async ({ where }: { where: { id: string } }) => posts().find((p) => p.id === where.id) ?? null,
      findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
        posts().filter((p) => where.id.in.includes(p.id)),
    },
    communityPinnedPost: {
      findMany: async ({ where }: { where: { communityId: string } }) =>
        sorted(where.communityId).map((p) => ({ postId: p.postId, position: p.position })),
      findUnique: async ({ where }: { where: { communityId_postId: { communityId: string; postId: string } } }) =>
        pins().find(
          (p) => p.communityId === where.communityId_postId.communityId && p.postId === where.communityId_postId.postId,
        ) ?? null,
      create: async ({ data }: { data: Pin }) => {
        h.calls.push('pin.create');
        h.pins.push({ ...data });
        return data;
      },
      update: async ({
        where,
        data,
      }: {
        where: { communityId_postId: { communityId: string; postId: string } };
        data: { position: number };
      }) => {
        const row = pins().find(
          (p) => p.communityId === where.communityId_postId.communityId && p.postId === where.communityId_postId.postId,
        );
        if (row) row.position = data.position;
        return row;
      },
      delete: async ({ where }: { where: { communityId_postId: { communityId: string; postId: string } } }) => {
        h.calls.push('pin.delete');
        h.pins = (pins() as unknown as Array<Record<string, unknown>>).filter(
          (p) =>
            !(p.communityId === where.communityId_postId.communityId && p.postId === where.communityId_postId.postId),
        );
      },
    },
    notification: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        h.notified.find(
          (n) => n.userId === where.userId && n.entityType === where.entityType && n.entityId === where.entityId,
        ) ?? null,
    },
  };
  // A transaction is a critical section: the real lock (`pg_advisory_xact_lock`) makes a second pin wait for the first.
  prisma.$transaction = (fn: (tx: unknown) => Promise<unknown>) => {
    const run = h.chain.then(() => fn(prisma));
    h.chain = run.catch(() => undefined);
    return run;
  };
  return { prisma };
});
vi.mock('@/lib/db/advisory-lock.server', () => ({
  lockKey: async (_tx: unknown, key: string) => {
    h.calls.push(`lock:${key}`);
  },
}));
vi.mock('@/lib/communities/modlog.server', () => ({
  logModAction: async (_tx: unknown, input: Record<string, unknown>) => {
    h.calls.push(`log:${String(input.action)}`);
    h.logged.push(input);
    return 1n;
  },
}));
vi.mock('@/lib/notifications.server', () => ({
  createNotification: async (input: Record<string, unknown>) => {
    h.notified.push(input);
  },
}));
vi.mock('@/lib/feed/map-feed-item.server', () => ({
  rmharkIncludeLite: () => ({}),
  mapRmharksWithBoundedReactions: async () => [],
}));
vi.mock('@/lib/feed/audience.server', () => ({
  viewerVisiblePostWhere: async () => ({}),
}));
vi.mock('@/lib/communities/flairs.server', () => ({
  loadFlairsForPosts: async () => new Map(),
}));

const { route: listRoute } = await import('@/lib/communities/api/communities.$slug.pins.server');
const { route: itemRoute } = await import('@/lib/communities/api/communities.$slug.pins.$postId.server');

type Handler = (a: { request: Request; params: Record<string, string> }) => Promise<Response> | Response;
const call = (
  r: { handlers: Record<string, Handler | undefined> },
  method: string,
  params: Record<string, string>,
  body?: unknown,
) =>
  r.handlers[method]!({
    request: new Request('https://rmhstudios.com/api/x', {
      method,
      headers: {
        cookie: 'better-auth.session_token=t',
        'x-forwarded-for': `198.51.100.${(++h.seq % 200) + 1}`,
        'content-type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    params,
  });

const pin = (postId: string) => call(listRoute, 'POST', { slug: 'a' }, { postId });
const unpin = (postId: string) => call(itemRoute, 'DELETE', { slug: 'a', postId });
const order = () =>
  (h.pins as unknown as Pin[])
    .filter((p) => p.communityId === 'cA')
    .sort((a, b) => a.position - b.position)
    .map((p) => p.postId);

const addPost = (id: string, over: Partial<Post> = {}) =>
  h.posts.push({
    id,
    communityId: 'cA',
    userId: `author-${id}`,
    threadRootId: null,
    deletedAt: null,
    audience: 'PUBLIC',
    ...over,
  });

beforeEach(() => {
  h.userId = 'mod-a';
  h.roles = new Map([
    ['cA:mod-a', 'MOD'],
    ['cA:owner', 'ADMIN'],
    ['cA:member', 'MEMBER'],
  ]);
  h.posts = [];
  h.pins = [];
  h.calls = [];
  h.logged = [];
  h.notified = [];
  h.chain = Promise.resolve();
  for (const id of ['p1', 'p2', 'p3', 'p4']) addPost(id);
});

describe('pinning', () => {
  it('lets a moderator pin, in order, and writes the mod-log row under the lock', async () => {
    expect((await pin('p1')).status).toBe(200);
    const res = await pin('p2');
    expect(await res.json()).toEqual({ order: ['p1', 'p2'] });
    expect(order()).toEqual(['p1', 'p2']);
    expect(h.logged.map((l) => l.action)).toEqual(['post_pinned', 'post_pinned']);
    expect(h.logged[0]).toMatchObject({ communityId: 'cA', actorId: 'mod-a', targetType: 'post', targetId: 'p1' });
    // The lock is taken before anything is written, and the log row is written in the same transaction as the pin.
    expect(h.calls.slice(0, 3)).toEqual(['lock:community-pins:cA', 'pin.create', 'log:post_pinned']);
  });

  it('refuses a member, a non-member and a signed-in stranger with 403', async () => {
    h.userId = 'member';
    expect((await pin('p1')).status).toBe(403);
    h.userId = 'nobody';
    expect((await pin('p1')).status).toBe(403);
    expect(h.pins).toHaveLength(0);
    expect(h.logged).toHaveLength(0);
  });

  it('lets the owner pin', async () => {
    h.userId = 'owner';
    expect((await pin('p1')).status).toBe(200);
  });

  it('refuses the fourth pin with the cap message and changes nothing', async () => {
    for (const id of ['p1', 'p2', 'p3']) expect((await pin(id)).status).toBe(200);
    const res = await pin('p4');
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'A community can pin three posts. Unpin one first.', code: 'pin_limit' });
    expect(order()).toEqual(['p1', 'p2', 'p3']);
    expect(h.logged).toHaveLength(3);
  });

  it('cannot exceed three when moderators pin at the same moment', async () => {
    for (const id of ['p5', 'p6']) addPost(id);
    const results = await Promise.all(['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].map((id) => pin(id)));
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 200, 200, 409, 409, 409]);
    expect(order()).toHaveLength(3);
    expect(new Set((h.pins as unknown as Pin[]).map((p) => p.position))).toEqual(new Set([0, 1, 2]));
  });

  it('pinning the same post twice is a no-op (no second row, no second log, no second notice)', async () => {
    await pin('p1');
    const again = await pin('p1');
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ order: ['p1'] });
    expect(h.logged).toHaveLength(1);
    expect(h.notified).toHaveLength(1);
  });

  it('answers 404 for a post of another community', async () => {
    addPost('other', { communityId: 'cB' });
    expect((await pin('other')).status).toBe(404);
    expect(h.pins).toHaveLength(0);
  });

  it('answers 404 for a comment (not a post), a thread follow-up, a removed or held post and a narrower audience', async () => {
    addPost('follow-up', { threadRootId: 'p1' });
    addPost('removed', { deletedAt: new Date('2026-11-20T00:00:00Z') });
    addPost('followers-only', { audience: 'FOLLOWERS' });
    for (const id of ['comment-1', 'follow-up', 'removed', 'followers-only', 'missing']) {
      expect((await pin(id)).status, id).toBe(404);
    }
    expect(h.pins).toHaveLength(0);
    expect(h.logged).toHaveLength(0);
  });

  it('validates the body', async () => {
    const res = await call(listRoute, 'POST', { slug: 'a' }, { postId: '' });
    expect(res.status).toBe(400);
  });
});

describe('the author is told', () => {
  it('once, with a system notice that links to the community', async () => {
    await pin('p1');
    expect(h.notified).toHaveLength(1);
    expect(h.notified[0]).toMatchObject({
      userId: 'author-p1',
      type: 'SYSTEM',
      entityType: 'community-pin',
      entityId: 'p1',
      link: '/c/a',
    });
    expect(noticeFallbackText(h.notified[0]?.preview as never)).toContain('Art');
  });

  it('not again after an unpin and a re-pin, and never on unpinning', async () => {
    await pin('p1');
    await unpin('p1');
    await pin('p1');
    expect(h.notified).toHaveLength(1);
  });

  it('never when a moderator pins their own post', async () => {
    addPost('mine', { userId: 'mod-a' });
    await pin('mine');
    expect(h.notified).toHaveLength(0);
    expect(order()).toEqual(['mine']);
  });

  it('is told per post', async () => {
    await pin('p1');
    await pin('p2');
    expect(h.notified.map((n) => n.userId)).toEqual(['author-p1', 'author-p2']);
  });
});

describe('unpinning and reordering', () => {
  it('unpins, closes the gap and logs it, silently for the author', async () => {
    for (const id of ['p1', 'p2', 'p3']) await pin(id);
    h.notified = [];
    h.logged = [];
    const res = await unpin('p2');
    expect(await res.json()).toEqual({ order: ['p1', 'p3'] });
    expect((h.pins as unknown as Pin[]).map((p) => [p.postId, p.position]).sort()).toEqual([
      ['p1', 0],
      ['p3', 1],
    ]);
    expect(h.logged).toMatchObject([{ action: 'post_unpinned', targetType: 'post', targetId: 'p2' }]);
    expect(h.notified).toHaveLength(0);
    // A slot is free again.
    expect((await pin('p4')).status).toBe(200);
  });

  it('unpinning something not pinned is a no-op without a log row', async () => {
    const res = await unpin('p1');
    expect(res.status).toBe(200);
    expect(h.logged).toHaveLength(0);
  });

  it('refuses a member on unpin and reorder', async () => {
    await pin('p1');
    h.userId = 'member';
    expect((await unpin('p1')).status).toBe(403);
    expect((await call(listRoute, 'PUT', { slug: 'a' }, { postIds: ['p1'] })).status).toBe(403);
    expect(order()).toEqual(['p1']);
  });

  it('reorders and logs pins_reordered in the same transaction', async () => {
    for (const id of ['p1', 'p2', 'p3']) await pin(id);
    h.calls = [];
    h.logged = [];
    const res = await call(listRoute, 'PUT', { slug: 'a' }, { postIds: ['p3', 'p1', 'p2'] });
    expect(await res.json()).toEqual({ order: ['p3', 'p1', 'p2'] });
    expect(order()).toEqual(['p3', 'p1', 'p2']);
    expect(h.logged).toMatchObject([{ action: 'pins_reordered', targetType: 'post', detail: { count: 3 } }]);
    expect(h.calls[0]).toBe('lock:community-pins:cA');
    expect(h.notified).toHaveLength(3);
  });

  it('writes nothing when the order did not change', async () => {
    await pin('p1');
    await pin('p2');
    h.logged = [];
    const res = await call(listRoute, 'PUT', { slug: 'a' }, { postIds: ['p1', 'p2'] });
    expect(res.status).toBe(200);
    expect(h.logged).toHaveLength(0);
  });

  it('refuses an order that is not exactly the posts pinned now', async () => {
    await pin('p1');
    await pin('p2');
    for (const postIds of [['p1'], ['p1', 'p3'], ['p1', 'p1'], ['p1', 'p2', 'p3']]) {
      const res = await call(listRoute, 'PUT', { slug: 'a' }, { postIds });
      expect([400, 409], JSON.stringify(postIds)).toContain(res.status);
    }
    expect(order()).toEqual(['p1', 'p2']);
  });
});

describe('reading', () => {
  it('tells the caller whether they can change the pins', async () => {
    await pin('p1');
    const asMod = await (await call(listRoute, 'GET', { slug: 'a' })).json();
    expect(asMod).toMatchObject({ canModerate: true, order: ['p1'], limit: 3 });
    h.userId = 'member';
    const asMember = await (await call(listRoute, 'GET', { slug: 'a' })).json();
    expect(asMember).toMatchObject({ canModerate: false, order: ['p1'] });
  });

  it('answers 404 for a community that does not exist', async () => {
    const res = await call(listRoute, 'GET', { slug: 'nope' });
    expect(res.status).toBe(404);
  });
});
