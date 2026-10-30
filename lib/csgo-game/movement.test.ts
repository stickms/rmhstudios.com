/**
 * CS:GO movement on the shared playerMove: run speed by weapon (items_game `max player speed`),
 * walking and crouching shares, the scoped AWP, the 57-unit jump apex, stamina slowing repeated jumps
 * and landings, the bunny-hop cap, and the hull / eye heights.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import {
  FL_ONGROUND,
  IN_ATTACK2,
  IN_DUCK,
  IN_FORWARD,
  IN_JUMP,
  IN_SPEED,
} from '../tf2-game/core/constants';
import { length2D } from '../tf2-game/core/vec';
import { GR_STATE_RND_RUNNING } from '../tf2-game/sim/rules';
import { cmdFor, csTestWorld, setupCs } from './__fixtures__/cs-world';
import {
  CS_DUCK_SPEED_FRACTION,
  CS_JUMP_HEIGHT,
  CS_JUMP_IMPULSE,
  CS_MOVE_PARAMS,
  CS_WALK_SPEED_FRACTION,
  csMaxSpeed,
  staminaAfterJump,
  staminaAfterLand,
  staminaRecover,
  staminaScale,
  SV_STAMINAMAX,
} from './movement';
import type { CsPlayer } from './player';
import type { CsWorld } from './world';

beforeAll(setupCs);

/** A world past the freeze time with one Terrorist (alone: the round runs on its clock). */
function liveWorld(): { w: CsWorld; p: CsPlayer } {
  const w = csTestWorld({ settings: { freezeTime: 0 } });
  const p = w.addPlayer('runner') as CsPlayer;
  p.requestTeam(2);
  p.requestClass(1);
  for (let i = 0; i < 5; i++) w.step();
  expect(w.rules.state).toBe(GR_STATE_RND_RUNNING);
  return { w, p };
}

let cmdNo = 0;
function run(w: CsWorld, p: CsPlayer, ticks: number, buttons: number, slot = 0, yaw = 0): number {
  let top = 0;
  // Back to the west end before each run, so the room's walls never stop it.
  w.teleportEntity(p, { x: -1200, y: 0, z: p.origin.z }, null, { x: 0, y: 0, z: 0 });
  for (let i = 0; i < ticks; i++) {
    w.queueCommand(
      p.id,
      cmdFor(w, ++cmdNo, {
        forwardMove: buttons & IN_FORWARD ? 450 : 0,
        buttons,
        weaponSelect: i === 0 ? slot : 0,
        viewAngles: { x: 0, y: yaw, z: 0 },
      }),
    );
    w.step();
    w.drainEvents();
    // The speed it settles at (a crouch starts from the standing speed).
    top = length2D(p.velocity);
  }
  return top;
}

