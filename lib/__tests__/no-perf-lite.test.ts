/**
 * The `perf-lite` material tier is gone (docs/superpowers/specs/2026-11-08-refractive-glass-design.md, "Calls made" 1).
 *
 * A software-rendering browser, Data Saver and a weak device get the same material as any other; the only things that
 * still read a low-end signal are games, the app tier, RUM, the eversion's mesh tier and the globe's CSS fallback, and
 * they read `lib/low-end.ts`, which is never a class on `<html>` and never read by the site material.
 *
 * This guard fails when the retired name comes back in the source: no CSS selector, no `classList` read or write, no
 * comment that sends a reader looking for a class that does not exist. It scans the source trees that shipped it
 * (`app`, `components`, `lib`, `hooks`, `stores`) and skips only itself.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..');
/** Spelled in two halves so this file does not trip its own scan. */
const RETIRED = ['perf', 'lite'].join('-');
const ROOTS = ['app', 'components', 'lib', 'hooks', 'stores'];
const EXT = /\.(css|ts|tsx|mjs|cjs|js|json)$/;
const SKIP_DIR = new Set(['node_modules', '.git', 'generated']);

function walk(dir: string, out: string[]): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIR.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (EXT.test(name)) out.push(full);
  }
  return out;
}

const SELF = relative(ROOT, __filename).split(sep).join('/');
const FILES = ROOTS.flatMap((r) => walk(join(ROOT, r), [])).filter(
  (f) => relative(ROOT, f).split(sep).join('/') !== SELF,
);
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('perf-lite is gone', () => {
  it('scans a real tree', () => {
    expect(FILES.length).toBeGreaterThan(500);
  });

  it('the retired name appears nowhere in app, components, lib, hooks or stores', () => {
    const hits = FILES.filter((f) => readFileSync(f, 'utf8').includes(RETIRED)).map((f) =>
      relative(ROOT, f).split(sep).join('/'),
    );
    expect(hits, `Remove "${RETIRED}" (the material has no low-end tier) from:`).toEqual([]);
  });

  it('the stamping script and its modules are deleted', () => {
    for (const f of ['lib/perf-tier.ts', 'lib/performance-tier.ts']) {
      expect(() => statSync(join(ROOT, f)), f).toThrow();
    }
    expect(read('app/routes/__root.tsx')).not.toContain('PERF_TIER_SCRIPT');
    expect(read('components/Providers.tsx')).not.toContain('applyPerfTier');
  });

  it('the jelly mount hook stamps data-jelly-ready without probing for a software renderer', () => {
    const hook = read('hooks/useLiquidInteractions.ts');
    expect(hook).toContain("setAttribute('data-jelly-ready', '')");
    for (const probe of [
      'reconcileSoftRender',
      'settleSoftRender',
      'detectSoftRender',
      'probeGpu',
      'lib/low-end',
    ]) {
      expect(hook, probe).not.toContain(probe);
    }
  });

  it('the material never reads the low-end capability signal', () => {
    for (const f of FILES) {
      const rel = relative(ROOT, f).split(sep).join('/');
      if (!rel.startsWith('lib/jelly/') && !rel.startsWith('lib/liquid/')) continue;
      if (rel.includes('__tests__')) continue;
      expect(readFileSync(f, 'utf8'), rel).not.toContain('@/lib/low-end');
    }
  });

  it('the low-end signal is not a document class: lib/low-end.ts writes nothing to <html>', () => {
    const src = read('lib/low-end.ts').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(src).not.toMatch(/classList\.(add|toggle|remove)/);
    expect(src).not.toMatch(/documentElement/);
  });
});
