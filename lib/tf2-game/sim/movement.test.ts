/**
 * Movement against the SDK's numbers. Expected values are derived here from
 * the SDK formulas (friction/accelerate recurrences, the jump impulse and the
 * half-step gravity integration, the step height, the 0.7 ground normal …),
 * not read back from the implementation.
 */
import { describe, expect, it } from 'vitest';
import {
  FL_DUCKING,
  IN_BACK,
  IN_DUCK,
  IN_FORWARD,
  IN_JUMP,
  MOVETYPE_NOCLIP,
  MOVETYPE_OBSERVER,
  MASK_PLAYERSOLID,
  TF_CLASS_DEMOMAN,
  TF_CLASS_HEAVYWEAPONS,
  TF_CLASS_MEDIC,
  TF_CLASS_SCOUT,
  TF_CLASS_SNIPER,
  TF_CLASS_SOLDIER,
  TF_CLASS_SPY,
  TF_CLASS_ENGINEER,
  TF_CLASS_PYRO,
  TF_TEAM_RED,
  TICK_INTERVAL,
  VEC_DUCK_HULL_MAX,
  VEC_DUCK_HULL_MIN,
  VEC_HULL_MAX,
  VEC_HULL_MIN,
  WL_EYES,
  WL_FEET,
  WL_NOTINWATER,
  WL_WAIST,
} from '../core/constants';
import type { UserCmd } from '../core/types';
import { emptyTrace, emptyUserCmd } from '../core/types';
import type { Vec3 } from '../core/vec';
import { length2D, simpleSpline } from '../core/vec';
import { BoxWorld, boxBrush, rampBrush, roomBrushes, waterBrush } from './__fixtures__/box-world';
import type { Brush } from './__fixtures__/box-world';
import {
  ALL_CLASSES,
  CLASS_EYE_HEIGHT,
  CLASS_MAX_SPEED,
  calculateMaxSpeed,
  classMaxHealth,
  tfFallDamage,
} from './class-speeds';
import { playerMove } from './movement';
import type { MoveContext, MoveState } from './movement-types';
import {
  MOVE_COND_SHIELD_CHARGE,
  OBS_MODE_ROAMING,
  createMoveState,
  isOnGround,
} from './movement-types';

const DT = TICK_INTERVAL;
const EPS = 0.03125; // DIST_EPSILON: where a resting hull sits above the floor

function makeCtx(brushes: Brush[]): MoveContext & { world: BoxWorld } {
  return { world: new BoxWorld(brushes), curtime: 0, filter: null };
}

/** A flat floor (top at z = 0) with nothing else. */
const flatFloor = (half = 8192): Brush[] => [
  boxBrush({ x: -half, y: -half, z: -64 }, { x: half, y: half, z: 0 }),
];

function makeCmd(): UserCmd {
  return emptyUserCmd();
}

function tick(
  s: MoveState,
  cmd: UserCmd,
  ctx: MoveContext,
  n = 1,
  each?: (i: number) => void,
): void {
  for (let i = 0; i < n; i++) {
    cmd.commandNumber++;
    playerMove(s, cmd, ctx);
    ctx.curtime += DT;
    each?.(i);
  }
}

/** A player of `cls` dropped just above (x, y, z) and left to settle on the ground. */
function spawn(cls: number, ctx: MoveContext, x = 0, y = 0, z = 1): MoveState {
  const s = createMoveState(cls, TF_TEAM_RED);
  s.origin = { x, y, z };
  tick(s, makeCmd(), ctx, 40);
  return s;
}

/** SDK Friction + Accelerate for straight-line ground running at `max` (wish = max). */
function groundAccelRecurrence(max: number, ticks: number): number[] {
  const out: number[] = [];
  let v = 0;
  for (let i = 0; i < ticks; i++) {
    if (v >= 0.1) v = Math.max(0, v - Math.max(v, 100) * 4 * DT);
    const add = max - v;
    if (add > 0) v += Math.min(add, 10 * DT * max);
    v = Math.min(v, max);
    if (v < 1) v = 0;
    out.push(v);
  }
  return out;
}

