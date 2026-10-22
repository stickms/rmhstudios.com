/**
 * WS4 / review item 13 - search read path.
 *
 * The heavy candidate scans are read-only and lag-tolerant, so they go through
 * `prismaRead` (the replica when `DATABASE_REPLICA_URL` is set, the primary
 * otherwise). The visibility facts that must be fresh - deleted, audience,
 * private community, hidden author, still published - are NOT lag-tolerant, so
 * the final hydrated page is re-checked on the PRIMARY. A lagging replica can
 * therefore cost a result appearing late but never a just-hidden one appearing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { queryRaw, userFindMany, rmharkFindMany, pQueryRaw, pUserFindMany, pRmharkFindMany } =
  vi.hoisted(() => ({
    queryRaw: vi.fn(),
    userFindMany: vi.fn(),
    rmharkFindMany: vi.fn(),
    pQueryRaw: vi.fn(),
    pUserFindMany: vi.fn(),
    pRmharkFindMany: vi.fn(),
  }));

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    $queryRaw: pQueryRaw,
    user: { findMany: pUserFindMany },
    rMHark: { findMany: pRmharkFindMany },
  },
  prismaRead: {
    $queryRaw: queryRaw,
    user: { findMany: userFindMany },
    rMHark: { findMany: rmharkFindMany },
  },
}));
const sem = vi.hoisted(() => ({ ids: [] as string[] }));
vi.mock('@/lib/search/embeddings.server', () => ({
  isEmbeddingAvailable: () => sem.ids.length > 0,
  nearest: async () => sem.ids.map((entityId) => ({ entityId, distance: 0.1 })),
}));
vi.mock('@/lib/social/follow-graph.server', () => ({ getFollowingIds: async () => [] }));
vi.mock('@/lib/moderation.server', () => ({ getHiddenAuthorIds: async () => [] }));

import { fuzzyTerms } from '@/lib/search/db.server';
import { searchPeopleScored } from '@/lib/search/people.server';
import { searchPostsScored } from '@/lib/search/posts.server';
import { searchDocs } from '@/lib/search/docs.server';

beforeEach(() => {
  sem.ids = [];
  queryRaw.mockReset().mockResolvedValue([]);
  userFindMany.mockReset().mockResolvedValue([]);
  rmharkFindMany.mockReset().mockResolvedValue([]);
  pQueryRaw.mockReset().mockResolvedValue([]);
  pUserFindMany.mockReset().mockResolvedValue([]);
  pRmharkFindMany.mockReset().mockResolvedValue([]);
});

describe('search read path', () => {
  it('people: a cheap breadth probe plus one recall query, both on prismaRead', async () => {
    await searchPeopleScored(fuzzyTerms('ada'));
    expect(queryRaw).toHaveBeenCalledTimes(2);
  });

  it('posts: one recall query on prismaRead', async () => {
    await searchPostsScored(fuzzyTerms('hello world'));
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it.each(['blog', 'news', 'build', 'library'] as const)('docs/%s: one query on prismaRead', async (name) => {
    await searchDocs(name, fuzzyTerms('graph'));
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('posts: hydrate on the primary, never on the replica', async () => {
    queryRaw.mockResolvedValue([{ id: 'p1' }]);
    await searchPostsScored(fuzzyTerms('hello world'));
    expect(pRmharkFindMany).toHaveBeenCalledTimes(1);
    expect(rmharkFindMany).not.toHaveBeenCalled();
  });

  it('posts: semantic hits are filtered by the same visibility rule as the SQL scan', async () => {
    sem.ids = ['secret-community-post', 'deleted-post'];
    await searchPostsScored(fuzzyTerms('spheres'), { hiddenAuthorIds: ['blocked-1'], authorId: 'ada' });
    const where = pRmharkFindMany.mock.calls[0][0].where;
    expect(where.id).toEqual({ in: expect.arrayContaining(sem.ids) });
    expect(where.deletedAt).toBeNull();
    expect(where.audience).toBe('PUBLIC');
    expect(where.unlockPrice).toBeNull();
    const clauses = JSON.stringify(where.AND);
    expect(clauses).toContain('isPrivate'); // communityVisibleWhere(null)
    expect(clauses).toContain('blocked-1');
    expect(clauses).toContain('"ada"');
  });

  it('posts: searching inside a community pins the community instead', async () => {
    sem.ids = ['x'];
    await searchPostsScored(fuzzyTerms('spheres'), { communityId: 'c1' });
    expect(pRmharkFindMany.mock.calls[0][0].where.AND).toContainEqual({ communityId: 'c1' });
  });

  it('people: hydration is read from the primary', async () => {
    queryRaw.mockResolvedValueOnce([{ n: 0 }]).mockResolvedValueOnce([
      { id: 'u1', name: 'Ada', username: 'ada', handle: 'ada', display_name: 'Ada', bio: null, follower_count: 1 },
    ]);
    await searchPeopleScored(fuzzyTerms('ada'));
    expect(pUserFindMany).toHaveBeenCalledTimes(1);
    expect(userFindMany).not.toHaveBeenCalled();
  });

  it('docs: a hit the primary says is no longer visible is dropped', async () => {
    queryRaw.mockResolvedValue([
      { id: 'd1', slug: 'graph-a', title: 'graph', description: null, body: null, tags: null, category: null, image: null, popularity: 0, created_at: new Date() },
      { id: 'd2', slug: 'graph-b', title: 'graph', description: null, body: null, tags: null, category: null, image: null, popularity: 0, created_at: new Date() },
    ]);
    pQueryRaw.mockResolvedValue([{ id: 'd1' }]); // d2 was hidden; the replica has not caught up
    const hits = await searchDocs('library', fuzzyTerms('graph'));
    expect(hits.map((h) => h.id)).toEqual(['graph-a']);
  });
});
