/**
 * The eversion state layer (globals.css §7.3) runs on two SAMPLED SPRINGS, and this is what keeps the sample tied
 * to the physics it was taken from — the same job `motion-pop-spring.test.ts` does for the menu open.
 *
 * `--evert-ease` and `--evert-ease-pop` are CSS `linear()` easings baked from `spring()` in `lib/fluid.ts`, and
 * `--evert-in` / `--evert-pop-in` are how long each runs (the spring's settle time). Baked numbers in a stylesheet
 * look like magic numbers to whoever tidies them next; this re-derives them and fails if the two disagree.
 *
 * It also holds the layer to the motion costs the design language is built on (design.md §4): it animates
 * `clip-path`, `opacity`, `transform`/`translate` and two colours on control-sized boxes, never a shadow, a layout
 * property or a filter; a hover is only ever a fine pointer's, so a phone never shows a sticky one; and the
 * degradation tiers stand it down centrally.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  spring,
  springLinearEasing,
  springResponse,
  springSettleTime,
  springStep,
} from '@/lib/fluid';

const ROOT = join(__dirname, '..', '..');
const CSS = readFileSync(join(ROOT, 'app', 'globals.css'), 'utf8');
const SECTION = (() => {
  const start = CSS.indexOf('/* ─── §7.3 Eversion');
  const end = CSS.indexOf('/* ─── Scoped shared-element View Transitions', start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  // Rules only: the prose explaining them names the very properties the rules must not animate.
  return CSS.slice(start, end).replace(/\/\*[\s\S]*?\*\//g, '');
})();

const token = (name: string): string => {
  const m = new RegExp(`${name}:\\s*([^;]+);`).exec(SECTION);
  expect(m, `${name} is missing from §7.3`).not.toBeNull();
  return m![1].trim();
};

const SPRINGS = [
  { ease: '--evert-ease', time: '--evert-in', duration: 0.3, bounce: 0.15 },
  { ease: '--evert-ease-pop', time: '--evert-pop-in', duration: 0.32, bounce: 0.3 },
] as const;

describe('§7.3 — the eversion is the site’s own spring, sampled', () => {
  it.each(SPRINGS)('$ease is spring($duration, $bounce) as linear(), over its settle time', (t) => {
    const s = spring(t.duration, t.bounce);
    const settle = springSettleTime(s);
    expect(token(t.time)).toBe(`${settle}s`);
    expect(token(t.ease)).toBe(springLinearEasing(s, settle));
  });

  it('the closed-form response is the integrator’s', () => {
    const s = spring(0.3, 0.15);
    let state = { value: 0, velocity: 0 };
    const dt = 1 / 240;
    for (let i = 1; i <= 96; i++) {
      state = springStep(state, 1, s, dt);
      expect(springResponse(s, i * dt)).toBeCloseTo(state.value, 6);
    }
  });

  it('the surface spring barely overshoots; the landing spring visibly snaps', () => {
    const peak = (d: number, b: number) => {
      let p = 0;
      for (let t = 0; t < 1; t += 0.0005) p = Math.max(p, springResponse(spring(d, b), t));
      return p;
    };
    expect(peak(0.3, 0.15)).toBeLessThan(1.01);
    expect(peak(0.32, 0.3)).toBeGreaterThan(1.03);
    expect(peak(0.32, 0.3)).toBeLessThan(1.06);
  });
});

describe('§7.3 — the layer costs what the design language allows', () => {
  it('transitions only compositor-cheap properties on control-sized boxes', () => {
    const allowed = new Set([
      'clip-path',
      'opacity',
      'transform',
      'translate',
      'scale',
      'border-color',
      'background-color',
    ]);
    const decls = SECTION.match(/transition:[^;]+;/g) ?? [];
    expect(decls.length).toBeGreaterThan(4);
    for (const decl of decls) {
      for (const part of decl.replace(/^transition:/, '').split(',')) {
        const prop = part.trim().split(/\s+/)[0]!;
        expect(allowed.has(prop), `${decl.trim()} animates ${prop}`).toBe(true);
      }
    }
    expect(SECTION).not.toMatch(
      /transition[^;]*\b(box-shadow|width|height|filter|background-position|all)\b/,
    );
  });

  it('the layers on controls that can navigate run on the compositor, not the main thread', () => {
    // A press that navigates starts the route's render on the main thread; a main-thread animation (clip-path)
    // stood still for ~630 ms after the click, until the new page had painted. `scale` keeps moving through it.
    const rule = (sel: string) => {
      const i = SECTION.indexOf(`${sel} {`);
      expect(i, sel).toBeGreaterThan(-1);
      return SECTION.slice(i, SECTION.indexOf('}', i));
    };
    for (const sel of ['[data-evert]::before', "[data-evert~='select']::after"]) {
      const body = rule(sel);
      expect(body, sel).toMatch(/scale: 0;/);
      expect(body, sel).toMatch(/transform-origin: var\(--evert-x, 50%\) var\(--evert-y, 50%\)/);
      expect(body, sel).toMatch(/transition:\s*scale var\(--evert-in\)/);
      expect(body, sel).not.toMatch(/clip-path/);
    }
  });

  it('hover only ever comes from a fine pointer', () => {
    const hoverRules = SECTION.match(/[^{}]*:hover[^{]*\{/g) ?? [];
    expect(hoverRules.length).toBeGreaterThan(0);
    const fine = SECTION.indexOf('@media (hover: hover) and (pointer: fine)');
    expect(fine).toBeGreaterThan(-1);
    for (const rule of hoverRules) expect(SECTION.indexOf(rule)).toBeGreaterThan(fine);
  });

  it('perf-lite swaps the springs for a tween, and forced colors drop the layer', () => {
    expect(SECTION).toMatch(/html\.perf-lite\s*\{[^}]*--evert-ease:\s*cubic-bezier/);
    expect(SECTION).toMatch(/@media \(forced-colors: active\)\s*\{[^}]*\[data-evert\]::before/);
  });

  it('only the site’s own Reduce motion switch stands the layer down; the OS preference does not', () => {
    // Owner, 2026-10-21: "it should always play by default". The account switch's reset reaches every pseudo-element…
    expect(CSS).toMatch(
      /html\.reduce-motion \*,\s*html\.reduce-motion \*::before,\s*html\.reduce-motion \*::after\s*\{[^}]*transition-duration: 0\.01ms !important/,
    );
    // …and the OS-wide reset spares the eversion's layers, the pop-up globe, the hub and the run's overlay.
    const os = CSS.slice(CSS.indexOf('@media (prefers-reduced-motion: reduce) {\n  :not('));
    const head = os.slice(0, os.indexOf('{', os.indexOf(')::after')));
    for (const spared of [
      '[data-evert]',
      '.evert-ghost',
      '.evert-popup',
      '.eversion-overlay',
      '.radial-hub',
    ]) {
      expect(head, spared).toContain(spared);
    }
  });
});

describe('§7.3 — the shared controls carry the layer', () => {
  const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

  it.each([
    ['components/ui/button.tsx', 'data-evert'],
    ['components/ui/liquid-tabs.tsx', 'data-evert'],
    ['components/ui/menu.tsx', "'data-evert'"],
    ['components/ui/select.tsx', 'data-evert'],
    ['components/ui/switch.tsx', 'data-switch-knob'],
    // The navigation chrome, and the cards you press to go somewhere (owner, 2026-10-20: "I don't see any
    // animations when I press non globe buttons to navigate").
    ['components/radial/RadialNavRail.tsx', 'data-evert="select"'],
    ['components/radial/RadialShell.tsx', 'data-evert'],
    ['components/radial/RadialFeed.tsx', 'data-evert'],
    ['components/radial/WheelCard.tsx', 'data-evert'],
    ['components/creator-studio/storefront.tsx', "'data-evert': 'over'"],
    ['components/creator-studio/RankedSummary.tsx', 'data-evert'],
  ])('%s', (file, hook) => {
    expect(read(file)).toContain(hook);
  });

  it('their hover fills arrive by eversion, not as colour changes on the control', () => {
    expect(read('components/ui/button.tsx')).not.toMatch(/hover:bg-|hover:opacity-/);
    expect(read('components/ui/menu.tsx')).not.toMatch(/hover:bg-|focus-visible:bg-/);
    expect(read('components/ui/select.tsx')).not.toMatch(/data-\[highlighted\]:bg-/);
  });

  it('the point is written by one delegated listener, mounted once', () => {
    expect(read('components/Providers.tsx')).toMatch(/useEvertPointLayer\(\);/);
    const hook = read('hooks/useEvertPoint.ts');
    expect(hook).not.toMatch(/requestAnimationFrame|documentElement\.style/);
  });
});