describe('class data', () => {
  it('matches the shipped class scripts and g_TFClassViewVectors', () => {
    expect(CLASS_MAX_SPEED.slice(1)).toEqual([400, 300, 240, 280, 320, 230, 300, 320, 300]);
    expect(CLASS_EYE_HEIGHT.slice(1)).toEqual([65, 75, 68, 68, 75, 75, 68, 75, 68]);
    for (const cls of ALL_CLASSES) {
      expect(createMoveState(cls).viewOffsetZ).toBe(CLASS_EYE_HEIGHT[cls]);
    }
  });

  it('applies the stock TeamFortress_CalculateMaxSpeed rules', () => {
    expect(calculateMaxSpeed({ classIndex: TF_CLASS_SNIPER, aiming: true })).toBe(80);
    expect(
      calculateMaxSpeed({ classIndex: TF_CLASS_SNIPER, aiming: true, aimingWithBow: true }),
    ).toBe(160);
    expect(calculateMaxSpeed({ classIndex: TF_CLASS_HEAVYWEAPONS, aiming: true })).toBe(110);
    expect(
      calculateMaxSpeed({ classIndex: TF_CLASS_SPY, disguiseClass: TF_CLASS_HEAVYWEAPONS }),
    ).toBe(230);
    expect(calculateMaxSpeed({ classIndex: TF_CLASS_SPY, disguiseClass: TF_CLASS_SCOUT })).toBe(
      320,
    );
    expect(
      calculateMaxSpeed({
        classIndex: TF_CLASS_SPY,
        disguiseClass: TF_CLASS_HEAVYWEAPONS,
        stealthed: true,
      }),
    ).toBe(320);
    expect(calculateMaxSpeed({ classIndex: TF_CLASS_DEMOMAN, shieldCharging: true })).toBe(750);
    expect(calculateMaxSpeed({ classIndex: TF_CLASS_ENGINEER, carryingObject: true })).toBeCloseTo(
      270,
      9,
    );
    expect(calculateMaxSpeed({ classIndex: TF_CLASS_PYRO, teamWin: 'winner' })).toBeCloseTo(330, 9);
    expect(calculateMaxSpeed({ classIndex: TF_CLASS_MEDIC, healTargetMaxSpeed: 400 })).toBe(400);
    expect(
      calculateMaxSpeed({ classIndex: TF_CLASS_SCOUT, isObserver: true, observerRoaming: true }),
    ).toBe(400);
  });
});

describe('ground movement', () => {
  it('a player standing still on flat ground does not drift', () => {
    const ctx = makeCtx(flatFloor());
    const s = spawn(TF_CLASS_SOLDIER, ctx, 10.5, -3.25);
    expect(isOnGround(s)).toBe(true);
    expect(s.origin.z).toBeCloseTo(EPS, 9);
    const start = { ...s.origin };
    tick(s, makeCmd(), ctx, 1000);
    expect(s.origin).toEqual(start);
    expect(s.velocity).toEqual({ x: 0, y: 0, z: 0 });
  });

  it.each(ALL_CLASSES)(
    'class %i accelerates by the SDK recurrence and never exceeds its max speed',
    (cls) => {
      const ctx = makeCtx(flatFloor());
      const s = spawn(cls, ctx);
      const max = CLASS_MAX_SPEED[cls]!;
      const expected = groundAccelRecurrence(max, 120);
      const cmd = makeCmd();
      cmd.forwardMove = 450;
      cmd.buttons = IN_FORWARD;
      tick(s, cmd, ctx, 120, (i) => {
        const sp = length2D(s.velocity);
        expect(sp).toBeCloseTo(expected[i]!, 9);
        expect(sp).toBeLessThanOrEqual(max + 1e-9);
        expect(s.velocity.y).toBeCloseTo(0, 9);
      });
      expect(length2D(s.velocity)).toBeCloseTo(max, 9);
      // From standstill: v1 = 0.15·max, then v ← v·0.94 + 0.15·max (above 100 u/s) until
      // capped — 9 ticks (0.135 s) for every class.
      const ticksToMax = expected.findIndex((v) => v >= max) + 1;
      expect(ticksToMax).toBe(9);
    },
  );

  it('stops by the friction recurrence (stopspeed 100, friction 4)', () => {
    const ctx = makeCtx(flatFloor());
    const s = spawn(TF_CLASS_SCOUT, ctx);
    const cmd = makeCmd();
    cmd.forwardMove = 450;
    tick(s, cmd, ctx, 100);
    expect(length2D(s.velocity)).toBeCloseTo(400, 9);

    let v = 400;
    let dist = 0;
    let ticks = 0;
    while (v > 0) {
      v = Math.max(0, v - Math.max(v, 100) * 4 * DT);
      if (v < 1) v = 0;
      dist += v * DT;
      ticks++;
    }
    const x0 = s.origin.x;
    tick(s, makeCmd(), ctx, ticks + 50);
    expect(s.origin.x - x0).toBeCloseTo(dist, 6);
    expect(s.velocity.x).toBe(0);
    // ~ 400→100 geometric (≈23 ticks) then 100/6 linear (≈17 ticks)
    expect(ticks).toBeGreaterThan(35);
    expect(ticks).toBeLessThan(45);
  });

  it('caps movement at TF_MAX_SPEED (520) even for a higher max speed', () => {
    const ctx = makeCtx(flatFloor());
    const s = spawn(TF_CLASS_SCOUT, ctx);
    s.maxSpeed = 600;
    const cmd = makeCmd();
    cmd.forwardMove = 450; // HighMaxSpeedMove raises full-key input to the max speed
    tick(s, cmd, ctx, 200);
    expect(length2D(s.velocity)).toBeCloseTo(520, 9);
  });

  it('backpedals at 90 % of max speed and strafes at full speed', () => {
    const ctx = makeCtx(flatFloor());
    const s = spawn(TF_CLASS_SOLDIER, ctx);
    const cmd = makeCmd();
    cmd.forwardMove = -450;
    cmd.buttons = IN_BACK;
    tick(s, cmd, ctx, 200);
    expect(s.velocity.x).toBeCloseTo(-240 * 0.9, 9);

    const s2 = spawn(TF_CLASS_SOLDIER, ctx);
    const side = makeCmd();
    side.sideMove = 450;
    tick(s2, side, ctx, 200);
    expect(length2D(s2.velocity)).toBeCloseTo(240, 9);
  });

  it('moves with a conveyor (base velocity) without gaining own velocity', () => {
    const ctx = makeCtx(flatFloor());
    const s = spawn(TF_CLASS_MEDIC, ctx);
    s.baseVelocity = { x: 100, y: 0, z: 0 };
    const x0 = s.origin.x;
    tick(s, makeCmd(), ctx, 10);
    expect(s.origin.x - x0).toBeCloseTo(100 * DT * 10, 9);
    expect(s.velocity.x).toBeCloseTo(0, 9);
  });

  it('fires footsteps at the TF step interval (240 ms for a running Scout)', () => {
    const ctx = makeCtx(flatFloor());
    const steps: number[] = [];
    let t = 0;
    ctx.onFootstep = (name, vol) => {
      expect(name).toBe('concrete');
      // Walking (below 0.8 × max) steps are quieter; running ones 0.5.
      if (t > 100) expect(vol).toBe(0.5);
      steps.push(t);
    };
    const s = spawn(TF_CLASS_SCOUT, ctx);
    const cmd = makeCmd();
    cmd.forwardMove = 450;
    tick(s, cmd, ctx, 300, () => t++);
    const late = steps.filter((x) => x > 100);
    expect(late.length).toBeGreaterThan(5);
    // RemapValClamped(400, 200, 450, 400, 200) = 240 ms = 16 ticks
    for (let i = 1; i < late.length; i++) expect(late[i]! - late[i - 1]!).toBe(16);
  });
});

