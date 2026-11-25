/**
 * The lists a member is on (s13-11): only public and unlisted lists are shown, blocked owners are left out, leaving
 * removes the membership and records it, the owner's re-add is refused (the site's add and the developer API's
 * replace), a blocked, banned or erased member cannot be added, and the cap is counted under the list's lock.
 * Prisma is an in-memory fake that runs the `where` shapes the code writes; nothing here touches a database.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOf, type TestHandler } from '@/lib/__tests__/api-handlers-of';

interface FeedRow {
  id: string;
  ownerId: string;
  kind: string;
  name: string;
  isPublic: boolean;
  visibility: 'PRIVATE' | 'UNLISTED' | 'PUBLIC';
}

const h = vi.hoisted(() => ({
  feeds: [] as {
    id: string;
    ownerId: string;
    kind: string;
    name: string;
    isPublic: boolean;
    visibility: 'PRIVATE' | 'UNLISTED' | 'PUBLIC';
  }[],
  members: [] as { feedId: string; userId: string; addedAt: Date }[],
  leaves: [] as { feedId: string; userId: string; at: Date }[],
  blocks: [] as { id: string; blockerId: string; blockedId: string }[],
  users: [] as {
    id: string;
    name: string | null;
    handle: string | null;
    banReason?: string | null;
    bannedUntil?: Date | null;
    deletionScheduledAt?: Date | null;
  }[],
  blockedAuthors: [] as string[],
  log: [] as string[],
  cap: null as number | null,
}));

vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: async () => ({ user: { id: 'owner' }, session: {} }) } },
}));
vi.mock('@/lib/rate-limit.server', () => ({ withRateLimitAsync: async () => null }));
vi.mock('@/lib/moderation.server', () => ({ getBlockedAuthorIds: async () => h.blockedAuthors }));
vi.mock('@/lib/feeds/feeds.server', () => ({
  feedSourceSelect: {},
  readFeedPage: async () => ({ page: [], nextCursor: null }),
  readableByOthers: (r: { isPublic: boolean; visibility: string }) => r.isPublic || r.visibility !== 'PRIVATE',
  toFeedSource: (r: unknown) => r,
  setFeedPeople: async (feedId: string, userIds: string[]) => {
    h.log.push(`people:${userIds.join(',')}`);
    h.members = h.members.filter((m) => m.feedId !== feedId || userIds.includes(m.userId));
    for (const userId of userIds) {
      if (!h.members.some((m) => m.feedId === feedId && m.userId === userId)) {
        h.members.push({ feedId, userId, addedAt: new Date() });
      }
    }
  },
}));
vi.mock('@/lib/db/advisory-lock.server', () => ({
  lockKey: async (_tx: unknown, key: string) => {
    h.log.push(`lock:${key}`);
  },
}));

vi.mock('@/lib/prisma.server', () => {
  type Feed = (typeof h.feeds)[number];
  type Where = {
    id?: string;
    ownerId?: string | { notIn: string[] };
    kind?: string;
    OR?: Record<string, unknown>[];
  };
  const seenByOthers = (f: Feed, or: Record<string, unknown>[]) =>
    or.some((c) =>
      'isPublic' in c ? f.isPublic === c.isPublic : (c.visibility as { in: string[] }).in.includes(f.visibility),
    );
  const feedMatches = (f: Feed, w: Where) =>
    (w.id === undefined || f.id === w.id) &&
    (w.ownerId === undefined ||
      (typeof w.ownerId === 'string' ? f.ownerId === w.ownerId : !w.ownerId.notIn.includes(f.ownerId))) &&
    (w.kind === undefined || f.kind === w.kind) &&
    (w.OR === undefined || seenByOthers(f, w.OR));
  const feedOf = (id: string) => h.feeds.find((f) => f.id === id)!;

  const tx = {
    customFeed: {
      findFirst: async ({ where }: { where: Where }) => h.feeds.find((f) => feedMatches(f, where)) ?? null,
    },
    listLeave: {
      findUnique: async ({ where }: { where: { feedId_userId: { feedId: string; userId: string } } }) =>
        h.leaves.find((l) => l.feedId === where.feedId_userId.feedId && l.userId === where.feedId_userId.userId) ??
        null,
      findMany: async ({ where }: { where: { feedId?: string; userId?: string | { in: string[] } } }) =>
        h.leaves
          .filter(
            (l) =>
              (where.feedId === undefined || l.feedId === where.feedId) &&
              (where.userId === undefined ||
                (typeof where.userId === 'string' ? l.userId === where.userId : where.userId.in.includes(l.userId))),
          )
          .map((l) => ({
            ...l,
            feed: {
              name: feedOf(l.feedId).name,
              owner: h.users.find((u) => u.id === feedOf(l.feedId).ownerId) ?? null,
            },
          })),
      upsert: async ({ create }: { create: { feedId: string; userId: string } }) => {
        h.log.push('leave:record');
        if (!h.leaves.some((l) => l.feedId === create.feedId && l.userId === create.userId)) {
          h.leaves.push({ ...create, at: new Date() });
        }
      },
      deleteMany: async ({ where }: { where: { userId: string } }) => {
        const before = h.leaves.length;
        h.leaves = h.leaves.filter((l) => l.userId !== where.userId);
        return { count: before - h.leaves.length };
      },
    },
    userBlock: {
      findFirst: async ({ where }: { where: { OR: { blockerId: string; blockedId: string }[] } }) =>
        h.blocks.find((b) => where.OR.some((o) => o.blockerId === b.blockerId && o.blockedId === b.blockedId)) ?? null,
    },
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => h.users.find((u) => u.id === where.id) ?? null,
    },
    customFeedMember: {
      count: async ({ where }: { where: { feedId: string } }) => {
        h.log.push('count');
        return h.cap ?? h.members.filter((m) => m.feedId === where.feedId).length;
      },
      upsert: async ({ create }: { create: { feedId: string; userId: string } }) => {
        h.log.push('insert');
        if (!h.members.some((m) => m.feedId === create.feedId && m.userId === create.userId)) {
          h.members.push({ ...create, addedAt: new Date() });
        }
      },
      deleteMany: async ({ where }: { where: { feedId: string; userId: string } }) => {
        h.log.push('member:delete');
        const before = h.members.length;
        h.members = h.members.filter((m) => !(m.feedId === where.feedId && m.userId === where.userId));
        return { count: before - h.members.length };
      },
      findMany: async ({
        where,
        take,
      }: {
        where: {
          userId: string;
          feed: Where;
          OR?: { addedAt: Date | { lt: Date }; feedId?: { lt: string } }[];
        };
        take: number;
      }) =>
        h.members
          .filter((m) => m.userId === where.userId && feedMatches(feedOf(m.feedId), where.feed))
          .filter((m) => {
            if (!where.OR) return true;
            const [lt, eq] = where.OR as [{ addedAt: { lt: Date } }, { addedAt: Date; feedId: { lt: string } }];
            return (
              m.addedAt < lt.addedAt.lt || (m.addedAt.getTime() === eq.addedAt.getTime() && m.feedId < eq.feedId.lt)
            );
          })
          .sort((a, b) => b.addedAt.getTime() - a.addedAt.getTime() || (a.feedId < b.feedId ? 1 : -1))
          .slice(0, take)
          .map((m) => {
            const f = feedOf(m.feedId);
            const owner = h.users.find((u) => u.id === f.ownerId) ?? null;
            return { feedId: m.feedId, addedAt: m.addedAt, feed: { id: f.id, name: f.name, owner } };
          }),
    },
  };
  return {
    prisma: {
      ...tx,
      $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    },
  };
});

import { addMember, replaceListMembers, ListError } from '@/lib/lists/lists.server';
import { exportListsLeft, leaveList, listLeaveErasureOps, listsIAmOn } from '@/lib/lists/lists-on.server';
import { route as membersRoute } from '@/lib/lists/api/lists.$id.members.server';
import { route as leaveRoute } from '@/lib/lists/api/lists.$id.leave.server';
import { route as onRoute } from '@/lib/lists/api/lists.on.server';
import { MAX_MEMBERS } from '@/lib/lists/constants';

const feed = (
  id: string,
  ownerId: string,
  visibility: FeedRow['visibility'],
  extra: Partial<FeedRow> = {},
): FeedRow => ({
  id,
  ownerId,
  kind: 'list',
  name: `List ${id}`,
  isPublic: visibility === 'PUBLIC',
  visibility,
  ...extra,
});
const minutes = (n: number) => new Date(Date.UTC(2026, 11, 1, 12, n));

beforeEach(() => {
  h.feeds = [];
  h.members = [];
  h.leaves = [];
  h.blocks = [];
  h.blockedAuthors = [];
  h.log = [];
  h.cap = null;
  h.users = [
    { id: 'owner', name: 'Olive', handle: 'olive' },
    { id: 'owner2', name: null, handle: 'otto' },
    { id: 'me', name: 'Me', handle: 'me' },
    { id: 'ada', name: 'Ada', handle: 'ada' },
  ];
});

describe('listsIAmOn', () => {
  it('shows public and unlisted lists newest first, and never a private one', async () => {
    h.feeds = [
      feed('pub', 'owner', 'PUBLIC'),
      feed('unl', 'owner2', 'UNLISTED'),
      feed('priv', 'owner', 'PRIVATE'),
      feed('feed-kind', 'owner', 'PUBLIC', { kind: 'feed' }),
    ];
    h.members = ['pub', 'unl', 'priv', 'feed-kind'].map((feedId, i) => ({ feedId, userId: 'me', addedAt: minutes(i) }));
    const page = await listsIAmOn('me');
    expect(page.lists.map((l) => l.id)).toEqual(['unl', 'pub']);
    expect(page.lists[1]).toEqual({
      id: 'pub',
      name: 'List pub',
      owner: { name: 'Olive', handle: 'olive' },
      addedAt: minutes(0).toISOString(),
    });
    expect(page.nextCursor).toBeNull();
  });

  it('shows a list that is public by either flag, as every other reader does', async () => {
    h.feeds = [feed('flag', 'owner', 'PRIVATE', { isPublic: true })];
    h.members = [{ feedId: 'flag', userId: 'me', addedAt: minutes(0) }];
    expect((await listsIAmOn('me')).lists.map((l) => l.id)).toEqual(['flag']);
  });

  it('leaves out lists whose owner is blocked either way', async () => {
    h.feeds = [feed('a', 'owner', 'PUBLIC'), feed('b', 'owner2', 'PUBLIC')];
    h.members = [
      { feedId: 'a', userId: 'me', addedAt: minutes(0) },
      { feedId: 'b', userId: 'me', addedAt: minutes(1) },
    ];
    h.blockedAuthors = ['owner2'];
    expect((await listsIAmOn('me')).lists.map((l) => l.id)).toEqual(['a']);
  });

  it('pages by 50 with a cursor that continues where the page ended', async () => {
    h.feeds = Array.from({ length: 52 }, (_, i) => feed(`f${String(i).padStart(2, '0')}`, 'owner', 'PUBLIC'));
    h.members = h.feeds.map((f, i) => ({ feedId: f.id, userId: 'me', addedAt: minutes(i) }));
    const first = await listsIAmOn('me');
    expect(first.lists).toHaveLength(50);
    expect(first.nextCursor).not.toBeNull();
    const second = await listsIAmOn('me', first.nextCursor!);
    expect(second.lists.map((l) => l.id)).toEqual(['f01', 'f00']);
    expect(second.nextCursor).toBeNull();
  });
});

describe('leaveList', () => {
  beforeEach(() => {
    h.feeds = [feed('pub', 'owner', 'PUBLIC'), feed('priv', 'owner', 'PRIVATE')];
    h.members = [
      { feedId: 'pub', userId: 'me', addedAt: minutes(0) },
      { feedId: 'pub', userId: 'ada', addedAt: minutes(1) },
      { feedId: 'priv', userId: 'me', addedAt: minutes(2) },
    ];
  });

  it('removes the membership and records the leave, under the list’s lock, touching no one else', async () => {
    await leaveList('me', 'pub');
    expect(h.members.map((m) => `${m.feedId}:${m.userId}`)).toEqual(['pub:ada', 'priv:me']);
    expect(h.leaves).toHaveLength(1);
    expect(h.leaves[0]).toMatchObject({ feedId: 'pub', userId: 'me' });
    expect(h.log[0]).toBe('lock:list-members:pub');
  });

  it('is fine twice, and refuses a list the member was never on or cannot see', async () => {
    await leaveList('me', 'pub');
    await expect(leaveList('me', 'pub')).resolves.toBeUndefined();
    await expect(leaveList('ada2', 'pub')).rejects.toThrow('NOT_FOUND');
    await expect(leaveList('me', 'priv')).rejects.toThrow('NOT_FOUND');
    expect(h.leaves).toHaveLength(1);
    expect(h.members.some((m) => m.feedId === 'priv' && m.userId === 'me')).toBe(true);
  });

  it('answers the endpoint with ok, and a refusal as a 404 that names nothing', async () => {
    const post = handlersOf<TestHandler>(leaveRoute).POST!;
    const call = (id: string) =>
      post({
        request: new Request(`http://x/api/lists/${id}/leave`, {
          method: 'POST',
          headers: { cookie: 'better-auth.session_token=t' },
        }),
        params: { id },
      });
    h.members.push({ feedId: 'pub', userId: 'owner', addedAt: minutes(3) });
    expect((await call('pub')).status).toBe(200);
    expect(h.leaves).toMatchObject([{ feedId: 'pub', userId: 'owner' }]);
    expect((await call('priv')).status).toBe(404);
  });
});

describe('the owner cannot add a member back after they left', () => {
  beforeEach(() => {
    h.feeds = [feed('pub', 'owner', 'PUBLIC')];
    h.leaves = [{ feedId: 'pub', userId: 'me', at: minutes(0) }];
  });

  it('refuses the site’s add', async () => {
    await expect(addMember('owner', 'pub', 'me')).rejects.toThrow('MEMBER_REFUSED');
    expect(h.members).toEqual([]);
  });

  it('allows an add of someone else, and the same member to another list of the owner', async () => {
    h.feeds.push(feed('other', 'owner', 'PUBLIC'));
    await addMember('owner', 'pub', 'ada');
    await addMember('owner', 'other', 'me');
    expect(h.members.map((m) => `${m.feedId}:${m.userId}`)).toEqual(['pub:ada', 'other:me']);
  });

  it('drops them from the developer API’s replace and reports them', async () => {
    const dropped = await replaceListMembers('owner', 'pub', ['me', 'ada']);
    expect(dropped).toEqual(['me']);
    expect(h.members.map((m) => m.userId)).toEqual(['ada']);
    expect(h.log[0]).toBe('lock:list-members:pub');
  });

  it('answers the add endpoint with one refusal sentence and a 409', async () => {
    const put = handlersOf<TestHandler>(membersRoute).PUT!;
    const res = await put({
      request: new Request('http://x/api/lists/pub/members', {
        method: 'PUT',
        headers: { 'content-type': 'application/json', cookie: 'better-auth.session_token=t' },
        body: JSON.stringify({ userId: 'me' }),
      }),
      params: { id: 'pub' },
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      code: 'LIST_MEMBER_REFUSED',
      error: "That person can't be added to this list",
    });
  });
});

describe('who cannot be added', () => {
  beforeEach(() => {
    h.feeds = [feed('pub', 'owner', 'PUBLIC')];
    h.users.push(
      { id: 'banned', name: 'B', handle: 'banned', bannedUntil: new Date(Date.now() + 86_400_000) },
      { id: 'was-banned', name: 'W', handle: 'wasbanned', bannedUntil: new Date(Date.now() - 86_400_000) },
      { id: 'erased', name: null, handle: null, banReason: 'account_deleted' },
      { id: 'leaving', name: 'L', handle: 'leaving', deletionScheduledAt: new Date() },
    );
  });

  it.each(['banned', 'erased', 'leaving', 'nobody'])('refuses %s with the one refusal', async (id) => {
    await expect(addMember('owner', 'pub', id)).rejects.toThrow('MEMBER_REFUSED');
    expect(h.members).toEqual([]);
  });

  it('refuses a member blocked in either direction, with the same refusal', async () => {
    h.blocks = [{ id: 'b1', blockerId: 'owner', blockedId: 'ada' }];
    await expect(addMember('owner', 'pub', 'ada')).rejects.toThrow('MEMBER_REFUSED');
    h.blocks = [{ id: 'b2', blockerId: 'me', blockedId: 'owner' }];
    await expect(addMember('owner', 'pub', 'me')).rejects.toThrow('MEMBER_REFUSED');
  });

  it('allows a member whose ban has ended, and refuses someone else’s list as not found', async () => {
    await addMember('owner', 'pub', 'was-banned');
    expect(h.members.map((m) => m.userId)).toEqual(['was-banned']);
    await expect(addMember('owner2', 'pub', 'ada')).rejects.toBeInstanceOf(ListError);
    await expect(addMember('owner2', 'pub', 'ada')).rejects.toThrow('NOT_FOUND');
  });
});

describe('the cap', () => {
  beforeEach(() => {
    h.feeds = [feed('pub', 'owner', 'PUBLIC')];
  });

  it('is counted and the row inserted after the list’s lock, in that order', async () => {
    await addMember('owner', 'pub', 'ada');
    expect(h.log).toEqual(['lock:list-members:pub', 'count', 'insert']);
  });

  it('refuses at the limit without inserting', async () => {
    h.cap = MAX_MEMBERS;
    await expect(addMember('owner', 'pub', 'ada')).rejects.toThrow('MEMBER_LIMIT');
    expect(h.log).toEqual(['lock:list-members:pub', 'count']);
    expect(h.members).toEqual([]);
  });
});

describe('GET /api/lists/on', () => {
  it('pages the caller’s lists and refuses a malformed query', async () => {
    h.feeds = [feed('pub', 'owner', 'PUBLIC'), feed('priv', 'owner', 'PRIVATE')];
    h.members = [
      { feedId: 'pub', userId: 'owner', addedAt: minutes(0) },
      { feedId: 'priv', userId: 'owner', addedAt: minutes(1) },
    ];
    const get = handlersOf<TestHandler>(onRoute).GET!;
    const call = (qs: string) =>
      get({
        request: new Request(`http://x/api/lists/on${qs}`, { headers: { cookie: 'better-auth.session_token=t' } }),
        params: {},
      });
    const res = await call('');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect((await res.json()).lists.map((l: { id: string }) => l.id)).toEqual(['pub']);
    expect((await call(`?cursor=${'x'.repeat(101)}`)).status).toBe(400);
  });
});

describe('export and erasure', () => {
  it('exports the lists the member left with the list name, owner and date', async () => {
    h.feeds = [feed('pub', 'owner', 'PUBLIC', { name: 'Friends' })];
    h.leaves = [{ feedId: 'pub', userId: 'me', at: minutes(5) }];
    expect(await exportListsLeft('me')).toEqual([{ list: 'Friends', owner: 'olive', at: minutes(5).toISOString() }]);
    expect(await exportListsLeft('ada')).toEqual([]);
  });

  it('erases only the member’s own leave rows', async () => {
    h.leaves = [
      { feedId: 'pub', userId: 'me', at: minutes(0) },
      { feedId: 'pub', userId: 'ada', at: minutes(0) },
    ];
    await Promise.all(listLeaveErasureOps('me'));
    expect(h.leaves.map((l) => l.userId)).toEqual(['ada']);
  });
});
