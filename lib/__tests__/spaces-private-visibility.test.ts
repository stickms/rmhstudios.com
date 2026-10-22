/**
 * Spaces hosted by a PRIVATE community are members-only: the live list and the
 * room read (incl. persisted transcript) must filter by viewer membership.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  space: { findMany: vi.fn(), findFirst: vi.fn() },
  spaceMessage: { findMany: vi.fn() },
}));
vi.mock('@/lib/prisma.server', () => ({
  prisma: { space: h.space, spaceMessage: h.spaceMessage },
}));
vi.mock('@/lib/presence.server', () => ({ setActivity: vi.fn() }));

import { getSpace, listLiveSpaces, viewableSpaceWhere } from '@/lib/spaces.server';

describe('viewableSpaceWhere', () => {
  it('anonymous: only profile + public-community Spaces', () => {
    expect(viewableSpaceWhere(null)).toEqual({
      OR: [{ communityId: null }, { community: { isPrivate: false } }],
    });
  });
  it('signed in: also Spaces of communities the viewer belongs to', () => {
    expect(viewableSpaceWhere('u1').OR).toContainEqual({
      community: { members: { some: { userId: 'u1' } } },
    });
  });
});

describe('listLiveSpaces / getSpace', () => {
  beforeEach(() => {
    h.space.findMany.mockReset().mockResolvedValue([]);
    h.space.findFirst.mockReset();
    h.spaceMessage.findMany.mockReset().mockResolvedValue([]);
  });

  it('listLiveSpaces applies the viewer filter', async () => {
    await listLiveSpaces(20, null);
    expect(h.space.findMany.mock.calls[0][0].where).toEqual({
      status: 'LIVE',
      OR: [{ communityId: null }, { community: { isPrivate: false } }],
    });
  });

  it('getSpace returns null (and never loads the transcript) when the filter hides the row', async () => {
    h.space.findFirst.mockResolvedValue(null);
    expect(await getSpace('s1', null)).toBeNull();
    expect(h.space.findFirst.mock.calls[0][0].where).toMatchObject({
      id: 's1',
      OR: expect.any(Array),
    });
    expect(h.spaceMessage.findMany).not.toHaveBeenCalled();
  });
});