describe('stairs and slopes', () => {
  function stepWorld(h: number): Brush[] {
    return [...flatFloor(), boxBrush({ x: 64, y: -512, z: 0 }, { x: 1024, y: 512, z: h })];
  }

  it('walks up an 18-unit step', () => {
    const ctx = makeCtx(stepWorld(18));
    const s = spawn(TF_CLASS_HEAVYWEAPONS, ctx);
    const cmd = makeCmd();
    cmd.forwardMove = 450;
    tick(s, cmd, ctx, 100);
    expect(s.origin.x).toBeGreaterThan(200);
    expect(s.origin.z).toBeCloseTo(18 + EPS, 9);
    expect(isOnGround(s)).toBe(true);
  });

  it('is blocked by a 19-unit step', () => {
    const ctx = makeCtx(stepWorld(19));
    const s = spawn(TF_CLASS_HEAVYWEAPONS, ctx);
    const cmd = makeCmd();
    cmd.forwardMove = 450;
    tick(s, cmd, ctx, 100);
    expect(s.origin.x).toBeCloseTo(64 - 24 - EPS, 6);
    expect(s.origin.z).toBeCloseTo(EPS, 9);
  });

  function rampWorld(deg: number): Brush[] {
    const run = 1024;
    return [...flatFloor(), rampBrush(0, run, -512, 512, 0, run * Math.tan((deg * Math.PI) / 180))];
  }

  it('stands still on a 45° slope (normal z 0.707 ≥ 0.7)', () => {
    const tan = Math.tan(Math.PI / 4);
    const ctx = makeCtx(rampWorld(45));
    const s = spawn(TF_CLASS_SOLDIER, ctx, 400, 0, (400 + 24) * tan + 1);
    tick(s, makeCmd(), ctx, 60);
    expect(isOnGround(s)).toBe(true);
    const at = { ...s.origin };
    tick(s, makeCmd(), ctx, 300);
    expect(s.origin.x).toBeCloseTo(at.x, 9);
    expect(s.origin.z).toBeCloseTo(at.z, 9);
  });

  it('slides down a 46° slope (normal z 0.695 < 0.7)', () => {
    const tan = Math.tan((46 * Math.PI) / 180);
    const ctx = makeCtx(rampWorld(46));
    const s = spawn(TF_CLASS_SOLDIER, ctx, 400, 0, (400 + 24) * tan + 1);
    let groundedTicks = 0;
    tick(s, makeCmd(), ctx, 60, () => {
      if (isOnGround(s) && s.origin.x > 0) groundedTicks++;
    });
    expect(groundedTicks).toBe(0);
    expect(s.origin.x).toBeLessThan(300);
  });
});

