import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { none } from '../store';

/**
 * Zustand selectors that build a fresh value, as an executable gate.
 *
 * This exists because of a shipped crash, and the crash is worth describing
 * because the code that caused it looks completely ordinary:
 *
 *     const ids = useMmStore((s) => [...s.itemMeta.keys()]);
 *
 * Zustand v5 is a thin wrapper over `useSyncExternalStore`, which calls the
 * selector on every render and compares the result to the previous one **by
 * identity** to decide whether anything changed. A selector that allocates never
 * compares equal, so React re-renders, which calls the selector, which allocates
 * again — until React gives up with "Maximum update depth exceeded". In this
 * game that happened the moment the first world snapshot arrived, i.e. the
 * instant you walked out of the lobby, and the error boundary replaced the
 * island with a crash screen.
 *
 * React does warn ("The result of getSnapshot should be cached to avoid an
 * infinite loop") but only in dev, and only into the console, after the game has
 * already died. This test is the version that fails before anybody ships it.
 *
 * The rule: a `useMmStore` selector may READ and it may COMPARE, but it may not
 * CONSTRUCT. Anything that needs a derived array belongs in a `useMemo` keyed on
 * the stable value the selector returned, and an empty-list fallback belongs to
 * the shared `none<T>()` from the store.
 */

const ROOT = process.cwd();
const DIRS = [join('components', 'massive-march'), join('lib', 'massive-march')];

function collect(dir: string, out: string[] = []): string[] {
  let entries;
  try {
    entries = readdirSync(join(ROOT, dir), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const rel = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') continue;
      collect(rel, out);
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(rel);
    }
  }
  return out;
}

const FILES = DIRS.flatMap((d) => collect(d)).filter((f) => statSync(join(ROOT, f)).isFile());

/**
 * Blank out comments, preserving newlines so line numbers still line up.
 *
 * Not optional: the doc comments that explain this very rule quote the broken
 * selector verbatim, and without this the gate's first act is to fail on its own
 * documentation.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, lead) => lead + ' '.repeat(m.length - lead.length));
}

/**
 * The selector body of every `useMmStore((s) => …)` call, with its line number.
 *
 * Scanned by brace/paren depth rather than by regex so a selector spanning
 * several lines is read whole — the multi-line ones are exactly where an
 * allocation is easiest to miss by eye.
 */
function selectors(source: string): { body: string; line: number }[] {
  const src = stripComments(source);
  const out: { body: string; line: number }[] = [];
  const re = /useMmStore\(\s*\((\w+)\)\s*=>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let depth = 1; // we are inside `useMmStore(`
    let i = m.index + m[0].length;
    for (; i < src.length && depth > 0; i++) {
      if (src[i] === '(') depth++;
      else if (src[i] === ')') depth--;
    }
    out.push({
      body: src.slice(m.index + m[0].length, i - 1),
      line: src.slice(0, m.index).split('\n').length,
    });
  }
  return out;
}

/**
 * Constructs that allocate a new value every call.
 *
 * `.find()` is deliberately absent: it returns an element of an array the store
 * owns, so its identity is as stable as the store's — which is the point.
 */
const ALLOCATING: [RegExp, string][] = [
  [/\[\s*\.\.\./, 'spreads into a new array'],
  [/\?\?\s*\[\]/, 'falls back to a fresh `[]` — use `none<T>()` from the store'],
  [/\?\?\s*\{\}/, 'falls back to a fresh `{}`'],
  [/\.map\(/, 'maps into a new array'],
  [/\.filter\(/, 'filters into a new array'],
  [/\.slice\(/, 'slices into a new array'],
  [/\.concat\(/, 'concatenates into a new array'],
  [/Object\.(keys|values|entries)\(/, 'builds a new array from an object'],
  [/Array\.from\(/, 'builds a new array'],
  [/new (Map|Set|Array)\(/, 'builds a new collection'],
];

describe('massive march — store selectors never allocate', () => {
  it('scans the game’s sources', () => {
    // Guards the walker: a bad path would make the rule below pass vacuously.
    expect(FILES.length).toBeGreaterThan(20);
    expect(FILES).toContain(join('components', 'massive-march', 'world', 'Items3D.tsx'));
  });

  it('finds selectors to check', () => {
    const total = FILES.reduce((n, f) => n + selectors(readFileSync(join(ROOT, f), 'utf8')).length, 0);
    expect(total).toBeGreaterThan(15);
  });

  it('no selector constructs a value', () => {
    const violations: string[] = [];
    for (const file of FILES) {
      const src = readFileSync(join(ROOT, file), 'utf8');
      for (const { body, line } of selectors(src)) {
        for (const [pattern, why] of ALLOCATING) {
          if (pattern.test(body)) {
            violations.push(`${file}:${line} — selector ${why}: ${body.trim().slice(0, 90)}`);
            break;
          }
        }
      }
    }

    expect(
      violations,
      `\nThese zustand selectors allocate on every call (${violations.length}):\n` +
        violations.map((v) => `  ${v}`).join('\n') +
        '\n\nA selector may read and compare, never construct — zustand compares its ' +
        'result by identity, so an allocating selector re-renders forever and dies as ' +
        '"Maximum update depth exceeded". Return the stable value and derive from it ' +
        'in a useMemo, or use `none<T>()` for an empty-list fallback.\n',
    ).toEqual([]);
  });
});

describe('none()', () => {
  it('hands back the same array every time, for every element type', () => {
    // The whole reason it exists: `?? none<T>()` has to be identity-stable or it
    // is just `?? []` with extra steps.
    expect(none<string>()).toBe(none<number>());
  });

  it('is frozen, so one caller cannot poison every fallback', () => {
    expect(Object.isFrozen(none())).toBe(true);
  });
});
