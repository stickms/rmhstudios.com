import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import * as lucide from 'lucide-react';
import { games, apps } from '@/lib/catalog';
import { appEntrySchema, gameEntrySchema } from '@/lib/catalog/types';

/**
 * The catalog split (one file per entry under `lib/catalog/`) moved the
 * "is this entry well-formed?" question from a reviewer's eyes to a zod schema.
 *
 * **This file is now the only place that schema runs.** It used to also run at
 * module load in `lib/catalog/index.ts`, which put zod (71 KB raw) on the shared
 * critical path of every page on the site and re-parsed 34 static objects in
 * every visitor's browser. The parse moved here; nothing about the coverage
 * changed except that it now runs once in CI instead of once per page view. So
 * `every entry parses against its schema` below is load-bearing — deleting it
 * removes the site's only runtime-shape check on hand-written catalog data.
 *
 * On top of shape, three things only make sense across the whole catalog:
 *
 *  1. every file on disk is actually wired into the barrel (a per-entry file
 *     that nobody imports is invisible, and the failure mode is a game
 *     vanishing from the site with no error anywhere);
 *  2. `iconName` names a real Lucide icon — the schema deliberately does not
 *     check this, because doing so would pull the whole icon set into every
 *     bundle that reads the catalog, whereas a test can import it freely;
 *  3. ids and hrefs are unique and well-formed, since the id is the join key
 *     for scoring rules, capabilities, wagers and arcade challenges.
 */

const CATALOG_DIR = join(process.cwd(), 'lib/catalog');
const FEATURES_DIR = join(process.cwd(), 'features');

/** Entry ids that a feature folder owns (`features/<id>/catalog.ts`), by catalog kind. */
function featureEntryIds(kind: 'games' | 'apps'): string[] {
  return readdirSync(FEATURES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(FEATURES_DIR, e.name, 'catalog.ts')))
    .flatMap((e) => {
      const src = readFileSync(join(FEATURES_DIR, e.name, 'catalog.ts'), 'utf8');
      const isApp = src.includes('AppInfo');
      const id = /^\s*id: '([^']+)'/m.exec(src)?.[1];
      return (kind === 'apps') === isApp && id ? [id] : [];
    });
}

/** Hand-kept entry files under lib/catalog/<kind>/ plus the entries features own. */
function entryFileIds(kind: 'games' | 'apps'): string[] {
  const handKept = readdirSync(join(CATALOG_DIR, kind))
    .filter((f) => f.endsWith('.ts'))
    .map((f) => f.replace(/\.ts$/, ''));
  return [...handKept, ...featureEntryIds(kind)].sort();
}