describe('jumping', () => {
  // TF jump: StartGravity −6, +289, FinishGravity −6 → the first move is at 277 u/s,
  // and each later tick 12 u/s slower (half gravity either side of the move).
  const apex = (() => {
    let h = 0;
    for (let v = 289 - 12; v > 0; v -= 12) h += v * DT;
    return h;
  })();

  it('a standing jump rises ~50 units (289 u/s impulse)', () => {
    expect(apex).toBeCloseTo(50.04, 9);
    const ctx = makeCtx(flatFloor());
    const s = spawn(TF_CLASS_SOLDIER, ctx);
    const z0 = s.origin.z;
    const cmd = makeCmd();
    cmd.buttons = IN_JUMP;
    let jumps = 0;
    ctx.onJump = (air) => {
      expect(air).toBe(false);
      jumps++;
    };
    tick(s, cmd, ctx, 1);
    expect(s.velocity.z).toBeCloseTo(289 - 18, 9);
    let maxZ = s.origin.z;
    let landed = 0;
    ctx.onLand = () => landed++;
    tick(s, cmd, ctx, 120, () => (maxZ = Math.max(maxZ, s.origin.z)));
    expect(maxZ - z0).toBeCloseTo(apex, 9);
    expect(jumps).toBe(1); // holding jump does not pogo
    expect(landed).toBe(1);
    expect(isOnGround(s)).toBe(true);
  });

  it('a crouch jump lifts the feet another 20 units (82 − 62 hull)', () => {
    const ctx = makeCtx(flatFloor());
    const s = spawn(TF_CLASS_SOLDIER, ctx);
    const z0 = s.origin.z;
    const cmd = makeCmd();
    cmd.buttons = IN_JUMP;
    tick(s, cmd, ctx, 1);
    cmd.buttons = IN_JUMP | IN_DUCK;
    let maxZ = 0;
    tick(s, cmd, ctx, 120, () => (maxZ = Math.max(maxZ, s.origin.z)));
    const hullDelta = VEC_HULL_MAX.z - VEC_HULL_MIN.z - (VEC_DUCK_HULL_MAX.z - VEC_DUCK_HULL_MIN.z);
    expect(hullDelta).toBe(20);
    expect(maxZ - z0).toBeCloseTo(apex + hullDelta, 9);
    expect(s.flags & FL_DUCKING).toBeTruthy();
  });

  it('cannot jump while ducked on the ground', () => {
    const ctx = makeCtx(flatFloor());
    const s = spawn(TF_CLASS_PYRO, ctx);
    const cmd = makeCmd();
    cmd.buttons = IN_DUCK;
    tick(s, cmd, ctx, 30);
    expect(s.ducked).toBe(true);
    cmd.buttons = IN_DUCK | IN_JUMP;
    tick(s, cmd, ctx, 1);
    expect(isOnGround(s)).toBe(true);
    expect(s.velocity.z).toBe(0);
  });

  it('Scouts double jump once: velocity replaced by input + 268.33 up', () => {
    const ctx = makeCtx(flatFloor());
    const s = spawn(TF_CLASS_SCOUT, ctx);
    const air: boolean[] = [];
    ctx.onJump = (a) => air.push(a);
    const cmd = makeCmd();
    cmd.buttons = IN_JUMP;
    tick(s, cmd, ctx, 1);
    cmd.buttons = 0;
    tick(s, cmd, ctx, 10);
    cmd.buttons = IN_JUMP;
    cmd.forwardMove = 450;
    tick(s, cmd, ctx, 1);
    // AirDash sets z to sqrt(2·800·45); FinishGravity then takes 6.
    expect(s.velocity.z).toBeCloseTo(268.3281572999747 - 6, 9);
    expect(s.velocity.x).toBeCloseTo(400, 9); // forward input clamped to the Scout's 400
    expect(s.airDash).toBe(1);
    const vz = s.velocity.z;
    cmd.buttons = 0;
    tick(s, cmd, ctx, 1);
    cmd.buttons = IN_JUMP;
    tick(s, cmd, ctx, 1);
    expect(s.velocity.z).toBeCloseTo(vz - 24, 9); // third jump refused
    expect(air).toEqual([false, true]);
    tick(s, makeCmd(), ctx, 120);
    expect(isOnGround(s)).toBe(true);
    expect(s.airDash).toBe(0);
  });

  it('other classes cannot air jump', () => {
    const ctx = makeCtx(flatFloor());
    const s = spawn(TF_CLASS_SOLDIER, ctx);
    const cmd = makeCmd();
    cmd.buttons = IN_JUMP;
    tick(s, cmd, ctx, 1);
    cmd.buttons = 0;
    tick(s, cmd, ctx, 5);
    const vz = s.velocity.z;
    cmd.buttons = IN_JUMP;
    tick(s, cmd, ctx, 1);
    expect(s.velocity.z).toBeCloseTo(vz - 12, 9);
  });

  it('bunny hopping is capped at 1.2 × max speed', () => {
    const ctx = makeCtx(flatFloor());
    const s = spawn(TF_CLASS_SOLDIER, ctx);
    s.velocity.x = 600; // e.g. from a rocket
    const cmd = makeCmd();
    cmd.buttons = IN_JUMP;
    tick(s, cmd, ctx, 1);
    // PreventBunnyJumping scales the whole velocity (z = −6 after StartGravity).
    const cap = 1.2 * 240;
    expect(s.velocity.x).toBeCloseTo((600 * cap) / Math.sqrt(600 * 600 + 36), 9);
  });

  it('air strafing gains speed beyond the max ground speed (air cap 30)', () => {
    const ctx = makeCtx(flatFloor());
    const s = createMoveState(TF_CLASS_SCOUT, TF_TEAM_RED);
    s.origin = { x: 0, y: 0, z: 3000 };
    s.velocity = { x: 400, y: 0, z: 0 };
    const cmd = makeCmd();
    cmd.sideMove = 450;
    let expected = 400;
    for (let i = 0; i < 100; i++) {
      // Face along the velocity so the strafe wish is perpendicular to it.
      cmd.viewAngles.y = (Math.atan2(s.velocity.y, s.velocity.x) * 180) / Math.PI;
      tick(s, cmd, ctx, 1);
      expected = Math.sqrt(expected * expected + 30 * 30);
      expect(length2D(s.velocity)).toBeCloseTo(expected, 6);
    }
    expect(length2D(s.velocity)).toBeCloseTo(500, 6);
    expect(isOnGround(s)).toBe(false);
  });
});

