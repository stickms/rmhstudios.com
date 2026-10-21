/**
 * WS4 — search is read-only and lag-tolerant, so every corpus query must go
 * through `prismaRead` (the replica when `DATABASE_REPLICA_URL` is set, the
 * primary otherwise). The primary client here throws on any access: a corpus
 * that still reaches for `prisma` fails these tests.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { queryRaw, userFindMany, rmharkFindMany } = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  userFindMany: vi.fn(),
  rmharkFindMany: vi.fn(),
}));

vi.mock('@/lib/prisma.server', () => ({
  prisma: new Proxy(
    {},
    {
      get(_t, prop) {
        throw new Error(`search touched the primary client (prisma.${String(prop)})`);
      },
    },
  ),
  prismaRead: {
    $queryRaw: queryRaw,
    user: { findMany: userFindMany },
    rMHark: { findMany: rmharkFindMany },
  },
}));
vi.mock('@/lib/search/embeddings.server', () => ({
  isEmbeddingAvailable: () => false,
  nearest: async () => [],
}));

import { fuzzyTerms } from '@/lib/search/db.server';
import { searchPeopleScored } from '@/lib/search/people.server';
import { searchPostsScored } from '@/lib/search/posts.server';
import { searchDocs } from '@/lib/search/docs.server';

beforeEach(() => {
  queryRaw.mockReset().mockResolvedValue([]);
  userFindMany.mockReset().mockResolvedValue([]);
  rmharkFindMany.mockReset().mockResolvedValue([]);
});

describe('search read path', () => {
  it('people: one recall query on prismaRead', async () => {
    await searchPeopleScored(fuzzyTerms('ada'));
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('posts: one recall query on prismaRead', async () => {
    await searchPostsScored(fuzzyTerms('hello world'));
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it.each(['blog', 'news', 'build', 'library'] as const)('docs/%s: one query on prismaRead', async (name) => {
    await searchDocs(name, fuzzyTerms('graph'));
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });
});
