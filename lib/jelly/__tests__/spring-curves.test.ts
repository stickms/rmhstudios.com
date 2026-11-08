/**
 * CSS springs (CSS-first jelly, PR 3; docs/superpowers/specs/2026-11-07-css-first-jelly-design.md §3 "Soft body is
 * CSS"). The soft body's springs become CSS `linear(...)` easings sampled from the closed-form step response of a damped
 * spring, so a transition on `scale` rises, overshoots and settles the way the physics service's spring did. What must
 * hold:
 *  - the curve starts at exactly 0 and ends at exactly 1 (a transition lands on its target, never beside it);
 *  - an under-damped spring overshoots, by no more than its analytic peak; a critically damped one never does;
 *  - mapped onto every CSS soft-body move (rest ↔ hover ↔ press), no frame leaves `MOTION_BOUNDS.maxScaleDelta`;
 *  - the settle time is where the response stays within the epsilon for good.
 */
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { SPRINGS } from '@/lib/fluid';
import {
  CSS_SIZE_FALLBACK_PX,
  CSS_SOFT_BODY,
  CSS_SPRINGS,
  cssCappedPose,
  cssEdgeReach,
} from '../soft-policy';
import { MOTION_BOUNDS } from '../tiers';
import {
  SPRING_SETTLE_EPSILON,
  dampedSpringLinear,
  springResponse,
  springSettleMs,
} from '../spring-curves';

/** The numeric stops of a `linear(...)` string (no percentages: the stops are evenly spaced). */
function stops(curve: string): number[] {
  const m = /^linear\((.*)\)$/.exec(curve);
  expect(m, `not a linear() easing: ${curve}`).not.toBeNull();
  return m![1].split(',').map((s) => Number(s.trim()));
}

const zeta = (s: { stiffness: number; damping: number; mass: number }) =>
  s.damping / (2 * Math.sqrt(s.stiffness * s.mass));

describe('dampedSpringLinear', () => {
  it('starts at exactly 0 and ends at exactly 1', () => {
    for (const s of Object.values(CSS_SPRINGS)) {
      const v = stops(dampedSpringLinear(s));
      expect(v[0]).toBe(0);
      expect(v[v.length - 1]).toBe(1);
      expect(v.every(Number.isFinite)).toBe(true);
    }
  });

  it('emits samples + 1 evenly spaced stops (default 40 intervals)', () => {
    expect(stops(dampedSpringLinear(SPRINGS.jellyRelease))).toHaveLength(41);
    expect(stops(dampedSpringLinear({ ...SPRINGS.jellyRelease, samples: 12 }))).toHaveLength(13);
  });

  it('overshoots an under-damped spring by a bounded amount, never past its analytic peak', () => {
    const s = CSS_SPRINGS.release;
    const z = zeta(s);
    expect(z).toBeLessThan(1);
    const peak = 1 + Math.exp((-Math.PI * z) / Math.sqrt(1 - z * z));
    const max = Math.max(...stops(dampedSpringLinear(s)));
    expect(max).toBeGreaterThan(1);
    expect(max).toBeLessThanOrEqual(peak + 1e-4);
    // The release wobble overshoots ~23% (lib/fluid.ts jellyRelease, ζ 0.42): a visible wobble, not a fling.
    expect(max).toBeLessThan(1.3);
  });

  it('never overshoots a critically damped spring, and rises monotonically', () => {
    const v = stops(dampedSpringLinear(CSS_SPRINGS.press));
    expect(Math.max(...v)).toBeLessThanOrEqual(1);
    for (let i = 1; i < v.length; i++) expect(v[i]).toBeGreaterThanOrEqual(v[i - 1]);
  });

  it('handles an over-damped spring (starts at 0, no overshoot, ends at 1)', () => {
    const v = stops(dampedSpringLinear({ stiffness: 100, damping: 40, mass: 1 }));
    expect(v[0]).toBe(0);
    expect(v[v.length - 1]).toBe(1);
    expect(Math.max(...v)).toBeLessThanOrEqual(1);
  });

  it('never leaves MOTION_BOUNDS when mapped onto any CSS soft-body move', () => {
    const bound = MOTION_BOUNDS.maxScaleDelta + 1e-9;
    const rest = 1;
    const settled = [rest, CSS_SOFT_BODY.hoverPlump, CSS_SOFT_BODY.hoverDent];
    const pressed = [CSS_SOFT_BODY.pressControl, CSS_SOFT_BODY.pressCard];
    const poses = [...settled, ...pressed];
    for (const pose of poses) expect(Math.abs(pose - 1)).toBeLessThanOrEqual(bound);
    expect(CSS_SOFT_BODY.hoverPlump).toBeLessThanOrEqual(1.03);
    // The press curve carries every move INTO a press; the release curve every move back to rest or hover
    // (app/jelly-material.css §8: `:active` takes --spring-press, every other state --spring-release).
    const moves: [keyof typeof CSS_SPRINGS, number[], number[]][] = [
      ['press', poses, pressed],
      ['release', poses, settled],
    ];
    for (const [curve, froms, tos] of moves) {
      const v = stops(dampedSpringLinear(CSS_SPRINGS[curve]));
      for (const from of froms)
        for (const to of tos)
          for (const x of v) {
            const scale = from + (to - from) * x;
            expect(
              Math.abs(scale - 1),
              `${curve}: ${from} → ${to} at progress ${x} reaches scale ${scale}`,
            ).toBeLessThanOrEqual(bound);
          }
    }
  });

  it('rejects a spring it cannot sample', () => {
    expect(() => dampedSpringLinear({ stiffness: 0, damping: 1 })).toThrow(RangeError);
    expect(() => dampedSpringLinear({ stiffness: 100, damping: 1, mass: 0 })).toThrow(RangeError);
    expect(() => dampedSpringLinear({ stiffness: 100, damping: -1 })).toThrow(RangeError);
    expect(() => dampedSpringLinear({ stiffness: 100, damping: 10, samples: 1 })).toThrow(
      RangeError,
    );
  });
});