describe('ducking', () => {
  it('ducks after 0.2 s with a spline eye transition, and crouch-walks at 1/3 speed', () => {
    const ctx = makeCtx(flatFloor());
    const s = spawn(TF_CLASS_SNIPER, ctx);
    const cmd = makeCmd();
    cmd.buttons = IN_DUCK;
    tick(s, cmd, ctx, 1); // press: m_flDucktime = 1000
    expect(s.ducking).toBe(true);
    expect(s.viewOffsetZ).toBe(75);
    for (let k = 1; k <= 13; k++) {
      tick(s, cmd, ctx, 1);
      const frac = simpleSpline((0.015 * k) / 0.2);
      expect(s.viewOffsetZ).toBeCloseTo(45 * frac + 75 * (1 - frac), 9);
      expect(s.ducked).toBe(false);
    }
    tick(s, cmd, ctx, 1); // 14 ticks = 0.21 s > TIME_TO_DUCK
    expect(s.ducked).toBe(true);
    expect(s.flags & FL_DUCKING).toBeTruthy();
    expect(s.viewOffsetZ).toBe(45);

    cmd.forwardMove = 450;
    tick(s, cmd, ctx, 150);
    expect(length2D(s.velocity)).toBeCloseTo(300 * 0.33333333, 6);

    // Unduck takes TIME_TO_UNDUCK (0.2 s) too.
    cmd.forwardMove = 0;
    cmd.buttons = 0;
    tick(s, cmd, ctx, 14);
    expect(s.ducked).toBe(true);
    tick(s, cmd, ctx, 1);
    expect(s.ducked).toBe(false);
    expect(s.viewOffsetZ).toBe(75);
  });

  it('refuses a grounded re-duck for 0.3 s after a release', () => {
    const ctx = makeCtx(flatFloor());
    const s = spawn(TF_CLASS_MEDIC, ctx);
    const cmd = makeCmd();
    cmd.buttons = IN_DUCK;
    tick(s, cmd, ctx, 3);
    cmd.buttons = 0;
    tick(s, cmd, ctx, 1); // release starts the duck timer
    cmd.buttons = IN_DUCK;
    tick(s, cmd, ctx, 1);
    expect(s.ducking && !s.ducked && s.duckTime === 1000).toBe(false);
    expect(s.ducked).toBe(false);
  });

  it('allows two air ducks per jump', () => {
    const ctx = makeCtx(flatFloor());
    const s = spawn(TF_CLASS_SOLDIER, ctx);
    s.origin.z = 2000;
    s.groundEntity = -1;
    s.flags = 0;
    const cmd = makeCmd();
    for (let i = 0; i < 2; i++) {
      cmd.buttons = IN_DUCK;
      tick(s, cmd, ctx, 1);
      expect(s.ducked).toBe(true);
      cmd.buttons = 0;
      tick(s, cmd, ctx, 1);
      expect(s.ducked).toBe(false);
    }
    expect(s.airDucked).toBe(2);
    cmd.buttons = IN_DUCK;
    tick(s, cmd, ctx, 1);
    expect(s.ducked).toBe(false);
  });

  it('stays ducked under a low ceiling', () => {
    const ctx = makeCtx([
      ...flatFloor(),
      boxBrush({ x: -64, y: -64, z: 70 }, { x: 64, y: 64, z: 100 }),
    ]);
    const s = createMoveState(TF_CLASS_ENGINEER, TF_TEAM_RED);
    s.origin = { x: 300, y: 0, z: 1 };
    const cmd = makeCmd();
    cmd.buttons = IN_DUCK;
    tick(s, cmd, ctx, 40);
    cmd.forwardMove = -450; // walk under the ceiling, crouched
    tick(s, cmd, ctx, 200);
    expect(s.origin.x).toBeLessThan(40);
    cmd.buttons = 0;
    cmd.forwardMove = 0;
    tick(s, cmd, ctx, 60);
    expect(s.ducked).toBe(true);
    expect(s.viewOffsetZ).toBe(45);
  });
});

