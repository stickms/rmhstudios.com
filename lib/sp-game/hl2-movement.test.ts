/**
 * Half-Life 2 / Portal movement through the shared CGameMovement port with
 * HL2 parameters, checked against the SDK's formulas (gamemovement.cpp,
 * hl2_player.cpp, shareddefs.h). Synthetic room, no game files.
 */
import { describe, expect, it } from 'vitest';
import { FL_ONGROUND, IN_DUCK, IN_JUMP } from '../tf2-game/core/constants';
import { emptyUserCmd, type UserCmd } from '../tf2-game/core/types';
import { playerMove, TF_MOVE_PARAMS } from '../tf2-game/sim/movement';
import { createMoveState, type MoveContext, type MoveState } from '../tf2-game/sim/movement-types';
import { BoxWorld, roomBrushes } from '../tf2-game/sim/__fixtures__/box-world';
import {
  DAMAGE_FOR_FALL_SPEED,
  HL2_JUMP_IMPULSE,
  HL2_MOVE_PARAMS,
  HL2_NORM_SPEED,
  HL2_SPRINT_SPEED,
  HL2_WALK_SPEED,
  PLAYER_FATAL_FALL_SPEED,
  PLAYER_MAX_SAFE_FALL_SPEED,
  PORTAL_MOVE_PARAMS,
  SP_GRAVITY,
} from './constants';

const DT = 0.015;

function setup(params = HL2_MOVE_PARAMS, maxSpeed = HL2_NORM_SPEED, height = 4096) {
  const world = new BoxWorld(roomBrushes(4096, height));
  const st = createMoveState(0, 0);
  st.viewOffsetZ = params.viewZ ?? 64;
  st.maxSpeed = maxSpeed;
  st.origin.z = 0.03125;
  const falls: number[] = [];
  const ctx: MoveContext = { params, world, curtime: 0, filter: null, onFallDamage: (s) => falls.push(s) };
  const cmd: UserCmd = emptyUserCmd();
  const run = (n: number, f?: (st: MoveState, i: number) => void): void => {
    for (let i = 0; i < n; i++) {
      cmd.commandNumber++;
      ctx.curtime += DT;
      playerMove(st, cmd, ctx);
      f?.(st, i);
    }
  };
  run(2);
  return { st, cmd, run, ctx, falls };
}

