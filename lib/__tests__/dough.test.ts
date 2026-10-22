import { describe, expect, it } from 'vitest';
import { CONTACT, DOUGH_N, DoughBody, PLASTIC_TAU, pressTarget } from '../dough';

const run = (b: DoughBody, seconds: number, dt = 1 / 60) => {
  for (let t = 0; t < seconds; t += dt) b.step(dt);
};
const out = new Float64Array(2);
const disp = (b: DoughBody, x: number, y: number) => {
  b.deform(x, y, out);
  return { x: out[0]! - x, y: out[1]! - y };
};

describe('dough body: a field with memory, not a stretchy ball', () => {
  it('is exactly at rest until touched, and reports it', () => {
    const b = new DoughBody();
    expect(b.active()).toBe(false);
    expect(b.step(1 / 60)).toBe(false);
    expect(b.peak()).toBe(0);
    expect(disp(b, 0.4, -0.2)).toEqual({ x: 0, y: 0 });
  });

  it('press target is radial, zero at the fingertip and strongest one footprint out', () => {
    const t = { x: 0, y: 0 };
    pressTarget(0, 0, t);
    expect(t).toEqual({ x: 0, y: 0 });
    const m = (r: number) => {
      pressTarget(r, 0, t);
      return t.x;
    };
    expect(m(CONTACT)).toBeGreaterThan(m(CONTACT * 0.4));
    expect(m(CONTACT)).toBeGreaterThan(m(CONTACT * 2.2));
    pressTarget(0, -CONTACT, t);
    expect(t.x).toBeCloseTo(0, 9);
    expect(t.y).toBeLessThan(0);
  });

  it('a held press dents under the finger, raises a shoulder, and stays local', () => {
    const b = new DoughBody();
    b.grab(0.2, 0.1);
    run(b, 0.5);
    expect(b.depth(0.2, 0.1)).toBeLessThan(-0.05);
    // The shoulder: somewhere around the footprint the surface rises above rest.
    let shoulder = 0;
    for (let a = 0; a < Math.PI * 2; a += 0.3) {
      shoulder = Math.max(shoulder, b.depth(0.2 + Math.cos(a) * 0.55, 0.1 + Math.sin(a) * 0.55));
    }
    expect(shoulder).toBeGreaterThan(0.005);
    // Locality: the far limb is essentially untouched, the near field is not.
    const near = Math.hypot(disp(b, 0.2 + CONTACT, 0.1).x, disp(b, 0.2 + CONTACT, 0.1).y);
    const far = Math.hypot(disp(b, -0.85, -0.3).x, disp(b, -0.85, -0.3).y);
    expect(near).toBeGreaterThan(0.04);
    expect(far).toBeLessThan(near * 0.1);
  });

  it('conserves volume: whatever a dent removes reappears around it', () => {
    const b = new DoughBody();
    b.grab(-0.1, 0.25);
    run(b, 0.4);
    const dent = Math.abs(b.depth(-0.1, 0.25));
    expect(dent).toBeGreaterThan(0.05);
    // Σh is the discrete divergence theorem on a field that vanishes at the border.
    expect(Math.abs(b.volume())).toBeLessThan(1e-3);
    b.drag(0.3, 0.1, 1.2, -0.4);
    run(b, 0.4);
    expect(Math.abs(b.volume())).toBeLessThan(1e-3);
  });

  it('holds a dent after release (plastic), rebounds a little (elastic), then lets it go', () => {
    const b = new DoughBody();
    b.grab(0, 0);
    run(b, 0.6);
    const held = Math.abs(b.depth(0, 0));
    b.release();
    run(b, 0.45);
    const soon = Math.abs(b.depth(0, 0));
    // Not gone: a spring would be back to rest within a period or two.
    expect(soon).toBeGreaterThan(held * 0.06);
    run(b, PLASTIC_TAU * 1.2);
    const later = Math.abs(b.depth(0, 0));
    expect(later).toBeLessThan(soon);
    run(b, 6);
    expect(b.active()).toBe(false);
    expect(b.peak()).toBe(0);
  });

  it('kneads: dragging carries material along, banks it up ahead and leaves a groove behind', () => {
    const b = new DoughBody();
    b.grab(-0.5, 0);
    // Drag along +x at 1 radius/s.
    const dt = 1 / 60;
    let x = -0.5;
    for (let t = 0; t < 0.6; t += dt) {
      x += 1.0 * dt;
      b.drag(x, 0, 1.0, 0);
      b.step(dt);
    }
    // Material that sat under the path moved along the drag.
    expect(disp(b, -0.2, 0).x).toBeGreaterThan(0.01);
    // Pile ahead of the finger, groove behind it (relative to rest).
    const ahead = b.depth(x + 0.32, 0);
    const behind = b.depth(x - 0.32, 0);
    expect(ahead).toBeGreaterThan(behind);
  });

  it('a drag leaves a memory of the path that outlives the finger by a beat', () => {
    const b = new DoughBody();
    b.grab(-0.4, 0.1);
    const dt = 1 / 60;
    let x = -0.4;
    for (let t = 0; t < 0.5; t += dt) {
      x += 1.1 * dt;
      b.drag(x, 0.1, 1.1, 0);
      b.step(dt);
    }
    b.release();
    run(b, 0.5);
    const trail = Math.hypot(disp(b, -0.1, 0.1).x, disp(b, -0.1, 0.1).y);
    expect(trail).toBeGreaterThan(0.004);
  });

  it('deform is identity far away and smooth (bilinear) near the contact', () => {
    const b = new DoughBody();
    b.grab(0.1, 0.1);
    run(b, 0.3);
    expect(Math.hypot(disp(b, 1.1, 1.1).x, disp(b, 1.1, 1.1).y)).toBeLessThan(1e-5);
    // No jumps between neighbouring samples.
    let prev = disp(b, 0, 0.1);
    for (let x = 0.01; x < 0.6; x += 0.01) {
      const d = disp(b, x, 0.1);
      expect(Math.hypot(d.x - prev.x, d.y - prev.y)).toBeLessThan(0.02);
      prev = d;
    }
  });

  it('the limb can bulge: the field extends past the rest silhouette', () => {
    const b = new DoughBody();
    b.grab(0.95, 0);
    run(b, 0.5);
    // Material near the limb is pushed outward by a press on the limb's inner side.
    b.release();
    const b2 = new DoughBody();
    b2.grab(0.55, 0);
    run(b2, 0.5);
    expect(disp(b2, 0.95, 0).x).toBeGreaterThan(0.005);
  });

  it('stays finite and bounded under abuse (a flick, a nudge, a hand-off, long frames)', () => {
    const b = new DoughBody();
    let seed = 7;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    b.grab(0, 0);
    for (let i = 0; i < 600; i++) {
      b.drag(rnd() * 2 - 1, rnd() * 2 - 1, (rnd() - 0.5) * 30, (rnd() - 0.5) * 30);
      if (i % 40 === 0) b.nudge((rnd() - 0.5) * 40, (rnd() - 0.5) * 40, 1.2);
      b.step(i % 17 === 0 ? 0.25 : 1 / 60);
      expect(Number.isFinite(b.peak())).toBe(true);
      expect(b.peak()).toBeLessThan(0.5);
    }
    expect(b.field.every((v) => Number.isFinite(v))).toBe(true);
    b.release();
    run(b, 12);
    expect(b.active()).toBe(false);
  });

  it('is deterministic and exposes a versioned field for the shader', () => {
    const a = new DoughBody();
    const c = new DoughBody();
    for (const b of [a, c]) {
      b.grab(0.3, -0.2);
      run(b, 0.35);
    }
    expect(Array.from(a.field)).toEqual(Array.from(c.field));
    expect(a.field.length).toBe(DOUGH_N * DOUGH_N * 4);
    const v = a.version;
    a.step(1 / 60);
    expect(a.version).toBeGreaterThan(v);
  });

  it('only applies the perspective lift of a dent to the front hemisphere', () => {
    const b = new DoughBody();
    b.grab(0.4, 0.2);
    run(b, 0.4);
    const front = new Float64Array(2);
    const back = new Float64Array(2);
    const flat = new Float64Array(2);
    b.deform(0.4, 0.2, front, 1);
    b.deform(0.4, 0.2, back, -1);
    b.deform(0.4, 0.2, flat);
    expect([...back]).toEqual([...flat]);
    expect(front[0]).toBeLessThan(back[0]!);
  });

  it('a grab from outside the limb takes hold of the nearest point of it', () => {
    const b = new DoughBody();
    b.grab(3, 0);
    expect(b.gx).toBeCloseTo(0.98, 5);
    expect(b.gy).toBeCloseTo(0, 9);
  });
});