describe('falling', () => {
  it('reports the landing speed and gates fall damage at 580 / 650', () => {
    const ctx = makeCtx(flatFloor());
    const lands: number[] = [];
    const damage: number[] = [];
    ctx.onLand = (v) => lands.push(v);
    ctx.onFallDamage = (v) => damage.push(v);
    for (const h of [100, 250, 400]) {
      const s = createMoveState(TF_CLASS_SOLDIER, TF_TEAM_RED);
      s.origin = { x: 0, y: 0, z: h };
      tick(s, makeCmd(), ctx, 200);
      expect(isOnGround(s)).toBe(true);
    }
    expect(lands).toHaveLength(3);
    for (const [i, h] of [100, 250, 400].entries()) {
      // Half-step gravity: the landing tick starts with v = −12k; the hull lands
      // when it ends within 2 units (+DIST_EPSILON) of the floor (CategorizePosition).
      let z = h;
      let v = 0;
      let expected: number;
      for (;;) {
        expected = -v;
        v -= 6;
        z = Math.max(EPS, z + v * DT);
        if (z < 2 + EPS) break;
        v -= 6;
      }
      expect(lands[i]).toBeCloseTo(expected, 9);
      expect(Math.abs(lands[i]! - Math.sqrt(2 * 800 * h))).toBeLessThan(24);
    }
    // CheckFalling asks for damage above 580; TF's FlPlayerFallDamage only deals it above 650.
    expect(damage).toEqual([lands[1], lands[2]]);
    expect(lands[1]).toBeGreaterThan(580);
    expect(lands[1]).toBeLessThan(650);
    expect(tfFallDamage(lands[1]!, 200)).toBe(0);
    expect(tfFallDamage(lands[2]!, 200)).toBeCloseTo(((5 * lands[2]!) / 300) * 2, 9);
  });

  it('computes TF fall damage: 5 per 300 u/s × max health / 100 above 650', () => {
    const hp = classMaxHealth(TF_CLASS_SOLDIER);
    expect(hp).toBe(200);
    expect(tfFallDamage(650, hp)).toBe(0);
    expect(tfFallDamage(900, hp)).toBeCloseTo(5 * 3 * 2, 9);
    expect(tfFallDamage(900, hp, 1.2)).toBeCloseTo(36, 9);
    expect(tfFallDamage(651, classMaxHealth(TF_CLASS_SCOUT))).toBeCloseTo(
      ((5 * 651) / 300) * 1.25,
      9,
    );
  });

  it('rolls the view on a hard landing and springs back', () => {
    const ctx = makeCtx(flatFloor());
    const s = createMoveState(TF_CLASS_SOLDIER, TF_TEAM_RED);
    s.origin = { x: 0, y: 0, z: 400 };
    let peak = 0;
    tick(s, makeCmd(), ctx, 100, () => (peak = Math.max(peak, Math.abs(s.punchAngle.z))));
    expect(peak).toBeGreaterThan(5);
    tick(s, makeCmd(), ctx, 300);
    expect(s.punchAngle.z).toBe(0);
  });
});

