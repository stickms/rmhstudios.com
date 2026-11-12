/**
 * No site-tier or app-tier stylesheet is over 1,500 lines, and a split sheet stays one sheet (redesign E4).
 *
 * `app/globals.css` and `components/library/library.css`
 * are entry sheets: a prelude plus ordered `@import './<stem>/<part>.css'` lines. Importing the parts in file order
 * from the same entry point keeps the cascade identical to the single file they replaced (proved by diffing the
 * emitted CSS before and after). That only holds if every partial is imported exactly once and nothing but the
 * imports follows the first one — so this pins it.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cssParts } from './css-source';
import { siteAppCssFiles } from './css-tiers';

const ROOT = process.cwd();
const MAX_LINES = 1500;
const ENTRIES = [
  'app/globals.css',
  'components/library/library.css',
];

describe('stylesheet size and split integrity', () => {
  it(`no site/app-tier stylesheet exceeds ${MAX_LINES} lines`, () => {
    const big = siteAppCssFiles()
      .map((f) => [f, readFileSync(join(ROOT, f), 'utf8').split('\n').length] as const)
      .filter(([, n]) => n > MAX_LINES)
      .map(([f, n]) => `${f}: ${n}`);
    expect(big, 'Split it into cohesive partials imported in the same order from the same entry sheet.').toEqual([]);
  });

  it.each(ENTRIES)('%s imports every partial in its directory, once, in order', (entry) => {
    const stem = entry.replace(/\.css$/, '');
    const parts = cssParts(entry).map((p) => p.slice(ROOT.length + 1));
    expect(parts.length).toBeGreaterThan(1);
    expect(new Set(parts).size).toBe(parts.length);
    const onDisk = readdirSync(join(ROOT, stem))
      .filter((f) => f.endsWith('.css'))
      .map((f) => `${stem}/${f}`)
      .sort();
    expect([...parts].sort(), 'an orphan partial is dead CSS; a missing one is a broken page').toEqual(onDisk);
    for (const p of parts) expect(existsSync(join(ROOT, p))).toBe(true);
  });

  it.each(ENTRIES)('%s: after the first partial import, only partial imports follow', (entry) => {
    const stem = entry.replace(/^.*\//, '').replace(/\.css$/, '');
    const partial = new RegExp(`^@import './${stem}/[^']+\\.css';$`);
    const lines = readFileSync(join(ROOT, entry), 'utf8').split('\n');
    const first = lines.findIndex((l) => partial.test(l));
    expect(first).toBeGreaterThan(-1);
    const tail = lines.slice(first).filter((l) => l.trim() !== '');
    expect(tail.every((l) => partial.test(l))).toBe(true);
  });
});
