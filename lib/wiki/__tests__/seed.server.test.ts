import { beforeEach, describe, expect, it, vi } from 'vitest';

const wiki = vi.hoisted(() => {
  class WikiError extends Error {
    constructor(
      readonly code: string,
      message: string,
    ) {
      super(message);
    }
  }
  return {
    WikiError,
    listWikiPages: vi.fn(),
    createWikiPage: vi.fn(),
    renderWikiPage: vi.fn(),
  };
});
vi.mock('@/lib/wiki/wikijs.server', () => wiki);

import { seedStarterPages } from '@/lib/wiki/seed.server';
import { STARTER_PAGES } from '@/lib/wiki/starter-pages';

const paths = STARTER_PAGES.map((p) => p.path);

beforeEach(() => {
  vi.clearAllMocks();
  let id = 100;
  wiki.listWikiPages.mockResolvedValue([]);
  wiki.createWikiPage.mockImplementation(async () => ({ id: id++ }));
  wiki.renderWikiPage.mockResolvedValue(undefined);
});

describe('seedStarterPages', () => {
  it('creates every starter page, published, on an empty wiki', async () => {
    await expect(seedStarterPages()).resolves.toEqual({ created: paths, skipped: [] });
    expect(wiki.createWikiPage).toHaveBeenCalledTimes(paths.length);
    for (const [input] of wiki.createWikiPage.mock.calls) expect(input.isPublished).toBe(true);
  });

  it('never touches a page that already exists', async () => {
    wiki.listWikiPages.mockResolvedValue([{ path: 'home' }, { path: 'games' }]);
    const { created, skipped } = await seedStarterPages();
    expect(skipped).toEqual(['home', 'games']);
    expect(created).not.toContain('home');
    const written = wiki.createWikiPage.mock.calls.map(([input]) => input.path);
    expect(written).not.toContain('home');
    expect(written).not.toContain('games');
  });

  it('does nothing on a second run', async () => {
    wiki.listWikiPages.mockResolvedValue(paths.map((path) => ({ path })));
    await expect(seedStarterPages()).resolves.toEqual({ created: [], skipped: paths });
    expect(wiki.createWikiPage).not.toHaveBeenCalled();
    expect(wiki.renderWikiPage).not.toHaveBeenCalled();
  });

  it('renders each new page again once all of them exist, so links between them resolve', async () => {
    await seedStarterPages();
    expect(wiki.renderWikiPage.mock.calls.map(([id]) => id)).toEqual(paths.map((_, i) => 100 + i));
    const lastCreate = Math.max(...wiki.createWikiPage.mock.invocationCallOrder);
    const firstRender = Math.min(...wiki.renderWikiPage.mock.invocationCallOrder);
    expect(firstRender).toBeGreaterThan(lastCreate);
  });

  it('counts a page that appeared mid-run as skipped', async () => {
    wiki.createWikiPage.mockImplementationOnce(async () => {
      throw new wiki.WikiError('conflict', 'exists');
    });
    const { created, skipped } = await seedStarterPages();
    expect(skipped).toEqual([paths[0]]);
    expect(created).toEqual(paths.slice(1));
  });

  it('stops on any other failure', async () => {
    wiki.createWikiPage.mockRejectedValueOnce(new wiki.WikiError('unreachable', 'down'));
    await expect(seedStarterPages()).rejects.toMatchObject({ code: 'unreachable' });
  });
});
