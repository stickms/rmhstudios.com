/**
 * The floating-surface open is a SAMPLED SPRING, and this is what stops the
 * sample from drifting away from the physics it was taken from.
 *
 * `globals.css` §7.1 animates every popover, menu, select and hover card with
 * `@keyframes motion-pop-in` — a uniform scale from 0.92 to 1 whose stops are
 * `spring(0.26, 0.08)` from `lib/fluid.ts` read off at fixed percentages of its
 * own duration. CSS has no spring, so the curve has to be baked; baked numbers
 * in a stylesheet are exactly the kind of thing that gets "tidied" by someone
 * who cannot tell them from magic numbers, and nothing about the file says they
 * are load-bearing. So this test re-derives them from the same function the rest
 * of the site's motion is built on and fails if the two disagree.
 *
 * It also holds three shape rules that are the difference between the current
 * open and the one it replaced (a wireframe-cage "bloom" with a rotational
 * wobble — §7.1 documents why it went):
 *
 *  1. **No rotation.** Nothing in AppKit/UIKit/SwiftUI rotates a menu, and a
 *     rotated panel puts every row of text off-axis for the length of the open.
 *  2. **Uniform scale.** `scale(a, b)` with a ≠ b is a squash, and an X
 *     overshoot can push a horizontal scrollbar onto the document.
 *  3. **The cage is gone and stays gone.** It was a full-size extra painted
 *     layer carrying two repeating gradients over a backdrop-filtered panel, on
 *     every menu, dialog and sheet the site opens.
 *
 * And the one cross-file invariant the CSS cannot state itself: `POP_COLLAPSE_MS`
 * in `lib/motion.ts` is what `usePopPresence` counts before it lets React remove
 * a hand-rolled menu, and `--motion-collapse` is how long the close animation
 * runs. If those two disagree the menu is either cut off mid-exit or sits
 * invisible-but-mounted afterwards.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { spring, type Spring } from '@/lib/fluid';
import { POP_COLLAPSE_MS } from '@/lib/motion';

const ROOT = join(__dirname, '..', '..');
const CSS = readFileSync(join(ROOT, 'app', 'globals.css'), 'utf8');

/** The spring §7.1 samples. Perceptual duration in seconds, SwiftUI bounce. */
const POP_DURATION = 0.26;
const POP_BOUNCE = 0.08;
/** Where the panel starts. Uniform — see rule 2 above. */
const POP_FROM = 0.92;

/**
 * The spring's step response from rest, 0 → 1.
 *
 * The closed-form solution rather than an integration of `springStep`, for the
 * same reason `springStep` itself is closed-form: it has to be exact at
 * arbitrary t, and this samples at nine of them.
 */
function response(s: Spring, t: number): number {
  const omega = Math.sqrt(s.stiffness / s.mass);
  const zeta = s.damping / (2 * Math.sqrt(s.stiffness * s.mass));
  const x0 = -1;
  if (zeta < 1) {
    const wd = omega * Math.sqrt(1 - zeta * zeta);
    const e = Math.exp(-zeta * omega * t);
    return 1 + e * (x0 * Math.cos(wd * t) + ((zeta * omega * x0) / wd) * Math.sin(wd * t));
  }
  if (zeta === 1) {
    return 1 + Math.exp(-omega * t) * (x0 + omega * x0 * t);
  }
  const r = omega * Math.sqrt(zeta * zeta - 1);
  const r1 = -zeta * omega + r;
  const r2 = -zeta * omega - r;
  const c2 = (-r1 * x0) / (r2 - r1);
  return 1 + (x0 - c2) * Math.exp(r1 * t) + c2 * Math.exp(r2 * t);
}

/**
 * Pull the INSIDE of one `@keyframes <name> { … }` out of the stylesheet — the
 * stop list only, without the rule's own braces. Returning the whole rule would
 * leave its opening brace in front of the first stop, and a stop-list parser
 * reading `… motion-pop-in {` would then attribute the `0%` block's declarations
 * to an empty selector and silently lose the stop.
 */
function keyframes(name: string): string {
  const start = CSS.indexOf(`@keyframes ${name} {`);
  expect(start, `@keyframes ${name} is missing from globals.css`).toBeGreaterThan(-1);
  const open = CSS.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < CSS.length; i++) {
    if (CSS[i] === '{') depth++;
    else if (CSS[i] === '}' && --depth === 0) return CSS.slice(open + 1, i);
  }
  throw new Error(`unterminated @keyframes ${name}`);
}

