import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { resetEversionFlagsForTests } from '../flags';
import { maybeLoadEversionDebug, mountDebugOverlay, onDebugChange, registerDebug } from '../debug';

/**
 * The debug surface must not reach a visitor without `?eversion-debug=1`
 * (spec §11.3). T29 owns the permanent assertion on the built bundle
 * (`scripts/check-bundle-budget.ts`); until then this pins the source-level
 * shape that makes the bundle assertion pass: the heavy overlay is imported by
 * `debug.ts` through a dynamic `import()` and by nobody else, and `debug.ts`
 * itself (which registrants import statically) stays a leaf with no DOM.
 */

const REPO = join(__dirname, '..', '..', '..');
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.output',
  'dist-server',
  '.claude',
  '__tests__',
  'locales',
  'public',
  'docs',
]);

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
        sources(join(dir, entry.name), out);
      }
    } else if (/\.(tsx?|mjs|cjs|js)$/.test(entry.name) && !/\.(test|spec)\./.test(entry.name)) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

const rel = (f: string) => relative(REPO, f).split(sep).join('/');
const code = (f: string) =>
  readFileSync(f, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

// Only the trees that could import it.
const FILES = ['lib', 'components', 'app', 'hooks', 'stores', 'server'].flatMap((d) =>
  sources(join(REPO, d)),
);

describe('debug surface is in no static closure', () => {
  it('scans a non-trivial tree', () => {
    expect(FILES.length).toBeGreaterThan(500);
  });

  it('imports debug-overlay only dynamically, and only from debug.ts', () => {
    const staticImport = /(?:^|\n)\s*(?:import|export)\b[^;'"]*?from\s*['"][^'"]*debug-overlay['"]/;
    const sideEffectImport = /(?:^|\n)\s*import\s*['"][^'"]*debug-overlay['"]/;
    const dynamicImport = /\bimport\(\s*['"][^'"]*debug-overlay['"]\s*\)/;
    const dynamicHits: string[] = [];
    for (const f of FILES) {
      const src = code(f);
      expect(src, rel(f)).not.toMatch(staticImport);
      expect(src, rel(f)).not.toMatch(sideEffectImport);
      if (dynamicImport.test(src)) dynamicHits.push(rel(f));
    }
    expect(dynamicHits).toEqual(['lib/eversion/debug.ts']);
  });

  it('keeps debug.ts a leaf: imports only flags and types, touches no DOM globals', () => {
    const src = code(join(REPO, 'lib/eversion/debug.ts'));
    const specifiers = [...src.matchAll(/(?:^|\n)\s*import\b[^;]*?from\s*['"]([^'"]+)['"]/g)].map(
      (m) => m[1],
    );
    expect(specifiers.sort()).toEqual(['./flags', './types']);
    expect(src).not.toMatch(/\bdocument\./);
  });

  it('is never imported by non-eversion code except through the loader entry points', () => {
    // Registrants live in lib/eversion and components/radial; nothing else should know it.
    for (const f of FILES) {
      const r = rel(f);
      if (r.startsWith('lib/eversion/') || r.startsWith('components/radial/')) continue;
      expect(code(f), r).not.toMatch(/from\s*['"][^'"]*eversion\/debug['"]/);
    }
  });
});

describe('loader without the flag', () => {
  beforeEach(() => resetEversionFlagsForTests());
  afterEach(() => {
    vi.unstubAllGlobals();
    resetEversionFlagsForTests();
  });

  it('does nothing and leaves window.__eversion undefined', () => {
    const win: { __eversion?: unknown } = {};
    vi.stubGlobal('window', win);
    vi.stubGlobal('document', {});
    vi.stubGlobal('location', { search: '' });
    const dispose = maybeLoadEversionDebug();
    const dispose2 = mountDebugOverlay();
    registerDebug('capture', {} as never)();
    expect(typeof dispose).toBe('function');
    expect(() => {
      dispose();
      dispose2();
    }).not.toThrow();
    expect(win.__eversion).toBeUndefined();
  });

  it('does nothing on the server (no window)', () => {
    vi.stubGlobal('window', undefined);
    expect(() => maybeLoadEversionDebug()()).not.toThrow();
  });
});

describe('registry notifications', () => {
  beforeEach(() => resetEversionFlagsForTests());
  afterEach(() => {
    vi.unstubAllGlobals();
    resetEversionFlagsForTests();
  });

  it('tells listeners when a slot is registered and removed, and stops after unsubscribe', () => {
    const win: { __eversion?: { slots(): string[] } } = {};
    vi.stubGlobal('window', win);
    vi.stubGlobal('location', { search: '?eversion-debug=1' });
    const seen: string[][] = [];
    const off = onDebugChange(() => seen.push(win.__eversion?.slots() ?? []));
    const remove = registerDebug('host', {} as never);
    remove();
    off();
    registerDebug('host', {} as never)();
    expect(seen).toEqual([['host'], []]);
  });
});
