/**
 * The /news loader goes through the shared `getNewsIndexArticles` helper (lean
 * select, replica read) instead of its own primary `findMany` with a drifting
 * column list; `featured` is derived from that one result.
 */
import { describe, it, expect, vi } from 'vitest';

const { getAll, primaryFindMany } = vi.hoisted(() => ({
  getAll: vi.fn(),
  primaryFindMany: vi.fn(),
}));

vi.mock('@/lib/news', () => ({ getNewsIndexArticles: getAll }));
vi.mock('@/lib/prisma.server', () => ({
  prisma: { newsArticle: { findMany: primaryFindMany } },
  prismaRead: { newsArticle: { findMany: vi.fn() } },
}));
vi.mock('@/components/news/NewsPageContent', () => ({ NewsPageContent: () => null }));
vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({ handler: (fn: () => unknown) => fn }),
}));
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => ({ options: config }),
}));

import { Route } from '@/app/routes/_site/news/index';

describe('/news loader', () => {
  it('reads through the shared getNewsIndexArticles helper, never the primary, and derives featured', async () => {
    const a = { slug: 'a', featured: true };
    const b = { slug: 'b', featured: false };
    getAll.mockResolvedValue([a, b]);
    const loader = (Route as unknown as { options: { loader: () => Promise<unknown> } }).options
      .loader;
    const data = (await loader()) as { articles: unknown[]; featured: unknown[] };
    expect(getAll).toHaveBeenCalledTimes(1);
    expect(primaryFindMany).not.toHaveBeenCalled();
    expect(data.articles).toEqual([a, b]);
    expect(data.featured).toEqual([a]);
    expect(data.featured[0]).toBe(a);
  });
});