/** `{ 8: 0.9274, … }` — every percentage stop that declares a `scale()`. */
function scaleStops(body: string): Record<number, number> {
  const out: Record<number, number> = {};
  // Stops can be grouped (`0%, 50% {`), so read the selector list as a whole.
  const re = /([\d.%,\s]+?)\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const scale = /transform:\s*scale\(([^)]*)\)/.exec(m[2]);
    if (!scale) continue;
    for (const sel of m[1].split(',')) {
      const pct = /(-?[\d.]+)%/.exec(sel.trim());
      if (pct) out[Number(pct[1])] = Number(scale[1].split(',')[0]);
    }
  }
  return out;
}

describe('§7.1 — the pop open is the site’s own spring, sampled', () => {
  const body = keyframes('motion-pop-in');
  const stops = scaleStops(body);

  it('samples at the stops the stylesheet documents', () => {
    expect(Object.keys(stops).map(Number).sort((a, b) => a - b)).toEqual([
      0, 8, 16, 24, 32, 42, 54, 68, 84,
    ]);
  });

  it('every stop is spring(0.26, 0.08) mapped onto 0.92 → 1', () => {
    const s = spring(POP_DURATION, POP_BOUNCE);
    for (const [pct, declared] of Object.entries(stops)) {
      const t = (Number(pct) / 100) * POP_DURATION;
      const expected = POP_FROM + (1 - POP_FROM) * response(s, t);
      // The stylesheet carries four decimal places; half a unit in the last
      // place is the most a correct rounding can be out.
      expect(declared, `${pct}% stop`).toBeCloseTo(expected, 4);
    }
  });

  it('never overshoots enough to inflate the panel past its own box', () => {
    const s = spring(POP_DURATION, POP_BOUNCE);
    let peak = 0;
    for (let t = 0; t <= POP_DURATION * 3; t += 0.0005) peak = Math.max(peak, response(s, t));
    // A real spring's deceleration, with the overshoot kept far below a pixel
    // on any panel the site actually renders.
    expect(peak).toBeGreaterThan(1);
    expect((peak - 1) * (1 - POP_FROM) * 600).toBeLessThan(0.5);
  });

  it('omits the 100% stop, so the spring lands on the element’s own transform', () => {
    expect(stops[100]).toBeUndefined();
  });
});

describe('§7.1 — the shape rules that replaced the bloom', () => {
  const popIn = keyframes('motion-pop-in');
  const popOut = keyframes('motion-pop-out');

  it('the open carries no rotation', () => {
    expect(popIn).not.toMatch(/rotate/);
  });

  it('the open and the close both scale uniformly', () => {
    for (const [name, body] of [
      ['motion-pop-in', popIn],
      ['motion-pop-out', popOut],
    ] as const) {
      const anisotropic = /scale\(\s*[\d.]+\s*,/.exec(body);
      expect(anisotropic, `${name} uses a two-argument scale()`).toBeNull();
    }
  });

  it('animates nothing but transform and opacity', () => {
    const props = [...popIn.matchAll(/^\s*([a-z-]+)\s*:/gm)].map((m) => m[1]);
    expect(new Set(props)).toEqual(new Set(['transform', 'opacity']));
  });

  it('the content is legible well before the panel has settled', () => {
    // Opacity reaches 1 at the 24% stop — ~62ms. The old bloom held the rows at
    // zero until 34% of a 300ms window (~102ms) and only finished at ~200ms.
    const full = /(\d+)%\s*\{[^}]*opacity:\s*1\s*;/.exec(popIn);
    expect(full).not.toBeNull();
    expect(Number(full![1]) * POP_DURATION * 10).toBeLessThan(80);
  });

  it('the wireframe cage is gone — no keyframes, no rules, no class', () => {
    for (const gone of [
      'motion-pop-cage',
      'motion-pop-reveal',
      '--motion-wobble',
      '--motion-cage-rim',
      '--motion-cage-line',
      '.motion-cage',
    ]) {
      expect(CSS.includes(gone), `${gone} is back in globals.css`).toBe(false);
    }
  });

  it('the close is a fraction of the open, not a mirror of it', () => {
    const bloom = /--motion-bloom:\s*([\d.]+)s/.exec(CSS);
    const collapse = /--motion-collapse:\s*([\d.]+)s/.exec(CSS);
    expect(bloom).not.toBeNull();
    expect(collapse).not.toBeNull();
    expect(Number(collapse![1])).toBeLessThan(Number(bloom![1]) / 2);
  });
});

describe('§7.1 — the CSS window and the React lifetime agree', () => {
  it('--motion-collapse mirrors POP_COLLAPSE_MS', () => {
    const collapse = /--motion-collapse:\s*([\d.]+)s/.exec(CSS);
    expect(collapse).not.toBeNull();
    expect(Math.round(Number(collapse![1]) * 1000)).toBe(POP_COLLAPSE_MS);
  });

  it('--motion-bloom is the spring’s own perceptual duration', () => {
    const bloom = /--motion-bloom:\s*([\d.]+)s/.exec(CSS);
    expect(Number(bloom![1])).toBe(POP_DURATION);
  });
});
