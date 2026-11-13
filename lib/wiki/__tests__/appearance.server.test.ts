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
  return { WikiError, wikiGraphql: vi.fn(), wikiLocale: () => 'en' };
});
vi.mock('@/lib/wiki/wikijs.server', () => wiki);

import { applyWikiAppearance, WIKI_TITLE, wikiNavigation } from '@/lib/wiki/appearance.server';
import { STARTER_PAGES } from '@/lib/wiki/starter-pages';
import { WIKIPEDIA_CSS } from '@/lib/wiki/wikipedia-theme';

const done = { responseResult: { succeeded: true, message: null } };
const answers = {
  theming: { setConfig: done },
  site: { updateConfig: done },
  navigation: { updateConfig: done, updateTree: done },
};

beforeEach(() => {
  wiki.wikiGraphql.mockReset();
  wiki.wikiGraphql.mockResolvedValue(answers);
});

describe('the Wikipedia stylesheet', () => {
  const rules = WIKIPEDIA_CSS.replace(/\/\*[\s\S]*?\*\//g, '');

  it('is well formed', () => {
    expect(rules.split('{').length).toBe(rules.split('}').length);
    expect(rules).not.toContain('${');
  });

  it('scopes every selector to the wiki app root, so it outranks Vuetify', () => {
    const selectors = rules
      .split('}')
      .map((block) => block.split('{')[0]!.trim())
      .filter(Boolean)
      .flatMap((list) => list.split(',').map((s) => s.trim()));
    expect(selectors.length).toBeGreaterThan(50);
    for (const selector of selectors) expect(selector).toMatch(/^#app[ .]/);
  });

  it('is separate from the main site: no site or app token, no site font', () => {
    expect(WIKIPEDIA_CSS).not.toMatch(/--site-|--app-|--chrome-|Geist/);
  });

  it('carries the Wikipedia signatures', () => {
    expect(WIKIPEDIA_CSS).toContain('#0645ad'); // link blue
    expect(WIKIPEDIA_CSS).toContain('#a7d7f9'); // the article's pale blue edge
    expect(WIKIPEDIA_CSS).toContain("'Linux Libertine', Georgia, Times, serif");
    expect(WIKIPEDIA_CSS).toContain('#eaecf0'); // wikitable header
  });
});

describe('wikiNavigation', () => {
  const items = wikiNavigation('en');

  it('starts at the main page and links every starter page but home', () => {
    expect(items[0]).toMatchObject({ kind: 'link', targetType: 'home', target: '/' });
    const targets = items.map((i) => i.target);
    for (const page of STARTER_PAGES) {
      expect(targets.includes(`/en/${page.path}`)).toBe(page.path !== 'home');
    }
  });

  it('leads back to the main site, and has unique stable ids', () => {
    expect(items.at(-1)).toMatchObject({ target: 'https://rmhstudios.com' });
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
    expect(wikiNavigation('en')).toEqual(items);
  });

  it('follows the wiki locale', () => {
    expect(wikiNavigation('fr').some((i) => i.target === '/fr/games')).toBe(true);
  });
});

describe('applyWikiAppearance', () => {
  it('sets the stylesheet, the site identity and a static navigation', async () => {
    await applyWikiAppearance();
    const calls = wiki.wikiGraphql.mock.calls as [string, Record<string, unknown>?][];
    expect(calls).toHaveLength(4);

    const [theme, site, mode, tree] = calls;
    expect(theme![0]).toContain('setConfig');
    expect(theme![0]).toContain('darkMode: false');
    expect(theme![1]).toEqual({ css: WIKIPEDIA_CSS });

    expect(site![1]).toMatchObject({ title: WIKI_TITLE });
    // Visitors read; they do not comment, rate or keep personal wikis.
    expect(site![0]).toContain('featurePageComments: false');
    expect(site![0]).toContain('featurePageRatings: false');
    expect(site![0]).toContain('featurePersonalWikis: false');

    expect(mode![0]).toContain('mode: STATIC');
    expect(tree![1]).toEqual({ tree: [{ locale: 'en', items: wikiNavigation('en') }] });
  });

  it('fails, naming the step, when the wiki refuses one', async () => {
    wiki.wikiGraphql.mockResolvedValueOnce({
      theming: { setConfig: { responseResult: { succeeded: false, message: 'Forbidden' } } },
    });
    await expect(applyWikiAppearance()).rejects.toMatchObject({
      code: 'rejected',
      message: 'theme: Forbidden',
    });
    expect(wiki.wikiGraphql).toHaveBeenCalledTimes(1);
  });
});
