/**
 * The handheld tier — one media query, four files, no drift.
 *
 * ## What this tier is, and why it needed to exist
 *
 * The site had two device axes and neither covered phones:
 *
 *   `html.perf-lite`   "this machine is weak". `lib/perf-tier.ts` documents
 *                      that NO iPhone ever reaches it, and its Android
 *                      thresholds (`deviceMemory < 4`, `cores <= 2`) are also
 *                      cleared by any current mid-range Android.
 *   `html.ios-webkit`  "this compositor behaves differently". Froze the aurora
 *                      — but only on iOS. Android Chrome ran the full animated
 *                      backdrop with no equivalent.
 *
 * So the fact that is true of *every* handheld — 2–3× device pixel ratio, a
 * thermal ceiling, battery power — had no expression at all, and phones paid
 * for a `position: fixed` full-viewport gradient running two infinite transform
 * animations underneath ~46 `backdrop-filter` surfaces. A moving backdrop
 * invalidates every one of those blur regions every frame.
 *
 * ## Why a test and not just a comment
 *
 * The tier is enforced in CSS (which stops reading the offsets) and in JS
 * (which stops computing them), in three files that cannot import from each
 * other. Those two halves are one contract:
 *
 *   - JS query NARROWER than CSS → the hook computes offsets, writes them every
 *     frame, and CSS ignores them. Pure waste, invisible in review, on the
 *     devices least able to spare a frame.
 *   - JS query WIDER than CSS → the hook detaches on devices whose stylesheet
 *     still animates the aurora, and the parallax silently stops working.
 *
 * Neither shows up as a failing render, which is why it is pinned here.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

/**
 * The one query. Deliberately `(pointer: coarse)` AND a width bound rather than
 * width alone: a desktop browser resized narrow is still a desktop and keeps
 * the full effect, and a coarse-pointer kiosk or TV above 1024px is not
 * thermally limited in the way this tier assumes.
 */
const HANDHELD_QUERY = '(pointer: coarse) and (max-width: 1024px)';

const GLOBALS = read('app/globals.css');
const RADIAL = read('components/radial/radial.css');
const HOOK = read('hooks/useLiquidBackground.ts');

