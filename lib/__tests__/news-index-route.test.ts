/**
 * The /news loader: the unsearched front is cached under the ingest's tag (one read per minute per view, dropped when
 * new headlines land), a search goes straight to the replica, and the URL's search params are validated before any
 * of it (an unknown category or a silly page number never reaches a query).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getFront, cachedFn } = vi.hoisted(() => ({
  getFront: vi.fn(),
  cachedFn: vi.fn((_key: string, _ttl: number, loader: () => Promise<unknown>, _opts: unknown) => loader()),
}));

vi.mock('@/lib/news', () => ({ getNewsFront: getFront, NEWS_PAGE_SIZE: 30 }));
vi.mock('@/lib/cached.server', () => ({ cached: cachedFn }));
vi.mock('@/components/news/NewsFront', () => ({ NewsFront: () => null }));
vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({ validator: () => ({ handler: (fn: (a: { data: unknown }) => unknown) => (a: { data: unknown }) => fn(a) }) }),
}));
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => ({ options: config }),
}));

import { Route } from '@/app/routes/_site/news/index';

type Options = {
  loader: (a: { deps: unknown }) => Promise<{ items: unknown[]; page: number; pageSize: number }>;
  validateSearch: (s: Record<string, unknown>) => unknown;
};
const options = (Route as unknown as { options: Options }).options;

beforeEach(() => {
  getFront.mockReset().mockResolvedValue({ items: [{ slug: 'a' }], total: 1 });
  cachedFn.mockClear();
});

describe('/news route', () => {
  it('caches the unsearched front under the ingest tag', async () => {
    const data = await options.loader({ deps: { category: 'Science' } });
    expect(cachedFn).toHaveBeenCalledTimes(1);
    expect(cachedFn.mock.calls[0]?.[0]).toBe('news:front:Science:1');
    expect(cachedFn.mock.calls[0]?.[3]).toEqual({ tags: ['news-front'] });
    expect(getFront).toHaveBeenCalledWith({ category: 'Science', q: undefined, page: 1 });
    expect(data).toMatchObject({ items: [{ slug: 'a' }], page: 1, pageSize: 30 });
  });

  it('sends a search straight to the read, uncached', async () => {
    await options.loader({ deps: { q: 'nasa' } });
    expect(cachedFn).not.toHaveBeenCalled();
    expect(getFront).toHaveBeenCalledWith({ category: undefined, q: 'nasa', page: 1 });
  });

  it('validates the search params', () => {
    expect(options.validateSearch({ category: 'Science', q: '  moon ', page: '2' })).toEqual({
      category: 'Science',
      q: 'moon',
      page: 2,
    });
    expect(options.validateSearch({ category: 'Nope', page: '9999', q: '' })).toEqual({});
    expect(options.validateSearch({ page: '1' })).toEqual({});
  });
});
