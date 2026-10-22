/**
 * The site backdrop is STATIC — on every tier, at every width.
 *
 * ## Why this is a gate
 *
 * The shared backdrop behind every `_site` page — the two aurora layers
 * (`.site-aurora::before/::after`, app/globals.css), the concentric rings and
 * the blob field (`.radial-backdrop__*`, components/radial/radial.css) — used to
 * animate forever: an aurora drift, a ring "breathe", a blob drift. Each was
 * individually justified as "transform-only, runs on the compositor, costs the
 * main thread nothing", and each claim was true. What none of them accounted
 * for is that a page with even ONE perpetual animation never goes idle: the
 * compositor produces a new full-viewport frame on every vsync for as long as
 * the tab is open. On a 144Hz panel that is 144 composites a second of
 * decoration nobody is looking at, 240 on a 240Hz one, and it competes with
 * the scroll and interaction frames those displays exist to show.
 *
 * Measured 2026-10-08 on `/`, 1920×1080, vsync-capped headless Chromium:
 * ~1020ms of browser CPU per second at rest and 16.7fps with the motion;
 * 63ms/s and a locked 60fps without it. Removing `backdrop-filter` instead
 * changed nothing — the animated layers were the cost, not the blur.
 * (Full table: the note above `.radial-backdrop__field` in radial.css, and
 * docs/performance-audit-2026-10-08.md.)
 *
 * Handhelds already had this motion switched off; the fix made desktop match.
 * This gate holds the line in both stylesheets, because a single "subtle"
 * infinite keyframe on any backdrop layer reintroduces the whole cost.
 *
 * ## What is still allowed
 *
 * `translate` + `transition` on the aurora layers — that is the opt-in device
 * tilt parallax, written per input EVENT by `hooks/useLiquidBackground.ts`, not
 * per frame, and it settles. `animation: none` declarations are fine (they are
 * the degradation tiers). One-shot animations on `.glass-liquid::after` are
 * fine; `infinite` is not.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

const GLOBALS = read('app/globals.css');
const RADIAL = read('components/radial/radial.css');

/** Innermost `selector { declarations }` pairs — nested @media/@layer bodies match at their leaves. */
function rules(css: string): Array<{ selector: string; body: string }> {
  const out: Array<{ selector: string; body: string }> = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    out.push({ selector: m[1].trim(), body: m[2] });
  }
  return out;
}

/** Every `animation` / `animation-name` value in a declaration block. */
function animations(body: string): string[] {
  return [...body.matchAll(/(?:^|;|\s)animation(?:-name)?\s*:\s*([^;]+)/g)].map((m) => m[1].trim());
}

const BACKDROP_SELECTOR = /\.site-aurora|\.radial-backdrop/;

describe('no backdrop layer animates', () => {
  it.each([
    ['app/globals.css', GLOBALS],
    ['components/radial/radial.css', RADIAL],
  ])('%s declares no running animation on a backdrop selector', (_file, css) => {
    const offenders: string[] = [];
    for (const { selector, body } of rules(css)) {
      if (!BACKDROP_SELECTOR.test(selector)) continue;
      for (const value of animations(body)) {
        if (/^none(\s*!important)?$/.test(value)) continue;
        offenders.push(`${selector} { animation: ${value} }`);
      }
    }
    expect(offenders, 'a backdrop layer animates — the page will never go idle').toEqual([]);
  });

  it('holds no permanent compositor hint on a backdrop layer', () => {
    // `will-change: transform` on a layer that no longer moves keeps a
    // viewport-sized (or larger — the aurora is oversized by 14–18%) texture
    // resident for nothing.
    const offenders = [...rules(GLOBALS), ...rules(RADIAL)]
      .filter(({ selector, body }) => BACKDROP_SELECTOR.test(selector) && /will-change\s*:(?!\s*auto)/.test(body))
      .map(({ selector }) => selector);
    expect(offenders).toEqual([]);
  });

  it('the retired keyframes are gone, not just unreferenced', () => {
    for (const name of ['aurora-drift', 'aurora-drift-far', 'radial-breathe', 'radial-blob-drift']) {
      expect(GLOBALS + RADIAL).not.toMatch(new RegExp(`@keyframes\\s+${name}\\b`));
    }
  });
});

describe('the liquid sheen is a single pass', () => {
  it('.glass-liquid::after never loops', () => {
    const sheen = rules(GLOBALS).filter(({ selector }) => /\.glass-liquid::after/.test(selector));
    expect(sheen.length).toBeGreaterThan(0);
    for (const { body } of sheen) {
      for (const value of animations(body)) expect(value).not.toMatch(/\binfinite\b/);
    }
  });
});
