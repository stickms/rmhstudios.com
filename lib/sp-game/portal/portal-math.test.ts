/**
 * The portal passage transform: a point just behind portal A comes out just in
 * front of portal B, directions turn with the pair, and speed is conserved.
 */
import { describe, expect, it } from 'vitest';
import { angleVectors, vec3, type Vec3 } from '../../tf2-game/core/vec';
import {
  frameForward,
  frameFromAngles,
  frameFromNormalUp,
  frameUp,
  planeDistance,
  portalTransform,
  rectsOverlap,
  segmentEntersPortal,
  transformAngles,
  transformPoint,
  transformVector,
  withinRect,
} from './portal-math';

const len = (v: Vec3): number => Math.hypot(v.x, v.y, v.z);

describe('portal transform', () => {
  // A floor portal (facing up) and a wall portal facing +x.
  const floor = frameFromAngles(vec3(0, 0, 0), vec3(-90, 0, 0));
  const wall = frameFromAngles(vec3(1000, 200, 64), vec3(0, 0, 0));

  it('builds orthonormal frames facing out of the surface', () => {
    expect(frameForward(floor).z).toBeCloseTo(1, 12);
    expect(frameForward(wall).x).toBeCloseTo(1, 12);
    const f = frameFromNormalUp(vec3(), vec3(0, -1, 0), vec3(0, 0, 1));
    expect(frameUp(f).z).toBeCloseTo(1, 12);
  });

  it('maps the entry centre to the exit centre and swaps front and back', () => {
    const tr = portalTransform(floor, wall);
    const c = transformPoint(tr, floor.origin);
    expect(c.x).toBeCloseTo(1000, 9);
    expect(c.y).toBeCloseTo(200, 9);
    expect(c.z).toBeCloseTo(64, 9);
    // Just behind the floor portal → just in front of the wall portal.
    const behind = transformPoint(tr, vec3(0, 0, -3));
    expect(planeDistance(wall, behind)).toBeCloseTo(3, 9);
    const front = transformPoint(tr, vec3(0, 0, 5));
    expect(planeDistance(wall, front)).toBeCloseTo(-5, 9);
  });

  it('turns "into A" into "out of B"', () => {
    const tr = portalTransform(floor, wall);
    const v = transformVector(tr, vec3(0, 0, -1));
    expect(v.x).toBeCloseTo(1, 12);
    expect(Math.abs(v.y) + Math.abs(v.z)).toBeLessThan(1e-12);
  });

  it('conserves speed exactly for falls into a floor portal (speedy thing goes in, speedy thing comes out)', () => {
    const tr = portalTransform(floor, wall);
    for (const fall of [100, 1000, 4000]) {
      const speed = Math.sqrt(2 * 600 * fall);
      const vin = vec3(13.5, -7.25, -speed);
      const vout = transformVector(tr, vin);
      expect(Math.abs(len(vout) - len(vin))).toBeLessThan(1e-9 * len(vin));
      expect(vout.x).toBeCloseTo(speed, 9);
    }
  });

  it('is an exact inverse with the reverse passage', () => {
    const a = frameFromAngles(vec3(-37, 512, 300), vec3(0, 33, 0));
    const b = frameFromAngles(vec3(800, -64, 32), vec3(90, 0, 0));
    const ab = portalTransform(a, b);
    const ba = portalTransform(b, a);
    const p = vec3(-20, 500, 310);
    const back = transformPoint(ba, transformPoint(ab, p));
    expect(back.x).toBeCloseTo(p.x, 9);
    expect(back.y).toBeCloseTo(p.y, 9);
    expect(back.z).toBeCloseTo(p.z, 9);
  });

  it('turns view angles with the pair', () => {
    const a = frameFromAngles(vec3(), vec3(0, 90, 0)); // wall facing +y
    const b = frameFromAngles(vec3(), vec3(0, 0, 0)); // wall facing +x
    const tr = portalTransform(a, b);
    // Walking into A means looking along −y; coming out of B looks along +x.
    const ang = transformAngles(tr, vec3(0, -90, 0));
    const f = vec3();
    angleVectors(ang, f);
    expect(f.x).toBeCloseTo(1, 9);
  });

  it('finds where a segment enters the rectangle and nothing outside it', () => {
    expect(segmentEntersPortal(floor, vec3(10, 20, 30), vec3(10, 20, -30))).toBeCloseTo(0.5, 12);
    expect(segmentEntersPortal(floor, vec3(10, 20, -30), vec3(10, 20, 30))).toBe(-1);
    expect(segmentEntersPortal(floor, vec3(100, 0, 30), vec3(100, 0, -30))).toBe(-1);
    expect(withinRect(wall, vec3(1000, 200 + 31, 64 + 55))).toBe(true);
    expect(withinRect(wall, vec3(1000, 200 + 33, 64))).toBe(false);
  });

  it('detects overlapping rectangles on one plane only', () => {
    const p1 = frameFromAngles(vec3(0, 0, 64), vec3(0, 0, 0));
    expect(rectsOverlap(p1, frameFromAngles(vec3(0, 40, 64), vec3(0, 0, 0)))).toBe(true);
    expect(rectsOverlap(p1, frameFromAngles(vec3(0, 70, 64), vec3(0, 0, 0)))).toBe(false);
    expect(rectsOverlap(p1, frameFromAngles(vec3(0, 0, 64), vec3(0, 180, 0)))).toBe(false);
  });
});
