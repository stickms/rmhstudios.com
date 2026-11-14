import { beforeEach, describe, expect, it, vi } from 'vitest';

const wiki = vi.hoisted(() => ({ writeWikiText: vi.fn() }));
vi.mock('@/lib/wiki/mediawiki.server', () => wiki);

import { applyWikiSidebar, SIDEBAR_TITLE, wikiSidebar } from '@/lib/wiki/sidebar.server';
import { MAIN_PAGE, STARTER_PAGES } from '@/lib/wiki/starter-pages';

beforeEach(() => {
  wiki.writeWikiText.mockReset();
  wiki.writeWikiText.mockResolvedValue(undefined);
});

describe('the wiki sidebar', () => {
  const lines = wikiSidebar().trimEnd().split('\n');

  it("is MediaWiki's sidebar format: groups of `* `, links of `** target|label`", () => {
    for (const line of lines) expect(line).toMatch(/^\* \S|^\*\* [^|]+\|[^|]+$/);
  });

  it('keeps the skin boxes Wikipedia has: search, tools and languages', () => {
    for (const box of ['* SEARCH', '* TOOLBOX', '* LANGUAGES']) expect(lines).toContain(box);
  });

  it('links every starter article, and the main page through MediaWiki’s own entry', () => {
    expect(lines).toContain('** mainpage|mainpage-description');
    for (const page of STARTER_PAGES) {
      if (page.title === MAIN_PAGE) continue;
      expect(lines).toContain(`** ${page.title}|${page.title}`);
    }
  });

  it('leads back to the main site', () => {
    expect(lines).toContain('** https://rmhstudios.com|rmhstudios.com');
  });

  it('is written to MediaWiki:Sidebar, and only there', async () => {
    await applyWikiSidebar();
    expect(wiki.writeWikiText).toHaveBeenCalledTimes(1);
    const [title, text] = wiki.writeWikiText.mock.calls[0]!;
    expect(title).toBe(SIDEBAR_TITLE);
    expect(SIDEBAR_TITLE).toBe('MediaWiki:Sidebar');
    expect(text).toBe(wikiSidebar());
  });

  it('passes a wiki failure through', async () => {
    wiki.writeWikiText.mockRejectedValue(new Error('permissiondenied'));
    await expect(applyWikiSidebar()).rejects.toThrow('permissiondenied');
  });
});
