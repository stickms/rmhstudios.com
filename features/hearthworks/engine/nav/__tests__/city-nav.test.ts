import { describe, expect, it } from 'vitest';
import { ROAD_STEP_COST } from '../../content';
import { stepWorld, roadLink, tileIndex, packCell, type World } from '../../world';
import { mid, run, townWorld } from '../../world/__tests__/town';
import {
  adjacentMove,
  findPath,
  newMover,
  startPath,
  stepMover,
  stepTicks,
  TICKS_PER_TILE,
} from '..';

function walkTicks(w: World, from: { x: number; z: number }, to: { x: number; z: number }): number {
  const m = newMover(from.x, from.z);
  expect(startPath(w, m, to)).toBe(true);
  let n = 0;
  while (n < 5000) {
    n++;
    const s = stepMover(w, m);
    if (s === 'arrived') return n;
    if (s === 'blocked') throw new Error('blocked');
  }
  throw new Error('never arrived');
}

describe('roads in the pathfinder', () => {
  it('cost less than open ground, and are walked faster', () => {
    const w = townWorld();
    const m = mid(w);
    run(w, { type: 'placeRoad', x: m, z: m, x2: m + 8, z2: m });
    const move = adjacentMove(w, m, m, m + 1, m);
    expect(move).toEqual({ kind: 'walk', cost: ROAD_STEP_COST });
    expect(adjacentMove(w, m, m + 1, m + 1, m + 1)?.cost).toBe(1); // the same step beside the road
    expect(stepTicks('walk', 1, 0, true)).toBeLessThan(stepTicks('walk', 1, 0));
    const onRoad = walkTicks(w, { x: m, z: m }, { x: m + 8, z: m });
    const beside = walkTicks(w, { x: m, z: m + 2 }, { x: m + 8, z: m + 2 });
    expect(onRoad).toBeLessThan(beside);
    expect(onRoad).toBeLessThan(8 * TICKS_PER_TILE); // faster than the plain walk of the same length
  });

  it('are preferred even when they are a detour, and the same route is found every time', () => {
    const w = townWorld(40);
    const m = mid(w);
    // A U of road: down 3, across 10, up 3 — longer than the straight line over open grass, but much cheaper.
    run(w, { type: 'placeRoad', x: m, z: m, x2: m, z2: m + 3 });
    run(w, { type: 'placeRoad', x: m, z: m + 3, x2: m + 10, z2: m + 3 });
    run(w, { type: 'placeRoad', x: m + 10, z: m + 3, x2: m + 10, z2: m });
    const a = findPath(w, { x: m, z: m }, { x: m + 10, z: m })!;
    const b = findPath(w, { x: m, z: m }, { x: m + 10, z: m })!;
    expect(a).toEqual(b);
    expect(a.steps.some((s) => s.z === m + 3 && s.x === m + 5)).toBe(true); // took the road
    // Without the roads it is the straight line.
    const bare = townWorld(40);
    const straight = findPath(bare, { x: m, z: m }, { x: m + 10, z: m })!;
    expect(straight.steps.every((s) => s.z === m)).toBe(true);
    expect(a.cost).toBeLessThan(straight.cost + 0.001);
  });

  it('walk up and down a one-block ramp instead of jumping, but a two-block cliff splits the road', () => {
    const w = townWorld();
    const m = mid(w);
    w.height[tileIndex(w, m + 1, m)] = 4;
    w.height[tileIndex(w, m + 2, m)] = 6;
    run(w, { type: 'placeRoad', x: m, z: m, x2: m + 2, z2: m });
    expect(adjacentMove(w, m, m, m + 1, m)).toEqual({ kind: 'walk', cost: ROAD_STEP_COST });
    expect(adjacentMove(w, m + 1, m, m, m)).toEqual({ kind: 'walk', cost: ROAD_STEP_COST });
    expect(roadLink(w, m + 1, m, m + 2, m)).toBe(false);
    expect(adjacentMove(w, m + 1, m, m + 2, m)).toBeNull(); // +2 is a wall for a walker
  });

  it('treat developed lots and utilities as walls', () => {
    const w = townWorld();
    const m = mid(w);
    w.city.cells[tileIndex(w, m + 1, m)] = packCell({ zone: 'homes', level: 1 });
    w.city.cells[tileIndex(w, m + 1, m + 1)] = packCell({ utility: 'well' });
    stepWorld(w, 0);
    expect(adjacentMove(w, m, m, m + 1, m)).toBeNull();
    expect(adjacentMove(w, m, m + 1, m + 1, m + 1)).toBeNull();
    // An empty zoned tile is still open ground.
    w.city.cells[tileIndex(w, m + 1, m - 1)] = packCell({ zone: 'homes' });
    expect(adjacentMove(w, m, m - 1, m + 1, m - 1)).not.toBeNull();
  });
});
