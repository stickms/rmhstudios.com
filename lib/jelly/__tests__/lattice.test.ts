import { describe, expect, it } from 'vitest';

import {
  LATTICE_NODES,
  createLattice,
  impulseLattice,
  latticeArea,
  latticeAsleep,
  latticeOn,
  latticeUniform,
  nodeNormalOffset,
  perimeterParam,
  setLatticeInput,
  stepLattice,
  warpFalloff,
  type Lattice,
} from '../lattice';
import { latticeCaps } from '../soft-policy';
import { DENT } from '../tiers';

/**
 * Tier L runs inside the glass engine's frame, so its contract is the engine's: it must settle and stop on its own,
 * stay finite through any frame time, and never draw a rim outside the bounds — the outward cap is the focus ring's
 * offset, the inward cap is the bevel.
 */

/** Node indices, clockwise from the top-left. */
const TL = 0;
const T = 1;
const TR = 2;
const R = 3;
const BR = 4;
const B = 5;
const BL = 6;
const L = 7;

function steps(l: Lattice, seconds: number, dt = 1 / 60) {
  for (let t = 0; t < seconds - 1e-9; t += dt) stepLattice(l, dt);
}

function normals(l: Lattice): number[] {
  return Array.from({ length: LATTICE_NODES }, (_, i) => l.ox[i] * l.nx[i] + l.oy[i] * l.ny[i]);
}

/** A 6px dent at the top midpoint, as if a press had just let go. */
function dented(w = 200, h = 120, bevel = 12): Lattice {
  const l = createLattice({ w, h, bevel });
  l.oy[T] = 6;
  l.asleep = false;
  return l;
}

describe('settle', () => {
  it('goes from a 6px dent to sleep in under 1.5s, at 30–144Hz', () => {
    for (const hz of [30, 60, 120, 144]) {
      const l = dented();
      let t = 0;
      while (stepLattice(l, 1 / hz) && t < 5) t += 1 / hz;
      expect(t, `${hz}Hz`).toBeLessThan(1.5);
      expect(latticeAsleep(l)).toBe(true);
    }
  });

  it('is stable at dt = 0.25: no NaN, energy bounded, still settles', () => {
    const l = dented();
    let maxOffset = 0;
    let frames = 0;
    while (stepLattice(l, 0.25) && frames < 200) {
      frames++;
      for (let i = 0; i < LATTICE_NODES; i++) {
        expect(Number.isFinite(l.ox[i]) && Number.isFinite(l.oy[i])).toBe(true);
        maxOffset = Math.max(maxOffset, Math.hypot(l.ox[i], l.oy[i]));
      }
    }
    expect(maxOffset).toBeLessThanOrEqual(6);
    expect(latticeAsleep(l)).toBe(true);
  });

  it('latticeAsleep agrees with a zeroed state and a zero uniform', () => {
    const l = dented();
    expect(latticeAsleep(l)).toBe(false);
    expect(latticeOn(l)).toBe(1);
    steps(l, 3);
    expect(latticeAsleep(l)).toBe(true);
    expect(latticeOn(l)).toBe(0);
    for (let i = 0; i < LATTICE_NODES; i++) {
      expect(l.ox[i]).toBe(0);
      expect(l.oy[i]).toBe(0);
      expect(l.vx[i]).toBe(0);
      expect(l.vy[i]).toBe(0);
    }
    expect(Array.from(latticeUniform(l))).toEqual(new Array(16).fill(0));
  });

  it('a new lattice sleeps and costs nothing to step', () => {
    const l = createLattice({ w: 100, h: 40, bevel: 6 });
    expect(latticeAsleep(l)).toBe(true);
    expect(stepLattice(l, 1 / 60)).toBe(false);
  });

  it('never sleeps while an input drives it', () => {
    const l = createLattice({ w: 100, h: 40, bevel: 6 });
    setLatticeInput(l, { kind: 'hover', x: 100, y: 20 });
    steps(l, 5);
    expect(latticeAsleep(l)).toBe(false);
    setLatticeInput(l, null);
    steps(l, 2);
    expect(latticeAsleep(l)).toBe(true);
  });
});

