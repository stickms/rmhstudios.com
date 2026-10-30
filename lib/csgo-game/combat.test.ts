/**
 * CS:GO's damage and accuracy: hit groups through armor (with and without a helmet), range falloff,
 * the inaccuracy model and the spray — the same pattern on the host and on a predicting client from
 * the same commands — and penetration through a wall in a box world.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import {
  HITGROUP_CHEST,
  HITGROUP_HEAD,
  HITGROUP_LEFTLEG,
  HITGROUP_STOMACH,
} from '../tf2-game/core/types';
import { IN_ATTACK } from '../tf2-game/core/constants';
import { UniformRandomStream } from '../tf2-game/core/random';
import { boxBrush } from '../tf2-game/sim/__fixtures__/box-world';
import { cmdFor, csTestWorld, setupCs } from './__fixtures__/cs-world';
import {
  applyArmor,
  buildRecoilTable,
  csInaccuracy,
  csShotOffsets,
  damageAfterPenetration,
  hitGroupMultiplier,
  materialPenetration,
  penetrationDepth,
  rangeDamage,
  type ArmorResult,
} from './combat';
import { csWeapon } from './data/weapon-data';
import type { CsPlayer } from './player';
import { CsGun } from './weapons/gun';
import type { CsWorld } from './world';

beforeAll(setupCs);

const res: ArmorResult = { health: 0, armor: 0 };

describe('hit groups and armor', () => {
  it('multiplies by hit group (head ×4, stomach ×1.25, chest ×1, legs ×0.75)', () => {
    expect(hitGroupMultiplier(HITGROUP_HEAD)).toBe(4);
    expect(hitGroupMultiplier(HITGROUP_STOMACH)).toBe(1.25);
    expect(hitGroupMultiplier(HITGROUP_CHEST)).toBe(1);
    expect(hitGroupMultiplier(HITGROUP_LEFTLEG)).toBe(0.75);
  });

  it("applies the weapon's armor ratio: the head only with a helmet, the legs never", () => {
    const ak = csWeapon('ak47')!;
    // Chest, kevlar: 36 × 1.55 / 2 = 27.9 to health; half the absorbed 8.1 off the armor.
    applyArmor(36, HITGROUP_CHEST, 100, false, ak.armorRatio, res);
    expect(res.health).toBeCloseTo(27.9, 6);
    expect(res.armor).toBeCloseTo(4.05, 6);
    // Head, no helmet: the full 144.
    applyArmor(36 * 4, HITGROUP_HEAD, 100, false, ak.armorRatio, res);
    expect(res.health).toBe(144);
    // Head, helmet: 111.6.
    applyArmor(36 * 4, HITGROUP_HEAD, 100, true, ak.armorRatio, res);
    expect(res.health).toBeCloseTo(111.6, 6);
    // Legs: never armored.
    applyArmor(27, HITGROUP_LEFTLEG, 100, true, ak.armorRatio, res);
    expect(res.health).toBe(27);
    // Almost no armor left: the armor runs out and the rest reaches health.
    applyArmor(100, HITGROUP_CHEST, 2, false, 1.0, res);
    expect(res.armor).toBe(2);
    expect(res.health).toBeCloseTo(96, 6);
  });

  it('falls off with range: damage × rangeModifier ^ (distance / 500)', () => {
    expect(rangeDamage(36, 0.98, 0)).toBe(36);
    expect(rangeDamage(36, 0.98, 500)).toBeCloseTo(35.28, 6);
    expect(rangeDamage(36, 0.98, 1000)).toBeCloseTo(34.5744, 4);
  });
});

/** Two Ts and a CT past the freeze time; returns the shooter and the victim (the second T idles). */
function duel(
  w: CsWorld,
  shooterAt: { x: number; y: number },
  victimAt: { x: number; y: number },
): { s: CsPlayer; v: CsPlayer } {
  const s = w.addPlayer('shooter') as CsPlayer;
  const v = w.addPlayer('victim') as CsPlayer;
  s.requestTeam(2);
  s.requestClass(1);
  v.requestTeam(3);
  v.requestClass(1);
  for (let i = 0; i < 4; i++) w.step();
  w.teleportEntity(
    s,
    { x: shooterAt.x, y: shooterAt.y, z: 0.03125 },
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 0, z: 0 },
  );
  w.teleportEntity(
    v,
    { x: victimAt.x, y: victimAt.y, z: 0.03125 },
    { x: 0, y: 180, z: 0 },
    { x: 0, y: 0, z: 0 },
  );
  v.armor = 0;
  v.helmet = false;
  return { s, v };
}

