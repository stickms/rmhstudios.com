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
  const start = CSS.indexOf('/* Section 7.3 Eversion');
  const end = CSS.indexOf('/* ─── Scoped shared-element View Transitions', start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  // Rules only: the prose explaining them names the very properties the rules must not animate.
  return CSS.slice(start, end).replace(/\/\*[\s\S]*?\*\//g, '');
})();

const token = (name: string): string => {
  const m = new RegExp(`${name}:\\s*([^;]+);`).exec(SECTION);
  expect(m, `${name} is missing from §7.3`).not.toBeNull();
  return m![1].trim().replace(/\s+/g, ' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')');
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
      // `none` animates nothing: the arming hold of a control adopted on first contact.
      'none',
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

  it('ordinary state layers fade without growing or moving an origin', () => {
    const a = SECTION.indexOf('  [data-evert]::before,');
    const b = SECTION.indexOf('/* Legacy', a);
    const controls = SECTION.slice(a, b < 0 ? SECTION.indexOf("[data-slot='button']", a) : b);
    expect(controls).toContain('transition: opacity var(--site-transition-speed)');
    expect(controls).not.toMatch(/scale:|transform-origin:|clip-path:/);
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

  it('both system and account motion preferences stop decorative transitions', () => {
    expect(CSS).toMatch(
      /html\.reduce-motion \*,\s*html\.reduce-motion \*::before,\s*html\.reduce-motion \*::after\s*\{[^}]*transition-duration: 0\.01ms !important/,
    );
    expect(CSS).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\*,\s*\*::before,\s*\*::after/,
    );
  });
});

describe('ordinary controls keep immediate feedback', () => {
  const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
  it('does not install the retired control eversion listener or mini globe renderer', () => {
    expect(read('components/Providers.tsx')).not.toContain('useEvertPointLayer');
    expect(read('components/radial/eversion/EversionRoot.tsx')).not.toContain(
      "import('./mini-globe')",
    );
  });
  it('buttons acknowledge hover and press without replacing the surface', () => {
    const button = read('components/ui/button.tsx');
    expect(button).toContain('hover:bg-site-surface-hover');
    expect(button).toContain('data-fluid-press');
    expect(button).not.toContain('data-evert=');
  });
});
