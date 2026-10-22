/**
 * `getBlockedAuthorIds` is access control (canReadThread, viewerVisiblePostWhere,
 * quote cards), so a failed lookup must fail the request, never read as "no
 * blocks": that would let a blocked viewer open the post. The mute-inclusive
 * `getHiddenAuthorIds` only filters feeds and keeps its empty fallback.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/cached.server', () => ({
  cached: (_k: string, _ttl: number, fn: () => Promise<unknown>) => fn(),
  invalidateCached: async () => {},
}));
vi.mock('@/lib/prisma.server', () => {
  const fail = async () => {
    throw new Error('db down');
  };
  return {
    prisma: {
      userBlock: { findMany: fail },
      userMute: { findMany: fail },
    },
  };
});

import { getBlockedAuthorIds, getHiddenAuthorIds } from '@/lib/moderation.server';

describe('block lookups fail closed', () => {
  it('getBlockedAuthorIds rejects when the lookup fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(getBlockedAuthorIds('viewer')).rejects.toThrow('db down');
  });

  it('anonymous viewers need no lookup', async () => {
    expect(await getBlockedAuthorIds(null)).toEqual([]);
  });

  it('the feed-only hidden set keeps its empty fallback', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await getHiddenAuthorIds('viewer')).toEqual([]);
  });
});