describe('shots', () => {
  it('a standing first shot to the head kills an unarmored player (36 × 4 = 144)', () => {
    const w = csTestWorld({ settings: { freezeTime: 0 } });
    const { s, v } = duel(w, { x: -900, y: 300 }, { x: -700, y: 300 });
    s.giveNamedWeapon('weapon_ak47');
    s.switchToSlot(0);
    for (let i = 0; i < 80; i++) w.step(); // the draw
    // Eye at 64 → the head box centre at ~67: aim a hair up.
    const pitch = (-Math.atan2(67 - 64, 200) * 180) / Math.PI;
    w.queueCommand(
      s.id,
      cmdFor(w, 1000, { buttons: IN_ATTACK, viewAngles: { x: pitch, y: 0, z: 0 } }),
    );
    w.step();
    const deaths = w.drainEvents().filter((e) => e.type === 'death');
    expect(v.alive).toBe(false);
    expect(deaths).toHaveLength(1);
    expect((deaths[0] as { customKill: number }).customKill).toBe(1); // headshot
  });

  it('inaccuracy: crouching < standing < running, airborne; the scoped AWP far below unscoped', () => {
    const ak = csWeapon('ak47')!;
    const base = {
      onGround: true,
      ducked: false,
      speed: 0,
      weaponSpeed: 215,
      zoomed: false,
      penalty: 0,
    };
    const stand = csInaccuracy(ak, base);
    const crouch = csInaccuracy(ak, { ...base, ducked: true });
    const walk = csInaccuracy(ak, { ...base, speed: 0.3 * 215 });
    const run = csInaccuracy(ak, { ...base, speed: 215 });
    const air = csInaccuracy(ak, { ...base, onGround: false });
    expect(crouch).toBeLessThan(stand);
    expect(walk).toBe(stand); // under 34 % of the speed: no moving inaccuracy
    expect(run).toBeGreaterThan(stand + 100);
    expect(air).toBeGreaterThan(stand + 100);
    // The scoped AWP is far more accurate than unscoped.
    const awp = csWeapon('awp')!;
    expect(csInaccuracy(awp, { ...base, zoomed: true, weaponSpeed: 100 })).toBeLessThan(
      csInaccuracy(awp, base) / 10,
    );
  });

  it('the shot offsets are a pure function of the command seed', () => {
    const a = new Float64Array(18);
    const b = new Float64Array(18);
    csShotOffsets(new UniformRandomStream(1234), 10, 40, 9, a);
    csShotOffsets(new UniformRandomStream(1234), 10, 40, 9, b);
    expect([...a]).toEqual([...b]);
    csShotOffsets(new UniformRandomStream(1235), 10, 40, 9, b);
    expect([...a]).not.toEqual([...b]);
  });

  it("the spray pattern is generated from the weapon's recoil data and seed, deterministically", () => {
    const ak = csWeapon('ak47')!;
    const t1 = buildRecoilTable(ak.recoil.seed, ak.recoil);
    const t2 = buildRecoilTable(ak.recoil.seed, ak.recoil);
    expect([...t1]).toEqual([...t2]);
    expect([...buildRecoilTable(ak.recoil.seed + 1, ak.recoil)]).not.toEqual([...t1]);
    // The first shots climb nearly straight (angle near the base); all stay within the variance.
    expect(Math.abs(t1[0] - ak.recoil.angle)).toBeLessThan(1e-6);
    for (let i = 0; i < 64; i++)
      expect(Math.abs(t1[i * 2] - ak.recoil.angle)).toBeLessThanOrEqual(
        ak.recoil.angleVariance + 1e-6,
      );
  });

  it('host and predicting client fire the same spray from the same commands', () => {
    const host = csTestWorld({ settings: { freezeTime: 0 } });
    const client = csTestWorld({ settings: { freezeTime: 0 }, isServer: false });
    const shooters = [host, client].map((w) => {
      const p = w.addPlayer('sprayer') as CsPlayer;
      p.requestTeam(2);
      p.requestClass(1);
      for (let i = 0; i < 4; i++) w.step();
      w.teleportEntity(
        p,
        { x: -900, y: 0, z: 0.03125 },
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: 0 },
      );
      p.giveNamedWeapon('weapon_ak47');
      p.switchToSlot(0);
      return p;
    });
    if (client.entities.length === 0) throw new Error('no client world');
    const sprays: number[][][] = [[], []];
    const punches: number[][] = [[], []];
    for (let tick = 0; tick < 160; tick++) {
      [host, client].forEach((w, k) => {
        const p = shooters[k];
        const gun = p.activeWeapon() as CsGun;
        const before = gun.lastFireTime;
        w.queueCommand(
          p.id,
          cmdFor(w, 2000 + tick, {
            buttons: tick >= 80 ? IN_ATTACK : 0,
            viewAngles: { x: 0, y: 0, z: 0 },
          }),
        );
        w.step();
        w.drainEvents();
        if (gun.lastFireTime !== before) sprays[k].push([...gun.lastShotDirs.slice(0, 3)]);
        punches[k].push(p.aimPunch.x, p.aimPunch.y);
      });
    }
    expect(sprays[0].length).toBeGreaterThanOrEqual(10);
    expect(sprays[1]).toEqual(sprays[0]);
    expect(punches[1]).toEqual(punches[0]);
    // The spray climbs: later shots aim higher than the first.
    const z = (d: number[]) => d[2];
    expect(z(sprays[0][9])).toBeGreaterThan(z(sprays[0][0]) + 0.05);
  });
});

