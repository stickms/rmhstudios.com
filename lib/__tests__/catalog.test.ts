import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import * as lucide from 'lucide-react';
import { games } from '@/lib/games';
import { apps } from '@/lib/apps';
import { appEntrySchema, gameEntrySchema } from '@/lib/catalog/types';

/**
 * The catalog split (one file per entry under `lib/catalog/`) moved the
 * "is this entry well-formed?" question from a reviewer's eyes to a zod schema
 * that runs at module load. That covers shape. It does not cover the three
 * things that only make sense across the whole catalog, which is what this file
 * is for:
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

function entryFileIds(kind: 'games' | 'apps'): string[] {
  return readdirSync(join(CATALOG_DIR, kind))
    .filter((f) => f.endsWith('.ts'))
    .map((f) => f.replace(/\.ts$/, ''))
    .sort();
}

describe('catalog barrel', () => {
  it.each([
    ['games', () => games, () => entryFileIds('games')],
    ['apps', () => apps, () => entryFileIds('apps')],
  ] as const)('%s: every entry file is imported by the barrel', (_kind, list, files) => {
    // A file added under lib/catalog/<kind>/ without a matching import line in
    // lib/catalog/index.ts compiles, ships, and does nothing. The filename is
    // held equal to the entry id so this check is possible at all.
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

  it('rejects a missing required field', () => {
    const { cta: _cta, ...withoutCta } = games[0];
    expect(gameEntrySchema.safeParse(withoutCta).success).toBe(false);
  });
});
