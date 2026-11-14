import { describe, expect, it } from 'vitest';
import { apps, games } from '@/lib/catalog';
import { entryHeading, escapeWikitext, MAIN_PAGE, STARTER_PAGES } from '@/lib/wiki/starter-pages';
import { createWikiPageBody } from '@/lib/wiki/wiki-schema';

const byTitle = new Map(STARTER_PAGES.map((p) => [p.title, p]));

/** Internal link targets: `[[Target]]` and `[[Target|label]]`, outside `<nowiki>`. */
const internalLinks = (content: string) =>
  [
    ...content
      .replace(/<nowiki>[\s\S]*?<\/nowiki>/g, '')
      .matchAll(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g),
  ].map((m) => m[1]!.trim());

describe('starter pages', () => {
  it("has the pages the wiki opens with, each under its own title, starting with MediaWiki's main page", () => {
    expect([...byTitle.keys()]).toEqual(
      expect.arrayContaining([
        MAIN_PAGE,
        'About RMH Studios',
        'Games',
        'Apps',
        'RMHarks',
        'Developer API',
      ]),
    );
    expect(byTitle.size).toBe(STARTER_PAGES.length);
    expect(STARTER_PAGES[0]!.title).toBe(MAIN_PAGE);
  });

  it.each(STARTER_PAGES.map((p) => [p.title, p] as const))(
    '%s passes the same validation as a page an admin writes',
    (_title, page) => {
      expect(createWikiPageBody.safeParse({ ...page, summary: '' }).success).toBe(true);
    },
  );

  it.each(STARTER_PAGES.map((p) => [p.title, p] as const))(
    '%s is wikitext, with no Markdown, no title heading and no unresolved template',
    (_title, page) => {
      // The wiki shows the title itself; a level-one heading would repeat it.
      expect(page.content).not.toMatch(/^=[^=]/m);
      expect(page.content).not.toMatch(/^#{1,6} |^- |\]\(|```|\*\*/m);
      expect(page.content).not.toMatch(/\$\{|undefined|\[object Object\]|\{\{/);
      // Tildes would become a signature when MediaWiki saves the page.
      expect(page.content).not.toContain('~~~');
    },
  );

  it('every link between wiki pages points at a starter page', () => {
    for (const page of STARTER_PAGES) {
      for (const target of internalLinks(page.content)) {
        expect(byTitle.has(target), `${page.title} links to [[${target}]]`).toBe(true);
      }
    }
  });

  it('the main page links to every other starter page', () => {
    const home = internalLinks(byTitle.get(MAIN_PAGE)!.content);
    for (const title of byTitle.keys()) {
      if (title !== MAIN_PAGE) expect(home).toContain(title);
    }
  });

  it('lists every public game and app from the catalog, and no hidden one', () => {
    const cases = [
      [byTitle.get('Games')!.content, games],
      [byTitle.get('Apps')!.content, apps],
    ] as const;
    for (const [content, entries] of cases) {
      for (const entry of entries as readonly {
        title: string;
        status?: string;
        unlisted?: boolean;
        hidden?: boolean;
      }[]) {
        const shown = content.includes(entryHeading(entry));
        expect(shown, entry.title).toBe(!entry.unlisted && !entry.hidden);
      }
    }
  });

  it('keeps the catalog tables at two cells a row, whatever the descriptions contain', () => {
    for (const title of ['Games', 'Apps']) {
      const content = byTitle.get(title)!.content;
      const table = content.slice(content.indexOf('{|'), content.indexOf('|}') + 2);
      const rows = table.split('\n|-\n').slice(1);
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) expect(row.replace(/\n\|\}$/, '').split('||')).toHaveLength(2);
    }
  });
});

describe('escapeWikitext', () => {
  it('turns every character that starts markup into a reference that renders as itself', () => {
    const out = escapeWikitext("[[x]] {{y}} a|b <b> ''i'' ~~~~ __TOC__ &amp;");
    expect(out).not.toMatch(/[[\]{}|<>~]|''|__/);
    expect(out).toContain('&amp;amp;');
  });

  it('leaves ordinary text alone', () => {
    expect(escapeWikitext("Bob's game: fast, 3D (beta).")).toBe("Bob's game: fast, 3D (beta).");
  });
});
