/**
 * Review item 12: a post made in a community still has its own audience. The
 * community feed and the Hall of Fame filtered only on community membership, so
 * a FOLLOWERS / PRIVATE post was shown to every member (or to everyone in a
 * public community) while canViewPost denied it. They now compose the shared
 * viewerVisiblePostWhere, so the query-side rule is the per-post rule.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  communityFindUnique: vi.fn(),
  memberFindUnique: vi.fn(),
  rmharkFindMany: vi.fn(),
  starFindMany: vi.fn(),
  closeFriendFindMany: vi.fn(),
}));

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    community: { findUnique: h.communityFindUnique },
    communityMember: { findUnique: h.memberFindUnique },
    rMHark: { findMany: h.rmharkFindMany },
    communityStarPost: { findMany: h.starFindMany },
    closeFriend: { findMany: h.closeFriendFindMany },
  },
}));
vi.mock('@/lib/social/follow-graph.server', () => ({ getFollowingIds: async () => ['followed-1'] }));
vi.mock('@/lib/moderation.server', () => ({ getHiddenAuthorIds: async () => ['hidden-1'] }));
vi.mock('@/lib/notifications.server', () => ({ createNotification: vi.fn() }));
vi.mock('@/lib/feed/map-feed-item.server', () => ({
  rmharkIncludeLite: () => ({}),
  mapRmharksWithBoundedReactions: async () => [],
}));
vi.mock('@/lib/communities/flairs.server', () => ({ loadFlairsForPosts: async () => new Map() }));
vi.mock('@/lib/communities/join-requests.server', () => ({ getOwnRequestState: async () => null }));
vi.mock('@/lib/communities/settings.server', () => ({
  getCommunitySettings: async () => ({ starThreshold: 3 }),
}));

import { getCommunityFeed } from '@/lib/community.server';
import { getHallOfFame } from '@/lib/communities/starboard.server';

beforeEach(() => {
  h.communityFindUnique.mockReset().mockResolvedValue({ id: 'c1', isPrivate: false });
  h.memberFindUnique.mockReset().mockResolvedValue({ followedFlairIds: [] });
  h.rmharkFindMany.mockReset().mockResolvedValue([]);
  h.starFindMany.mockReset().mockResolvedValue([]);
  h.closeFriendFindMany.mockReset().mockResolvedValue([]);
});

/** The audience rule: PUBLIC, own, followed FOLLOWERS, ... and never PRIVATE-by-others. */
function expectAudienceRule(where: Record<string, unknown>) {
  const or = where.OR as Array<Record<string, unknown>>;
  expect(Array.isArray(or)).toBe(true);
  expect(or).toContainEqual({ audience: 'PUBLIC' });
  expect(or).toContainEqual({ audience: 'FOLLOWERS', userId: { in: ['followed-1'] } });
  expect(or).toContainEqual({ userId: 'viewer-1' });
  // PRIVATE is reachable only through the author-is-viewer branch.
  expect(JSON.stringify(or)).not.toContain('"PRIVATE"');
  expect(where.deletedAt).toBeNull();
}

describe('community surfaces honour the post audience', () => {
  it('community feed (member viewer)', async () => {
    await getCommunityFeed('s', 'viewer-1');
    expectAudienceRule(h.rmharkFindMany.mock.calls[0][0].where);
  });

  it('community feed (anonymous viewer on a public community): PUBLIC only', async () => {
    await getCommunityFeed('s', null);
    const where = h.rmharkFindMany.mock.calls[0][0].where;
    expect(where.audience).toBe('PUBLIC');
    expect(where.communityId).toBe('c1');
  });

  it('hall of fame', async () => {
    await getHallOfFame('c1', 'viewer-1');
    expectAudienceRule(h.starFindMany.mock.calls[0][0].where.post);
  });

  it('hall of fame (anonymous): PUBLIC only', async () => {
    await getHallOfFame('c1', null);
    expect(h.starFindMany.mock.calls[0][0].where.post.audience).toBe('PUBLIC');
  });
});
