/**
 * The liquid globe's free trackball (`lib/trackball.ts`). Its pose is handed to
 * the Globe Eversion as `Rz(roll)·Rx(pitch)·Ry(yaw)` at the moment of a
 * navigation, so the decomposition and its rates are a hand-off contract: get
 * them wrong and the effect's sphere jumps off the globe the visitor was holding.
 */
import { describe, expect, it } from 'vitest';
import {
  dragRotvec,
  eulerOf,
  eulerRatesOf,
  matrixOf,
  mulQuat,
  normalizeQuat,
  quat,
  quatFromRotvec,
  quatFromYawPitch,
  quatToFront,
  rotvecOf,
} from '../trackball';

const DEG = Math.PI / 180;

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

/** The pose the eversion's shader builds, as a row-major matrix. */
function eversionMatrix(yaw: number, pitch: number, roll: number): number[] {
  const cy = Math.cos(yaw * DEG),
    sy = Math.sin(yaw * DEG);
  const cp = Math.cos(pitch * DEG),
    sp = Math.sin(pitch * DEG);
  const cr = Math.cos(roll * DEG),
    sr = Math.sin(roll * DEG);
  const col = (x: number, y: number, z: number) => {
    const x1 = x * cy + z * sy;
    const z1 = -x * sy + z * cy;
    const y2 = y * cp - z1 * sp;
    return [x1 * cr - y2 * sr, x1 * sr + y2 * cr, y * sp + z1 * cp];
  };
  const a = col(1, 0, 0),
    b = col(0, 1, 0),
    c = col(0, 0, 1);
  return [a[0]!, b[0]!, c[0]!, a[1]!, b[1]!, c[1]!, a[2]!, b[2]!, c[2]!];
}

function randomQuat(r: () => number) {
  const q = quat();
  q[0] = r() - 0.5;
  q[1] = r() - 0.5;
  q[2] = r() - 0.5;
  q[3] = r() - 0.5;
  return normalizeQuat(q);
}

describe('trackball', () => {
  it('poses the old two-angle globe identically (Rx(pitch)·Ry(yaw))', () => {
    const r = rng(1);
    const m = new Float64Array(9);
    for (let i = 0; i < 100; i++) {
      const yaw = (r() - 0.5) * 720;
      const pitch = (r() - 0.5) * 360;
      matrixOf(quatFromYawPitch(yaw, pitch, quat()), m);
      const want = eversionMatrix(yaw, pitch, 0);
      for (let k = 0; k < 9; k++) expect(m[k]).toBeCloseTo(want[k]!, 12);
    }
  });

  it('decomposes any orientation into the eversion pose Rz(roll)·Rx(pitch)·Ry(yaw)', () => {
    const r = rng(2);
    const m = new Float64Array(9);
    const pose = { yaw: 0, pitch: 0, roll: 0 };
    for (let i = 0; i < 200; i++) {
      matrixOf(randomQuat(r), m);
      eulerOf(m, pose);
      expect(Math.abs(pose.pitch)).toBeLessThanOrEqual(90);
      const back = eversionMatrix(pose.yaw, pose.pitch, pose.roll);
      for (let k = 0; k < 9; k++) expect(back[k]).toBeCloseTo(m[k]!, 9);
    }
  });

  it('converts a view-space angular velocity into the matching Euler rates', () => {
    const r = rng(3);
    const m = new Float64Array(9);
    const a = { yaw: 0, pitch: 0, roll: 0 };
    const b = { yaw: 0, pitch: 0, roll: 0 };
    const rates = { yaw: 0, pitch: 0, roll: 0 };
    const dt = 1e-5;
    const wrap = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;
    for (let i = 0; i < 100; i++) {
      const q = randomQuat(r);
      eulerOf(matrixOf(q, m), a);
      if (Math.abs(a.pitch) > 80) continue; // the gimbal, where the rates are floored by design
      const w = [(r() - 0.5) * 400, (r() - 0.5) * 400, (r() - 0.5) * 400];
      eulerRatesOf(a, w[0]!, w[1]!, w[2]!, rates);
      const q2 = normalizeQuat(
        mulQuat(quatFromRotvec(w[0]! * dt, w[1]! * dt, w[2]! * dt, quat()), q, quat()),
      );
      eulerOf(matrixOf(q2, m), b);
      expect(wrap(b.yaw - a.yaw) / dt).toBeCloseTo(rates.yaw, 1);
      expect((b.pitch - a.pitch) / dt).toBeCloseTo(rates.pitch, 1);
      expect(wrap(b.roll - a.roll) / dt).toBeCloseTo(rates.roll, 1);
    }
  });

  it('round-trips rotation vectors through the exponential and logarithm maps', () => {
    const r = rng(4);
    const v = new Float64Array(3);
    for (let i = 0; i < 100; i++) {
      const x = (r() - 0.5) * 300,
        y = (r() - 0.5) * 300,
        z = (r() - 0.5) * 300;
      if (Math.hypot(x, y, z) >= 179) continue;
      rotvecOf(quatFromRotvec(x, y, z, quat()), v);
      expect(v[0]).toBeCloseTo(x, 9);
      expect(v[1]).toBeCloseTo(y, 9);
      expect(v[2]).toBeCloseTo(z, 9);
    }
  });

  it('keeps the grabbed glass under the pointer on the sphere, over the poles included', () => {
    const r = rng(5);
    const v = new Float64Array(3);
    const m = new Float64Array(9);
    for (let i = 0; i < 200; i++) {
      const ax = (r() - 0.5) * 1.4,
        ay = (r() - 0.5) * 1.4;
      const bx = (r() - 0.5) * 1.4,
        by = (r() - 0.5) * 1.4;
      if (ax * ax + ay * ay > 1 || bx * bx + by * by > 1) continue;
      dragRotvec(ax, ay, bx, by, v);
      matrixOf(quatFromRotvec(v[0]!, v[1]!, v[2]!, quat()), m);
      const az = Math.sqrt(1 - ax * ax - ay * ay);
      expect(m[0]! * ax + m[1]! * ay + m[2]! * az).toBeCloseTo(bx, 9);
      expect(m[3]! * ax + m[4]! * ay + m[5]! * az).toBeCloseTo(by, 9);
    }
  });

  it('twists about the viewing axis by the angle swept around the rim, off the sphere', () => {
    const v = new Float64Array(3);
    const a = 0.3;
    dragRotvec(2 * Math.cos(0), 2 * Math.sin(0), 2 * Math.cos(a), 2 * Math.sin(a), v);
    expect(v[0]).toBeCloseTo(0, 6);
    expect(v[1]).toBeCloseTo(0, 6);
    // The chord's tangential length over the radius: within a hair of the arc.
    expect(v[2]! * DEG).toBeCloseTo((2 * Math.sin(a / 2) * 2) / 2 / Math.cos(a / 2), 6);
  });

  it('turns a point to the front by the shortest arc, with no twist', () => {
    const r = rng(6);
    const m = new Float64Array(9);
    for (let i = 0; i < 100; i++) {
      let x = r() - 0.5,
        y = r() - 0.5,
        z = r() - 0.5;
      const n = Math.hypot(x, y, z);
      x /= n;
      y /= n;
      z /= n;
      if (z < -0.999) continue;
      const q = quatToFront(x, y, z, quat());
      expect(q[3]).toBe(0); // axis in the screen plane: no roll about the viewing axis
      matrixOf(q, m);
      expect(m[6]! * x + m[7]! * y + m[8]! * z).toBeCloseTo(1, 9);
    }
  });
});
