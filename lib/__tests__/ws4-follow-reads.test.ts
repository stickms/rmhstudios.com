/**
 * WS4 — three read paths used to run their own unbounded `follow.findMany` for the
 * viewer's whole follow list on every cold read: the friends leaderboard, the
 * hashtag feed and Explore. The friends leaderboard uses `getFollowingIds` (capped at 5,000,
 * cached 30 s, invalidated on follow/unfollow/block): it ranks people and gates nothing.
 * The tag feed and Explore decide VISIBILITY / SUGGESTIONS, so they must be exact and no
 * longer use the capped list (review item 5): the tag feed asks the database inside its one
 * raw query, Explore probes `follow` for the bounded suggestion pool only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  followFindMany: vi.fn(),
  profileFindMany: vi.fn(),
  rmharkFindMany: vi.fn(),
  queryRaw: vi.fn(),
  getFollowingIds: vi.fn(),
  getHiddenAuthorIds: vi.fn(),
}));

vi.mock('@/lib/prisma.server', () => {
  const client = {
    follow: { findMany: h.followFindMany },
    userProfile: { findMany: h.profileFindMany },
    rMHark: { findMany: h.rmharkFindMany },
    $queryRaw: h.queryRaw,
    hashtag: { findMany: async () => [] },
    community: { findMany: async () => [] },
    libraryDocument: { findMany: async () => [] },
    user: { findMany: async () => [] },
  };
  return { prisma: client, prismaRead: client };
});
vi.mock('@/lib/cached.server', () => ({
  cached: (_key: string, _ttl: number, load: () => Promise<unknown>) => load(),
}));
vi.mock('@/lib/social/follow-graph.server', () => ({
  getFollowingIds: h.getFollowingIds,
  friendsLeaderboardKey: (id: string) => `leaderboard:friends:${id}`,
}));
vi.mock('@/lib/moderation.server', () => ({
  getHiddenAuthorIds: h.getHiddenAuthorIds,
  getHiddenAuthorIdsStrict: h.getHiddenAuthorIds,
}));
vi.mock('@/lib/feed/map-feed-item.server', () => ({
  rmharkIncludeLite: () => ({}),
  mapRmharksWithBoundedReactions: async () => [],
}));
vi.mock('@/lib/feed/timeline', () => ({
  getMutedWords: async () => [],
  applyMutedWords: (items: unknown[]) => items,
}));
vi.mock('@/lib/feed/audience.server', () => ({
  audienceWhereExact: (viewerId: string | null) => ({ _aud: [viewerId] }),
  communityVisibleWhere: () => ({}),
}));

import { getLeaderboard } from '@/lib/leaderboard.server';
import { listTagFeed } from '@/lib/tags.server';
import { listExplore } from '@/lib/explore.server';

beforeEach(() => {
  for (const fn of Object.values(h)) fn.mockReset();
  h.profileFindMany.mockResolvedValue([]);
  h.rmharkFindMany.mockResolvedValue([]);
  h.getHiddenAuthorIds.mockResolvedValue([]);
  h.getFollowingIds.mockResolvedValue(['a', 'b']);
});

describe('friends leaderboard', () => {
  it('reads the follow graph through getFollowingIds, never follow.findMany', async () => {
    await getLeaderboard('me', 'friends');
    expect(h.followFindMany).not.toHaveBeenCalled();
    expect(h.getFollowingIds).toHaveBeenCalledWith('me');
    expect(h.profileFindMany).toHaveBeenCalledTimes(1);
    const where = h.profileFindMany.mock.calls[0][0].where;
    expect(new Set(where.userId.in)).toEqual(new Set(['me', 'a', 'b']));
  });
});

describe('tag feed', () => {
  // WS8: the tag feed picks the page's ids with a raw keyset scan (audience filter
  // included) and then hydrates them. The follower check is a correlated EXISTS in
  // that query, so no follow ids are bound at all.
  const boundValues = () =>
    (h.queryRaw.mock.calls[0][0] as { values: unknown[] }).values.flat(Infinity as 1);

  it('checks follows exactly inside the one raw query, not via the capped list', async () => {
    h.queryRaw.mockResolvedValue([]);
    await listTagFeed('rust', { viewerId: 'me' });
    expect(h.followFindMany).not.toHaveBeenCalled();
    expect(h.getFollowingIds).not.toHaveBeenCalled();
    expect(h.queryRaw).toHaveBeenCalledTimes(1);
    expect(boundValues()).not.toEqual(expect.arrayContaining(['a', 'b']));
  });

  const sqlText = () =>
    (h.queryRaw.mock.calls[0][0] as { sql: string }).sql
      .replace(/\s+/g, ' ')
      .replace(/::"RMHarkAudience"/g, '')
      .replace(/\( /g, '(')
      .replace(/ \)/g, ')');

  it('the audience rule lives in the SQL: signed-in viewers get every audience branch, bound to them', async () => {
    h.queryRaw.mockResolvedValue([]);
    await listTagFeed('rust', { viewerId: 'me' });
    const sql = sqlText();
    expect(sql).toContain(`r.audience = 'PUBLIC'`);
    expect(sql).toContain('r."userId" = ?'); // own posts
    expect(sql).toContain(
      `r.audience = 'FOLLOWERS' AND EXISTS (SELECT 1 FROM follow f WHERE f."followerId" = ? AND f."followingId" = r."userId")`,
    );
    expect(sql).toContain(
      `r.audience = 'SUPPORTERS' AND EXISTS (SELECT 1 FROM creator_membership cm WHERE cm."supporterId" = ? AND cm."creatorId" = r."userId"`,
    );
    // A lapsed membership must not unlock SUPPORTERS posts: the expiry clause is part of the rule.
    expect(sql).toContain('cm."expiresAt" > now()');
    expect(sql).toContain(
      `r.audience = 'CIRCLE' AND EXISTS (SELECT 1 FROM close_friend cf WHERE cf."memberId" = ? AND cf."ownerId" = r."userId")`,
    );
    expect(boundValues()).toContain('me');
  });

  it('a signed-out read is PUBLIC-only: no FOLLOWERS / SUPPORTERS / CIRCLE branch, no viewer bound', async () => {
    h.queryRaw.mockResolvedValue([]);
    await listTagFeed('rust', { viewerId: null });
    const sql = sqlText();
    expect(sql).toContain(`r.audience = 'PUBLIC'`);
    for (const a of ['FOLLOWERS', 'SUPPORTERS', 'CIRCLE']) expect(sql).not.toContain(a);
    expect(boundValues()).not.toContain('me');
  });

  it("keyset cursor resumes from the cursor post's link row for THIS tag, falling back to the post row", async () => {
    h.queryRaw.mockResolvedValue([]);
    await listTagFeed('rust', { viewerId: null, cursor: 'post-9' });
    const sql = sqlText();
    // The link row comes first (pri 0) and is scoped to the tag's hashtag id...
    expect(sql).toContain(
      `SELECT ph2."createdAt", ph2."rmheetId" AS id, 0 AS pri FROM post_hashtag ph2 WHERE ph2."hashtagId" = (SELECT id FROM hashtag WHERE tag = ?) AND ph2."rmheetId" = ?`,
    );
    // ...then the post row as the fallback (pri 1), and the lower pri wins.
    expect(sql).toContain(
      `UNION ALL SELECT "createdAt", id, 1 FROM rmheet WHERE id = ?) c ORDER BY c.pri LIMIT 1`,
    );
    // Compared as the same (createdAt, rmheetId) pair the page is ordered by.
    expect(sql).toContain('(ph."createdAt", ph."rmheetId") < (');
    const bound = boundValues();
    expect(bound.filter((v) => v === 'post-9')).toHaveLength(2);
    expect(bound.filter((v) => v === 'rust')).toHaveLength(2); // page scan + cursor link row
  });

  it('no cursor, no cursor subquery', async () => {
    h.queryRaw.mockResolvedValue([]);
    await listTagFeed('rust', { viewerId: null });
    expect(sqlText()).not.toContain('ph2');
  });

  it('a signed-out read touches no follow data at all', async () => {
    h.queryRaw.mockResolvedValue([]);
    await listTagFeed('rust', { viewerId: null });
    expect(h.getFollowingIds).not.toHaveBeenCalled();
    expect(h.followFindMany).not.toHaveBeenCalled();
    expect(boundValues()).not.toEqual(expect.arrayContaining(['a', 'b']));
  });
});

describe('explore', () => {
  it('excludes followed accounts with one bounded probe, not the capped list', async () => {
    h.rmharkFindMany.mockResolvedValue([{ id: 'p1' }]);
    h.followFindMany.mockResolvedValue([]);
    await listExplore('me');
    expect(h.getFollowingIds).not.toHaveBeenCalled();
    expect(h.followFindMany).toHaveBeenCalledTimes(1);
  });
});