describe('springSettleMs', () => {
  it('is where the response stays within the epsilon for good', () => {
    for (const s of Object.values(CSS_SPRINGS)) {
      const ms = springSettleMs(s);
      expect(Number.isInteger(ms)).toBe(true);
      for (let t = ms; t <= ms + 2000; t += 5)
        expect(Math.abs(springResponse(t / 1000, s) - 1)).toBeLessThanOrEqual(
          SPRING_SETTLE_EPSILON,
        );
      // …and not much sooner: just before it, the response was still outside the epsilon.
      let outside = false;
      for (let t = ms - 2; t < ms; t += 0.05)
        outside ||= Math.abs(springResponse(t / 1000, s) - 1) > SPRING_SETTLE_EPSILON;
      expect(outside).toBe(true);
    }
  });

  it('gives the release its ~1.2 s settle and the press a quick one', () => {
    expect(springSettleMs(CSS_SPRINGS.release)).toBeGreaterThan(900);
    expect(springSettleMs(CSS_SPRINGS.release)).toBeLessThan(1400);
    expect(springSettleMs(CSS_SPRINGS.press)).toBeLessThan(400);
  });

  it('the CSS springs are the soft body’s own (lib/fluid.ts SPRINGS)', () => {
    expect(CSS_SPRINGS.press).toBe(SPRINGS.jellyPress);
    expect(CSS_SPRINGS.release).toBe(SPRINGS.jellyRelease);
  });
});

describe('size-capped poses (the 4 px edge bound)', () => {
  /** Worst edge travel, px, of a host of larger side `size` moving from `from` to `to` on `curve`'s stops. */
  const travel = (size: number, from: number, to: number, curve: number[]) =>
    Math.max(...curve.map((x) => (Math.abs(from + (to - from) * x - 1) * size) / 2));
  const release = stops(dampedSpringLinear(CSS_SPRINGS.release));
  const press = stops(dampedSpringLinear(CSS_SPRINGS.press));

  it('derives the reach from MOTION_BOUNDS and the release overshoot', () => {
    const overshoot = Math.max(...release) - 1;
    const reach = cssEdgeReach();
    expect(reach).toBeLessThanOrEqual((2 * MOTION_BOUNDS.maxEdgeTravelPx) / (1 + 2 * overshoot));
    expect(reach).toBeGreaterThan((2 * MOTION_BOUNDS.maxEdgeTravelPx) / (1 + 2 * overshoot) - 1e-3);
  });

  it('caps every pose by size, and leaves small hosts on their configured pose', () => {
    expect(cssCappedPose(CSS_SOFT_BODY.pressControl, 100)).toBe(CSS_SOFT_BODY.pressControl);
    expect(cssCappedPose(CSS_SOFT_BODY.hoverPlump, 100)).toBe(CSS_SOFT_BODY.hoverPlump);
    expect(cssCappedPose(CSS_SOFT_BODY.pressCard, 2000)).toBeGreaterThan(CSS_SOFT_BODY.pressCard);
    expect(cssCappedPose(CSS_SOFT_BODY.hoverPlump, 2000)).toBeLessThan(CSS_SOFT_BODY.hoverPlump);
    expect(cssCappedPose(1, 640)).toBe(1);
    // No size written yet (a keyboard press): the fallback is a safe, small pose.
    expect(CSS_SIZE_FALLBACK_PX).toBe(1000);
    expect(cssCappedPose(CSS_SOFT_BODY.pressControl)).toBe(
      cssCappedPose(CSS_SOFT_BODY.pressControl, 1000),
    );
  });

  it('keeps every edge within MOTION_BOUNDS.maxEdgeTravelPx for hosts of 100–2000 px, overshoot included', () => {
    const bound = MOTION_BOUNDS.maxEdgeTravelPx + 1e-9;
    for (let size = 100; size <= 2000; size += 10) {
      // The pose a host of this size gets with its size written, and with the fallback (only valid up to it).
      const sized = (p: number) => cssCappedPose(p, size);
      const variants = [sized];
      if (size <= CSS_SIZE_FALLBACK_PX) variants.push((p: number) => cssCappedPose(p));
      for (const pose of variants) {
        const settled = [1, pose(CSS_SOFT_BODY.hoverPlump), pose(CSS_SOFT_BODY.hoverDent)];
        const pressed = [pose(CSS_SOFT_BODY.pressControl), pose(CSS_SOFT_BODY.pressCard)];
        const all = [...settled, ...pressed];
        for (const from of all) {
          for (const to of pressed)
            expect(
              travel(size, from, to, press),
              `press ${from}→${to} @${size}px`,
            ).toBeLessThanOrEqual(bound);
          for (const to of settled)
            expect(
              travel(size, from, to, release),
              `release ${from}→${to} @${size}px`,
            ).toBeLessThanOrEqual(bound);
        }
      }
    }
  });
});