describe('area preservation', () => {
  it('a held dent changes the polygon area by < 3% and the sides bulge', () => {
    const l = createLattice({ w: 200, h: 120, bevel: 12 });
    setLatticeInput(l, { kind: 'press', x: 100, y: 0 });
    steps(l, 0.3);
    const n = normals(l);
    expect(n[T]).toBeLessThan(-4); // a real dent
    expect(Math.abs(latticeArea(l) / l.restArea - 1)).toBeLessThan(0.03);
    for (const side of [R, B, L]) expect(n[side]).toBeGreaterThan(0.5);
  });

  it('the #989 press dent indents ≈ DENT.indentPx under the contact and bulges the far sides', () => {
    const l = createLattice({ w: 200, h: 120, bevel: 10 }); // bevel cap 0.6·10 = 6px, dent indent 5px
    setLatticeInput(l, { kind: 'press', x: 100, y: 0 });
    steps(l, 0.3);
    const n = normals(l);
    expect(n[T]).toBeCloseTo(-DENT.indentPx, 0);
    expect(n[B]).toBeGreaterThan(0.8);
    expect(n[B]).toBeLessThan(2.2);
  });

  it('a thin bevel still caps the indent below DENT.indentPx', () => {
    const l = createLattice({ w: 200, h: 120, bevel: 4 }); // bevel cap 0.6·4 = 2.4px
    setLatticeInput(l, { kind: 'press', x: 100, y: 0 });
    steps(l, 0.3);
    expect(normals(l)[T]).toBeCloseTo(-2.4, 0); // the solver's raw state; the drawn rim is saturated at the cap
  });
});

describe('symmetry', () => {
  it('a press at the top midpoint gives a left-right mirror-symmetric response', () => {
    const l = createLattice({ w: 180, h: 90, bevel: 10 });
    setLatticeInput(l, { kind: 'press', x: 90, y: 0 });
    for (let k = 0; k < 40; k++) {
      stepLattice(l, 1 / 60);
      for (const [a, b] of [
        [TL, TR],
        [L, R],
        [BL, BR],
      ]) {
        expect(l.ox[a]).toBeCloseTo(-l.ox[b], 9);
        expect(l.oy[a]).toBeCloseTo(l.oy[b], 9);
      }
      expect(l.ox[T]).toBeCloseTo(0, 9);
      expect(l.ox[B]).toBeCloseTo(0, 9);
    }
  });
});

describe('caps', () => {
  it('outward ≤ the overdraw bound (≤ 3px) and inward ≤ min(0.6·bevel, 10px) for bevels 3–24, under abuse', () => {
    for (const bevel of [3, 6, 12, 18, 24]) {
      for (const [w, h] of [
        [48, 32],
        [200, 120],
        [900, 600],
      ]) {
        const l = createLattice({ w, h, bevel });
        const { outward, inward } = l.caps;
        expect(outward).toBeLessThanOrEqual(3);
        expect(inward).toBeCloseTo(Math.min(0.6 * bevel, 10), 10);
        const out = new Float32Array(16);
        const check = () => {
          latticeUniform(l, out);
          for (let i = 0; i < LATTICE_NODES; i++) {
            const n = nodeNormalOffset(out, l, i);
            expect(n).toBeLessThanOrEqual(outward + 1e-5);
            expect(n).toBeGreaterThanOrEqual(-inward - 1e-5);
          }
        };
        setLatticeInput(l, { kind: 'press', x: w, y: h / 2 });
        for (let k = 0; k < 60; k++) {
          stepLattice(l, 1 / 60);
          check();
        }
        setLatticeInput(l, { kind: 'drag', ax: 1e7, ay: -1e7 });
        for (let k = 0; k < 30; k++) {
          stepLattice(l, 1 / 60);
          check();
        }
        setLatticeInput(l, { kind: 'hover', x: 0, y: 0 });
        for (let k = 0; k < 10; k++) impulseLattice(l, 1, 0, 50);
        for (let k = 0; k < 60; k++) {
          stepLattice(l, 1 / 60);
          check();
        }
      }
    }
  });

  it('large surfaces get half the amplitude', () => {
    const full = latticeCaps(20);
    const half = createLattice({ w: 900, h: 600, bevel: 20, amplitude: 0.5 }).caps;
    expect(half.outward).toBeCloseTo(full.outward / 2, 10);
    expect(half.inward).toBeCloseTo(full.inward / 2, 10);
  });

  it('the shader falloff is full at the rim and reaches zero ≤ 8px inside the bevel', () => {
    for (const bevel of [3, 6, 12, 18, 24]) {
      expect(warpFalloff(0, bevel)).toBe(1);
      expect(warpFalloff(bevel, bevel)).toBe(1);
      expect(warpFalloff(bevel + 8, bevel)).toBe(0);
      expect(warpFalloff(bevel + 100, bevel)).toBe(0);
      let prev = 1;
      for (let d = bevel; d <= bevel + 8; d += 0.25) {
        const f = warpFalloff(d, bevel);
        expect(f).toBeLessThanOrEqual(prev + 1e-12);
        prev = f;
      }
    }
  });
});

