/**
 * The Homes layout faults the owner reported, pinned at the source so they cannot come back unnoticed.
 * (What the page looks like is checked in a browser; these hold the causes.)
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const index = read('../../../app/routes/_site/homes/index.tsx');
const grid = read('../ListingGrid.tsx');
const card = read('../ListingCard.tsx');
const filters = read('../FiltersBar.tsx');
const map = read('../ListingsMap.tsx');

describe('Homes: the results toolbar', () => {
  it('prints the count once ("1 1 home" was a bold number followed by a string that already held it)', () => {
    expect(index.match(/t\('homes-count-noun'/g)).toHaveLength(1);
    expect(index).not.toContain('total.toLocaleString()');
  });

  it('draws the view switch with the shared Tabs, and the page takes the two-column frame', () => {
    expect(index).toContain('<Tabs');
    expect(index).toContain('<NoMargin />');
  });
});

describe('Homes: the list', () => {
  it('sizes grid columns from the space the grid has, never from the viewport', () => {
    expect(grid).toContain('grid-cols-[repeat(auto-fill,minmax(min(100%,240px),1fr))]');
    // The header comment quotes the old classes; the code below it must not use them.
    expect(grid.slice(grid.indexOf('import '))).not.toMatch(/\b(sm|md|lg|xl):grid-cols-/);
  });

  it('keeps the price and each fact on one line and gives the title two', () => {
    expect(card.match(/whitespace-nowrap/g)?.length).toBeGreaterThanOrEqual(3);
    expect(card).toContain('line-clamp-2');
    expect(card).not.toContain('line-clamp-1');
  });

  it('keeps the save control out of the link and at a 44px target', () => {
    const link = card.slice(card.indexOf('<Link'), card.indexOf('</Link>'));
    expect(link).not.toContain('FavoriteButton');
    expect(read('../FavoriteButton.tsx')).toContain('size-11');
  });
});

describe('Homes: the filter bar', () => {
  it('uses the shared tab strip and Select, one size for every select', () => {
    expect(filters).toContain('<PageTabs');
    const selects = filters.slice(0, filters.indexOf('{advanced && (')).match(/<Select\b/g) ?? [];
    const sized =
      filters.slice(0, filters.indexOf('{advanced && (')).match(/controlSize="sm"/g) ?? [];
    expect(selects).toHaveLength(3);
    expect(sized).toHaveLength(3);
    expect(filters).not.toContain('w-auto min-w-');
  });
});

describe('Homes: the map', () => {
  it('fetches its tiles from a host both content security policies let it connect to', () => {
    // MapLibre loads raster tiles with fetch(), which `connect-src` governs, not `img-src`. The host was
    // missing from both policies, so in production the map drew its pins on an empty canvas.
    const host = /tiles: \['(https:\/\/[^/']+)\//.exec(map)?.[1];
    expect(host).toBe('https://tile.openstreetmap.org');
    const connect = (policy: string) => /connect-src ([^;]+)/.exec(policy)?.[1] ?? '';
    // Read as text: a component test may not import a `.server` module (boundaries/server-value-import).
    const mirror = read('../../../lib/csp/policy.server.ts')
      .split('\n')
      .filter((line) => line.includes('"connect-src '));
    expect(mirror).toHaveLength(1);
    expect(mirror[0]).toContain(host);
    const apache = read('../../../deploy/apache/rmhstudios.conf');
    const enforced = apache
      .split('\n')
      .filter(
        (line) =>
          /^\s*Header\b.*Content-Security-Policy/.test(line) && line.includes('connect-src'),
      );
    expect(enforced.length).toBeGreaterThan(0);
    for (const line of enforced) expect(connect(line)).toContain(host);
  });

  it('is a framed picture while it loads, and refits once the map exists', () => {
    expect(map).toContain('border border-site-border bg-site-bg-subtle');
    expect(map).toContain('onLoad={() => setReady(true)}');
  });
});