describe('the handheld query is identical everywhere it appears', () => {
  it.each([
    ['app/globals.css', GLOBALS],
    ['components/radial/radial.css', RADIAL],
    ['hooks/useLiquidBackground.ts', HOOK],
  ])('%s carries the exact query', (_file, source) => {
    expect(source).toContain(HANDHELD_QUERY);
  });

  it('no file has invented a near-miss variant', () => {
    // A second query that is *almost* this one is the drift mode that matters:
    // it looks right in review and silently splits the tier in two.
    //
    // Scoped to real `@media` preludes (`@media … {`) rather than scanning the
    // raw text: both stylesheets discuss `(pointer: coarse)` in prose, and a
    // comment is not a rule.
    for (const source of [GLOBALS, RADIAL]) {
      for (const [, prelude] of source.matchAll(/@media([^{]+)\{/g)) {
        // A prelude can be a comma-separated LIST (`(max-width: 640px),
        // (hover: none) and (pointer: coarse)` — a real rule in globals.css).
        // Each disjunct is its own query and has to be judged on its own, or a
        // legitimate list reads as one malformed query.
        for (const part of prelude.split(',')) {
          const query = part.replace(/\s+/g, ' ').trim();
          // A bare `(pointer: coarse)` — or the negated hover/fine form
          // globals.css uses for the glint — is legitimate and not a claim to
          // be this tier. Only a width-bounded coarse query is.
          if (!/pointer:\s*coarse/.test(query) || !/max-width/.test(query)) continue;
          expect(query).toBe(HANDHELD_QUERY);
        }
      }
    }
    // Same rule for the hook, where the query lives inside `matchMedia(...)`.
    for (const [, query] of HOOK.matchAll(/matchMedia\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      if (!/pointer:\s*coarse/.test(query) || !/max-width/.test(query)) continue;
      expect(query.replace(/\s+/g, ' ').trim()).toBe(HANDHELD_QUERY);
    }
  });
});

describe('the CSS half actually stops the motion', () => {
  /** The handheld block in globals.css, from its query to the matching brace. */
  function handheldBlock(source: string): string {
    const start = source.indexOf(`@media ${HANDHELD_QUERY}`);
    expect(start).toBeGreaterThan(-1);
    let depth = 0;
    for (let i = source.indexOf('{', start); i < source.length; i++) {
      if (source[i] === '{') depth++;
      else if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
    }
    throw new Error('unterminated @media block');
  }

  it('kills the drift animation and the parallax translate on both aurora layers', () => {
    const block = handheldBlock(GLOBALS);
    expect(block).toContain('.site-aurora::before');
    expect(block).toContain('.site-aurora::after');
    // `animation: none` alone is not enough — the pointer/tilt offset rides
    // `translate`, which is a separate channel from the keyframes' `transform`.
    expect(block).toMatch(/animation:\s*none/);
    expect(block).toMatch(/translate:\s*none/);
    // A layer left promoted holds compositor memory for a layer that no longer
    // moves, which on a phone is the cost this tier is trying to give back.
    expect(block).toMatch(/will-change:\s*auto/);
  });

  it('caps blur through the viewport cap, not by overwriting the factor', () => {
    const block = handheldBlock(GLOBALS);
    // Writing --glass-blur-factor here would collide with html.perf-lite, which
    // has higher specificity AND a weaker cap — a weak phone would have ended
    // up with more blur than a strong one. The caps are disjoint properties
    // combined by min() at :root precisely so they compose.
    expect(block).toContain('--glass-blur-cap-viewport');
    expect(block).not.toContain('--glass-blur-factor');
  });

  it(':root combines all three blur inputs with min() so no tier can raise cost', () => {
    const root = GLOBALS.slice(0, GLOBALS.indexOf('@layer components'));
    const factor = root.match(/--glass-blur-factor:\s*min\(([^;]+)\);/s);
    expect(factor).not.toBeNull();
    const inputs = factor![1];
    expect(inputs).toContain('--glass-user-blur');
    expect(inputs).toContain('--glass-blur-cap-tier');
    expect(inputs).toContain('--glass-blur-cap-viewport');
  });

  it('perf-lite declares a cap rather than the derived factor', () => {
    // If this regresses to `--glass-blur-factor`, the viewport cap above stops
    // applying to every device that is BOTH weak and handheld.
    const perfLite = GLOBALS.slice(GLOBALS.indexOf('html.perf-lite {'));
    expect(perfLite.slice(0, 600)).toContain('--glass-blur-cap-tier');
  });

  it('stops the radial rings and blob field on handheld tablets too', () => {
    // The `min-width: 768px` gates in radial.css stop at phones, so a
    // coarse-pointer tablet was running six breathing rings and four drifting
    // blobs full-screen and forever.
    const start = RADIAL.indexOf(`@media ${HANDHELD_QUERY}`);
    expect(start).toBeGreaterThan(-1);
    const block = RADIAL.slice(start, start + 400);
    expect(block).toContain('.radial-backdrop__ring');
    expect(block).toContain('.radial-backdrop__blob');
    expect(block).toMatch(/animation:\s*none/);
  });
});

describe('the JS half bails out before it computes anything', () => {
  it('returns early on the handheld query', () => {
    expect(HOOK).toMatch(
      new RegExp(
        `matchMedia\\(\\s*['"]\\(pointer: coarse\\) and \\(max-width: 1024px\\)['"]\\s*\\)[\\s\\S]{0,40}return`,
      ),
    );
  });

  it('bails before installing any listener or rAF', () => {
    // The guard is worthless if it sits below the subscription it is meant to
    // prevent, so assert on ORDER, not just presence.
    const guard = HOOK.indexOf(HANDHELD_QUERY);
    expect(guard).toBeGreaterThan(-1);
    for (const later of ['addEventListener', 'requestAnimationFrame']) {
      expect(HOOK.indexOf(later)).toBeGreaterThan(guard);
    }
  });
});