describe('water', () => {
  function pool(): Brush[] {
    return [
      ...flatFloor(),
      waterBrush({ x: -4096, y: -4096, z: 0 }, { x: 4096, y: 4096, z: 3000 }),
    ];
  }

  it('sinks idle at 0.8 × 60 u/s and swims at 0.8 × max speed', () => {
    const ctx = makeCtx(pool());
    const s = createMoveState(TF_CLASS_SCOUT, TF_TEAM_RED);
    s.origin = { x: 0, y: 0, z: 1500 };
    tick(s, makeCmd(), ctx, 200);
    expect(s.waterLevel).toBe(WL_EYES);
    expect(s.velocity.z).toBeCloseTo(-48, 9);

    const cmd = makeCmd();
    cmd.forwardMove = 450;
    tick(s, cmd, ctx, 200);
    expect(s.velocity.x).toBeCloseTo(320, 9);
    expect(s.velocity.z).toBeCloseTo(0, 3); // −48 decaying by 0.94 a tick
  });

  it('jump swims up: 100 u/s, then quarter-strength friction and acceleration', () => {
    const ctx = makeCtx(pool());
    const s = createMoveState(TF_CLASS_SCOUT, TF_TEAM_RED);
    s.origin = { x: 0, y: 0, z: 1500 };
    tick(s, makeCmd(), ctx, 20);
    const cmd = makeCmd();
    cmd.buttons = IN_JUMP;
    tick(s, cmd, ctx, 5);
    // CheckWaterJumpButton sets 100. Moving up with nothing standable below,
    // CategorizePosition leaves m_surfaceFriction at 0.25, so water friction drops
    // 100·4·0.015·0.25 = 1.5 and acceleration adds 10·320·0.015·0.25 = 12.
    expect(s.surfaceFriction).toBe(0.25);
    expect(s.velocity.z).toBeCloseTo(110.5, 9);
  });

  it('reports water levels and the splash on entry', () => {
    const ctx = makeCtx(pool());
    const changes: [number, number, boolean][] = [];
    ctx.onWaterLevelChange = (a, b, splash) => changes.push([a, b, splash]);
    const s = createMoveState(TF_CLASS_SCOUT, TF_TEAM_RED);
    s.origin = { x: 0, y: 0, z: 3200 };
    tick(s, makeCmd(), ctx, 100);
    expect(changes[0]).toEqual([WL_NOTINWATER, WL_FEET, true]);
    expect(changes.map((c) => c[1])).toEqual(expect.arrayContaining([WL_FEET, WL_WAIST, WL_EYES]));
  });

  it('hops out of water onto a ledge (water jump)', () => {
    // Pool floor z 0, water to z 60 (above the soldier's waist at 53, below the eyes at 68),
    // a ledge at x ≥ 0 rising to z 64.
    const ctx = makeCtx([
      ...flatFloor(),
      waterBrush({ x: -512, y: -512, z: 0 }, { x: 0, y: 512, z: 60 }),
      boxBrush({ x: 0, y: -512, z: 0 }, { x: 1024, y: 512, z: 64 }),
    ]);
    const s = spawn(TF_CLASS_SOLDIER, ctx, -100);
    expect(s.waterLevel).toBe(WL_WAIST);
    const cmd = makeCmd();
    cmd.forwardMove = 450;
    let waterJumped = false;
    tick(s, cmd, ctx, 150, () => {
      if (s.waterJumpTime > 0) waterJumped = true;
    });
    expect(waterJumped).toBe(true);
    expect(s.origin.x).toBeGreaterThan(24);
    expect(s.origin.z).toBeCloseTo(64 + EPS, 6);
    expect(isOnGround(s)).toBe(true);
  });
});

describe('special movement', () => {
  it('noclip flies through walls', () => {
    const ctx = makeCtx(roomBrushes(256, 256));
    const s = createMoveState(TF_CLASS_SPY, TF_TEAM_RED);
    s.origin = { x: 0, y: 0, z: 100 };
    s.moveType = MOVETYPE_NOCLIP;
    const cmd = makeCmd();
    cmd.forwardMove = 450;
    tick(s, cmd, ctx, 100);
    expect(s.origin.x).toBeGreaterThan(400);
    expect(s.origin.z).toBeCloseTo(100, 9);
  });

  it('a roaming spectator flies with sv_specspeed', () => {
    const ctx = makeCtx(flatFloor());
    const s = createMoveState(TF_CLASS_SPY, TF_TEAM_RED);
    s.origin = { x: 0, y: 0, z: 100 };
    s.moveType = MOVETYPE_OBSERVER;
    s.observerMode = OBS_MODE_ROAMING;
    const cmd = makeCmd();
    cmd.forwardMove = 450;
    tick(s, cmd, ctx, 300);
    // Wish 450·3 = 1350, capped to 320·3 = 960; each tick accelerates (5·960·0.015 = 72)
    // up to 960, then friction keeps 0.94 of it.
    expect(s.velocity.x).toBeCloseTo(960 * 0.94, 6);
  });

  it('a shield charge runs at 750 regardless of input and ends when stopped', () => {
    const ctx = makeCtx([
      ...flatFloor(),
      boxBrush({ x: 2000, y: -512, z: 0 }, { x: 2100, y: 512, z: 200 }),
    ]);
    let ended = 0;
    ctx.onChargeEnd = () => ended++;
    const s = spawn(TF_CLASS_DEMOMAN, ctx);
    s.maxSpeed = calculateMaxSpeed({ classIndex: TF_CLASS_DEMOMAN, shieldCharging: true });
    s.conds |= MOVE_COND_SHIELD_CHARGE;
    s.velocity.x = 300;
    const cmd = makeCmd();
    cmd.sideMove = 450;
    cmd.buttons = IN_JUMP;
    tick(s, cmd, ctx, 60);
    expect(s.velocity.x).toBeCloseTo(750, 6);
    expect(s.velocity.y).toBeCloseTo(0, 9);
    expect(isOnGround(s)).toBe(true); // jump is locked out
    tick(s, cmd, ctx, 200);
    expect(ended).toBe(1);
  });
});

