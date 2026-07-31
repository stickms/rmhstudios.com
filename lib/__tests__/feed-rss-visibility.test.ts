import { describe, it, expect, vi } from 'vitest';

// The feed module builds a Prisma client at import time; these tests inspect the
// query it constructs rather than hitting a database. The factory is hoisted
// above the file, so the mocks are created inside it and read back afterwards
// via `vi.mocked` rather than captured from a top-level const.
vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    rMHark: { findMany: vi.fn().mockResolvedValue([]) },
    user: { findFirst: vi.fn().mockResolvedValue({ id: 'u1', name: 'A', handle: 'a' }) },
  },
}));

import { prisma } from '@/lib/prisma.server';
import { PUBLIC_POST_WHERE, tagFeedItems, userFeedItems } from '@/lib/feed/rss.server';

const findMany = vi.mocked(prisma.rMHark.findMany);
const findFirst = vi.mocked(prisma.user.findFirst);

/**
 * The `where` clause the module handed Prisma on its most recent call. Typed as
 * a loose record because these tests assert on the query's SHAPE, not on
 * Prisma's generated input type.
 */
function lastWhere(): Record<string, unknown> {
  const call = findMany.mock.calls.at(-1);
  if (!call) throw new Error('findMany was never called');
  return (call[0] as { where: Record<string, unknown> }).where;
}

/**
 * Public RSS feeds are served to anonymous readers and cached by aggregators,
 * so a visibility leak here is permanent and public — there is no "delete the
 * post" remedy once a feed reader has pulled it.
 *
 * These tests pin the predicate itself rather than trusting each route to build
 * an equivalent one, because "equivalent" is exactly what drifts: the tag feed
 * and the user feed were written from the same rule and would otherwise be free
 * to diverge on the next change.
 */
describe('public post feed visibility', () => {
  it('restricts to PUBLIC audience', () => {
    expect(PUBLIC_POST_WHERE.audience).toBe('PUBLIC');
  });

  it('excludes deleted posts', () => {
    expect(PUBLIC_POST_WHERE.deletedAt).toBeNull();
  });

  it('excludes community posts, whose visibility depends on membership', () => {
    // A feed has no viewer, so there is nobody whose membership could be checked.
    expect(PUBLIC_POST_WHERE.communityId).toBeNull();
  });

  it('excludes paywalled posts', () => {
    // Syndicating a gated post would hand out the thing somebody paid for.
    expect(PUBLIC_POST_WHERE.OR).toEqual([{ unlockPrice: null }, { unlockPrice: 0 }]);
  });

  it('applies the shared predicate to the tag feed', async () => {
    findMany.mockClear();
    await tagFeedItems('rmh');
    const where = lastWhere();
    for (const key of Object.keys(PUBLIC_POST_WHERE)) {
      expect(where, `tag feed dropped the '${key}' guard`).toHaveProperty(key);
    }
    expect(where.audience).toBe('PUBLIC');
  });

  it('applies the shared predicate to the user feed', async () => {
    findMany.mockClear();
    await userFeedItems('a');
    const where = lastWhere();
    for (const key of Object.keys(PUBLIC_POST_WHERE)) {
      expect(where, `user feed dropped the '${key}' guard`).toHaveProperty(key);
    }
    expect(where.audience).toBe('PUBLIC');
  });

  it('lowercases the tag before matching', async () => {
    findMany.mockClear();
    await tagFeedItems('RMHStudios');
    const hashtags = lastWhere().hashtags as { some: { hashtag: { tag: string } } };
    expect(hashtags.some.hashtag.tag).toBe('rmhstudios');
  });

  it('returns null for an unknown handle so the route can 404', async () => {
    findFirst.mockResolvedValueOnce(null);
    expect(await userFeedItems('nobody')).toBeNull();
  });
});
