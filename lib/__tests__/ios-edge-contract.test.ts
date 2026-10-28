/**
 * The iOS edge contract: nothing on the site may be painted at a screen edge as a fixed or sticky layer, or the coloured
 * bands behind Safari's status bar and floating tab bar come back.
 *
 * Why (app/globals.css "iOS 26 Safari tints the strips…", app/routes/__root.tsx "Why theme-color is not set on iOS"):
 * Safari fills those strips from `position: fixed` / sticky layers it finds at an edge, reads a layer with its own paint
 * as one flat colour, and shows it as an opaque band over the content scrolling under it. Transparency,
 * `pointer-events: none`, transforms and `backdrop-filter` do not opt a layer out. The contract that keeps the bands away
 * lived only in comments; this file is where it is enforced.
 *
 *  1. INVARIANTS: the pieces the contract is made of still exist (viewport-fit=cover, no theme-color on iOS in any of its
 *     three writers, the fixed decoration hidden on iOS, the root carrying the canvas, the top capsule floating).
 *  2. RATCHET: a site-tier rule or class that pins a fixed/sticky layer flush to the top or bottom edge is counted per
 *     file and frozen in `ios-edge.baseline.json`. A new one fails ("float it off the edge, or hide it on
 *     `html.ios-webkit`, then…"); a file UNDER its frozen count also fails ("lower it"), so the list only goes down.
 *
 *       IOS_EDGE_BASELINE=lower pnpm exec vitest run lib/__tests__/ios-edge-contract.test.ts
 *       IOS_EDGE_BASELINE=freeze …   (rewrites the whole file from the current tree; initial adoption only)
 *
 * The runtime counterpart, which finds what static scanning cannot see, is `pnpm audit:pages --edges`.
 */
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const BASELINE_PATH = join(__dirname, 'ios-edge.baseline.json');

// ── 1. Invariants ──────────────────────────────────────────────────────────────────────────────────────────────

