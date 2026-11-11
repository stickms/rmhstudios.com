/**
 * Every `@keyframes` in the site and app tier is on a named list (redesign E4).
 *
 * Steel R5 and M6: nothing moves at rest and nothing else animates. The Plasmatic Jelly material's one keyframe
 * (`jelly-drift`) went with the material. Everything here is a pre-existing animation that has an owner — a spinner, a
 * skeleton, a live dot, a one-shot route/enter effect — and is listed with the reason it exists. A new
 * `@keyframes` therefore has to be added to {@link SANCTIONED} on purpose, in the diff, with a reason.
 *
 * One-directional like the other ratchets: an entry whose `@keyframes` is gone fails
 * ("the list stays honest"), so the list can only shrink or be added to deliberately. Many of these are
 * candidates for conversion to a CSS transition with `@starting-style` (enters/exits) — see
 * docs/plans/2026-11-09-ground-up-redesign-audit.md E4 ledger.
 *
 * Scope: `siteAppCssFiles()` (lib/__tests__/css-tiers.ts) — site-tier and app-tier stylesheets; the games and
 * standalone arms that keep their own scheme (and their own keyframes) are skipped.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { siteAppCssFiles } from './css-tiers';

const ROOT = process.cwd();

/** keyframe name -> why it exists (owner). */
export const SANCTIONED: Record<string, string> = {
  // --- the material -------------------------------------------------------------------------------

  // --- app/globals.css: site-wide ---------------------------------------------------------------
  'page-enter': 'route content enter (.page-root); suppressed on history POP by html.nav-pop',
  'content-item-enter': 'staggered enter of feed/list items (.content-item)',
  'motion-presence': 'no-op presence animation so Radix keeps a [data-motion] node until its exit transition ends',
  'u-reveal-in': 'scroll-driven reveal (animation-timeline: view()) for .u-reveal',
  'u-parallax-view': 'scroll-driven parallax (animation-timeline: view()) for .u-parallax',
  'vinyl-spin': 'feed VinylRecord while playing (components/feed/VinylRecord.tsx)',
  'doctrine-shake': 'doctrine page: 0.15s error shake',
  // Game / arm effects whose classes live in the global sheet (owner is the game, not the site):
  'rainbow-shift': 'signal-forge title (.rainbow-text)',
  glitch: 'signal-forge title (.glitch-text)',
  'dr-rise': 'dream-rift menu rise (game)',
  'dr-float': 'dream-rift menu float (game)',
  'dr-title-glow': 'dream-rift title glow (game)',

  // --- components/ui ----------------------------------------------------------------------------
  'ui-sheet-presence': 'no-op presence animation so Radix keeps a Sheet mounted through its exit transition',
  'ui-dialog-presence': 'no-op presence animation so Radix keeps a Dialog mounted through its exit transition',

  // --- components/radial: the globe shell -------------------------------------------------------
  'dock-globe-shimmer': 'globe dock shimmer',
  'dock-globe-glint': 'globe dock glint',
  'rad-live-reveal': 'radial live-region reveal',
  'rmh-logo-bloom': 'RMH logo intro bloom',
  'rmh-logo-draw': 'RMH logo intro stroke draw',
  'globe-in': 'globe menu open',
  'globe-out': 'globe menu close',
  'globe-pin-in': 'globe pin enter',
  'globe-current-halo': 'globe current-page halo',
  'globe-armed': 'globe armed (long-press) state',
  'globe-swell': 'eversion hand-over: hub globe swells',
  'globe-dissolve': 'eversion hand-over: hub globe dissolves',
  'radial-pulse-soft': 'radial soft pulse (live dot)',
  'radial-page-rise': 'radial page rise after eversion',
  'evert-popup-in': 'eversion popup enter',
  'evert-popup-turn': 'eversion popup slow turn',
  'evert-popup-swell': 'eversion popup hand-over swell',
  'evert-popup-dissolve': 'eversion popup hand-over dissolve',
  'evert-popup-out': 'eversion popup exit',

  // --- feature pages (site tier) ----------------------------------------------------------------
  'lib-rise': 'library card rise',
  'lib-spin': 'library spinner',
  'lib-details-in': 'library details enter',
  'sec-fade-down': 'security page banner enter',
  'kd-aura-spin': 'kaikai-debt aura',
  'kd-aura-spin-reverse': 'kaikai-debt aura (counter-rotating)',
  'kd-globe-turn': 'kaikai-debt globe',
  'kd-sweep-1': 'kaikai-debt sweep',
  'kd-sweep-2': 'kaikai-debt sweep',
  'kd-flash-in': 'kaikai-debt flash',
  'rmhcalc-pulse': 'RMHCalculator live indicator',
  'store-rise': 'creator storefront card rise',
  'feed-live-pulse': 'feed "live" dot',
  'rmht-rise': 'RMHTech rise',
  'rmht-spin': 'RMHTech spin',
  'rmht-glow': 'RMHTech glow',
  'rmht-fade': 'RMHTech fade',
  'rmht-cue': 'RMHTech scroll cue',
  'rmht-metalflow': 'RMHTech metal flow',
  'rmht-metalblob': 'RMHTech metal blob',
  'rmht-metalsheen': 'RMHTech metal sheen',

  // --- app tier ---------------------------------------------------------------------------------
  'app-toast-in': 'app tier toast enter',
  'app-toast-out': 'app tier toast exit',
  'app-fade-in': 'app tier fade-in',
  'app-slide-up': 'app tier slide-up',
  'app-sheet-up': 'app tier bottom sheet enter',
  'app-skeleton-pulse': 'app tier skeleton pulse',
  'app-spin': 'app tier <Spinner>',
  'vibe-rise': 'RMHVibe rise',
  'vibe-rise-soft': 'RMHVibe soft rise',
  'vibe-spin': 'RMHVibe spinner',
  'vibe-pulse': 'RMHVibe pulse',
  'rmhtype-blink': 'RMHType caret blink',
  'rmhtube-reaction-float': 'RMHTube floating reaction',
};

const FILES = siteAppCssFiles();

const found = new Map<string, string[]>();
for (const f of FILES) {
  const css = readFileSync(join(ROOT, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of css.matchAll(/@keyframes\s+([\w-]+)/g)) {
    const name = m[1] as string;
    found.set(name, [...(found.get(name) ?? []), f]);
  }
}

describe('@keyframes are sanctioned (site + app tier)', () => {
  it('scans real stylesheets', () => {
    expect(FILES).toContain('app/globals.css');
    expect(FILES).toContain('components/shared/app-theme.css');
    expect(FILES).not.toContain('components/temple-of-joy/temple-of-joy.css');
  });

  it('every @keyframes name is on the SANCTIONED list', () => {
    const unknown = [...found].filter(([n]) => !(n in SANCTIONED)).map(([n, f]) => `${n} (${f.join(', ')})`);
    expect(
      unknown,
      'New @keyframes: prefer a CSS transition with @starting-style (CLAUDE.md "Never fake a law"). If a keyframe is truly needed, add it to SANCTIONED in lib/__tests__/keyframes-sanctioned.test.ts with a reason.',
    ).toEqual([]);
  });

  it('the list stays honest: every entry still has a @keyframes', () => {
    const stale = Object.keys(SANCTIONED).filter((n) => !found.has(n));
    expect(stale, 'Delete these entries; their @keyframes are gone.').toEqual([]);
  });

  it('each entry states a reason', () => {
    for (const [n, why] of Object.entries(SANCTIONED)) expect(why.length, n).toBeGreaterThan(8);
  });
});
