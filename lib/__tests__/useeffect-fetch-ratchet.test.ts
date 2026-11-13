/**
 * Files that fetch their page data from an effect only go DOWN (redesign audit B4).
 *
 * The rule: a page's primary data is fetched in its route loader (SSR,
 * intent-preloadable) and seeded into React Query (`lib/route/route-query.ts`);
 * React Query / effects are for client-owned interactive state. The audit's
 * measure is the number of component files that combine `useEffect` with a
 * `fetch('/api…')` or a contract `api(` call.
 *
 * One-directional, like the other backlogs in this folder:
 *  - a NEW such file fails (count above the baseline) - seed the data from the
 *    route loader instead;
 *  - migrating one fails too until BASELINE is lowered to the new count.
 *
 * It is an approximation of the audit's `rg`, not a proof: a genuinely
 * interactive fetch (a search box, a poll, a submit) still counts and is part of
 * the backlog the audit target (<= 20) tolerates.
 */
import { globSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** Lower this when you migrate pages. Never raise it. */
const BASELINE = 218;

const USE_EFFECT = /\buseEffect\b/;
const API_CALL = /fetch\(\s*['"`]\/api\/|(?<![\w.])api\(\s*[A-Za-z_]\w*Api\b/;

function count(): { total: number; files: string[] } {
  const files = globSync('{app/routes,components,features}/**/*.tsx', {
    exclude: (f) => /node_modules|__tests__|\.test\.|routeTree\.gen/.test(String(f)),
  });
  const hits: string[] = [];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    if (USE_EFFECT.test(src) && API_CALL.test(src)) hits.push(String(f));
  }
  return { total: hits.length, files: hits };
}

describe('useEffect + /api fetch ratchet', () => {
  it('does not grow and is lowered as it shrinks', () => {
    const { total, files } = count();
    expect(
      total,
      `component files combining useEffect with an /api fetch: ${total}, baseline ${BASELINE}.\n` +
        (total > BASELINE
          ? '  A new one: fetch the page data in the route loader instead (prefetchRouteQuery, lib/route/route-query.ts).\n'
          : `  You migrated some: lower BASELINE in this file to ${total}.\n`) +
        `  First few: ${files.slice(0, 8).join(', ')}`,
    ).toBe(BASELINE);
  });
});
