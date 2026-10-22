/**
 * The CSS springs are the site's springs, and the enter/exit pairs are one path.
 *
 * `globals.css` §7.1 carries `--spring-smooth` / `--spring-snappy` /
 * `--spring-sheet`: `linear()` easings that are the step responses of
 * `spring(duration, bounce)` from `lib/fluid.ts` (the function `APPLE_SPRING`
 * and `SPRINGS` are built on), sampled at 41 evenly spaced points from rest to
 * within 0.05% of the target, plus a `--spring-*-duration` that is exactly that
 * settle time. Baked numbers in a stylesheet look like magic numbers and get
 * "tidied"; this re-derives every stop and fails if they drift from the physics.
 *
 * It also holds the two promises the dialog and sheet motion make:
 *  - **one path both ways** — each exit ends on exactly the frame its enter
 *    starts from (they used to disagree, so a dialog arrived from one place and
 *    left for another);
 *  - **readable on the quick clock** — a surface whose travel rides a spring
 *    gets its opacity from a separate short animation, so the spring's long
 *    sub-pixel tail never holds the content back.
 *
 * And the defaults behind Tailwind's bare `transition*` utilities stay pinned to
 * the site's curve and clock rather than falling back to Material's.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { spring, type Spring } from '@/lib/fluid';
import { APPLE_SPRING } from '@/lib/motion';

const ROOT = join(__dirname, '..', '..');
const GLOBALS = readFileSync(join(ROOT, 'app', 'globals.css'), 'utf8');
const DIALOG = readFileSync(join(ROOT, 'components', 'ui', 'dialog.css'), 'utf8');
const SHEET = readFileSync(join(ROOT, 'components', 'ui', 'sheet.css'), 'utf8');

/** Closed-form step response from rest, 0 → 1 (same as motion-pop-spring.test). */
function response(s: Spring, t: number): number {
  const omega = Math.sqrt(s.stiffness / s.mass);
  const zeta = s.damping / (2 * Math.sqrt(s.stiffness * s.mass));
  const x0 = -1;
  if (zeta < 1) {
    const wd = omega * Math.sqrt(1 - zeta * zeta);
    const e = Math.exp(-zeta * omega * t);
    return 1 + e * (x0 * Math.cos(wd * t) + ((zeta * omega * x0) / wd) * Math.sin(wd * t));
  }
  if (zeta === 1) return 1 + Math.exp(-omega * t) * (x0 + omega * x0 * t);
  const r = omega * Math.sqrt(zeta * zeta - 1);
  const r1 = -zeta * omega + r;
  const r2 = -zeta * omega - r;
  const c2 = (-r1 * x0) / (r2 - r1);
  return 1 + (x0 - c2) * Math.exp(r1 * t) + c2 * Math.exp(r2 * t);
}

function cssVar(name: string): string {
  const m = new RegExp(`${name}:\\s*([^;]+);`).exec(GLOBALS);
  expect(m, `${name} is missing from globals.css`).not.toBeNull();
  return m![1].trim();
}

/** The INSIDE of the first `@keyframes <name> { … }` in `css`. */
function keyframes(css: string, name: string, from = 0): string {
  const start = css.indexOf(`@keyframes ${name} {`, from);
  expect(start, `@keyframes ${name} is missing`).toBeGreaterThan(-1);
  const open = css.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i);
  }
  throw new Error(`unterminated @keyframes ${name}`);
}

function transformIn(body: string): string {
  const m = /transform:\s*([^;]+);/.exec(body);
  expect(m, 'keyframe has no transform').not.toBeNull();
  return m![1].replace(/\s+/g, ' ').trim();
}

const SPRINGS: Record<'smooth' | 'snappy' | 'sheet', { duration: number; bounce: number }> = {
  smooth: APPLE_SPRING.smooth,
  snappy: APPLE_SPRING.snappy,
  sheet: APPLE_SPRING.sheet,
};

describe('§7.1 — the CSS springs are APPLE_SPRING, sampled', () => {
  for (const [name, { duration, bounce }] of Object.entries(SPRINGS)) {
    it(`--spring-${name} is spring(${duration}, ${bounce}) to within 0.05%`, () => {
      const s = spring(duration, bounce);
      let settle = 0;
      for (let t = 0; t < 3; t += 0.001) if (Math.abs(response(s, t) - 1) >= 0.0005) settle = t;
      const T = Math.ceil(settle * 100) / 100;
      expect(cssVar(`--spring-${name}-duration`)).toBe(`${T}s`);

      const stops = /linear\(([^)]*)\)/
        .exec(cssVar(`--spring-${name}`))![1]
        .split(',')
        .map((v) => Number(v.trim()));
      expect(stops).toHaveLength(41);
      expect(stops[0]).toBe(0);
      expect(stops[40]).toBe(1);
      for (let i = 1; i < 40; i++) {
        expect(stops[i], `--spring-${name} stop ${i}`).toBeCloseTo(response(s, (i / 40) * T), 4);
      }
      // The final snap to exactly 1 is below a pixel on any full-height sheet.
      expect(Math.abs(1 - stops[39]) * 1000).toBeLessThan(1);
    });
  }
});

describe('dialog and sheet: one path both ways, readable on the quick clock', () => {
  it('the dialog exit ends on the frame its enter starts from', () => {
    expect(transformIn(keyframes(DIALOG, 'ui-dialog-content-out'))).toBe(
      transformIn(keyframes(DIALOG, 'ui-dialog-content-in')),
    );
  });

  it('the desktop sheet exit ends on the frame its enter starts from', () => {
    const desktop = SHEET.indexOf('@media (min-width: 768px)');
    expect(desktop).toBeGreaterThan(-1);
    expect(transformIn(keyframes(SHEET, 'ui-sheet-content-out', desktop))).toBe(
      transformIn(keyframes(SHEET, 'ui-sheet-content-in', desktop)),
    );
  });

  it('a spring-driven enter takes its opacity from a separate short animation', () => {
    for (const [css, rule] of [
      [DIALOG, /\[data-slot='dialog-content'\]\[data-state='open'\]\s*\{([^}]*)\}/],
      [SHEET, /\[data-slot="sheet-content"\]\[data-state="open"\]\s*\{([^}]*)\}/],
      [GLOBALS, /\[data-motion='rise'\]:not\(\[data-state='closed'\]\)\s*\{([^}]*)\}/],
    ] as const) {
      const body = rule.exec(css)?.[1] ?? '';
      expect(body, String(rule)).toMatch(/var\(--spring-\w+-duration\)\s+var\(--spring-\w+\)/);
      expect(body, String(rule)).toMatch(/var\(--motion-in\)\s+var\(--motion-ease-in\)/);
    }
    // ...and the spring half never animates opacity itself.
    expect(keyframes(DIALOG, 'ui-dialog-content-in')).not.toMatch(/opacity/);
    expect(keyframes(GLOBALS, 'motion-rise-move')).not.toMatch(/opacity/);
  });
});

describe('Tailwind transition defaults ride the site curve and clock', () => {
  it('pins the default duration and timing function', () => {
    expect(cssVar('--default-transition-duration')).toBe(
      'calc(var(--site-transition-speed, 200ms) * 0.75)',
    );
    // EASE.standard in lib/motion.ts.
    expect(cssVar('--default-transition-timing-function')).toBe('cubic-bezier(0.22, 1, 0.36, 1)');
  });
});
