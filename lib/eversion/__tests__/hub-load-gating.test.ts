// @vitest-environment node
/**
 * "No effect on page load time": nothing eversion-related may be requested before
 * `window` `load` (spec S#40). The browser gate (`eversion-load.mjs`, with its
 * late-load negative control) proves it against a build; this is the same rule at
 * the source, so a regression fails `pnpm test` first (review R6 M1).
 *
 * The warm-up timer routinely fires BEFORE `load` on a slow page, and
 * `import('@/lib/eversion/prefetch')` is itself a network request for a chunk, so
 * every dynamic import of the effect's code must sit behind `startEversion()`,
 * which waits for `load` (then a task, then idle). The warm-up moved from the hub
 * to the page root on 2026-10-21 (`eversion-root.ts` / `EversionRoot.tsx`), so a
 * transition that starts or ends off the shell runs the effect too; the rule moved
 * with it, and now also covers everything those root modules pull in statically.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const rootModule = read('components/radial/eversion/eversion-root.ts');

/** Source text of the top-level `function startEversion` (brace-matched). */
function startEversionBody(): string {
  const at = rootModule.indexOf('function startEversion(');
  expect(at).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = rootModule.indexOf('{', at); i < rootModule.length; i++) {
    if (rootModule[i] === '{') depth++;
    else if (rootModule[i] === '}' && --depth === 0) return rootModule.slice(at, i + 1);
  }
  throw new Error('unbalanced');
}

/**
 * Everything the shell and the page root reach statically on the effect's side. Each may import the flag, types,
 * and the others on this list - never the runtime (`pnpm check:bundle-budget` is the build-level gate).
 */
const STATIC_CLOSURE = [
  'components/radial/RadialHub.tsx',
  'components/radial/eversion/EversionRoot.tsx',
  'components/radial/eversion/eversion-root.ts',
  'components/radial/eversion/eversion-nav.ts',
  'components/radial/eversion/popup.ts',
  'components/radial/eversion/EversionOverlay.tsx',
  'components/radial/eversion/overlay-store.ts',
];
const ALLOWED = new Set([
  '@/lib/eversion/flags',
  './eversion/EversionOverlay',
  './eversion/eversion-root',
  './eversion/eversion-nav',
  './eversion-root',
  './eversion-nav',
  './popup',
  './overlay-store',
]);

describe('Globe Eversion load gating', () => {
  it('imports the effect only inside startEversion()', () => {
    const body = startEversionBody();
    const all = [...rootModule.matchAll(/import\(\s*['"]@\/lib\/eversion\//g)].length;
    const inside = [...body.matchAll(/import\(\s*['"]@\/lib\/eversion\//g)].length;
    expect(all).toBeGreaterThan(0);
    expect(inside).toBe(all);
    for (const file of STATIC_CLOSURE.filter((f) => !f.endsWith('eversion-root.ts'))) {
      expect(read(file), file).not.toMatch(/import\(\s*['"]@\/lib\/eversion\//);
    }
  });

  it('startEversion waits for load before importing', () => {
    const body = startEversionBody();
    expect(body).toContain("document.readyState === 'complete'");
    expect(body).toContain("addEventListener('load'");
    // The import is reached only from `go`, never from the synchronous body.
    expect(body.indexOf('import(')).toBeGreaterThan(body.indexOf('const go'));
    expect(body.indexOf("addEventListener('load'")).toBeGreaterThan(body.indexOf('import('));
  });

  it('the bridge is mounted only for a device that reports WebGL2', () => {
    expect(rootModule).toMatch(/if \(result\.webgl2\) set\(\{ bridgeWanted: true \}\)/);
    expect(read('components/radial/eversion/EversionRoot.tsx')).toMatch(
      /if \(!root\.bridgeWanted\) return null;/,
    );
  });

  it.each(STATIC_CLOSURE)(
    '%s statically imports only the flag, types and the light leaves',
    (file) => {
      const src = read(file);
      const statics = [
        ...src.matchAll(
          /^import\s+(type\s+)?[^;]*?from\s+'(@\/lib\/eversion\/[^']+|\.\.?\/(?:eversion\/)?[^']+)';/gms,
        ),
      ];
      for (const [full, typeOnly, spec] of statics) {
        if (typeOnly || (!spec!.includes('eversion') && !spec!.startsWith('./'))) continue;
        if (/\.css$/.test(spec!)) continue;
        if (!spec!.includes('eversion') && file.endsWith('RadialHub.tsx')) continue;
        expect(ALLOWED.has(spec!), full).toBe(true);
      }
    },
  );
});