describe('inputs', () => {
  it('hover pulls the rim outward toward the cursor', () => {
    const l = createLattice({ w: 200, h: 100, bevel: 12 });
    setLatticeInput(l, { kind: 'hover', x: 200, y: 50 });
    steps(l, 0.6);
    const n = normals(l);
    expect(n[R]).toBeGreaterThan(1);
    expect(n[R]).toBeGreaterThan(n[L]);
  });

  it('drag lags the slab against the host acceleration', () => {
    const l = createLattice({ w: 200, h: 100, bevel: 12 });
    setLatticeInput(l, { kind: 'drag', ax: 400, ay: 0 });
    steps(l, 0.4);
    const n = normals(l);
    expect(n[L]).toBeGreaterThan(0); // trailing edge lags out
    expect(n[R]).toBeLessThan(0); // leading edge piles up
  });

  it('an impulse dents the facing edge and wakes the lattice', () => {
    const l = createLattice({ w: 120, h: 60, bevel: 10 });
    impulseLattice(l, 1, 0, 1.5); // pushed rightward: the left edge is hit
    expect(latticeAsleep(l)).toBe(false);
    stepLattice(l, 1 / 60);
    expect(normals(l)[L]).toBeLessThan(0);
    steps(l, 2);
    expect(latticeAsleep(l)).toBe(true);
  });

  it('maps a local point to its nearest rim parameter', () => {
    const l = createLattice({ w: 100, h: 50, bevel: 6 });
    expect(perimeterParam(l, 50, 0)).toBe(50);
    expect(perimeterParam(l, 100, 25)).toBe(125);
    expect(perimeterParam(l, 50, 50)).toBe(200);
    expect(perimeterParam(l, 0, 25)).toBe(275);
    expect(perimeterParam(l, 50, 3)).toBe(50); // inside: nearest edge
  });
});

describe('plastic memory', () => {
  it('a short press leaves nothing behind', () => {
    const l = createLattice({ w: 200, h: 120, bevel: 12 });
    setLatticeInput(l, { kind: 'press', x: 100, y: 0 });
    steps(l, 0.2);
    setLatticeInput(l, null);
    expect(Array.from(l.ply).every((v) => v === 0)).toBe(true);
    let t = 0;
    while (stepLattice(l, 1 / 60) && t < 5) t += 1 / 60;
    expect(t).toBeLessThan(1.5);
  });

  it('a held press keeps ≤ 30% of the dent, gone (and asleep) after 3τ', () => {
    const l = createLattice({ w: 200, h: 120, bevel: 12 });
    setLatticeInput(l, { kind: 'press', x: 100, y: 0 });
    steps(l, 1.2);
    const dent = l.oy[T];
    setLatticeInput(l, null);
    expect(l.ply[T]).toBeGreaterThan(0);
    expect(l.ply[T]).toBeLessThanOrEqual(0.3 * dent + 1e-12);
    steps(l, 0.5);
    expect(normals(l)[T]).toBeLessThan(-0.2); // the memory is visible
    let t = 0.5;
    while (stepLattice(l, 1 / 60) && t < 10) t += 1 / 60;
    expect(t).toBeLessThan(1.8 + 1.5);
    expect(latticeAsleep(l)).toBe(true);
  });
});

describe('uniform', () => {
  it('is 16 floats and reuses the buffer it is given', () => {
    const l = dented();
    const buf = new Float32Array(16);
    expect(latticeUniform(l, buf)).toBe(buf);
    expect(latticeUniform(l)).toHaveLength(16);
    expect(nodeNormalOffset(buf, l, T)).toBeLessThan(0);
  });
});
