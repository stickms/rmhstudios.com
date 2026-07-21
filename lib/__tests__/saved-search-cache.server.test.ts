import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  savedSearch: {
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  },
}));
vi.mock('@/lib/prisma.server', () => ({ prisma: prismaMock }));

import { listSaved, createSaved, updateSaved, deleteSaved } from '@/lib/search/saved.server';

beforeEach(() => {
  prismaMock.savedSearch.findMany.mockReset().mockResolvedValue([]);
  prismaMock.savedSearch.count.mockReset().mockResolvedValue(0);
  prismaMock.savedSearch.create
    .mockReset()
    .mockResolvedValue({ id: 'x', query: 'q', types: [], alerts: false, createdAt: new Date(0) });
  prismaMock.savedSearch.updateMany.mockReset().mockResolvedValue({ count: 1 });
  prismaMock.savedSearch.deleteMany.mockReset().mockResolvedValue({ count: 1 });
});

describe('listSaved caching', () => {
  it('serves a repeat read from cache (one DB round trip)', async () => {
    await listSaved('cache-user-a');
    await listSaved('cache-user-a');
    expect(prismaMock.savedSearch.findMany).toHaveBeenCalledTimes(1);
  });

  it('never crosses users', async () => {
    await listSaved('cache-user-b');
    await listSaved('cache-user-c');
    expect(prismaMock.savedSearch.findMany).toHaveBeenCalledTimes(2);
  });

  it('re-queries after a create invalidates the cache', async () => {
    await listSaved('cache-user-d'); // 1: warms cache
    await createSaved('cache-user-d', 'from:alex has:media');
    await listSaved('cache-user-d'); // 2: cache dropped by the write
    expect(prismaMock.savedSearch.findMany).toHaveBeenCalledTimes(2);
  });

  it('re-queries after an update or delete invalidates the cache', async () => {
    await listSaved('cache-user-e'); // 1
    await updateSaved('cache-user-e', 'id1', true);
    await listSaved('cache-user-e'); // 2
    await deleteSaved('cache-user-e', 'id1');
    await listSaved('cache-user-e'); // 3
    expect(prismaMock.savedSearch.findMany).toHaveBeenCalledTimes(3);
  });
});
