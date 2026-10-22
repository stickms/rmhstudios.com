// @vitest-environment node
/**
 * The liquid globe's soft body (`lib/soft-body.ts`, owner 2026-10-21: "full soft-body physics … dragging it deforms
 * it according to your pointer/finger … make it super optimized"). What it must hold to: nothing at rest (the frame
 * loop repaints only while `step` says the body is deformed), a pull that follows the finger and is capped, a squeeze
 * around the finger while it is held, a stretch that keeps the ball's volume, and a release that wobbles back past rest
 * and settles. The globe is display-only on top of this; its lock and dwell never read it.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PINCH_DEPTH, SoftBody, TUG_MAX } from '../soft-body';

const out = new Float64Array(2);
const run = (b: SoftBody, seconds: number, dt = 1 / 120) => {
  let active = false;
  for (let t = 0; t < seconds; t += dt) active = b.step(dt);
  return active;
};

describe('the soft body', () => {
  it('at rest it does nothing and asks for no frames', () => {
    const b = new SoftBody();
    expect(b.active()).toBe(false);
    expect(b.step(1 / 60)).toBe(false);
    b.deform(0.4, -0.3, out);
    expect([...out]).toEqual([0.4, -0.3]);
  });

  it('a held press squeezes the surface toward the finger, most where the finger is', () => {
    const b = new SoftBody();
    b.grab(0.5, 0);
    run(b, 0.6);
    expect(b.pinch).toBeCloseTo(PINCH_DEPTH, 2);
    b.deform(0.8, 0, out);
    const near = 0.8 - out[0]!;
    b.deform(-0.8, 0, out);
    const far = Math.abs(-0.8 - out[0]!);
    expect(near).toBeGreaterThan(0);
    // The squeeze peaks one falloff out from the finger and fades away from it.
    expect(near).toBeGreaterThan(far * 1.5);
  });

  it('a drag pulls the region under the finger after it, capped at TUG_MAX', () => {
    const b = new SoftBody();
    b.grab(0.6, 0);
    b.drag(0.6, 0, 50, 0); // a hard flick to the right
    run(b, 1.2);
    expect(Math.hypot(b.dx, b.dy)).toBeCloseTo(TUG_MAX, 3);
    b.deform(0.6, 0, out);
    expect(out[0]! - 0.6).toBeGreaterThan(0.05);
  });

  it('stretches along the pull and keeps the ball’s volume', () => {
    const b = new SoftBody();
    b.grab(0, 0);
    b.drag(0, 0, 0, 30);
    run(b, 1);
    expect(b.m11).toBeGreaterThan(1); // along the pull (down)
    expect(b.m00).toBeLessThan(1); // across it
    // `s` along the pull and `1/√s` on BOTH axes across it (the one on screen and the one into it): s · (1/√s)² = 1.
    expect(b.m11 * b.m00 * b.m00).toBeCloseTo(1, 6);
  });

  it('a release wobbles back past rest, then settles and stops asking for frames', () => {
    const b = new SoftBody();
    b.grab(0.5, 0.2);
    b.drag(0.5, 0.2, 40, 0);
    run(b, 0.8);
    b.release();
    let crossed = false;
    for (let t = 0; t < 0.6; t += 1 / 120) {
      b.step(1 / 120);
      if (b.dx < -0.002) crossed = true;
    }
    expect(crossed).toBe(true);
    expect(run(b, 4)).toBe(false);
    expect(b.active()).toBe(false);
    b.deform(0.3, 0.3, out);
    expect([...out]).toEqual([0.3, 0.3]);
  });

  it('a grab off the globe takes hold of the nearest point of its limb', () => {
    const b = new SoftBody();
    b.grab(3, 0);
    expect(b.gx).toBeCloseTo(0.98, 6);
    expect(b.gy).toBe(0);
  });

  it('is cheap: ten thousand deformed samples in well under a frame', () => {
    const b = new SoftBody();
    b.grab(0.4, 0.1);
    b.drag(0.4, 0.1, 30, 10);
    run(b, 0.3);
    // The cage draws ~1,000 samples a frame; each pass is ten frames' worth.
    const pass = () => {
      const t0 = performance.now();
      for (let i = 0; i < 10_000; i++) b.deform(Math.cos(i), Math.sin(i), out);
      return performance.now() - t0;
    };
    // Warm up the JIT, then keep the FASTEST of five passes. A single
    // wall-clock sample measures the shared CI runner as much as the code — one
    // pass took 16.7 ms on a PR that never touched this (2026-10-22) — while a
    // genuine regression makes every pass slow, so the minimum still catches it.
    pass();
    const best = Math.min(...Array.from({ length: 5 }, pass));
    expect(best).toBeLessThan(16);
  });
});

describe('the globe wears it display-only', () => {
  const globe = readFileSync(join(process.cwd(), 'components/radial/LiquidGlobe.tsx'), 'utf8');

  it('deforms what is drawn (cage, crest, pins, glass) and steps it in the one frame loop', () => {
    expect(globe).toMatch(/if \(jelly\.step\(dt\)\) dirty\.current = true;/);
    expect(globe.match(/jelly\.deform\(/g)?.length).toBeGreaterThanOrEqual(4);
    // One scratch pair, never a per-sample allocation.
    expect(globe).toMatch(/const DEFORM_OUT = new Float64Array\(2\);/);
  });

  it('never moves what the lock and dwell measure', () => {
    const project = globe.slice(globe.indexOf('const project = '), globe.indexOf('const drawCage'));
    expect(project.length).toBeGreaterThan(0);
    expect(project).not.toMatch(/jelly/);
  });
});