describe('CS:GO movement', () => {
  it('uses CS:GO convars and hulls', () => {
    expect(CS_MOVE_PARAMS).toMatchObject({
      sv_accelerate: 5.5,
      sv_friction: 5.2,
      sv_airaccelerate: 12,
      sv_stopspeed: 80,
      gravity: 800,
      maxSpeedCap: 320,
    });
    expect(CS_MOVE_PARAMS.hullMax.z).toBe(72);
    expect(CS_MOVE_PARAMS.duckHullMax.z).toBe(54);
    expect(CS_MOVE_PARAMS.viewZ).toBe(64);
    expect(CS_MOVE_PARAMS.duckViewZ).toBe(46);
    expect(CS_JUMP_IMPULSE).toBeCloseTo(301.993, 2);
  });

  it('runs at the active weapon’s max speed; walks at 52 % and crouches at 34 %', () => {
    const { w, p } = liveWorld();
    // Knife (slot 3): 250; pistol (slot 2): 240.
    expect(run(w, p, 200, IN_FORWARD, 3)).toBeCloseTo(250, 0);
    expect(run(w, p, 200, IN_FORWARD, 2)).toBeCloseTo(240, 0);
    // A rifle (215) and the AWP (200, scoped 100).
    p.giveNamedWeapon('weapon_ak47');
    expect(run(w, p, 200, IN_FORWARD, 1)).toBeCloseTo(215, 0);
    p.giveNamedWeapon('weapon_awp');
    expect(run(w, p, 200, IN_FORWARD, 1)).toBeCloseTo(200, 0);
    run(w, p, 1, IN_FORWARD | IN_ATTACK2);
    expect(run(w, p, 200, IN_FORWARD)).toBeCloseTo(100, 0);
    // Knife again: walking and crouching.
    run(w, p, 1, 0, 3);
    expect(run(w, p, 200, IN_FORWARD | IN_SPEED)).toBeCloseTo(250 * CS_WALK_SPEED_FRACTION, 0);
    expect(run(w, p, 200, IN_FORWARD | IN_DUCK)).toBeCloseTo(250 * CS_DUCK_SPEED_FRACTION, 0);
  });

  it('jumps to a ~57-unit apex', () => {
    const { w, p } = liveWorld();
    run(w, p, 30, 0);
    const ground = p.origin.z;
    let apex = ground;
    for (let i = 0; i < 80; i++) {
      w.queueCommand(p.id, cmdFor(w, ++cmdNo, { buttons: i === 0 ? IN_JUMP : 0 }));
      w.step();
      apex = Math.max(apex, p.origin.z);
    }
    // v² / 2g is 57; the engine's half-step gravity integration (CGameMovement's StartGravity /
    // FinishGravity) peaks about v·dt/2 ≈ 2.3 units lower, as in the game.
    expect(apex - ground).toBeGreaterThan(CS_JUMP_HEIGHT - 3);
    expect(apex - ground).toBeLessThan(CS_JUMP_HEIGHT + 0.5);
    expect(p.move.flags & FL_ONGROUND).toBeTruthy();
  });

  it('stamina: a jump right after landing is lower, and it recovers', () => {
    const { w, p } = liveWorld();
    run(w, p, 120, 0);
    const jumpHeight = (): number => {
      const ground = p.origin.z;
      let apex = ground;
      w.queueCommand(p.id, cmdFor(w, ++cmdNo, { buttons: IN_JUMP }));
      w.step();
      for (let i = 0; i < 90 && !(p.move.flags & FL_ONGROUND && i > 5); i++) {
        w.queueCommand(p.id, cmdFor(w, ++cmdNo, { buttons: 0 }));
        w.step();
        apex = Math.max(apex, p.origin.z);
      }
      return apex - ground;
    };
    const fresh = jumpHeight();
    expect(p.stamina).toBeGreaterThan(0);
    const tired = jumpHeight();
    expect(tired).toBeLessThan(fresh - 2);
    run(w, p, 120, 0);
    expect(p.stamina).toBe(0);
    expect(jumpHeight()).toBeCloseTo(fresh, 0);
  });

  it('stamina model numbers (sv_stamina* cvars)', () => {
    expect(staminaAfterJump(0)).toBeCloseTo(0.08 * CS_JUMP_IMPULSE, 6);
    expect(staminaAfterLand(0, 300)).toBeCloseTo(15, 6);
    expect(staminaAfterJump(SV_STAMINAMAX)).toBe(SV_STAMINAMAX);
    expect(staminaRecover(30, 0.5)).toBe(0);
    expect(staminaScale(25)).toBeCloseTo(0.75, 6);
    expect(csMaxSpeed(250, false, 1, 20)).toBeCloseTo(200, 6);
    expect(csMaxSpeed(400, false, 1, 0)).toBe(320);
  });

  it('crouch-jumps (CS allows a jump while crouched) and caps a bunny hop at 1.1 × max speed', () => {
    const { w, p } = liveWorld();
    run(w, p, 60, IN_DUCK);
    const ground = p.origin.z;
    let apex = ground;
    for (let i = 0; i < 60; i++) {
      w.queueCommand(p.id, cmdFor(w, ++cmdNo, { buttons: IN_DUCK | (i === 0 ? IN_JUMP : 0) }));
      w.step();
      apex = Math.max(apex, p.origin.z);
    }
    expect(apex - ground).toBeGreaterThan(40);
    // A fast player jumping off the ground leaves at most 1.1 × max speed.
    run(w, p, 30, 0, 3);
    p.velocity.x = 600;
    p.velocity.y = 0;
    w.queueCommand(p.id, cmdFor(w, ++cmdNo, { buttons: IN_JUMP }));
    w.step();
    expect(length2D(p.velocity)).toBeLessThanOrEqual(250 * 1.1 + 1);
  });
});
