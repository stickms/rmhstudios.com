/**
 * The weekly digest's "latest from RMH Studios" slot never picks a draft or scheduled Log (s03-05).
 * Prisma is stood in for; every other source in the digest is empty.
 */
import { describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  blogFindFirst: vi.fn(),
}));

vi.mock('@/lib/prisma.server', () => {
  const model = (extra: Record<string, unknown> = {}) =>
    new Proxy(extra, {
      get: (t, k: string) => t[k] ?? (async () => (k === 'findMany' ? [] : null)),
    });
  const prisma = new Proxy(
    {
      user: model({
        findUnique: async () => ({
          id: 'u1',
          email: 'u1@example.test',
          name: 'U',
          handle: 'u',
          lastSeenAt: null,
          createdAt: new Date('2026-01-01T00:00:00Z'),
        }),
      }),
      blogPost: model({
        findFirst: m.blogFindFirst,
      }),
    } as Record<string, unknown>,
    {
      get: (t, k: string) => t[k] ?? model(),
    },
  );
  return {
    prisma,
  };
});
vi.mock('@/lib/streak.server', () => ({
  getStreak: async () => null,
}));
vi.mock('@/lib/quests/engine.server', () => ({
  getActiveQuests: async () => [],
}));

import { assembleDigest } from '@/lib/digest/assemble.server';
import { publishedLogWhere } from '@/lib/blog/publication';

describe('digest editorial slot', () => {
  it('asks for live Logs only', async () => {
    m.blogFindFirst.mockResolvedValue(null);
    await assembleDigest('u1').catch(() => null);
    expect(m.blogFindFirst).toHaveBeenCalledTimes(1);
    const { where } = m.blogFindFirst.mock.calls[0]![0] as {
      where: unknown;
    };
    expect(where).toEqual(
      expect.objectContaining({
        status: 'published',
        publishedAt: expect.objectContaining({
          lte: expect.any(Date),
        }),
      }),
    );
    expect(Object.keys(where as object).sort()).toEqual(Object.keys(publishedLogWhere(new Date())).sort());
  });
});
