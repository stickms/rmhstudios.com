/**
 * A series page and the "Part k of N" nav are public reads: they must apply the
 * same visibility rule as a direct post read, and a community / non-public post
 * can never be added.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  postSeries: { findUnique: vi.fn(), findFirst: vi.fn() },
  postSeriesItem: { findMany: vi.fn(), findUnique: vi.fn() },
  postSeriesFollow: { findUnique: vi.fn() },
  rMHark: { findUnique: vi.fn() },
  visible: vi.fn(),
  map: vi.fn(),
}));

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    postSeries: h.postSeries,
    postSeriesItem: h.postSeriesItem,
    postSeriesFollow: h.postSeriesFollow,
    rMHark: h.rMHark,
  },
}));
vi.mock('@/lib/cache', () => ({
  apiCache: { get: () => undefined, set: vi.fn(), invalidatePrefix: vi.fn() },
}));
vi.mock('@/lib/notifications.server', () => ({ createNotification: vi.fn() }));
vi.mock('@/lib/feed/audience.server', () => ({ viewerVisiblePostWhere: h.visible }));
vi.mock('@/lib/feed/map-feed-item.server', () => ({
  rmharkIncludeLite: () => ({}),
  mapRmharksWithBoundedReactions: h.map,
}));

import { addPost, getSeriesView, navForPost } from '@/lib/posts-plus/series.server';

const VISIBLE = { deletedAt: null, audience: 'PUBLIC', marker: 'visible-where' };

beforeEach(() => {
  for (const m of [
    h.postSeries.findUnique,
    h.postSeries.findFirst,
    h.postSeriesItem.findMany,
    h.postSeriesItem.findUnique,
    h.postSeriesFollow.findUnique,
    h.rMHark.findUnique,
    h.visible,
    h.map,
  ])
    m.mockReset();
  h.visible.mockResolvedValue(VISIBLE);
  h.map.mockImplementation(async (rows: unknown[]) => rows);
  h.postSeriesFollow.findUnique.mockResolvedValue(null);
});

describe('getSeriesView', () => {
  it("filters the items by the viewer's visibility rule", async () => {
    h.postSeries.findUnique.mockResolvedValue({
      id: 's1',
      userId: 'author',
      title: 't',
      description: null,
      followCount: 0,
      updatedAt: new Date(),
      user: { id: 'author', name: 'A' },
    });
    h.postSeriesItem.findMany.mockResolvedValue([]);
    await getSeriesView('s1', null);
    expect(h.visible).toHaveBeenCalledWith(null);
    const where = h.postSeriesItem.findMany.mock.calls[0][0].where;
    expect(where.post.AND).toContainEqual(VISIBLE);
  });
});

describe('navForPost', () => {
  it('scopes neighbours to what the viewer may see and returns null for a hidden post', async () => {
    h.postSeriesItem.findUnique.mockResolvedValue({
      seriesId: 's1',
      series: { id: 's1', title: 't', userId: 'author' },
    });
    // The visible-only query does not return the (private) post itself.
    h.postSeriesItem.findMany.mockResolvedValue([
      { postId: 'other', position: 1, post: { user: { handle: 'h' } } },
    ]);
    expect(await navForPost('private-post', 'viewer')).toBeNull();
    expect(h.visible).toHaveBeenCalledWith('viewer');
    expect(h.postSeriesItem.findMany.mock.calls[0][0].where.post.AND).toContainEqual(VISIBLE);
  });
});

describe('addPost', () => {
  it('rejects a community post', async () => {
    h.postSeries.findFirst.mockResolvedValue({ id: 's1', postCount: 0 });
    h.rMHark.findUnique.mockResolvedValue({
      userId: 'u',
      audience: 'PUBLIC',
      deletedAt: null,
      seriesId: null,
      communityId: 'c1',
      createdAt: new Date(),
    });
    const res = await addPost('u', 's1', 'p1');
    expect(res).toMatchObject({ ok: false, status: 400 });
    expect(h.rMHark.findUnique.mock.calls[0][0].select.communityId).toBe(true);
  });

  it('still rejects non-public posts', async () => {
    h.postSeries.findFirst.mockResolvedValue({ id: 's1', postCount: 0 });
    h.rMHark.findUnique.mockResolvedValue({
      userId: 'u',
      audience: 'FOLLOWERS',
      deletedAt: null,
      seriesId: null,
      communityId: null,
      createdAt: new Date(),
    });
    expect(await addPost('u', 's1', 'p1')).toMatchObject({ ok: false, status: 400 });
  });
});