describe('penetration', () => {
  it('goes through thin wood (with less damage), not through thick concrete', () => {
    expect(materialPenetration('wood/plywood')).toBeGreaterThan(
      materialPenetration('concrete/wall01'),
    );
    const depthWood = penetrationDepth(2, 'wood');
    expect(damageAfterPenetration(36, 8, depthWood)).toBeGreaterThan(0);
    expect(damageAfterPenetration(36, 8, depthWood)).toBeLessThan(36 * 0.75);
    expect(damageAfterPenetration(36, 64, penetrationDepth(2, 'concrete'))).toBe(0);

    const shot = (material: string, thickness: number): number => {
      const wall = boxBrush(
        { x: -810, y: 200, z: 0 },
        { x: -810 + thickness, y: 400, z: 128 },
        { surfaceName: material },
      );
      const w = csTestWorld({ settings: { freezeTime: 0 }, extraBrushes: [wall] });
      const { s, v } = duel(w, { x: -900, y: 300 }, { x: -700, y: 300 });
      s.giveNamedWeapon('weapon_ak47');
      s.switchToSlot(0);
      for (let i = 0; i < 80; i++) w.step();
      const pitch = (-Math.atan2(46 - 64, 200) * 180) / Math.PI; // the chest
      w.queueCommand(
        s.id,
        cmdFor(w, 3000, { buttons: IN_ATTACK, viewAngles: { x: pitch, y: 0, z: 0 } }),
      );
      w.step();
      return 100 - v.health;
    };
    const wood = shot('wood/door', 8);
    expect(wood).toBeGreaterThan(0);
    expect(wood).toBeLessThan(36);
    expect(shot('concrete/wall', 64)).toBe(0);
  });
});