describe('robustness', () => {
  it('survives 100k random commands in a closed room without NaNs, escapes or getting stuck', () => {
    const half = 512;
    const height = 384;
    const brushes = [
      ...roomBrushes(half, height),
      boxBrush({ x: 100, y: -100, z: 0 }, { x: 200, y: 100, z: 18 }),
      boxBrush({ x: -300, y: 100, z: 0 }, { x: -200, y: 300, z: 60 }),
      rampBrush(-400, -150, -400, -200, 0, 150),
      boxBrush({ x: 200, y: 200, z: 70 }, { x: 400, y: 400, z: 90 }),
    ];
    const ctx = makeCtx(brushes);
    let seed = 12345;
    const rand = (): number => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const classes = [TF_CLASS_SCOUT, TF_CLASS_SOLDIER, TF_CLASS_HEAVYWEAPONS];
    const tr = emptyTrace();
    const mins: Vec3 = { x: 0, y: 0, z: 0 };
    const maxs: Vec3 = { x: 0, y: 0, z: 0 };
    let s = spawn(TF_CLASS_SCOUT, ctx);
    const cmd = makeCmd();
    const N = 100_000;
    for (let i = 0; i < N; i++) {
      if (i % 20_000 === 0) {
        s = spawn(
          classes[(i / 20_000) % classes.length]!,
          ctx,
          (rand() - 0.5) * 600,
          (rand() - 0.5) * 600,
          120,
        );
      }
      if (rand() < 0.15) {
        cmd.forwardMove = Math.round(rand() * 2 - 1) * 450;
        cmd.sideMove = Math.round(rand() * 2 - 1) * 450;
        cmd.viewAngles.x = (rand() - 0.5) * 178;
        cmd.viewAngles.y = rand() * 360 - 180;
        cmd.buttons = (rand() < 0.3 ? IN_JUMP : 0) | (rand() < 0.2 ? IN_DUCK : 0);
      }
      if (rand() < 0.002) {
        // A blast: random knockback up to 1500 u/s.
        s.velocity.x += (rand() - 0.5) * 3000;
        s.velocity.y += (rand() - 0.5) * 3000;
        s.velocity.z += rand() * 1500;
      }
      tick(s, cmd, ctx, 1);

      const o = s.origin;
      const v = s.velocity;
      if (![o.x, o.y, o.z, v.x, v.y, v.z, s.viewOffsetZ].every(Number.isFinite)) {
        throw new Error(`non-finite state at tick ${i}`);
      }
      const hullTop = s.ducked ? VEC_DUCK_HULL_MAX.z : VEC_HULL_MAX.z;
      if (
        Math.abs(o.x) > half - 24 + 1e-6 ||
        Math.abs(o.y) > half - 24 + 1e-6 ||
        o.z < -1e-6 ||
        o.z + hullTop > height + 1e-6
      ) {
        throw new Error(`left the room at tick ${i}: ${JSON.stringify(o)}`);
      }
      if (s.ducked) {
        mins.x = VEC_DUCK_HULL_MIN.x;
        mins.y = VEC_DUCK_HULL_MIN.y;
        mins.z = VEC_DUCK_HULL_MIN.z;
        maxs.x = VEC_DUCK_HULL_MAX.x;
        maxs.y = VEC_DUCK_HULL_MAX.y;
        maxs.z = VEC_DUCK_HULL_MAX.z;
      } else {
        mins.x = VEC_HULL_MIN.x;
        mins.y = VEC_HULL_MIN.y;
        mins.z = VEC_HULL_MIN.z;
        maxs.x = VEC_HULL_MAX.x;
        maxs.y = VEC_HULL_MAX.y;
        maxs.z = VEC_HULL_MAX.z;
      }
      ctx.world.traceHull(o, o, mins, maxs, MASK_PLAYERSOLID, null, tr);
      if (tr.startSolid) throw new Error(`stuck in solid at tick ${i}: ${JSON.stringify(o)}`);
    }
  });

  it('is deterministic across a JSON snapshot (client prediction replay)', () => {
    const ctx1 = makeCtx(flatFloor());
    const ctx2 = makeCtx(flatFloor());
    const a = spawn(TF_CLASS_SCOUT, ctx1);
    const cmd = makeCmd();
    cmd.forwardMove = 450;
    cmd.sideMove = 200;
    cmd.viewAngles.y = 33;
    tick(a, cmd, ctx1, 37);
    const b = JSON.parse(JSON.stringify(a)) as MoveState;
    ctx2.curtime = ctx1.curtime;
    const cmd2 = JSON.parse(JSON.stringify(cmd)) as UserCmd;
    for (let i = 0; i < 200; i++) {
      cmd.buttons = cmd2.buttons = i % 37 === 0 ? IN_JUMP : i % 53 < 20 ? IN_DUCK : 0;
      tick(a, cmd, ctx1, 1);
      tick(b, cmd2, ctx2, 1);
    }
    expect(b).toEqual(a);
  });
});
