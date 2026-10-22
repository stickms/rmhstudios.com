import { describe, it, expect } from 'vitest';
import { buildMesh } from '../mesh';
import {
  MINI_MS,
  MINI_PAD,
  buildMiniGeometry,
  miniPositions,
  miniProject,
  miniStage,
} from '../mini';

/**
 * The button-sized eversion (`lib/eversion/mini.ts`) is drawn over the real control and removed at the end, so the
 * two things that would show as a glitch on every navigation are pinned: both ends land exactly on the control's
 * pixels (no jump when the overlay goes), and the surface never leaves the canvas it is drawn in (no clipped
 * globe). Plus continuity, since a step in any vertex is a visible pop.
 */

const mesh = buildMesh(32, 16);
const geom = buildMiniGeometry(mesh);

const sizes: Array<[number, number]> = [
  [180, 40], // a nav-rail pill
  [44, 44], // an icon button
  [96, 32],
  [40, 120], // tall
];

function at(t: number, w: number, h: number) {
  const out = new Float32Array(geom.vertexCount * 3);
  miniPositions(t, geom, w, h, out);
  return out;
}

describe('the button eversion', () => {
  it.each(sizes)('starts as the flat face of a %ix%i control, pixel for pixel', (w, h) => {
    const p = at(0, w, h);
    for (let i = 0; i < geom.vertexCount; i++) {
      expect(p[i * 3 + 2]).toBeCloseTo(0, 6);
      expect(p[i * 3]).toBeCloseTo((geom.uvBefore[i * 2]! - 0.5) * w, 4);
      expect(p[i * 3 + 1]).toBeCloseTo((geom.uvBefore[i * 2 + 1]! - 0.5) * h, 4);
    }
  });

  it.each(sizes)('ends as the flat face again (the antipode, upright) for %ix%i', (w, h) => {
    const p = at(1, w, h);
    for (let i = 0; i < geom.vertexCount; i++) {
      expect(p[i * 3 + 2]).toBeCloseTo(0, 6);
      expect(p[i * 3]).toBeCloseTo((geom.uvAfter[i * 2]! - 0.5) * w, 4);
      expect(p[i * 3 + 1]).toBeCloseTo((geom.uvAfter[i * 2 + 1]! - 0.5) * h, 4);
    }
  });

  it('shows the face upright and unmirrored at the end: the back point is the centre, east stays right', () => {
    const idx = (theta: number, phi: number) => {
      for (let i = 0; i < geom.vertexCount; i++) {
        if (
          Math.abs(geom.domain[i * 2]! - theta) < 1e-6 &&
          Math.abs(geom.domain[i * 2 + 1]! - phi) < 1e-3
        )
          return i;
      }
      throw new Error('no vertex');
    };
    // The point that was at the back (θ = π) carries the face's centre at the end.
    const back = idx(Math.PI, 1e-7);
    expect(geom.uvAfter[back * 2]).toBeCloseTo(0.5, 5);
    // A point a quarter-turn east of the back lands right of centre (u > 0.5), not left.
    const east = idx(-Math.PI + Math.PI / 4, 1e-7);
    expect(geom.uvAfter[east * 2]).toBeGreaterThan(0.5);
  });

  it.each(sizes)('stays inside the padded canvas at every moment (%ix%i)', (w, h) => {
    const out = new Float32Array(geom.vertexCount * 3);
    let maxX = 0;
    let maxY = 0;
    for (let s = 0; s <= 200; s++) {
      miniPositions(s / 200, geom, w, h, out);
      for (let i = 0; i < geom.vertexCount; i++) {
        const [x, y] = miniProject(out[i * 3]!, out[i * 3 + 1]!, out[i * 3 + 2]!, w, h);
        maxX = Math.max(maxX, Math.abs(x));
        maxY = Math.max(maxY, Math.abs(y));
      }
    }
    const c = Math.min(w, h) / 2;
    // The ellipsoid's depth axis is the smaller one; the tip and spin can carry it into x/y.
    expect(maxX).toBeLessThanOrEqual(Math.max(w / 2, c) * (1 + MINI_PAD));
    expect(maxY).toBeLessThanOrEqual(Math.max(h / 2, c) * (1 + MINI_PAD));
  });

  it('moves continuously: no vertex jumps between two 240 Hz frames', () => {
    const w = 180;
    const h = 40;
    const steps = Math.round((MINI_MS / 1000) * 240);
    let prev = at(0, w, h);
    let worst = 0;
    for (let s = 1; s <= steps; s++) {
      const cur = at(s / steps, w, h);
      for (let i = 0; i < cur.length; i++) worst = Math.max(worst, Math.abs(cur[i]! - prev[i]!));
      prev = cur;
    }
    // The eversion's push/twist is the fastest phase; at MINI_MS it stays under ~3.5 px/ms on a 180 px pill.
    expect(worst).toBeLessThan(15);
  });

  it('crosses the picture from the start face to the end face only mid-eversion', () => {
    expect(miniStage(0).afterMix).toBe(0);
    expect(miniStage(0.1).afterMix).toBe(0);
    expect(miniStage(0.9).afterMix).toBe(1);
    expect(miniStage(1)).toEqual({ e: 1, afterMix: 1, shade: 0 });
    // Flat at both ends: the overlay's colours are the control's own when it appears and when it goes.
    expect(miniStage(0).shade).toBe(0);
    expect(miniStage(0.5).shade).toBe(1);
  });
});
