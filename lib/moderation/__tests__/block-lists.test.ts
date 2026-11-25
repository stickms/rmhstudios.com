/**
 * Blocking takes each member off the other's lists (s13-11), inside the block's own transaction and only on lists the
 * two own: a third member's list that names both is untouched. The lists' membership locks are taken first, in id
 * order, so an add that is mid-flight finishes before the memberships go. Prisma is an in-memory fake.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOf, type TestHandler } from '@/lib/__tests__/api-handlers-of';

interface Feed {
  id: string;
  kind: string;
  ownerId: string;
}
interface Member {
  feedId: string;
  userId: string;
}

const h = vi.hoisted(() => ({
  feeds: [] as { id: string; kind: string; ownerId: string }[],
  members: [] as { feedId: string; userId: string }[],
  blocks: [] as { blockerId: string; blockedId: string }[],
  log: [] as string[],
  failBlock: false,
}));

vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: async () => ({ user: { id: 'viewer' }, session: {} }) } },
}));
vi.mock('@/lib/rate-limit.server', () => ({ withRateLimitAsync: async () => null }));
vi.mock('@/lib/moderation.server', () => ({ invalidateHiddenAuthors: () => {} }));
vi.mock('@/lib/social/follow-graph.server', () => ({ invalidateFollowingIds: () => {} }));
vi.mock('@/lib/social/follow-events.server', () => ({
  invalidateAudience: () => {},
  recordFollowEvent: async () => {},
}));
vi.mock('@/lib/feed/repost-mutes.server', () => ({
  clearRepostMuteForBlock: async () => {},
  invalidateRepostMutes: () => {},
}));
vi.mock('@/lib/study/deck-editors.server', () => ({ endEditingBetween: async () => {} }));
vi.mock('@/lib/db/advisory-lock.server', () => ({
  lockKey: async (_tx: unknown, key: string) => {
    h.log.push(`lock:${key}`);
  },
}));
vi.mock('@/lib/prisma.server', () => {
  const tx = {
    customFeed: {
      findMany: async ({ where }: { where: { kind: string; ownerId: { in: string[] } }; orderBy: { id: 'asc' } }) =>
        h.feeds
          .filter((f) => f.kind === where.kind && where.ownerId.in.includes(f.ownerId))
          .map((f) => ({ id: f.id }))
          .sort((a, b) => a.id.localeCompare(b.id)),
    },
    customFeedMember: {
      deleteMany: async ({ where }: { where: { userId: string; feed: { kind: string; ownerId: string } } }) => {
        h.log.push(`delete:${where.feed.ownerId}:${where.userId}`);
        const owned = new Set(
          h.feeds.filter((f) => f.kind === where.feed.kind && f.ownerId === where.feed.ownerId).map((f) => f.id),
        );
        const before = h.members.length;
        h.members = h.members.filter((m) => !(m.userId === where.userId && owned.has(m.feedId)));
        return { count: before - h.members.length };
      },
    },
    userBlock: {
      create: async ({ data }: { data: { blockerId: string; blockedId: string } }) => {
        h.log.push('block');
        if (h.failBlock) throw new Error('boom');
        h.blocks.push(data);
        return {};
      },
    },
    follow: { findMany: async () => [], deleteMany: async () => ({ count: 0 }) },
  };
  return {
    prisma: {
      ...tx,
      user: { findUnique: async () => ({ isAdmin: false }) },
      userBlock: { ...tx.userBlock, findUnique: async () => null },
      // A transaction that fails leaves nothing behind, as Postgres would.
      $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => {
        const saved = { feeds: [...h.feeds], members: [...h.members], blocks: [...h.blocks] };
        try {
          return await fn(tx);
        } catch (e) {
          h.feeds = saved.feeds;
          h.members = saved.members;
          h.blocks = saved.blocks;
          throw e;
        }
      },
    },
  };
});

import { route } from '@/lib/moderation/api/moderation.block.server';

const block = (target: string) =>
  handlersOf<TestHandler>(route).POST!({
    request: new Request('http://x/api/moderation/block', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: 'better-auth.session_token=t' },
      body: JSON.stringify({ targetUserId: target }),
    }),
    params: {},
  });

const feed = (id: string, ownerId: string): Feed => ({ id, kind: 'list', ownerId });
const on = (feedId: string, userId: string): Member => ({ feedId, userId });

beforeEach(() => {
  h.feeds = [
    feed('L1', 'viewer'), // the blocker's list, naming the blocked member
    feed('L2', 'target'), // the blocked member's list, naming the blocker
    feed('L3', 'third'), // a third member's list naming both
    feed('L4', 'viewer'), // the blocker's list naming a third member
    { id: 'F1', kind: 'feed', ownerId: 'viewer' }, // a custom feed (not a list) naming the blocked member
  ];
  h.members = [
    on('L1', 'target'),
    on('L1', 'third'),
    on('L2', 'viewer'),
    on('L3', 'viewer'),
    on('L3', 'target'),
    on('L4', 'third'),
    on('F1', 'target'),
  ];
  h.blocks = [];
  h.log = [];
  h.failBlock = false;
});

describe('blocking and lists', () => {
  it('removes each member from the other’s lists, in both directions', async () => {
    const res = await block('target');
    expect(res.status).toBe(200);
    expect(h.members).not.toContainEqual(on('L1', 'target'));
    expect(h.members).not.toContainEqual(on('L2', 'viewer'));
  });

  it('touches only the lists the two own: a third member’s list naming both, other people, and feeds stay', async () => {
    await block('target');
    expect(h.members).toEqual([
      on('L1', 'third'),
      on('L3', 'viewer'),
      on('L3', 'target'),
      on('L4', 'third'),
      on('F1', 'target'),
    ]);
  });

  it('takes the lists’ membership locks first, in id order, then blocks and removes in the same transaction', async () => {
    await block('target');
    expect(h.log).toEqual([
      'lock:list-members:L1',
      'lock:list-members:L2',
      'lock:list-members:L4',
      'block',
      'delete:viewer:target',
      'delete:target:viewer',
    ]);
  });

  it('keeps the memberships when the block itself fails', async () => {
    h.failBlock = true;
    const before = [...h.members];
    await block('target').catch(() => undefined);
    expect(h.members).toEqual(before);
    expect(h.blocks).toEqual([]);
  });

  it('records the block', async () => {
    await block('target');
    expect(h.blocks).toEqual([{ blockerId: 'viewer', blockedId: 'target' }]);
  });
});
