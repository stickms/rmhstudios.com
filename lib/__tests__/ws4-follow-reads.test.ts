/**
 * WS4 — two read paths used to run their own unbounded `follow.findMany` for the
 * viewer's whole follow list on every cold read: the friends leaderboard and the
 * hashtag feed. Both now use `getFollowingIds` (capped at 5,000, cached 30 s,
 * invalidated on follow/unfollow/block — the list the feed itself filters by).
 *
 * These tests count Prisma calls: neither module may touch `follow` directly.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  followFindMany: vi.fn(),
  profileFindMany: vi.fn(),
  rmharkFindMany: vi.fn(),
  getFollowingIds: vi.fn(),
  getHiddenAuthorIds: vi.fn(),
}));

vi.mock('@/lib/prisma.server', () => {
  const client = {
    follow: { findMany: h.followFindMany },
    userProfile: { findMany: h.profileFindMany },
    rMHark: { findMany: h.rmharkFindMany },
  };
  return { prisma: client, prismaRead: client };
});
vi.mock('@/lib/cached.server', () => ({
  cached: (_key: string, _ttl: number, load: () => Promise<unknown>) => load(),
}));
vi.mock('@/lib/social/follow-graph.server', () => ({ getFollowingIds: h.getFollowingIds }));
vi.mock('@/lib/moderation.server', () => ({ getHiddenAuthorIds: h.getHiddenAuthorIds }));
vi.mock('@/lib/feed/map-feed-item.server', () => ({
  rmharkIncludeLite: () => ({}),
  mapRmharksWithBoundedReactions: async () => [],
}));
vi.mock('@/lib/feed/audience.server', () => ({
  audienceWhere: (viewerId: string | null, following: string[]) => ({ _aud: [viewerId, following] }),
}));

import { getLeaderboard } from '@/lib/leaderboard.server';
import { listTagFeed } from '@/lib/tags.server';

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
  it('reads the follow graph through getFollowingIds, never follow.findMany', async () => {
    await listTagFeed('rust', { viewerId: 'me' });
    expect(h.followFindMany).not.toHaveBeenCalled();
    expect(h.getFollowingIds).toHaveBeenCalledWith('me');
    expect(h.rmharkFindMany).toHaveBeenCalledTimes(1);
    expect(h.rmharkFindMany.mock.calls[0][0].where._aud).toEqual(['me', ['a', 'b']]);
  });

  it('a signed-out read touches no follow data at all', async () => {
    await listTagFeed('rust', { viewerId: null });
    expect(h.getFollowingIds).not.toHaveBeenCalled();
    expect(h.followFindMany).not.toHaveBeenCalled();
    expect(h.rmharkFindMany.mock.calls[0][0].where._aud).toEqual([null, []]);
  });
});
