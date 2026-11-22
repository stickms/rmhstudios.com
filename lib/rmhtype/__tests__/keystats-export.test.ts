import { beforeEach, describe, expect, it, vi } from 'vitest';

const findMany = vi.fn();
vi.mock('@/lib/prisma.server', () => ({
  prisma: { rmhTypeKeyStat: { findMany: (...args: unknown[]) => findMany(...args) } },
}));

const { exportRmhTypeKeyStats } = await import('@/lib/rmhtype/keystats.server');

describe('exportRmhTypeKeyStats', () => {
  beforeEach(() => findMany.mockReset());

  it("reads only the member's own rows", async () => {
    findMany.mockResolvedValue([]);
    await exportRmhTypeKeyStats('user-1');
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0]?.[0].where).toEqual({ userId: 'user-1' });
  });

  it('returns the key, layout and the three counters, and nothing else', async () => {
    findMany.mockResolvedValue([
      { key: 'a', layout: 'qwerty', attempts: 10, errors: 2, totalMs: 1800, userId: 'user-1', extra: 'x' },
    ]);
    const rows = await exportRmhTypeKeyStats('user-1');
    expect(rows).toEqual([{ key: 'a', layout: 'qwerty', attempts: 10, errors: 2, totalMs: 1800 }]);
    expect(Object.keys(rows[0] ?? {}).sort()).toEqual(['attempts', 'errors', 'key', 'layout', 'totalMs']);
  });

  it('asks the database only for those columns', async () => {
    findMany.mockResolvedValue([]);
    await exportRmhTypeKeyStats('user-1');
    expect(findMany.mock.calls[0]?.[0].select).toEqual({
      key: true,
      layout: true,
      attempts: true,
      errors: true,
      totalMs: true,
    });
  });
});
