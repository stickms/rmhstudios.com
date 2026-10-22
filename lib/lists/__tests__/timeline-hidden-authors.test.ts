/**
 * Review item 13 (lists): the list timeline did not drop posts by authors the
 * viewer blocked or muted. They are filtered out of the member set, and the
 * shared visibility predicate (audience, deleted, blocks) is applied.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  memberFindMany: vi.fn(),
  rmharkFindMany: vi.fn(),
  closeFriendFindMany: vi.fn(),
  hidden: vi.fn(),
}));

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    userListMember: { findMany: h.memberFindMany },
    rMHark: { findMany: h.rmharkFindMany },
    closeFriend: { findMany: h.closeFriendFindMany },
  },
}));
vi.mock('@/lib/social/follow-graph.server', () => ({ getFollowingIds: async () => [] }));
// Blocks also ride the throwing getBlockedAuthorIds (unioned in); h.hidden already holds them here.
vi.mock('@/lib/moderation.server', () => ({ getHiddenAuthorIds: h.hidden, getBlockedAuthorIds: async () => [] }));

import { listTimeline } from '@/lib/lists/lists.server';

beforeEach(() => {
  h.memberFindMany.mockReset().mockResolvedValue([{ userId: 'a' }, { userId: 'b' }, { userId: 'c' }]);
  h.rmharkFindMany.mockReset().mockResolvedValue([]);
  h.closeFriendFindMany.mockReset().mockResolvedValue([]);
  h.hidden.mockReset().mockResolvedValue(['b']);
});

describe('listTimeline', () => {
  it('drops blocked/muted authors from the member set', async () => {
    await listTimeline('viewer-1', 'l1');
    const where = h.rmharkFindMany.mock.calls[0][0].where;
    expect(where.userId).toEqual({ in: ['a', 'c'] });
    expect(JSON.stringify(where.AND)).toContain('"b"');
  });

  it('returns nothing without a query when every member is hidden', async () => {
    h.hidden.mockResolvedValue(['a', 'b', 'c']);
    const out = await listTimeline('viewer-1', 'l1');
    expect(out).toEqual({ items: [], nextCursor: null });
    expect(h.rmharkFindMany).not.toHaveBeenCalled();
  });

  it('anonymous viewers see PUBLIC posts only', async () => {
    h.hidden.mockResolvedValue([]);
    await listTimeline(null, 'l1');
    expect(h.rmharkFindMany.mock.calls[0][0].where.AND[0].audience).toBe('PUBLIC');
  });
});
