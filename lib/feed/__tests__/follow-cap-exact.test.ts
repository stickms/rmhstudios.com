/**
 * Review item 5 (tag feed, explore suggestions) and item 13 (friends board).
 *
 * The shared follow list is capped at the 5,000 most recent follows, which is
 * right for assembling a timeline and wrong for deciding what a viewer may see
 * or whom to suggest. These pin the exact behaviour:
 *  - the tag feed's SQL asks the database whether the viewer follows the author
 *    (no id list bound as a parameter);
 *  - explore never suggests an account the viewer follows, even one the capped
 *    list forgot;
 *  - following / unfollowing drops the cached friends leaderboard.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  sql: [] as { text: string; values: unknown[] }[],
  invalidated: [] as string[],
  followed: [] as string[],
}));

vi.mock('@/lib/cached.server', () => ({
  cached: async (k: string, _t: number, fn: () => unknown) => {
    if (k === 'explore:list') {
      return {
        trendingTags: [],
        communities: [],
        libraryDocs: [],
        userPool: [{ id: 'old-follow' }, { id: 'stranger' }],
      };
    }
    if (k === 'explore:hot-candidates') return { ids: [], fallback: false };
    return fn();
  },
  invalidateCached: async (k: string) => {
    h.invalidated.push(k);
  },
}));
vi.mock('@/lib/moderation.server', () => ({
  getHiddenAuthorIds: async () => [],
  getHiddenAuthorIdsStrict: async () => [],
  getBlockedAuthorIds: async () => [],
}));
// The capped list knows nothing: the old code would have suggested everybody.
vi.mock('@/lib/social/follow-graph.server', async (orig) => ({
  ...(await orig<typeof import('@/lib/social/follow-graph.server')>()),
  getFollowingIds: async () => [],
}));
vi.mock('@/lib/feed/map-feed-item.server', () => ({
  rmharkIncludeLite: () => ({}),
  mapRmharksWithBoundedReactions: async () => [],
}));
vi.mock('@/lib/feed/timeline', () => ({
  getMutedWords: async () => [],
  applyMutedWords: (items: unknown[]) => items,
}));
vi.mock('@/lib/prisma.server', () => {
  const prisma = {
    $queryRaw: async (q: { text?: string; sql?: string; values: unknown[] }) => {
      h.sql.push({ text: q.text ?? q.sql ?? '', values: q.values });
      return [];
    },
    follow: {
      findMany: async () => h.followed.map((followingId) => ({ followingId })),
    },
    rMHark: { findMany: async () => [] },
  };
  return { prisma };
});

import { listTagFeed } from '@/lib/tags.server';
import { listExplore } from '@/lib/explore.server';
import { invalidateFollowingIds } from '@/lib/social/follow-graph.server';

beforeEach(() => {
  h.sql.length = 0;
  h.invalidated.length = 0;
  h.followed = [];
});

describe('tag feed follower check is exact', () => {
  it('probes the follow table instead of binding a capped id list', async () => {
    await listTagFeed('rmh', { viewerId: 'viewer' });
    const q = h.sql[0];
    expect(q.text).toMatch(/FROM follow f WHERE f\."followerId" = \$\d+ AND f\."followingId" = r\."userId"/);
    expect(q.text).not.toMatch(/ANY\(/);
    expect(q.values.some((v) => Array.isArray(v) && v.length > 100)).toBe(false);
  });
});

describe('explore suggestions are exact', () => {
  it('never suggests an account the viewer follows, even one the capped list forgot', async () => {
    h.followed = ['old-follow'];
    const r = await listExplore('viewer');
    expect(r.suggestedUsers.map((u: { id: string }) => u.id)).toEqual(['stranger']);
  });
});

describe('friends leaderboard invalidation', () => {
  it('following or unfollowing drops the viewer friends board', () => {
    invalidateFollowingIds('viewer');
    expect(h.invalidated).toContain('leaderboard:friends:viewer');
    expect(h.invalidated).toContain('following-ids:viewer');
  });
});
