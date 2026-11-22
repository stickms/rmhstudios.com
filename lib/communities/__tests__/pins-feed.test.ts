/**
 * s09-06 pinned posts in the community feed: the block leads the first page, the pages below leave pinned posts out,
 * and the block reads through the feed's own visibility filter and serialiser (the real ones here; only Prisma and the
 * block lookup are faked). Without `withPins` (the developer API's call) the page is unchanged and each post says
 * whether it is pinned.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface Row {
  id: string;
  userId: string;
  communityId: string;
  threadRootId: string | null;
  deletedAt: Date | null;
  createdAt: Date;
  likeCount: number;
  commentCount: number;
  repostCount: number;
  viewCount: number;
  content: string;
  hideCounts?: boolean;
}

const h = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  pins: [] as Array<{ postId: string; position: number }>,
  blocked: [] as string[],
  isPrivate: false,
  member: true,
  findManyWheres: [] as Array<Record<string, unknown>>,
  pinQueries: 0,
}));

vi.mock('@/lib/prisma.server', () => {
  const rows = () => h.rows as unknown as Row[];
  const idFilter = (id: unknown, rowId: string): boolean => {
    if (!id || typeof id !== 'object') return true;
    const f = id as { in?: string[]; notIn?: string[] };
    if (f.in && !f.in.includes(rowId)) return false;
    if (f.notIn?.includes(rowId)) return false;
    return true;
  };
  const prisma = {
    community: {
      findUnique: async () => ({ id: 'cA', isPrivate: h.isPrivate }),
    },
    communityMember: {
      findUnique: async () => (h.member ? { followedFlairIds: [] } : null),
    },
    communityPinnedPost: {
      findMany: async ({ where }: { where: { postId?: { in: string[] } } }) => {
        h.pinQueries += 1;
        return h.pins
          .filter((p) => !where.postId || where.postId.in.includes(p.postId))
          .sort((a, b) => a.position - b.position);
      },
    },
    rMHark: {
      findMany: async ({ where, take }: { where: Record<string, unknown>; take?: number }) => {
        h.findManyWheres.push(where);
        const notIn = (where.userId as { notIn?: string[] } | undefined)?.notIn ?? [];
        const found = rows()
          .filter(
            (r) =>
              r.communityId === where.communityId &&
              idFilter(where.id, r.id) &&
              (where.threadRootId === undefined || r.threadRootId === where.threadRootId) &&
              (where.deletedAt === undefined || r.deletedAt === where.deletedAt) &&
              !notIn.includes(r.userId),
          )
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return found.slice(0, take ?? found.length).map((r) => ({
          ...r,
          user: {
            id: r.userId,
            name: r.userId,
            image: null,
            username: r.userId,
            handle: r.userId,
            profile: { hideCountsOnMine: !!r.hideCounts },
          },
          likes: [],
          reposts: [],
          reactions: [],
        }));
      },
    },
    rMHarkReaction: {
      groupBy: async () => [],
      findMany: async () => [],
    },
    savedItem: {
      findMany: async () => [],
    },
    closeFriend: { findMany: async () => [] },
  };
  return { prisma };
});
vi.mock('@/lib/moderation.server', () => ({
  // Blocks in either direction: the real helper returns both sets, so the fake does too.
  getBlockedAuthorIds: async () => h.blocked,
  getHiddenAuthorIds: async () => [],
}));
vi.mock('@/lib/communities/flairs.server', () => ({
  loadFlairsForPosts: async () => new Map(),
}));
vi.mock('@/lib/communities/join-requests.server', () => ({
  getOwnRequestState: async () => null,
}));

const { getCommunityFeed } = await import('@/lib/communities/detail.server');

const day = (n: number) => new Date(Date.UTC(2026, 10, n));
const add = (id: string, over: Partial<Row> = {}) =>
  h.rows.push({
    id,
    userId: `u-${id}`,
    communityId: 'cA',
    threadRootId: null,
    deletedAt: null,
    createdAt: day(Number(id.replace(/\D/g, '')) || 1),
    likeCount: 7,
    commentCount: 3,
    repostCount: 2,
    viewCount: 99,
    content: `post ${id}`,
    ...over,
  });
const ids = (xs: Array<{ id: string }> | undefined) => (xs ?? []).map((i) => i.id);

beforeEach(() => {
  h.rows = [];
  h.pins = [];
  h.blocked = [];
  h.isPrivate = false;
  h.member = true;
  h.findManyWheres = [];
  h.pinQueries = 0;
  for (const id of ['p1', 'p2', 'p3', 'p4', 'p5']) add(id);
});

describe('the community feed with pins (the site)', () => {
  it('leads with the pinned posts in the moderators order and leaves them out below', async () => {
    h.pins = [
      { postId: 'p2', position: 0 },
      { postId: 'p1', position: 1 },
    ];
    const feed = await getCommunityFeed('a', 'viewer', { withPins: true });
    expect(ids(feed?.pinned)).toEqual(['p2', 'p1']);
    expect(ids(feed?.items)).toEqual(['p5', 'p4', 'p3']);
    expect(feed?.pinned?.every((i) => i.communityPinned === true && i.communitySlug === 'a')).toBe(true);
  });

  it('carries the block on the first page only, but leaves pinned posts out of every page', async () => {
    h.pins = [{ postId: 'p3', position: 0 }];
    const second = await getCommunityFeed('a', 'viewer', { withPins: true, cursor: 'p5' });
    expect(second?.pinned).toBeUndefined();
    expect(h.findManyWheres[0]?.id).toEqual({ notIn: ['p3'] });
  });

  it('answers an empty block when nothing is pinned, with one pin read for the page', async () => {
    const feed = await getCommunityFeed('a', 'viewer', { withPins: true });
    expect(feed?.pinned).toEqual([]);
    expect(h.pinQueries).toBe(1);
  });

  it('drops a pinned post that was removed or is held (deletedAt set), and a thread follow-up', async () => {
    add('p6', { deletedAt: day(20) });
    add('p7', { threadRootId: 'p1' });
    h.pins = [
      { postId: 'p6', position: 0 },
      { postId: 'p7', position: 1 },
      { postId: 'p1', position: 2 },
    ];
    const feed = await getCommunityFeed('a', 'viewer', { withPins: true });
    expect(ids(feed?.pinned)).toEqual(['p1']);
    // The removed post is not in the feed below either: the pin row is ignored, not shown.
    expect(ids(feed?.items)).not.toContain('p6');
  });

  it('hides a pinned post whose author the reader blocked, or who blocked the reader (the same filter as the feed)', async () => {
    h.pins = [
      { postId: 'p1', position: 0 },
      { postId: 'p2', position: 1 },
      { postId: 'p3', position: 2 },
    ];
    // `getBlockedAuthorIds` answers both directions: u-p1 is someone the reader blocked, u-p2 someone who blocked them.
    h.blocked = ['u-p1', 'u-p2'];
    const feed = await getCommunityFeed('a', 'viewer', { withPins: true });
    expect(ids(feed?.pinned)).toEqual(['p3']);
    expect(ids(feed?.items)).toEqual(['p5', 'p4']);
  });

  it('applies quiet counts to a pinned row exactly as to a row in the feed', async () => {
    add('p8', { hideCounts: true });
    add('p9', { hideCounts: true, userId: 'viewer' });
    h.pins = [
      { postId: 'p8', position: 0 },
      { postId: 'p9', position: 1 },
    ];
    const feed = await getCommunityFeed('a', 'viewer', { withPins: true });
    const [hidden, own] = feed?.pinned ?? [];
    expect([hidden?.likeCount, hidden?.commentCount, hidden?.repostCount, hidden?.viewCount]).toEqual([
      null,
      null,
      null,
      null,
    ]);
    // The author still sees their own figures.
    expect(own?.likeCount).toBe(7);
    // And the signed-out reader sees nothing of a hidden count either.
    const anon = await getCommunityFeed('a', null, { withPins: true });
    expect(anon?.pinned?.[0]?.likeCount).toBeNull();
  });

  it('keeps pins out of a flair-filtered list: it is a different list', async () => {
    h.pins = [{ postId: 'p1', position: 0 }];
    const feed = await getCommunityFeed('a', 'viewer', { withPins: true, flairId: 'f1' });
    expect(feed?.pinned).toBeUndefined();
    expect(h.findManyWheres[0]?.id).toBeUndefined();
  });

  it('keeps the feed own 404: a private community is not readable by a non-member, pins included', async () => {
    h.isPrivate = true;
    h.member = false;
    h.pins = [{ postId: 'p1', position: 0 }];
    expect(await getCommunityFeed('a', 'stranger', { withPins: true })).toBeNull();
    expect(await getCommunityFeed('a', null, { withPins: true })).toBeNull();
  });
});

describe('the community feed without pins (the developer API)', () => {
  it('leaves the page unchanged and says which posts are pinned', async () => {
    h.pins = [{ postId: 'p2', position: 0 }];
    const feed = await getCommunityFeed('a', 'viewer');
    expect(ids(feed?.items)).toEqual(['p5', 'p4', 'p3', 'p2', 'p1']);
    expect(feed?.pinned).toBeUndefined();
    expect(feed?.items.map((i) => [i.id, i.communityPinned])).toEqual([
      ['p5', false],
      ['p4', false],
      ['p3', false],
      ['p2', true],
      ['p1', false],
    ]);
    expect(h.findManyWheres[0]?.id).toBeUndefined();
  });
});

describe('what the pin reader goes through', () => {
  it('serialises a pinned row with the feed mapper and nothing else', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../pins.server.ts', import.meta.url), 'utf8');
    expect(src).toContain('mapRmharksWithBoundedReactions');
    expect(src).toContain('viewerVisiblePostWhere');
    expect(src).toContain('rmharkIncludeLite');
    // A pin whose post was deleted, removed or held takes no slot and shows nowhere.
    expect(src).toContain('post: { deletedAt: null }');
    // It never builds a post's fields by hand.
    expect(src).not.toMatch(/\b(likeCount|contentWarning|gifAlt|correctOptionId)\s*:/);
  });
});
