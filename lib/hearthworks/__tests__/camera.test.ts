import { describe, expect, it } from 'vitest';
import {
  ISO_FOV,
  THIRD_FOV,
  VIEW_BLEND_MS,
  bezierEase,
  blendPose,
  easeProgress,
  isoPose,
  stepViewProgress,
  thirdPose,
} from '../camera';

describe('easeProgress', () => {
  it('runs 0→1, never decreases, and leaves and lands at (almost) zero speed', () => {
    expect(easeProgress(0)).toBe(0);
    expect(easeProgress(1)).toBe(1);
    let prev = 0;
    for (let i = 1; i <= 200; i++) {
      const v = easeProgress(i / 200);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
    // zero-speed ends: the first and last hundredth of the journey cover a sliver of the distance
    expect(easeProgress(0.01)).toBeLessThan(0.002);
    expect(1 - easeProgress(0.99)).toBeLessThan(0.002);
  });

  it('is linear for the identity bezier and clamps out-of-range and NaN input', () => {
    const lin = bezierEase([1 / 3, 1 / 3, 2 / 3, 2 / 3]);
    expect(lin(0.5)).toBeCloseTo(0.5, 4);
    expect(easeProgress(-3)).toBe(0);
    expect(easeProgress(9)).toBe(1);
    expect(easeProgress(Number.NaN)).toBe(0);
  });
});

describe('stepViewProgress', () => {
  it('takes VIEW_BLEND_MS to cross and stops exactly at the ends', () => {
    let p = 0;
    p = stepViewProgress(p, 'third', VIEW_BLEND_MS / 2);
    expect(p).toBeCloseTo(0.5, 6);
    p = stepViewProgress(p, 'third', VIEW_BLEND_MS * 5);
    expect(p).toBe(1);
    p = stepViewProgress(p, 'iso', VIEW_BLEND_MS * 5);
    expect(p).toBe(0);
  });

  it('reverses from the frame it is on: no jump when the target flips mid-flight', () => {
    let p = stepViewProgress(0, 'third', VIEW_BLEND_MS * 0.4);
    const before = easeProgress(p);
    p = stepViewProgress(p, 'iso', 16);
    const after = easeProgress(p);
    expect(Math.abs(after - before)).toBeLessThan(0.03);
    expect(p).toBeLessThan(0.4);
    expect(p).toBeGreaterThan(0.38);
  });

  it('ignores zero, negative and non-finite dt and never leaves [0,1]', () => {
    expect(stepViewProgress(0.3, 'third', 0)).toBe(0.3);
    expect(stepViewProgress(0.3, 'third', -50)).toBe(0.3);
    expect(stepViewProgress(0.3, 'third', Number.NaN)).toBe(0.3);
    expect(stepViewProgress(7, 'third', 16)).toBe(1);
    expect(stepViewProgress(-7, 'iso', 16)).toBe(0);
  });
});

describe('blendPose', () => {
  const iso = isoPose({ x: 16, z: 16 }, 190);
  const third = thirdPose({ x: 16, z: 16, yaw: 0.6 });

  it('equals each end pose at t=0 and t=1', () => {
    const a = blendPose(iso, third, 0);
    const b = blendPose(iso, third, 1);
    for (let i = 0; i < 3; i++) {
      expect(a.position[i]).toBeCloseTo(iso.position[i], 6);
      expect(a.target[i]).toBeCloseTo(iso.target[i], 6);
      expect(b.position[i]).toBeCloseTo(third.position[i], 6);
      expect(b.target[i]).toBeCloseTo(third.target[i], 6);
    }
    expect(a.fov).toBeCloseTo(ISO_FOV, 6);
    expect(b.fov).toBeCloseTo(THIRD_FOV, 6);
  });

  it('is finite everywhere, including t out of range and NaN, and the lens only widens', () => {
    let prevFov = 0;
    for (let i = -2; i <= 102; i++) {
      const p = blendPose(iso, third, i / 100);
      for (const n of [...p.position, ...p.target, p.fov]) expect(Number.isFinite(n)).toBe(true);
      expect(p.fov).toBeGreaterThanOrEqual(prevFov - 1e-9);
      prevFov = p.fov;
    }
    expect(Number.isFinite(blendPose(iso, third, Number.NaN).fov)).toBe(true);
  });

  it('rides above the ground the avatar stands on, however high that is', () => {
    const high = thirdPose({ x: 16, z: 16, yaw: 0.6, y: 2.6 });
    expect(high.position[1]).toBeGreaterThan(2.6);
    expect(high.target[1]).toBeGreaterThan(2.6);
    const low = thirdPose({ x: 16, z: 16, yaw: 0.6, y: 0.4 });
    expect(high.position[1] - low.position[1]).toBeCloseTo(2.2, 9);
  });

  it('keeps the camera above ground and brings it in close on the avatar', () => {
    for (let i = 0; i <= 100; i++) expect(blendPose(iso, third, i / 100).position[1]).toBeGreaterThan(0);
    const end = blendPose(iso, third, 1);
    expect(Math.hypot(end.position[0] - 16, end.position[2] - 16)).toBeLessThan(5);
  });
});