describe('HL2 movement (CGameMovement with HL2 parameters)', () => {
  it('uses sv_gravity 600 and the HL2 hull / view', () => {
    expect(HL2_MOVE_PARAMS.gravity).toBe(SP_GRAVITY);
    expect(HL2_MOVE_PARAMS.hullMax.z).toBe(72);
    expect(HL2_MOVE_PARAMS.duckHullMax.z).toBe(36);
    expect(HL2_MOVE_PARAMS.viewZ).toBe(64);
    expect(PORTAL_MOVE_PARAMS.gravity).toBe(600);
    // TF2 is untouched.
    expect(TF_MOVE_PARAMS.gravity).toBe(800);
    expect(TF_MOVE_PARAMS.jumpImpulse).toBe(289);
  });

  it('falls with g = 600 u/s²', () => {
    const { st, run } = setup();
    st.origin.z = 2000;
    st.flags &= ~FL_ONGROUND;
    st.groundEntity = -1;
    st.velocity.z = 0;
    run(100);
    // Velocity after n ticks of half-step gravity: −g·n·dt (exact).
    expect(st.velocity.z).toBeCloseTo(-SP_GRAVITY * 100 * DT, 6);
  });

  it('jumps with the 160 u/s impulse to an apex of v²/2g ≈ 21.3 units', () => {
    const { st, cmd, run } = setup();
    expect(st.flags & FL_ONGROUND).toBeTruthy();
    const z0 = st.origin.z;
    cmd.buttons = IN_JUMP;
    let apex = z0;
    let first = 0;
    run(60, (s, i) => {
      if (i === 0) first = s.velocity.z;
      apex = Math.max(apex, s.origin.z);
    });
    // FullWalkMove: StartGravity (−½g·dt), CheckJumpButton adds 160 and runs FinishGravity
    // (−½g·dt), then the tick's own FinishGravity (−½g·dt).
    expect(first).toBeCloseTo(HL2_JUMP_IMPULSE - 1.5 * SP_GRAVITY * DT, 6);
    const ideal = (HL2_JUMP_IMPULSE * HL2_JUMP_IMPULSE) / (2 * SP_GRAVITY);
    expect(apex - z0).toBeGreaterThan(ideal - 1.3);
    expect(apex - z0).toBeLessThan(ideal + 0.1);
    // Not the TF2 jump (289 → 52 units at 800).
    expect(apex - z0).toBeLessThan(30);
  });

  it.each([
    ['walk', HL2_WALK_SPEED],
    ['normal', HL2_NORM_SPEED],
    ['sprint', HL2_SPRINT_SPEED],
  ])('reaches the %s speed (%d u/s) and no more', (_name, speed) => {
    const { st, cmd, run } = setup(HL2_MOVE_PARAMS, speed);
    cmd.forwardMove = 450;
    run(200);
    expect(Math.hypot(st.velocity.x, st.velocity.y)).toBeCloseTo(speed, 3);
  });

  it('crouch-walks at a third of the speed', () => {
    const { st, cmd, run } = setup();
    cmd.buttons = IN_DUCK;
    cmd.forwardMove = 450;
    run(200);
    expect(st.ducked).toBe(true);
    expect(Math.hypot(st.velocity.x, st.velocity.y)).toBeCloseTo(HL2_NORM_SPEED * 0.33333333, 1);
  });

  it('allows jumping while ducked (crouch jump), unlike TF2', () => {
    const { st, cmd, run } = setup();
    cmd.buttons = IN_DUCK;
    run(60);
    expect(st.ducked).toBe(true);
    cmd.buttons = IN_DUCK | IN_JUMP;
    run(1);
    expect(st.velocity.z).toBeGreaterThan(100);
  });

  it('adds the single-player forward jump boost, capped at 1.5 × max speed', () => {
    const { st, cmd, run } = setup();
    cmd.forwardMove = 450;
    run(200);
    cmd.buttons = IN_JUMP;
    run(1);
    // Boost: half of the clamped forward move, clipped to max + 50 % … then the air move.
    const h = Math.hypot(st.velocity.x, st.velocity.y);
    expect(h).toBeGreaterThan(HL2_NORM_SPEED + 1);
    expect(h).toBeLessThanOrEqual(HL2_NORM_SPEED * 1.5 + 1e-6);
  });

  it('reports a fall above the 526.5 u/s safe speed (HL2 fall damage rule)', () => {
    const { st, run, falls } = setup();
    st.origin.z = 600;
    st.flags &= ~FL_ONGROUND;
    st.groundEntity = -1;
    run(200);
    expect(falls.length).toBe(1);
    const speed = falls[0];
    expect(speed).toBeGreaterThan(PLAYER_MAX_SAFE_FALL_SPEED);
    // ~sqrt(2·600·600) = 848 u/s → (848 − 526.5) × 100 / (922.5 − 526.5) ≈ 81 damage.
    expect(speed).toBeCloseTo(Math.sqrt(2 * SP_GRAVITY * 600), -1);
    const dmg = (speed - PLAYER_MAX_SAFE_FALL_SPEED) * DAMAGE_FOR_FALL_SPEED;
    expect(dmg).toBeGreaterThan(70);
    expect(dmg).toBeLessThan(100);
    expect(DAMAGE_FOR_FALL_SPEED).toBeCloseTo(100 / (PLAYER_FATAL_FALL_SPEED - PLAYER_MAX_SAFE_FALL_SPEED), 10);
  });
});
