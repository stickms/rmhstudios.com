import { describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  vibePage: {
    findMany: vi.fn(),
  },
  vibeKv: {
    findMany: vi.fn(),
  },
  postVibeEmbed: {
    findMany: vi.fn(),
  },
}));
vi.mock('@/lib/prisma.server', () => ({
  prisma: h,
}));

import { exportVibeData } from '@/lib/rmhvibe/account-data.server';

describe('exportVibeData', () => {
  it('queries only the user’s own rows, bounded, and never selects the HTML', async () => {
    const d = new Date('2026-01-01');
    h.vibePage.findMany.mockResolvedValue([
      {
        slug: 'a-1',
        title: 'A',
        description: null,
        kind: 'page',
        prompt: 'p',
        status: 'ready',
        createdAt: d,
        updatedAt: d,
        tweakValues: {
          speed: 3,
        },
        parent: {
          slug: 'src-9',
        },
        versions: [
          {
            id: 'v1',
            prompt: 'p',
            title: 'A',
            description: null,
            createdAt: d,
          },
        ],
      },
    ]);
    h.vibeKv.findMany.mockResolvedValue([
      {
        key: 'score',
        value: 5,
        updatedAt: d,
        page: {
          slug: 'a-1',
        },
      },
    ]);
    h.postVibeEmbed.findMany.mockResolvedValue([
      {
        postId: 'p1',
        versionId: 'v1',
        createdAt: d,
        page: {
          slug: 'a-1',
        },
      },
    ]);

    const out = await exportVibeData('u1');

    const pageArgs = h.vibePage.findMany.mock.calls[0]![0];
    expect(pageArgs.where).toEqual({
      ownerId: 'u1',
    });
    expect(pageArgs.take).toBe(10_000);
    expect(pageArgs.select.html).toBeUndefined();
    expect(h.vibeKv.findMany.mock.calls[0]![0].where).toEqual({
      scope: 'user',
      ownerKey: 'u1',
    });
    expect(h.postVibeEmbed.findMany.mock.calls[0]![0].where).toEqual({
      post: {
        userId: 'u1',
      },
    });

    expect(out.pages[0]).toMatchObject({
      slug: 'a-1',
      remixOf: 'src-9',
      tweakValues: {
        speed: 3,
      },
    });
    expect(out.storeRows).toEqual([
      {
        pageSlug: 'a-1',
        key: 'score',
        value: 5,
        updatedAt: d,
      },
    ]);
    expect(out.postEmbeds[0]).toMatchObject({
      pageSlug: 'a-1',
      postId: 'p1',
    });
  });
});
