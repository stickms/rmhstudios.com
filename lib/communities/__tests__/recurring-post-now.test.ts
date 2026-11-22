/**
 * s09-11: "Post now" on a recurring thread claims with one compare-and-set on `lastPostedAt`. Two calls inside 60 s
 * post once (the second updates nothing and is 409 just_posted); a failed post puts the old value back.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  row: null as null | Record<string, unknown>,
  posts: 0,
  publishResult: 'post-1' as string | null,
  publishThrows: false,
  paused: 0,
}));

type Where = {
  id?: string;
  lastPostedAt?: Date | null;
  OR?: Array<{ lastPostedAt: null | { lt: Date } }>;
};

vi.mock('@/lib/prisma.server', () => {
  const state = () => h.row as Record<string, unknown>;
  return {
    prisma: {
      communityRecurringThread: {
        findFirst: vi.fn(async () => ({ ...state() })),
        updateMany: vi.fn(async (a: { where: Where; data: Record<string, unknown> }) => {
          const cur = state().lastPostedAt as Date | null;
          const w = a.where;
          let ok = true;
          if (w.OR)
            ok = w.OR.some((c) => (c.lastPostedAt === null ? cur === null : cur !== null && cur < c.lastPostedAt.lt));
          else if ('lastPostedAt' in w) ok = (cur?.getTime() ?? null) === (w.lastPostedAt?.getTime() ?? null);
          if (!ok) return { count: 0 };
          Object.assign(state(), a.data);
          return { count: 1 };
        }),
      },
      community: { findUnique: vi.fn(async () => ({ id: 'c1' })) },
      communityMember: { findUnique: vi.fn(async () => ({ role: 'MOD' })), findMany: vi.fn(async () => []) },
      user: { findUnique: vi.fn(async () => ({ bannedUntil: null })) },
      scheduledPost: {
        create: vi.fn(async () => ({ id: 'd1' })),
        deleteMany: vi.fn(async () => ({ count: 1 })),
      },
      communityPostFlair: { upsert: vi.fn(async () => ({})) },
    },
  };
});
vi.mock('@/lib/db/advisory-lock.server', () => ({ lockKey: vi.fn() }));
vi.mock('@/lib/notifications.server', () => ({ createNotification: vi.fn() }));
vi.mock('@/lib/communities/access.server', () => ({ canModerate: () => true }));
vi.mock('@/lib/communities/bans.server', () => ({ activeSanction: async () => null }));
vi.mock('@/lib/communities/flairs.server', () => ({ flairBelongsTo: async () => true }));
vi.mock('@/lib/communities/modlog.server', () => ({ logModAction: vi.fn() }));
vi.mock('@/lib/communities/post-gate.server', () => ({
  prepareCommunityPost: async () => ({ ok: true, held: false, holdRule: 'AutoMod', flagRule: null }),
}));
vi.mock('@/lib/scheduled/publish.server', () => ({
  publishScheduledPost: async () => {
    if (h.publishThrows) throw new Error('boom');
    if (h.publishResult) h.posts += 1;
    return h.publishResult;
  },
}));

const { postRecurringNow, RecurringError } = await import('@/lib/communities/recurring.server');

const NOW = new Date('2026-11-22T12:00:00Z');
const base = () => ({
  id: 't1',
  communityId: 'c1',
  createdById: 'u1',
  title: 'Weekly',
  body: 'Talk',
  flairId: null,
  failures: 0,
  active: true,
  lastPostId: null,
  lastPostedAt: null as Date | null,
});

beforeEach(() => {
  h.row = base();
  h.posts = 0;
  h.publishResult = 'post-1';
  h.publishThrows = false;
});

describe('postRecurringNow', () => {
  it('posts once for two calls inside 60 s: the second claim updates nothing and is 409 just_posted', async () => {
    expect(await postRecurringNow({ communityId: 'c1', id: 't1', now: NOW })).toBe('post-1');
    const err = await postRecurringNow({ communityId: 'c1', id: 't1', now: new Date(NOW.getTime() + 2_000) }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(RecurringError);
    expect(err).toMatchObject({ status: 409, code: 'just_posted' });
    expect(h.posts).toBe(1);
    expect(h.row!.active).toBe(true);
  });

  it('two calls at the same moment post once', async () => {
    const results = await Promise.allSettled([
      postRecurringNow({ communityId: 'c1', id: 't1', now: NOW }),
      postRecurringNow({ communityId: 'c1', id: 't1', now: NOW }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(h.posts).toBe(1);
  });

  it('posts again once the 60 s window has passed', async () => {
    await postRecurringNow({ communityId: 'c1', id: 't1', now: NOW });
    await postRecurringNow({ communityId: 'c1', id: 't1', now: new Date(NOW.getTime() + 61_000) });
    expect(h.posts).toBe(2);
  });

  it('puts the old lastPostedAt back when the post fails, and the thread is paused', async () => {
    const before = new Date('2026-11-01T00:00:00Z');
    h.row = { ...base(), lastPostedAt: before };
    h.publishResult = null;
    const err = await postRecurringNow({ communityId: 'c1', id: 't1', now: NOW }).catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 409, code: 'author_sanctioned' });
    expect(h.row.lastPostedAt).toEqual(before);
  });

  it('puts a null lastPostedAt back when publishing throws, so a retry can claim again', async () => {
    h.publishThrows = true;
    await expect(postRecurringNow({ communityId: 'c1', id: 't1', now: NOW })).rejects.toThrow('boom');
    expect(h.row!.lastPostedAt).toBeNull();
    h.publishThrows = false;
    expect(await postRecurringNow({ communityId: 'c1', id: 't1', now: NOW })).toBe('post-1');
  });

  it('is 404 for a thread of another community', async () => {
    const { prisma } = await import('@/lib/prisma.server');
    vi.mocked(prisma.communityRecurringThread.findFirst).mockResolvedValueOnce(null);
    await expect(postRecurringNow({ communityId: 'c2', id: 't1', now: NOW })).rejects.toMatchObject({ status: 404 });
  });
});