describe('iOS edge contract: invariants', () => {
  const root = read('app/routes/__root.tsx');
  const globals = read('app/globals.css');
  const radial = read('components/radial/radial.css');
  const theme = read('stores/themeStore.ts');

  it('the page paints edge to edge (viewport-fit=cover), so the bars show the page, not a gutter', () => {
    expect(root.match(/viewport-fit=cover/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('theme-color is never written on iOS: the pre-paint script and the runtime both skip ios-webkit', () => {
    // A theme-color is one flat colour, which is exactly the band. Pre-paint:
    expect(root).toContain(
      `if(!document.documentElement.classList.contains("ios-webkit")){var t=document.querySelector('meta[name="theme-color"][data-rmh-theme]')`,
    );
    // Runtime (paintDocumentGround): on iOS it removes our tag instead of mirroring the background into it.
    expect(theme).toMatch(
      /if \(html\.classList\.contains\('ios-webkit'\)\) \{\s*marked\?\.remove\(\);/,
    );
  });

  it('the full-viewport fixed decoration is not rendered on iOS WebKit', () => {
    expect(globals).toMatch(
      /html\.ios-webkit :is\(\.site-aurora, \.radial-backdrop, \.jelly-arc-layer\) \{\s*display: none;/,
    );
  });

  it('the ROOT carries the page canvas on iOS (the bars tint from it), not a fixed layer', () => {
    expect(globals).toMatch(
      /html\.ios-webkit:not\(\.app-route\) \{\s*background-image: var\(--site-canvas\);/,
    );
  });

  it('the top capsule floats clear of the edge (a flush sticky bar is what Safari tints from)', () => {
    const m = /\.radial-topbar \{[^}]*?\btop:\s*([\d.]+)rem/.exec(radial);
    expect(m, '.radial-topbar declares a rem offset from the top').toBeTruthy();
    expect(Number(m![1])).toBeGreaterThanOrEqual(0.5);
  });
});

describe('iOS edge contract: the scanner', () => {
  it('flags a fixed layer flush to an edge, and a sticky bar pinned to one', () => {
    expect(cssFindings('.a { position: fixed; inset: 0; }')).toEqual(['.a']);
    expect(cssFindings('.b { position: sticky; top: 0; }')).toEqual(['.b']);
    expect(cssFindings('.c { position: fixed; bottom: 0; left: 0; right: 0; }')).toEqual(['.c']);
  });
  it('does not flag a layer floated off the edge, or an in-flow one', () => {
    expect(cssFindings('.a { position: sticky; top: 0.75rem; }')).toEqual([]);
    expect(cssFindings('.a { position: fixed; inset: 0.75rem 0; }')).toEqual([]);
    expect(cssFindings('.a { position: relative; top: 0; }')).toEqual([]);
  });
  it('exempts a layer that html.ios-webkit does not render at all', () => {
    const css = '.deco { position: fixed; inset: 0; } html.ios-webkit .deco { display: none; }';
    expect(cssFindings(css, hiddenOnIos(css))).toEqual([]);
    expect(cssFindings('.deco { position: fixed; inset: 0; }', hiddenOnIos(''))).toEqual(['.deco']);
  });
  it('counts a Tailwind fixed/sticky with a flush edge token, not a floated one', () => {
    expect(twFindings('<div className="fixed inset-0 z-50" />')).toBe(1);
    expect(twFindings('<div className="sticky top-0" />')).toBe(1);
    expect(twFindings('<div className="fixed top-3 left-3" />')).toBe(0);
    expect(twFindings('<div className="inset-0 absolute" />')).toBe(0);
  });
});

// ── 2. The ratchet ─────────────────────────────────────────────────────────────────────────────────────────────

const fullscreenDirs = (() => {
  const src = read('lib/__tests__/design-consistency.test.ts');
  const start = src.indexOf('const FULLSCREEN_TIER_DIRS = new Set([');
  return new Set(
    [...src.slice(start, src.indexOf(']);', start)).matchAll(/^\s*'([a-z0-9-]+)'/gm)].map(
      (m) => m[1],
    ),
  );
})();

/** Site tier = not a full-screen game/app directory, not the app-tier shared kit, not a test. */
const inSiteTier = (rel: string) => {
  if (/__tests__|\.test\./.test(rel)) return false;
  if (rel.startsWith('components/')) {
    const dir = rel.split('/')[1];
    return !fullscreenDirs.has(dir) && dir !== 'shared';
  }
  return true;
};

function walk(dir: string, exts: RegExp, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, exts, out);
    else if (exts.test(name)) out.push(p);
  }
  return out;
}

const EDGE_ZERO = /^(0|0px|0rem|calc\(0.*\))$/;
const EDGE_PROPS = new Set(['top', 'bottom', 'inset-block-start', 'inset-block-end']);

/** Classes that `html.ios-webkit … { display: none }` removes from iOS: those layers can never tint a bar there. */
function hiddenOnIos(css: string): Set<string> {
  const hidden = new Set<string>();
  postcss.parse(css).walkRules((rule) => {
    if (!/^html\.ios-webkit\b/.test(rule.selector.trim())) return;
    let none = false;
    rule.walkDecls('display', (d) => {
      if (d.value.trim().replace(/\s*!important$/, '') === 'none') none = true;
    });
    if (!none) return;
    // The classes of the LAST compound of each selector (what the rule hides), looking inside `:is()` / `:where()`.
    selectorParser((root) => {
      root.each((sel) => {
        const last: selectorParser.Node[] = [];
        for (const n of sel.nodes) {
          if (n.type === 'combinator') last.length = 0;
          else last.push(n);
        }
        const take = (nodes: selectorParser.Node[]) => {
          for (const n of nodes) {
            if (n.type === 'class') hidden.add(n.value);
            else if (n.type === 'pseudo') n.each((inner) => take(inner.nodes));
          }
        };
        take(last);
      });
    }).processSync(rule.selector);
  });
  return hidden;
}

/** A fixed/sticky rule pinned flush to the top or bottom: a `top`/`bottom` of 0 (or `inset: 0…`). */
function cssFindings(css: string, hidden: Set<string> = new Set()): string[] {
  const found: string[] = [];
  postcss.parse(css).walkRules((rule) => {
    let pos = '';
    let edge = false;
    rule.walkDecls((d) => {
      const v = d.value.trim();
      if (d.prop === 'position' && /^(fixed|sticky)$/.test(v)) pos = v;
      if (EDGE_PROPS.has(d.prop) && EDGE_ZERO.test(v)) edge = true;
      if (d.prop === 'inset' && /^0(px|rem)?(\s+0(px|rem)?)*$/.test(v)) edge = true;
    });
    if (!pos || !edge) return;
    // Exempt when every selector of the rule is a class that iOS does not render at all.
    const classesOf = (sel: string) =>
      [
        ...sel
          .trim()
          .split(/\s+/)
          .pop()!
          .matchAll(/\.([A-Za-z0-9_-]+)/g),
      ].map((m) => m[1]);
    if (rule.selectors.every((sel) => classesOf(sel).some((c) => hidden.has(c)))) return;
    found.push(rule.selector.replace(/\s+/g, ' ').trim());
  });
  return found;
}

/** Tailwind: `fixed`/`sticky` with a flush edge token in the same class string. */
const TW_POS = /(?:^|[\s'"`])(fixed|sticky)(?=[\s'"`])/;
const TW_EDGE = /(?:^|[\s'"`])(?:top-0|bottom-0|inset-0|inset-y-0|inset-b-0|inset-t-0)(?=[\s'"`])/;
function twFindings(src: string): number {
  let n = 0;
  for (const m of src.matchAll(/(["'`])((?:(?!\1)[^\n\\])*)\1/g)) {
    const s = ` ${m[2]} `;
    if (TW_POS.test(s) && TW_EDGE.test(s)) n++;
  }
  return n;
}

function measure(): Record<string, number> {
  const counts: Record<string, number> = {};
  const cssFiles = [
    ...walk(join(ROOT, 'app'), /\.css$/),
    ...walk(join(ROOT, 'components'), /\.css$/),
  ].filter((abs) => inSiteTier(relative(ROOT, abs).replaceAll('\\', '/')));
  const hidden = new Set<string>();
  for (const abs of cssFiles) for (const c of hiddenOnIos(readFileSync(abs, 'utf8'))) hidden.add(c);
  const add = (rel: string, n: number) => {
    if (n > 0) counts[rel] = n;
  };
  for (const abs of cssFiles) {
    add(relative(ROOT, abs).replaceAll('\\', '/'), cssFindings(readFileSync(abs, 'utf8'), hidden).length);
  }
  for (const abs of [
    ...walk(join(ROOT, 'components'), /\.tsx$/),
    ...walk(join(ROOT, 'app/routes/_site'), /\.tsx$/),
    ...walk(join(ROOT, 'app/routes'), /^(__root|_site)\.tsx$/),
  ]) {
    const rel = relative(ROOT, abs).replaceAll('\\', '/');
    if (!inSiteTier(rel)) continue;
    add(rel, twFindings(readFileSync(abs, 'utf8')));
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

describe('iOS edge contract: no new fixed/sticky layer pinned flush to an edge (ratchet)', () => {
  const now = measure();
  const mode = process.env.IOS_EDGE_BASELINE;

  if (mode === 'freeze') {
    writeFileSync(BASELINE_PATH, JSON.stringify(now, null, 2) + '\n');
  }
  const frozen: Record<string, number> = existsSync(BASELINE_PATH)
    ? JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
    : {};
  if (mode === 'lower') {
    const lowered = { ...frozen };
    for (const [f, n] of Object.entries(frozen)) {
      const cur = now[f] ?? 0;
      if (cur < n) {
        if (cur === 0) delete lowered[f];
        else lowered[f] = cur;
      }
    }
    writeFileSync(BASELINE_PATH, JSON.stringify(lowered, null, 2) + '\n');
    Object.assign(frozen, lowered);
    for (const f of Object.keys(frozen)) if (!(f in lowered)) delete frozen[f];
  }

  it('has a baseline (run with IOS_EDGE_BASELINE=freeze once)', () => {
    expect(existsSync(BASELINE_PATH)).toBe(true);
  });

  it('introduces no new edge-pinned layer', () => {
    const over = Object.entries(now)
      .filter(([f, n]) => n > (frozen[f] ?? 0))
      .map(([f, n]) => `${f}: ${n} edge-pinned fixed/sticky layer(s), baseline ${frozen[f] ?? 0}`);
    expect(
      over,
      'A fixed or sticky layer flush to the top/bottom edge makes iOS 26 Safari fill the strip behind its bars with a ' +
        'flat band. Float it off the edge (see `.radial-topbar`: top 0.75rem), hide it on `html.ios-webkit`, or make ' +
        'it an in-flow element. If it is genuinely an overlay that only exists while open, say so and have the owner ' +
        'review the baseline bump.',
    ).toEqual([]);
  });

  it('is lowered when a file got cleaner (the list only goes down)', () => {
    const stale = Object.entries(frozen)
      .filter(([f, n]) => (now[f] ?? 0) < n)
      .map(([f, n]) => `${f}: now ${now[f] ?? 0}, frozen ${n}`);
    expect(
      stale,
      'Good: fewer edge-pinned layers than the baseline. Lower it: ' +
        'IOS_EDGE_BASELINE=lower pnpm exec vitest run lib/__tests__/ios-edge-contract.test.ts',
    ).toEqual([]);
  });
});
