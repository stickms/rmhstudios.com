import { describe, expect, it } from 'vitest';
import { createWorld, stepWorld, type World } from '../../world';
import {
  RUN_SPEED,
  WALK_SPEED,
  canStand,
  locomotionBlend,
  stepAvatar,
  tileBlocked,
  type AvatarState,
} from '..';

/** A flat grass arena with a water rim, so tests control exactly what is in the way. */
function arena(): World {
  const w = createWorld(1, 16);
  w.terrain = w.terrain.map((_, i) => {
    const x = i % 16;
    const z = Math.floor(i / 16);
    return x === 0 || z === 0 || x === 15 || z === 15 ? 'water' : 'grass';
  });
  w.height = w.height.map((_, i) => {
    const x = i % 16;
    const z = Math.floor(i / 16);
    return x === 0 || z === 0 || x === 15 || z === 15 ? 0 : 3;
  });
  return w;
}
const at = (x: number, z: number, yaw = 0, speed = 0): AvatarState => ({ x, z, yaw, speed });
const run = (w: World, s: AvatarState, input: { x: number; z: number; run?: boolean }, ms: number) => {
  let st = s;
  for (let t = 0; t < ms; t += 16) st = stepAvatar(w, st, { x: input.x, z: input.z, run: !!input.run }, 16);
  return st;
};

describe('stepAvatar', () => {
  it('accelerates softly to walking speed rather than snapping to it', () => {
    const w = arena();
    const one = stepAvatar(w, at(8, 8), { x: 0, z: 1, run: false }, 16);
    expect(one.speed).toBeGreaterThan(0);
    expect(one.speed).toBeLessThan(WALK_SPEED * 0.5);
    const settled = run(w, at(8, 8), { x: 0, z: 1 }, 1000);
    expect(settled.speed).toBeCloseTo(WALK_SPEED, 1);
    expect(run(w, at(8, 8), { x: 0, z: 1, run: true }, 1500).speed).toBeCloseTo(RUN_SPEED, 1);
  });

  it('moves the way it faces and eases to a stop when input ends', () => {
    const w = arena();
    const moving = run(w, at(8, 8, 0), { x: 0, z: 1 }, 600);
    expect(moving.z).toBeGreaterThan(8.5);
    expect(Math.abs(moving.x - 8)).toBeLessThan(0.01);
    const stopped = run(w, moving, { x: 0, z: 0 }, 600);
    expect(stopped.speed).toBeLessThan(0.01);
  });

  it('turns the short way round (π−ε → −π+ε crosses ±π, not through zero)', () => {
    const w = arena();
    const s = stepAvatar(w, at(8, 8, 3.0), { x: Math.sin(-3.0), z: Math.cos(-3.0), run: false }, 16);
    // heading −3.0 is 0.283 rad away the short way; the long way is 6.0 — yaw must move toward ±π
    expect(Math.abs(s.yaw)).toBeGreaterThan(2.9);
  });

  it('is stopped by water and by solid buildings but not by roads or plots', () => {
    const w = arena();
    const edge = run(w, at(14, 8, Math.PI / 2), { x: 1, z: 0 }, 2000);
    expect(edge.x).toBeLessThan(14.5);
    w.players = {};
    stepWorld(w, 0, [{ type: 'join', playerId: 'p' }]);
    w.players.p.money = 9999;
    stepWorld(w, 0, [
      { type: 'place', playerId: 'p', kind: 'cottage', x: 10, z: 8 },
      { type: 'place', playerId: 'p', kind: 'road', x: 5, z: 8 },
    ]);
    const hit = run(w, at(7, 8, Math.PI / 2), { x: 1, z: 0 }, 2000);
    expect(hit.x).toBeLessThan(9.6);
    const over = run(w, at(7, 8, -Math.PI / 2), { x: -1, z: 0 }, 1500);
    expect(over.x).toBeLessThan(5);
  });

  it('slides along a wall instead of sticking to it', () => {
    const w = arena();
    stepWorld(w, 0, [{ type: 'join', playerId: 'p' }]);
    w.players.p.money = 99_999;
    for (let z = 4; z <= 12; z++) stepWorld(w, 0, [{ type: 'place', playerId: 'p', kind: 'cottage', x: 10, z }]);
    const s = run(w, at(8.5, 6, Math.atan2(1, 1)), { x: 1, z: 1 }, 6000);
    expect(s.x).toBeLessThan(9.4); // never through the wall
    expect(s.z).toBeGreaterThan(8); // but kept moving along it
  });

  it('climbs one block but not two', () => {
    const w = arena();
    w.height[8 * 16 + 9] = 4; // +1: fine
    w.height[8 * 16 + 11] = 6; // from 3→6 across 10→11? separate test below
    expect(canStand(w, 9, 8, 8, 8)).toBe(true);
    w.height[8 * 16 + 10] = 6; // +3 from level 3
    expect(canStand(w, 10, 8, 8, 8)).toBe(false);
    expect(tileBlocked(w, 10, 8)).toBe(false); // open ground, just too steep
  });

  it('is safe against bad dt and bad input', () => {
    const w = arena();
    const s = at(8, 8);
    expect(stepAvatar(w, s, { x: 1, z: 0, run: false }, Number.NaN)).toBe(s);
    expect(stepAvatar(w, s, { x: 1, z: 0, run: false }, -5)).toBe(s);
    const out = stepAvatar(w, s, { x: Number.NaN, z: Infinity, run: false }, 16);
    for (const v of [out.x, out.z, out.yaw, out.speed]) expect(Number.isFinite(v)).toBe(true);
    // a huge frame gap is capped, so a stalled tab cannot teleport the avatar through a wall
    const jump = stepAvatar(w, at(13.5, 8, Math.PI / 2, RUN_SPEED), { x: 1, z: 0, run: true }, 60_000);
    expect(jump.x).toBeLessThan(14.6);
  });
});

describe('locomotionBlend', () => {
  it('always sums to 1, idles at rest, walks mid-speed, runs flat out', () => {
    for (let v = -1; v <= 6; v += 0.1) {
      const b = locomotionBlend(v);
      expect(b.idle + b.walk + b.run).toBeCloseTo(1, 9);
      for (const k of [b.idle, b.walk, b.run]) expect(k).toBeGreaterThanOrEqual(0);
    }
    expect(locomotionBlend(0).idle).toBe(1);
    expect(locomotionBlend(WALK_SPEED).walk).toBeGreaterThan(0.8);
    expect(locomotionBlend(RUN_SPEED).run).toBe(1);
    expect(locomotionBlend(Number.NaN).idle).toBe(1);
  });
});

describe('being walled in', () => {
  it('lets an avatar standing inside a solid building walk out of it', () => {
    const w = arena();
    stepWorld(w, 0, [{ type: 'join', playerId: 'p' }]);
    w.players.p.money = 99_999;
    w.players.p.x = 3;
    w.players.p.z = 3; // not where we stand, so the building can go up
    stepWorld(w, 0, [{ type: 'place', playerId: 'p', kind: 'cottage', x: 8, z: 8 }]);
    expect(tileBlocked(w, 8, 8)).toBe(true);
    const out = run(w, at(8, 8, 0), { x: 0, z: 1 }, 1500);
    expect(out.z).toBeGreaterThan(9.5);
  });
});
