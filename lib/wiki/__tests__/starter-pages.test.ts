import { describe, expect, it } from 'vitest';
import { apps, games } from '@/lib/catalog';
import { STARTER_PAGES } from '@/lib/wiki/starter-pages';
import { createWikiPageBody } from '@/lib/wiki/wiki-schema';

const byPath = new Map(STARTER_PAGES.map((p) => [p.path, p]));

describe('starter pages', () => {
  it('has the pages the wiki opens with, each at its own path', () => {
    expect([...byPath.keys()]).toEqual(
      expect.arrayContaining(['home', 'about', 'games', 'apps', 'rmharks', 'developer-api']),
    );
    expect(byPath.size).toBe(STARTER_PAGES.length);
  });

  it.each(STARTER_PAGES.map((p) => [p.path, p] as const))(
    '%s passes the same validation as a page an admin writes',
    (_path, page) => {
      expect(createWikiPageBody.safeParse({ ...page, isPublished: true }).success).toBe(true);
    },
  );

  it.each(STARTER_PAGES.map((p) => [p.path, p] as const))(
    '%s has no title heading and no unresolved template',
    (_path, page) => {
      // The wiki shows the title itself; a leading "# " would repeat it.
      expect(page.content).not.toMatch(/^# /m);
      expect(page.content).not.toMatch(/\$\{|undefined|\[object Object\]/);
    },
  );

  it('every link between wiki pages points at a starter page', () => {
    for (const page of STARTER_PAGES) {
      for (const [, target] of page.content.matchAll(/\]\(\/en\/([a-z0-9/-]+)\)/g)) {
        expect(byPath.has(target!), `${page.path} links to /en/${target}`).toBe(true);
      }
    }
  });

  it('the home page links to every other starter page', () => {
    const home = byPath.get('home')!.content;
    for (const path of byPath.keys()) {
      if (path !== 'home') expect(home).toContain(`(/en/${path})`);
    }
  });

  it('lists every public game and app from the catalog, and no hidden one', () => {
    const cases = [
      [byPath.get('games')!.content, games],
      [byPath.get('apps')!.content, apps],
    ] as const;
    for (const [content, entries] of cases) {
      for (const entry of entries as readonly {
        title: string;
        unlisted?: boolean;
        hidden?: boolean;
      }[]) {
        const shown = content.includes(`## ${entry.title}`);
        expect(shown, entry.title).toBe(!entry.unlisted && !entry.hidden);
      }
    }
  });

  it('keeps Markdown tables intact when a description contains a pipe', () => {
    for (const path of ['games', 'apps']) {
      const rows = byPath
        .get(path)!
        .content.split('\n')
        .filter((line) => line.startsWith('| ') && !line.startsWith('| ---'));
      for (const row of rows) expect(row.replaceAll('\\|', '').split('|')).toHaveLength(4);
    }
  });
});
