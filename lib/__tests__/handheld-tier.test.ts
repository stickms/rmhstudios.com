/**
 * The handheld tier — one media query, three files, no drift.
 *
 * ## What this tier is, and why it needed to exist
 *
 * The site had a device axis that did not cover phones (the old low-end class,
 * since removed: no iPhone ever reached it, and its Android thresholds were also
 * cleared by any current mid-range Android):
 *
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
import { join } from 'node:path';
import { readCss } from './css-source';

const ROOT = join(__dirname, '..', '..');
const read = (path: string) => readCss(join(ROOT, path));

/**
 * The one query. Deliberately `(pointer: coarse)` AND a width bound rather than
 * width alone: a desktop browser resized narrow is still a desktop and keeps
 * the full effect, and a coarse-pointer kiosk or TV above 1024px is not
 * thermally limited in the way this tier assumes.
 */
const HANDHELD_QUERY = '(pointer: coarse) and (max-width: 1024px)';

const GLOBALS = read('app/globals.css');
const HOOK = read('hooks/useLiquidBackground.ts');
/** The paper backdrop halves its frame rate on the same device class, so it carries this same query. */
const PAPER = read('components/rmhmusic/learn/PaperBackdrop.tsx');
describe('the handheld query is identical everywhere it appears', () => {
  it.each([
    ['hooks/useLiquidBackground.ts', HOOK],
    ['components/rmhmusic/learn/PaperBackdrop.tsx', PAPER],
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
    for (const source of [GLOBALS]) {
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
    // Every string literal that looks like a width-bounded coarse query is judged, not only `matchMedia(...)` arguments.
    for (const [, query] of PAPER.matchAll(/['"`]([^'"`\n]*pointer:\s*coarse[^'"`\n]*)['"`]/g)) {
      if (!/max-width/.test(query)) continue;
      expect(query.replace(/\s+/g, ' ').trim()).toBe(HANDHELD_QUERY);
    }
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
