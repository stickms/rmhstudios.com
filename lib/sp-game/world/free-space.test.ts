/**
 * The nearest-fit search that gets an entity out of a solid (portal exits, movers, a passage
 * closing around the player): shortest nudge first, the preferred direction first, then up.
 */
import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../../tf2-game/core/vec';
import { findFreeSpace } from './free-space';

/** A 72-unit-tall box fits wherever its bottom is at or above the floor (z = 0) and it is clear of a wall at x ≥ 100. */
const roomFits = (p: Vec3): boolean => p.z >= 0 && p.x + 16 <= 100;

describe('findFreeSpace', () => {
  it('returns the position itself when the box already fits (a copy, never the input)', () => {
    const o = { x: 0, y: 0, z: 10 };
    const r = findFreeSpace(o, roomFits);
    expect(r).toEqual(o);
    expect(r).not.toBe(o);
  });

  it('lifts a box sunk into the floor by the shortest step that clears it', () => {
    const r = findFreeSpace({ x: 0, y: 0, z: -2.5 }, roomFits)!;
    expect(r.z).toBeGreaterThanOrEqual(0);
    expect(r.z).toBeLessThan(1);
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
  });

  it('tries the preferred direction first (out of an exit portal) and does not mutate the start', () => {
    const start = { x: 90, y: 0, z: 0 };
    // Stuck in the wall at x ≥ 100: up does not help, the preferred −x does.
    const r = findFreeSpace(start, roomFits, { prefer: { x: -5, y: 0, z: 0 } })!;
    expect(r.x).toBeLessThanOrEqual(84);
    expect(r.z).toBe(0);
    expect(start.x).toBe(90);
  });

  it('gives up past maxDist', () => {
    expect(findFreeSpace({ x: 0, y: 0, z: -100 }, roomFits, { maxDist: 64 })).toBeNull();
    expect(findFreeSpace({ x: 0, y: 0, z: -60 }, roomFits, { maxDist: 64 })!.z).toBeGreaterThanOrEqual(0);
  });
});
