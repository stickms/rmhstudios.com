/**
 * No route file imports a stylesheet at top level — CSS travels with the
 * component that uses it.
 *
 * ## Why
 *
 * TanStack's code-splitter moves a route's `component` into a lazy chunk, but a
 * bare `import '….css'` has no binding, so it stays in the route DEFINITION —
 * and `routeTree.gen.ts` imports every route definition statically. So a
 * stylesheet imported at the top of, say, `_site/library/index.tsx` was not the
 * library's: it was in the entry stylesheet, render-blocking on every page of
 * the site. Perf audit 2026-10-08 found the entry `index-*.css` at 107 KB raw
 * (~21 KB gzip), 99.8% unused on `/`, made of the library, RMH Vibe, store,
 * creator-studio, builds and RMH Music sheets; moving them out took it to
 * 13 KB / 3.3 KB.
 *
 * It also hid a bug class: a page that renders a component from another
 * feature (the Games index renders the builds gallery) silently depended on
 * that feature's CSS being global. When it stopped being global the toolbar
 * shifted in after load. The answer is co-location — the component that uses
 * `.builds-toolbar` imports the sheet that styles it — and route JSX that uses
 * feature classes directly renders a style carrier
 * (`components/library/LibraryStyles.tsx` and friends).
 *
 * The same trap applies to anything a route definition reads (`validateSearch`,
 * `beforeLoad`): import constants from a UI-free module
 * (`components/creator-studio/arcade-tabs.ts`), never from a component file.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const ROUTES = join(ROOT, 'app', 'routes');

/**
 * The shell-wide sheet, which every page of its layout needs anyway.
 *
 * Only BARE side-effect imports are checked. `import href from '….css?url'` is
 * the other, correct pattern — the route puts that URL in its own `head()`
 * links, so the sheet is per-route by construction (the games and full-screen
 * apps all do this, and `__root.tsx` loads `globals.css` the same way).
 */
const ALLOWED = new Map<string, string>([['app/routes/_site.tsx', '@/components/feed/feed.css']]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx|ts)$/.test(name)) out.push(p);
  }
  return out;
}

describe('route files do not import stylesheets', () => {
  it('only the shell-wide sheets are imported at a route file’s top level', () => {
    const offenders: string[] = [];
    for (const file of walk(ROUTES)) {
      const rel = relative(ROOT, file);
      const src = readFileSync(file, 'utf8');
      for (const [, spec] of src.matchAll(/^import\s+['"]([^'"]+\.css)['"]/gm)) {
        if (ALLOWED.get(rel) === spec) continue;
        offenders.push(`${rel} → ${spec}`);
      }
    }
    expect(
      offenders,
      'a top-level CSS import in a route file lands in the entry stylesheet of EVERY page — import it from the component that uses it',
    ).toEqual([]);
  });
});