describe('catalog barrel', () => {
  it.each([
    ['games', () => games, () => entryFileIds('games')],
    ['apps', () => apps, () => entryFileIds('apps')],
  ] as const)('%s: every entry file is imported by the barrel', (_kind, list, files) => {
    // A file added under lib/catalog/<kind>/ (or a features/<id>/catalog.ts)
    // without a matching import line in lib/catalog/index.ts compiles, ships,
    // and does nothing. A hand-kept filename is held equal to the entry id so
    // this check is possible at all.
    expect(
      list()
        .map((e) => e.id)
        .sort(),
    ).toEqual(files());
  });

  it('every entry parses against its schema', () => {
    for (const game of games) expect(() => gameEntrySchema.parse(game)).not.toThrow();
    for (const app of apps) expect(() => appEntrySchema.parse(app)).not.toThrow();
  });

  it('is sorted by order, with no duplicates', () => {
    for (const list of [games, apps]) {
      const orders = list.map((e) => e.order);
      expect(orders).toEqual([...orders].sort((a, b) => a - b));
      expect(new Set(orders).size).toBe(orders.length);
    }
  });

  it('ids are unique across both catalogs', () => {
    // Wager eligibility, search and the history/resume tracker all look an id
    // up in "games, then apps", so a collision would resolve to the wrong card.
    const ids = [...games.map((g) => g.id), ...apps.map((a) => a.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every iconName is a real Lucide icon', () => {
    const icons = lucide as unknown as Record<string, unknown>;
    const missing = [...games, ...apps]
      .filter(
        (e) => typeof icons[e.iconName] !== 'object' && typeof icons[e.iconName] !== 'function',
      )
      .map((e) => `${e.id}:${e.iconName}`);
    expect(missing).toEqual([]);
  });

  it('bannerPath, when declared, exists under public/ and its master is at most 1.5 MB', () => {
    // The library's detail hero reads `bannerPath`; a typo'd path would render
    // as a broken wide image on the page the visitor is looking at.
    const problems = [...games, ...apps]
      .filter((e) => e.bannerPath)
      .flatMap((e) => {
        const file = join(process.cwd(), 'public', e.bannerPath as string);
        if (!existsSync(file)) return [`${e.id}: ${e.bannerPath} is missing`];
        // The master is 3840 px wide so the page can serve a sharp 1920/2560 px variant on a retina screen; the page
        // never ships the master itself (it is resized to build-time variants), so the ceiling is for the repo, not
        // for the visitor.
        return statSync(file).size > 1536 * 1024 ? [`${e.id}: ${e.bannerPath} is over 1.5 MB`] : [];
      });
    expect(problems).toEqual([]);
  });

  it('logoPath, when declared, exists under public/, is a WebP and is at most 150 KB', () => {
    // The library hero shows it in place of the title text; a typo'd path would leave a broken image where the
    // game's name should be.
    const problems = [...games, ...apps]
      .filter((e) => e.logoPath)
      .flatMap((e) => {
        const path = e.logoPath as string;
        const file = join(process.cwd(), 'public', path);
        if (!path.endsWith('.webp')) return [`${e.id}: ${path} is not a .webp`];
        if (!existsSync(file)) return [`${e.id}: ${path} is missing`];
        return statSync(file).size > 150 * 1024 ? [`${e.id}: ${path} is over 150 KB`] : [];
      });
    expect(problems).toEqual([]);
  });

  it('every game and app has a banner and a logo for its library page', () => {
    // The page shows the banner behind the card and the logo as the title; without them it falls back to a blurred
    // copy of the card and plain text, which is the look this replaced.
    const missing = [...games, ...apps].filter((e) => !e.unlisted).flatMap((e) => [
      ...(e.bannerPath ? [] : [`${e.id}: no bannerPath`]),
      ...(e.logoPath ? [] : [`${e.id}: no logoPath`]),
    ]);
    expect(missing).toEqual([]);
  });

  it('every href is a site path or an absolute URL', () => {
    const bad = [...games, ...apps]
      .filter((e) => !e.href.startsWith('/') && !/^https?:\/\//.test(e.href))
      .map((e) => `${e.id}:${e.href}`);
    expect(bad).toEqual([]);
  });
});

describe('catalog schema', () => {
  it('rejects an unknown key rather than ignoring it', () => {
    // The point of the strict schema: `imgPath` instead of `imagePath` type
    // checks nowhere and would otherwise just never render an image.
    const result = gameEntrySchema.safeParse({ ...games[0], imgPath: '/x.webp' });
    expect(result.success).toBe(false);
  });

  it('accepts an optional bannerPath on games and apps', () => {
    expect(gameEntrySchema.safeParse({ ...games[0], bannerPath: '/images/games/x-banner.webp' }).success).toBe(true);
    expect(appEntrySchema.safeParse({ ...apps[0], bannerPath: '/images/games/y-banner.webp' }).success).toBe(true);
  });

  it('accepts an optional logoPath on games and apps', () => {
    expect(gameEntrySchema.safeParse({ ...games[0], logoPath: '/images/games/logos/x.webp' }).success).toBe(true);
    expect(appEntrySchema.safeParse({ ...apps[0], logoPath: '/images/games/logos/y.webp' }).success).toBe(true);
  });

  it('rejects a missing required field', () => {
    const { cta: _cta, ...withoutCta } = games[0];
    expect(gameEntrySchema.safeParse(withoutCta).success).toBe(false);
  });
});
