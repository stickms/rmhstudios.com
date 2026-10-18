// @vitest-environment node
/**
 * "No effect on page load time": nothing eversion-related may be requested before
 * `window` `load` (spec S#40). The browser gate (`eversion-load.mjs`, with its
 * late-load negative control) proves it against a build; this is the same rule at
 * the source, so a regression fails `pnpm test` first (review R6 M1).
 *
 * The hub's 800 ms warm-up timer routinely fires BEFORE `load` on a slow page, and
 * `import('@/lib/eversion/prefetch')` is itself a network request for a chunk, so
 * every dynamic import of the effect's code from the hub must sit behind
 * `startEversion()`, which waits for `load` (then a task, then idle).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const hub = readFileSync(join(process.cwd(), 'components/radial/RadialHub.tsx'), 'utf8');

/** Source text of the top-level `function startEversion` (brace-matched). */
function startEversionBody(): string {
  const at = hub.indexOf('function startEversion(');
  expect(at).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = hub.indexOf('{', at); i < hub.length; i++) {
    if (hub[i] === '{') depth++;
    else if (hub[i] === '}' && --depth === 0) return hub.slice(at, i + 1);
  }
  throw new Error('unbalanced');
}

describe('RadialHub load gating', () => {
  it('imports the effect only inside startEversion()', () => {
    const body = startEversionBody();
    const all = [...hub.matchAll(/import\(\s*['"]@\/lib\/eversion\//g)].length;
    const inside = [...body.matchAll(/import\(\s*['"]@\/lib\/eversion\//g)].length;
    expect(all).toBeGreaterThan(0);
    expect(inside).toBe(all);
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
    expect(hub).toMatch(/result\.webgl2/);
    expect(hub).not.toMatch(
      /prefetchEversion\(\)\)\s*\.then\(\(\) => \{?\s*(?:if \(!unmounted\) )?setBridgeWanted/,
    );
  });

  it('the shell statically imports only the flag, the mark types and type-only modules', () => {
    const statics = [
      ...hub.matchAll(
        /^import\s+(type\s+)?[^;]*?from\s+'(@\/lib\/eversion\/[^']+|\.\/eversion\/[^']+)';/gms,
      ),
    ];
    for (const [full, typeOnly, spec] of statics) {
      if (typeOnly) continue;
      expect(spec, full).toBe('@/lib/eversion/flags');
    }
  });
});
