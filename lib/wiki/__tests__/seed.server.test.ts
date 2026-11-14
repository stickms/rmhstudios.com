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
    INSTALLER_USER: 'MediaWiki default',
    listWikiPages: vi.fn(),
    createWikiPage: vi.fn(),
    wikiPageLastEditor: vi.fn(),
    writeWikiText: vi.fn(),
    purgeWikiPages: vi.fn(),
  };
});
vi.mock('@/lib/wiki/mediawiki.server', () => wiki);

import { SEED_SUMMARY, seedStarterPages } from '@/lib/wiki/seed.server';
import { MAIN_PAGE, STARTER_PAGES } from '@/lib/wiki/starter-pages';

const titles = STARTER_PAGES.map((p) => p.title);
const others = titles.filter((t) => t !== MAIN_PAGE);
const listed = (names: string[]) => names.map((title, i) => ({ id: i + 1, title, updatedAt: '' }));

beforeEach(() => {
  vi.clearAllMocks();
  wiki.listWikiPages.mockResolvedValue([]);
  wiki.createWikiPage.mockResolvedValue({ id: 100 });
  wiki.wikiPageLastEditor.mockResolvedValue('Admin');
  wiki.writeWikiText.mockResolvedValue(undefined);
  wiki.purgeWikiPages.mockResolvedValue(undefined);
});

describe('seedStarterPages', () => {
  it('creates every starter page on an empty wiki, with a summary saying where it came from', async () => {
    await expect(seedStarterPages()).resolves.toEqual({ created: titles, skipped: [] });
    expect(wiki.createWikiPage).toHaveBeenCalledTimes(titles.length);
    for (const [input] of wiki.createWikiPage.mock.calls) expect(input.summary).toBe(SEED_SUMMARY);
    expect(wiki.writeWikiText).not.toHaveBeenCalled();
  });

  it("replaces the installer's placeholder main page, which nobody has edited", async () => {
    wiki.listWikiPages.mockResolvedValue(listed([MAIN_PAGE]));
    wiki.wikiPageLastEditor.mockResolvedValue('MediaWiki default');
    const { created } = await seedStarterPages();
    expect(created).toEqual(titles);
    const home = STARTER_PAGES.find((p) => p.title === MAIN_PAGE)!;
    expect(wiki.writeWikiText).toHaveBeenCalledWith(MAIN_PAGE, home.content, SEED_SUMMARY);
    expect(wiki.createWikiPage.mock.calls.map(([input]) => input.title)).toEqual(others);
  });

  it('never touches a page that already exists, the main page included once someone edited it', async () => {
    wiki.listWikiPages.mockResolvedValue(listed([MAIN_PAGE, 'Games']));
    const { created, skipped } = await seedStarterPages();
    expect(skipped).toEqual([MAIN_PAGE, 'Games']);
    expect(created).not.toContain('Games');
    expect(wiki.writeWikiText).not.toHaveBeenCalled();
    const written = wiki.createWikiPage.mock.calls.map(([input]) => input.title);
    expect(written).not.toContain(MAIN_PAGE);
    expect(written).not.toContain('Games');
  });

  it('does nothing on a second run', async () => {
    wiki.listWikiPages.mockResolvedValue(listed(titles));
    await expect(seedStarterPages()).resolves.toEqual({ created: [], skipped: titles });
    expect(wiki.createWikiPage).not.toHaveBeenCalled();
    expect(wiki.writeWikiText).not.toHaveBeenCalled();
    expect(wiki.purgeWikiPages).not.toHaveBeenCalled();
  });

  it('renders the new pages again once all of them exist, so links between them are blue', async () => {
    await seedStarterPages();
    expect(wiki.purgeWikiPages).toHaveBeenCalledWith(titles);
    const lastCreate = Math.max(...wiki.createWikiPage.mock.invocationCallOrder);
    expect(wiki.purgeWikiPages.mock.invocationCallOrder[0]).toBeGreaterThan(lastCreate);
  });

  it('counts a page that appeared mid-run as skipped', async () => {
    wiki.createWikiPage.mockRejectedValueOnce(new wiki.WikiError('conflict', 'exists'));
    const { created, skipped } = await seedStarterPages();
    expect(skipped).toEqual([titles[0]]);
    expect(created).toEqual(titles.slice(1));
  });

  it('stops on any other failure', async () => {
    wiki.createWikiPage.mockRejectedValueOnce(new wiki.WikiError('unreachable', 'down'));
    await expect(seedStarterPages()).rejects.toMatchObject({ code: 'unreachable' });
  });
});
