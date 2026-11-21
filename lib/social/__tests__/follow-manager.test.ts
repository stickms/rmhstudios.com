/**
 * The follow manager's writes: removing a follower only ever touches the session member's own followers,
 * keeps both counters and the follow log in step in one transaction, bulk actions cap and skip, and an undo
 * re-follows without a notification. Prisma is an in-memory fake; nothing here touches a database.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface Edge {
  id: string;
  followerId: string;
  followingId: string;
}
interface Counts {
  followerCount: number;
  followingCount: number;
}

const h = vi.hoisted(() => ({
  edges: [] as { id: string; followerId: string; followingId: string }[],
  counts: {} as Record<string, { followerCount: number; followingCount: number }>,
  events: [] as { followerId: string; followingId: string; kind: string; createdAt: Date }[],
  notifications: [] as string[],
  removedNotifications: [] as string[],
  invalidatedFollowing: [] as string[],
  invalidatedAudience: [] as string[],
  failEvent: false,
  blocks: [] as { blockerId: string; blockedId: string }[],
  nextId: 1,
}));

vi.mock('@/lib/notifications.server', () => ({
  createNotification: async (n: { type: string; userId: string; actorId: string }) => {
    h.notifications.push(`${n.type}:${n.actorId}->${n.userId}`);
  },
  removeNotification: async (n: { type: string; userId: string; actorId: string }) => {
    h.removedNotifications.push(`${n.type}:${n.actorId}->${n.userId}`);
  },
}));
vi.mock('@/lib/feed-sse', () => ({ feedEventBus: { publish: () => {}, publishPostEngagement: () => {} } }));
vi.mock('@/lib/achievements/engine.server', () => ({ progressAchievement: async () => {} }));
vi.mock('@/lib/social/engagement-effects.server', () => ({ enqueueProgression: async () => {} }));
vi.mock('@/lib/feed/notify-mentions.server', () => ({ notifyMentions: async () => {} }));
vi.mock('@/lib/media/attach.server', () => ({ resolveMediaForPost: async () => [] }));
vi.mock('@/lib/feed/audience.server', () => ({ canReadThread: async () => true }));
vi.mock('@/lib/social/follow-graph.server', () => ({
  invalidateFollowingIds: (id: string) => {
    h.invalidatedFollowing.push(id);
  },
}));
vi.mock('@/lib/social/follow-events.server', () => ({
  invalidateAudience: (id: string) => {
    h.invalidatedAudience.push(id);
  },
  recordFollowEvent: async (
    _tx: unknown,
    e: { followerId: string; followingId: string; kind: string },
  ) => {
    if (h.failEvent) throw new Error('event insert failed');
    h.events.push({ ...e, createdAt: new Date() });
  },
}));

vi.mock('@/lib/prisma.server', () => {
  const count = (id: string): Counts => (h.counts[id] ??= { followerCount: 0, followingCount: 0 });
  type FollowWhere = {
    followerId?: string | { in: string[] };
    followingId?: string | { in: string[] };
  };
  const matches = (e: Edge, w: FollowWhere) => {
    const ok = (v: string | { in: string[] } | undefined, actual: string) =>
      v === undefined || (typeof v === 'string' ? v === actual : v.in.includes(actual));
    return ok(w.followerId, e.followerId) && ok(w.followingId, e.followingId);
  };
  const prisma = {
    follow: {
      findMany: async ({ where }: { where: FollowWhere }) => h.edges.filter((e) => matches(e, where)),
      findUnique: async ({
        where,
      }: {
        where: { followerId_followingId: { followerId: string; followingId: string } };
      }) => h.edges.find((e) => matches(e, where.followerId_followingId)) ?? null,
      deleteMany: async ({ where }: { where: FollowWhere }) => {
        const before = h.edges.length;
        h.edges = h.edges.filter((e) => !matches(e, where));
        return { count: before - h.edges.length };
      },
      delete: async ({
        where,
      }: {
        where: { followerId_followingId: { followerId: string; followingId: string } };
      }) => {
        h.edges = h.edges.filter((e) => !matches(e, where.followerId_followingId));
        return {};
      },
      create: async ({ data }: { data: { followerId: string; followingId: string } }) => {
        h.edges.push({ id: `e${h.nextId++}`, ...data });
        return {};
      },
    },
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => ({ id: where.id }),
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; followerCount?: { gt: number }; followingCount?: { gt: number } };
        data: { followerCount?: { decrement: number }; followingCount?: { decrement: number } };
      }) => {
        const row = count(where.id);
        if (data.followerCount && row.followerCount > 0) row.followerCount -= data.followerCount.decrement;
        if (data.followingCount && row.followingCount > 0)
          row.followingCount -= data.followingCount.decrement;
        return { count: 1 };
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { followerCount?: { increment: number }; followingCount?: { increment: number } };
      }) => {
        const row = count(where.id);
        if (data.followerCount) row.followerCount += data.followerCount.increment;
        if (data.followingCount) row.followingCount += data.followingCount.increment;
        return { followerCount: row.followerCount };
      },
    },
    userBlock: {
      findFirst: async ({
        where,
      }: {
        where: { OR: { blockerId: string; blockedId: string }[] };
      }) =>
        h.blocks.find((b) =>
          where.OR.some((c) => c.blockerId === b.blockerId && c.blockedId === b.blockedId),
        ) ?? null,
    },
    followEvent: {
      findFirst: async ({
        where,
      }: {
        where: { followerId: string; followingId: string; kind: string; createdAt: { gte: Date } };
      }) =>
        h.events.find(
          (e) =>
            e.followerId === where.followerId &&
            e.followingId === where.followingId &&
            e.kind === where.kind &&
            e.createdAt >= where.createdAt.gte,
        ) ?? null,
      create: async ({ data }: { data: { followerId: string; followingId: string; kind: string } }) => {
        h.events.push({ ...data, createdAt: new Date() });
        return { id: 1n };
      },
    },
    $transaction: async (arg: unknown) => {
      if (typeof arg === 'function') {
        const snapshot = structuredClone({ edges: h.edges, counts: h.counts, events: h.events });
        try {
          return await (arg as (tx: unknown) => Promise<unknown>)(prisma);
        } catch (err) {
          h.edges = snapshot.edges;
          h.counts = snapshot.counts;
          h.events = snapshot.events;
          throw err;
        }
      }
      const out: unknown[] = [];
      for (const query of arg as PromiseLike<unknown>[]) out.push(await query);
      return out;
    },
  };
  return { prisma };
});

import {
  bulkRemoveFollowers,
  bulkUnfollow,
  removeFollower,
  undoUnfollow,
} from '@/lib/social/follow-manager.server';
import { followUser } from '@/lib/social/engagement.server';

function follow(followerId: string, followingId: string) {
  h.edges.push({ id: `e${h.nextId++}`, followerId, followingId });
}

beforeEach(() => {
  h.edges = [];
  h.counts = {
    me: { followerCount: 40, followingCount: 40 },
  };
  h.events = [];
  h.notifications = [];
  h.removedNotifications = [];
  h.invalidatedFollowing = [];
  h.invalidatedAudience = [];
  h.failEvent = false;
  h.blocks = [];
  h.nextId = 1;
});

describe('removeFollower', () => {
  it('deletes the follow, decrements both counters and records a removed event', async () => {
    follow('ann', 'me');
    h.counts.ann = { followerCount: 0, followingCount: 5 };

    expect(await removeFollower('me', 'ann')).toBe(true);

    expect(h.edges).toHaveLength(0);
    expect(h.counts.me?.followerCount).toBe(39);
    expect(h.counts.ann?.followingCount).toBe(4);
    expect(h.events).toEqual([
      expect.objectContaining({ followerId: 'ann', followingId: 'me', kind: 'removed' }),
    ]);
    expect(h.invalidatedFollowing).toEqual(['ann']);
    expect(h.invalidatedAudience).toEqual(['me']);
  });

  it('sends no notification and takes back the old follow notification', async () => {
    follow('ann', 'me');
    await removeFollower('me', 'ann');
    expect(h.notifications).toEqual([]);
    expect(h.removedNotifications).toEqual(['FOLLOW:ann->me']);
  });

  it('can only delete follows of the session member: the reverse edge and others are untouched', async () => {
    follow('me', 'ann'); // I follow ann: not my follower
    follow('bob', 'cat'); // somebody else's follow
    expect(await removeFollower('me', 'ann')).toBe(false);
    expect(await removeFollower('me', 'bob')).toBe(false);
    expect(h.edges).toHaveLength(2);
    expect(h.events).toEqual([]);
    expect(h.counts.me).toEqual({ followerCount: 40, followingCount: 40 });
  });

  it('writes nothing for someone who does not follow, and nothing for yourself', async () => {
    expect(await removeFollower('me', 'ghost')).toBe(false);
    expect(await removeFollower('me', 'me')).toBe(false);
    expect(h.events).toEqual([]);
    expect(h.invalidatedAudience).toEqual([]);
  });

  it('never takes a counter below zero', async () => {
    follow('ann', 'me');
    h.counts.me = { followerCount: 0, followingCount: 0 };
    h.counts.ann = { followerCount: 0, followingCount: 0 };
    await removeFollower('me', 'ann');
    expect(h.counts.me.followerCount).toBe(0);
    expect(h.counts.ann.followingCount).toBe(0);
  });

  it('rolls the edge back when the event cannot be written', async () => {
    follow('ann', 'me');
    h.failEvent = true;
    await expect(removeFollower('me', 'ann')).rejects.toThrow('event insert failed');
    expect(h.edges).toHaveLength(1);
    expect(h.counts.me?.followerCount).toBe(40);
    expect(h.invalidatedAudience).toEqual([]);
  });
});

describe('bulk actions', () => {
  it('bulkUnfollow unfollows current follows, skips the rest and keeps counters consistent', async () => {
    const ids = Array.from({ length: 30 }, (_, i) => `u${i}`);
    for (const id of ids) {
      follow('me', id);
      h.counts[id] = { followerCount: 10, followingCount: 0 };
    }
    const result = await bulkUnfollow('me', [...ids, 'stranger', 'u3']);
    expect(result).toEqual({ done: 30, skipped: 1 });
    expect(h.edges).toHaveLength(0);
    expect(h.counts.me?.followingCount).toBe(10);
    expect(ids.every((id) => h.counts[id]?.followerCount === 9)).toBe(true);
    expect(h.events.filter((e) => e.kind === 'unfollow')).toHaveLength(30);
  });

  it('bulkRemoveFollowers removes followers, skips non-followers and counts both', async () => {
    follow('a', 'me');
    follow('b', 'me');
    follow('me', 'c');
    const result = await bulkRemoveFollowers('me', ['a', 'b', 'c', 'nobody']);
    expect(result).toEqual({ done: 2, skipped: 2 });
    expect(h.edges).toEqual([expect.objectContaining({ followerId: 'me', followingId: 'c' })]);
    expect(h.counts.me?.followerCount).toBe(38);
    expect(h.events.filter((e) => e.kind === 'removed')).toHaveLength(2);
  });

  it('accepts exactly 200 ids and refuses 201', async () => {
    const ids = Array.from({ length: 201 }, (_, i) => `u${i}`);
    await expect(bulkUnfollow('me', ids)).rejects.toThrow(RangeError);
    await expect(bulkRemoveFollowers('me', ids)).rejects.toThrow(RangeError);
    await expect(bulkUnfollow('me', ids.slice(0, 200))).resolves.toEqual({ done: 0, skipped: 200 });
  });

  it('counts duplicate ids once', async () => {
    follow('me', 'x');
    expect(await bulkUnfollow('me', ['x', 'x', ' x '])).toEqual({ done: 1, skipped: 0 });
  });
});

describe('undoUnfollow', () => {
  it('re-follows without a follow notification, after a recent unfollow', async () => {
    follow('me', 'ann');
    await bulkUnfollow('me', ['ann']);
    expect(h.edges).toHaveLength(0);

    expect(await undoUnfollow('me', 'ann')).toBe(true);
    expect(h.edges).toEqual([expect.objectContaining({ followerId: 'me', followingId: 'ann' })]);
    expect(h.notifications).toEqual([]);
    expect(h.events.map((e) => e.kind)).toEqual(['unfollow', 'follow']);
  });

  it('refuses when there was no recent unfollow, so it cannot be used to follow silently', async () => {
    expect(await undoUnfollow('me', 'ann')).toBe(false);
    expect(h.edges).toHaveLength(0);
  });

  it('refuses when the account blocked the member after the unfollow', async () => {
    follow('me', 'ann');
    await bulkUnfollow('me', ['ann']);
    h.blocks.push({ blockerId: 'ann', blockedId: 'me' });
    expect(await undoUnfollow('me', 'ann')).toBe(false);
    expect(h.edges).toHaveLength(0);
  });

  it('refuses when the member blocked the account after the unfollow', async () => {
    follow('me', 'ann');
    await bulkUnfollow('me', ['ann']);
    h.blocks.push({ blockerId: 'me', blockedId: 'ann' });
    expect(await undoUnfollow('me', 'ann')).toBe(false);
  });

  it('is idempotent: a second undo while following changes nothing', async () => {
    follow('me', 'ann');
    await bulkUnfollow('me', ['ann']);
    expect(await undoUnfollow('me', 'ann')).toBe(true);
    expect(await undoUnfollow('me', 'ann')).toBe(true);
    expect(h.edges).toHaveLength(1);
    expect(h.events.filter((e) => e.kind === 'follow')).toHaveLength(1);
  });

  it('refuses when the unfollow is older than the undo window', async () => {
    h.events.push({
      followerId: 'me',
      followingId: 'ann',
      kind: 'unfollow',
      createdAt: new Date(Date.now() - 60 * 60 * 1000),
    });
    expect(await undoUnfollow('me', 'ann')).toBe(false);
  });
});

describe('followUser notify option', () => {
  it('notifies by default and stays silent with notify: false', async () => {
    await followUser({ followerId: 'me', followingId: 'ann' });
    expect(h.notifications).toEqual(['FOLLOW:me->ann']);

    h.notifications = [];
    await followUser({ followerId: 'me', followingId: 'bob', notify: false });
    expect(h.notifications).toEqual([]);
    expect(h.edges.map((e) => e.followingId)).toEqual(['ann', 'bob']);
  });
});
