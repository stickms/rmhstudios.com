import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Owner 2026-11-24: changing a setting (a tab, a program, a category, a filter, a cycle) updates the page in place. It
 * never scrolls to the top and never blanks the page. These are the static halves of that rule; the scratchpad browser
 * check measures `scrollY` around real changes.
 */
const root = __dirname;
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return files(p);
    return /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : [];
  });
const sources = files(root).map((p) => [p, readFileSync(p, 'utf8')] as const);

/** Each `navigate({ ... })` call's argument, by brace matching. */
function navigateCalls(src: string): string[] {
  const out: string[] = [];
  let i = src.indexOf('navigate({');
  while (i !== -1) {
    let depth = 0;
    let j = i + 'navigate('.length;
    for (; j < src.length; j++) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}' && --depth === 0) break;
    }
    out.push(src.slice(i, j + 1));
    i = src.indexOf('navigate({', j);
  }
  return out;
}

describe('a setting change keeps the reader in place', () => {
  it('every navigate() in the app replaces the entry and keeps the scroll position', () => {
    let count = 0;
    for (const [file, src] of sources) {
      for (const call of navigateCalls(src)) {
        count++;
        expect(call, file).toContain('resetScroll: false');
        expect(call, file).toContain('replace: true');
      }
    }
    expect(count).toBeGreaterThanOrEqual(5);
  });

  it("each of them first tells the site's scroll restoration the page is staying (holdScroll)", () => {
    for (const [file, src] of sources) {
      const calls = navigateCalls(src).length;
      if (calls === 0) continue;
      expect((src.match(/holdScroll\(\);\s*\n\s*(void |await )?navigate\(\{/g) ?? []).length, file).toBe(calls);
    }
    const school = sources.find(([f]) => f.endsWith('SchoolPage.tsx'))![1];
    expect(school).toContain('onClick={holdScroll}');
  });

  it('every link that only changes the search (the section links) keeps the scroll position', () => {
    for (const [file, src] of sources) {
      // A `<Link>` whose search is a function of the current one, up to its className.
      for (const m of src.matchAll(/<Link\b(?:(?!<Link)[\s\S])*?className=/g)) {
        if (m[0].includes('search={((prev')) expect(m[0], file).toContain('resetScroll={false}');
      }
    }
  });

  it('the filtered queries keep their previous answer while the next one loads, and the loaders do not wait on a change', () => {
    const queries = readFileSync(join(root, '..', 'medschools.queries.ts'), 'utf8');
    for (const name of [
      'schoolsQuery',
      'liveQuery',
      'activityQuery',
      'historyQuery',
      'forecastQuery',
      'secondariesQuery',
      'trackerQuery',
    ]) {
      const at = queries.indexOf(`export const ${name}`);
      expect(at, name).toBeGreaterThan(-1);
      expect(queries.slice(at, queries.indexOf('\nexport', at + 1)), name).toMatch(
        /keeping\([\s\S]*(keepPreviousData|keepWithinSchool\(slug\)),?\s*\)/,
      );
    }
    for (const route of ['index.tsx', 'live.tsx', '$slug.tsx', 'tracker.tsx']) {
      const src = readFileSync(join(root, '..', '..', '..', 'app', 'routes', 'rmh-medschool', route), 'utf8');
      expect(src, route).toMatch(/cause/);
    }
  });
});
