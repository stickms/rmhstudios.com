/**
 * Pure parts of the entity renderer: TF2 animation selection (CTFPlayerAnimState truth
 * table, weapon acttables), pose parameters (9-way move blend, feet-yaw lag), blend-grid
 * weights and pose keys, delta layer math (SDK QuaternionMA / QuaternionSM), autolayer ramps,
 * GLB frame detection and attachment placement, view-model activity mapping and bob, effect
 * lookups. Drawing is checked with the screenshot harness (scripts/tf2-game/render-harness,
 * `--scenes`).
 */
import { Matrix4, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { STOCK_WEAPONS } from '../../data/weapons';
import { TF_COND } from '../../sim/conditions';
import { ACT, vmActivityName } from '../../sim/weapons/constants';
import { sourceTransformToMatrix, srcToThree } from '../coords';
import {
  animatedFrame,
  checkPosedFrame,
  detectAxisRotation,
  frameMatrixFor,
  IDENTITY_ROTATION,
  nearestAxisRotation,
  PERM_SOURCE_TO_GL,
} from '../model-axes';
import {
  AnimSet,
  autolayerWeight,
  clampPoseValue,
  localPoseParameter,
  PoseBlender,
  quatMA,
  quatSM,
  seqCells,
  STUDIO_AL_POSE,
  STUDIO_AL_SPLINE,
  type SequenceDesc,
} from './animator';
import { impactSystemFor } from './effects';
import { projectileTrail } from './objects';
import {
  convergeYaw,
  PLAYERANIMEVENT_ATTACK_PRIMARY,
  PLAYERANIMEVENT_JUMP,
  PLAYERANIMEVENT_RELOAD,
  TFPlayerAnimState,
  translateActivity,
  type PlayerAnimInput,
} from './player-anim-state';
import { findDeathSequence } from './player-renderer';
import { BobState } from './viewmodel';

const ALL = () => true;

function input(over: Partial<PlayerAnimInput> = {}, conds: number[] = []): PlayerAnimInput {
  return {
    time: 10,
    dt: 1 / 60,
    vx: 0,
    vy: 0,
    vz: 0,
    onGround: true,
    ducked: false,
    waterLevel: 0,
    eyeYaw: 0,
    eyePitch: 0,
    inCond: (c) => conds.includes(c),
    suffix: 'PRIMARY',
    isMinigun: false,
    isSniperRifle: false,
    hasActivity: ALL,
    ...over,
  };
}

describe('weapon acttables (translateActivity)', () => {
  it('follows s_acttablePrimary / Melee / Item1', () => {
    expect(translateActivity('ACT_MP_STAND_IDLE', 'PRIMARY')).toBe('ACT_MP_STAND_PRIMARY');
    expect(translateActivity('ACT_MP_CROUCH_IDLE', 'MELEE')).toBe('ACT_MP_CROUCH_MELEE');
    expect(translateActivity('ACT_MP_RUN', 'SECONDARY')).toBe('ACT_MP_RUN_SECONDARY');
    expect(translateActivity('ACT_MP_JUMP_START', 'PDA')).toBe('ACT_MP_JUMP_START_PDA');
    expect(translateActivity('ACT_MP_ATTACK_STAND_PRIMARYFIRE', 'PRIMARY')).toBe(
      'ACT_MP_ATTACK_STAND_PRIMARY',
    );
    expect(translateActivity('ACT_MP_ATTACK_CROUCH_PRIMARYFIRE_DEPLOYED', 'PRIMARY')).toBe(
      'ACT_MP_ATTACK_CROUCH_PRIMARY_DEPLOYED',
    );
    expect(translateActivity('ACT_MP_ATTACK_STAND_SECONDARYFIRE', 'MELEE')).toBe(
      'ACT_MP_ATTACK_STAND_MELEE_SECONDARY',
    );
    expect(translateActivity('ACT_MP_ATTACK_SWIM_SECONDARYFIRE', 'MELEE')).toBe(
      'ACT_MP_ATTACK_SWIM_MELEE',
    );
    expect(translateActivity('ACT_MP_RELOAD_STAND_LOOP', 'PRIMARY')).toBe(
      'ACT_MP_RELOAD_STAND_PRIMARY_LOOP',
    );
    expect(translateActivity('ACT_MP_RELOAD_AIRWALK_END', 'SECONDARY')).toBe(
      'ACT_MP_RELOAD_AIRWALK_SECONDARY_END',
    );
    expect(translateActivity('ACT_MP_CROUCH_DEPLOYED', 'PRIMARY')).toBe(
      'ACT_MP_CROUCHWALK_DEPLOYED',
    );
    expect(translateActivity('ACT_MP_DEPLOYED_IDLE', 'ITEM1')).toBe('ACT_MP_DEPLOYED_IDLE_ITEM1');
    expect(translateActivity('ACT_MP_ATTACK_CROUCH_GRENADE', 'BUILDING')).toBe(
      'ACT_MP_ATTACK_STAND_GRENADE_BUILDING',
    );
    // No row: unchanged (the heavy's PREFIRE/POSTFIRE play as named).
    expect(translateActivity('ACT_MP_ATTACK_STAND_PREFIRE', 'PRIMARY')).toBe(
      'ACT_MP_ATTACK_STAND_PREFIRE',
    );
  });
});

describe('TFPlayerAnimState: main activity', () => {
  const main = (inp: PlayerAnimInput, s = new TFPlayerAnimState()) => s.calcMainActivity(inp);

  it('stands, runs, crouches and crouch-walks', () => {
    expect(main(input())).toBe('ACT_MP_STAND_IDLE');
    expect(main(input({ vx: 300 }))).toBe('ACT_MP_RUN');
    expect(main(input({ vx: 0.4 }))).toBe('ACT_MP_STAND_IDLE'); // under MOVING_MINIMUM_SPEED
    expect(main(input({ ducked: true }))).toBe('ACT_MP_CROUCH_IDLE');
    expect(main(input({ ducked: true, vy: 100 }))).toBe('ACT_MP_CROUCHWALK');
  });

  it('jump start → float → land gesture', () => {
    const s = new TFPlayerAnimState();
    s.doAnimationEvent(PLAYERANIMEVENT_JUMP, input({ time: 10 }));
    expect(s.restartMain).toBe(true);
    expect(main(input({ time: 10.1, onGround: false, vz: 200 }), s)).toBe('ACT_MP_JUMP_START');
    expect(main(input({ time: 10.6, onGround: false, vz: -100 }), s)).toBe('ACT_MP_JUMP_FLOAT');
    // Still "on ground" within 0.2 s of the jump does not end it.
    const s2 = new TFPlayerAnimState();
    s2.doAnimationEvent(PLAYERANIMEVENT_JUMP, input({ time: 10 }));
    expect(main(input({ time: 10.1, onGround: true }), s2)).toBe('ACT_MP_JUMP_START');
    // Landing ends it and queues the land gesture.
    s.gestures.length = 0;
    expect(main(input({ time: 11, onGround: true }), s)).toBe('ACT_MP_STAND_IDLE');
    expect(s.gestures.map((g) => g.activity)).toEqual(['ACT_MP_JUMP_LAND_PRIMARY']);
  });

  it('airwalks when launched fast (rocket jump), lands with a gesture', () => {
    const s = new TFPlayerAnimState();
    expect(main(input({ onGround: false, vz: 600 }), s)).toBe('ACT_MP_AIRWALK');
    expect(main(input({ onGround: false, vz: -200 }), s)).toBe('ACT_MP_AIRWALK');
    expect(main(input({ onGround: true, vz: 0 }), s)).toBe('ACT_MP_STAND_IDLE');
    expect(s.gestures[0]?.activity).toBe('ACT_MP_JUMP_LAND_PRIMARY');
    // A firing heavy never airwalks.
    expect(main(input({ onGround: false, vz: 600, isMinigun: true }, [TF_COND.AIMING]))).toBe(
      'ACT_MP_DEPLOYED_IDLE',
    );
  });

  it('swims at waist depth, deploys while aiming, holds the sniper deploy after a zoomed shot', () => {
    expect(main(input({ waterLevel: 2, onGround: false }))).toBe('ACT_MP_SWIM');
    expect(main(input({ waterLevel: 2, isMinigun: true }, [TF_COND.AIMING]))).toBe(
      'ACT_MP_SWIM_DEPLOYED',
    );
    expect(main(input({ vx: 100, isMinigun: true }, [TF_COND.AIMING]))).toBe('ACT_MP_DEPLOYED');
    expect(main(input({ ducked: true, vx: 100, isMinigun: true }, [TF_COND.AIMING]))).toBe(
      'ACT_MP_CROUCHWALK',
    );
    const s = new TFPlayerAnimState();
    s.doAnimationEvent(
      PLAYERANIMEVENT_ATTACK_PRIMARY,
      input({ isSniperRifle: true }, [TF_COND.ZOOMED]),
    );
    expect(s.gestures[0].activity).toBe('ACT_MP_ATTACK_STAND_PRIMARY_DEPLOYED');
    expect(main(input({ time: 11 }), s)).toBe('ACT_MP_DEPLOYED_IDLE');
    expect(main(input({ time: 13 }), s)).toBe('ACT_MP_STAND_IDLE');
  });

  it('translates attack / reload gestures for the stance and weapon', () => {
    const s = new TFPlayerAnimState();
    s.doAnimationEvent(PLAYERANIMEVENT_ATTACK_PRIMARY, input({ ducked: true }));
    s.doAnimationEvent(PLAYERANIMEVENT_RELOAD, input({ suffix: 'SECONDARY' }));
    expect(s.gestures.map((g) => g.activity)).toEqual([
      'ACT_MP_ATTACK_CROUCH_PRIMARY',
      'ACT_MP_RELOAD_STAND_SECONDARY',
    ]);
    // A model without the translated activity keeps the base one.
    const t = new TFPlayerAnimState();
    t.doAnimationEvent(PLAYERANIMEVENT_ATTACK_PRIMARY, input({ hasActivity: () => false }));
    expect(t.gestures[0].activity).toBe('ACT_MP_ATTACK_STAND_PRIMARYFIRE');
  });
});

describe('TFPlayerAnimState: pose parameters', () => {
  it('9-way move blend from the velocity in the body frame, scaled to the authored speed', () => {
    const s = new TFPlayerAnimState();
    s.computeMoveYaw(input({ vx: 400 }), 0, () => 400);
    expect(s.moveX).toBeCloseTo(1);
    expect(s.moveY).toBeCloseTo(0);
    // Moving left (+Y) while looking along +X: move_y = −1 (the run grid's W cell).
    s.computeMoveYaw(input({ vy: 200 }), 0, () => 400);
    expect(s.moveX).toBeCloseTo(0);
    expect(s.moveY).toBeCloseTo(-0.5);
    // Diagonal pushes to the box edge before scaling.
    s.computeMoveYaw(input({ vx: 300, vy: -300 }), 0, () => 1000);
    expect(Math.max(Math.abs(s.moveX), Math.abs(s.moveY))).toBeCloseTo(Math.hypot(300, 300) / 1000);
    s.computeMoveYaw(input(), 0, () => 400);
    expect([s.moveX, s.moveY]).toEqual([0, 0]);
  });

  it('feet lag the eyes standing still (body_yaw twists), then converge; moving snaps them', () => {
    const s = new TFPlayerAnimState();
    s.computeAimYaw(input({ eyeYaw: 0 }));
    s.computeAimYaw(input({ eyeYaw: 30, time: 10.1 }));
    expect(s.currentFeetYaw).toBeCloseTo(0);
    expect(s.bodyYaw).toBeCloseTo(-30);
    // Past 45° the goal steps by 45 and the feet turn toward it.
    for (let i = 0; i < 120; i++) s.computeAimYaw(input({ eyeYaw: 80, time: 10.2 + i / 60 }));
    expect(s.currentFeetYaw).toBeCloseTo(45);
    expect(s.bodyYaw).toBeCloseTo(-35);
    s.computeAimYaw(input({ eyeYaw: 80, vx: 100, time: 13 }));
    for (let i = 0; i < 60; i++) s.computeAimYaw(input({ eyeYaw: 80, vx: 100, time: 13 + i / 60 }));
    expect(s.bodyYaw).toBeCloseTo(0);
    s.computeAimPitch(input({ eyePitch: 30 }));
    expect(s.bodyPitch).toBe(-30);
  });

  it('ConvergeYawAngles takes the short way and slows near the goal', () => {
    // The SDK scales by the un-normalised |delta| (340° → full rate), stepping the short way.
    expect(convergeYaw(170, 720, 0.01, -170)).toBeCloseTo(-177.2, 3);
    expect(convergeYaw(10, 720, 1, 0)).toBe(10);
  });
});

// --- blending -------------------------------------------------------------------------

const POSE = [
  { name: 'body_yaw', start: -45, end: 45, loop: 360 },
  { name: 'body_pitch', start: -45, end: 90, loop: 360 },
  { name: 'move_x', start: -1, end: 1, loop: 0 },
];

describe('blend grids', () => {
  it('Studio_LocalPoseParameter: linear ranges and (decreasing) pose keys', () => {
    const blend = {
      groupsize: [3, 4],
      params: ['body_yaw', 'body_pitch'],
      start: [45, 90],
      end: [-45, -45],
      poseKeys: [
        [45, 0, -45],
        [90, 45, 0, -45],
      ],
    };
    expect(localPoseParameter(POSE[0], 30, blend, 0)).toEqual({
      index: 0,
      setting: expect.closeTo(1 / 3, 5),
    });
    expect(localPoseParameter(POSE[0], -30, blend, 0)).toEqual({
      index: 1,
      setting: expect.closeTo(2 / 3, 5),
    });
    expect(localPoseParameter(POSE[1], 0, blend, 1)).toEqual({ index: 1, setting: 1 });
    const lin = { groupsize: [3, 3], params: ['move_x'], start: [-1], end: [1] };
    expect(localPoseParameter(POSE[2], 0.5, lin, 0)).toEqual({
      index: 1,
      setting: expect.closeTo(0.5, 5),
    });
    expect(localPoseParameter(POSE[2], 1, lin, 0)).toEqual({ index: 1, setting: 1 });
    expect(localPoseParameter(POSE[2], -2, lin, 0)).toEqual({ index: 0, setting: 0 });
  });

  it('bilinear cell weights sum to 1 and pick the grid cells', () => {
    const set = new AnimSet([], new Float32Array(), new Float32Array(), { poseParameters: POSE });
    const seq: SequenceDesc = {
      name: 'aim',
      looping: false,
      delta: true,
      post: true,
      fps: 30,
      frames: 1,
      clips: Array.from({ length: 12 }, (_, i) => `aim@${i}`),
      blend: {
        groupsize: [3, 4],
        params: ['body_yaw', 'body_pitch'],
        start: [45, 90],
        end: [-45, -45],
        poseKeys: [
          [45, 0, -45],
          [90, 45, 0, -45],
        ],
      },
    };
    const names: string[] = [];
    const w: number[] = [];
    const pose = new Float32Array([-30, 20, 0]);
    expect(seqCells(set, seq, pose, names, w)).toBe(4);
    expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    // yaw index 1 (0 … −45), pitch index 1 (45 … 0): cells y·3 + x.
    expect(names).toEqual(['aim@4', 'aim@5', 'aim@7', 'aim@8']);
    expect(w[1]).toBeCloseTo((2 / 3) * (1 - 25 / 45), 5);
  });

  it('clamps and wraps pose values like Studio_SetPoseParameter', () => {
    expect(clampPoseValue(POSE[0], 400)).toBe(40);
    expect(clampPoseValue(POSE[0], -100)).toBe(-45);
    expect(clampPoseValue(POSE[2], 3)).toBe(1);
  });
});

describe('delta layers', () => {
  const q = (axis: [number, number, number], deg: number) =>
    new Quaternion().setFromAxisAngle(new Vector3(...axis).normalize(), (deg * Math.PI) / 180);

  it('post deltas compose base · d^w, pre deltas d^w · base (QuaternionMA / QuaternionSM)', () => {
    const base = q([0, 0, 1], 40);
    const d = q([1, 0, 0], 60);
    const out = [0, 0, 0, 1];
    quatMA(base.toArray(), 0, 0.5, d.toArray(), 0, out, 0);
    expect(
      new Quaternion().fromArray(out).angleTo(base.clone().multiply(q([1, 0, 0], 30))),
    ).toBeLessThan(1e-5);
    quatSM(0.5, d.toArray(), 0, base.toArray(), 0, out, 0);
    expect(new Quaternion().fromArray(out).angleTo(q([1, 0, 0], 30).multiply(base))).toBeLessThan(
      1e-5,
    );
  });

  it('SlerpBones: deltas add translation and rotation by weight × weightlist; absolutes slerp', () => {
    const set = new AnimSet(
      ['a', 'b'],
      new Float32Array([0, 1, 0, 0, 2, 0]),
      new Float32Array([0, 0, 0, 1, 0, 0, 0, 1]),
      {
        weightlists: [{ b: 0 }],
      },
    );
    const blender = new PoseBlender(set);
    const pos = new Float32Array(6);
    const quat = new Float32Array(8);
    blender.initPose(pos, quat);
    const dq = q([0, 1, 0], 90).toArray();
    const seqPos = new Float32Array([1, 0, 0, 1, 0, 0]);
    const seqQuat = new Float32Array([...dq, ...dq]);
    const delta: SequenceDesc = {
      name: 'd',
      looping: false,
      delta: true,
      post: true,
      fps: 30,
      frames: 1,
      clips: [],
      weightlist: 0,
    };
    blender.slerpBones(pos, quat, delta, seqPos, seqQuat, 0.5);
    expect(Array.from(pos)).toEqual([0.5, 1, 0, 0, 2, 0]);
    expect(new Quaternion().fromArray(quat, 0).angleTo(q([0, 1, 0], 45))).toBeLessThan(1e-3);
    expect(Array.from(quat.subarray(4))).toEqual([0, 0, 0, 1]); // weightlist 0 for b
    const abs: SequenceDesc = {
      name: 'a',
      looping: false,
      delta: false,
      post: false,
      fps: 30,
      frames: 1,
      clips: [],
    };
    blender.initPose(pos, quat);
    blender.slerpBones(pos, quat, abs, new Float32Array([2, 1, 0, 0, 0, 0]), seqQuat, 0.25);
    expect(pos[0]).toBeCloseTo(0.5);
    expect(new Quaternion().fromArray(quat, 4).angleTo(q([0, 1, 0], 22.5))).toBeLessThan(1e-3);
  });

  it('autolayer ramps by cycle or pose parameter (start/peak/tail/end, spline)', () => {
    const set = { poseIndex: new Map([['move_x', 0]]) };
    const run = {
      seq: 'aim_run',
      flags: STUDIO_AL_POSE | STUDIO_AL_SPLINE,
      pose: 'move_x',
      start: -0.8,
      peak: -0.2,
      tail: 1,
      end: 2,
    };
    expect(autolayerWeight(run, 0.3, 1, set, [1])?.weight).toBeCloseTo(1);
    expect(autolayerWeight(run, 0.3, 1, set, [-0.5])?.weight).toBeCloseTo(0.5);
    expect(autolayerWeight(run, 0.3, 1, set, [-0.9])).toBeNull();
    const ramp = { seq: 'x', flags: 0, start: 0, peak: 0.2, tail: 1, end: 1 };
    const r = autolayerWeight(ramp, 0.1, 0.8, set, [0]);
    expect(r?.weight).toBeCloseTo(0.4);
    expect(r?.cycle).toBeCloseTo(0.1);
    const always = { seq: 'aim', flags: 0, start: 0, peak: 0, tail: 0, end: 0 };
    expect(autolayerWeight(always, 0.7, 1, set, [0])).toEqual({ cycle: 0.7, weight: 1 });
  });
});

// --- frames and attachments -------------------------------------------------------------

describe('GLB frames (model-axes)', () => {
  const S = 0.01905;
  const hull = {
    min: [-19 * S, -16 * S, -3 * S] as [number, number, number],
    max: [6 * S, 16 * S, 83 * S] as [number, number, number],
  };

  it('recognises the (y, z, x) bind frame of characters and Source axes of props', () => {
    // A player bind pose: Y up, symmetric in X.
    expect(detectAxisRotation(hull, { min: [-0.29, 0.27, -0.3], max: [0.29, 1.34, 0.08] })).toEqual(
      PERM_SOURCE_TO_GL,
    );
    // A medkit: Z up.
    const kit = {
      min: [-15 * S, -15 * S, 0] as [number, number, number],
      max: [15 * S, 15 * S, 26 * S] as [number, number, number],
    };
    expect(detectAxisRotation(kit, { min: [-0.17, -0.23, 0.04], max: [0.16, 0.23, 0.49] })).toEqual(
      IDENTITY_ROTATION,
    );
    // The rocket: Source X along glTF Y.
    const rocket = {
      min: [-18.6 * S, -3.7 * S, -3.7 * S] as [number, number, number],
      max: [18.6 * S, 3.7 * S, 3.7 * S] as [number, number, number],
    };
    const r = detectAxisRotation(rocket, {
      min: [-0.065, -0.349, -0.065],
      max: [0.065, 0.349, 0.065],
    });
    expect(Math.abs(r[3])).toBe(1); // row y takes Source x
  });

  it('frame matrices map GLB space into three model space; a Source-axes model lands upright', () => {
    const m = frameMatrixFor(IDENTITY_ROTATION);
    // A Source-axes GLB point 10 units up (Z) is three +Y.
    const up = new Vector3(0, 0, 10 * S).applyMatrix4(m);
    expect(up.y).toBeCloseTo(10 * S);
    expect(frameMatrixFor(PERM_SOURCE_TO_GL).equals(new Matrix4())).toBe(true);
  });

  it('posed frames: clips converted with the fallback mapping over a Source-axes bind', () => {
    // Bind root rotation 90° about X (HL2 pelvis), posed root = P · that.
    const bindRoot = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2);
    const P = new Matrix4().set(0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1);
    const posed = new Quaternion().setFromRotationMatrix(
      P.clone().multiply(new Matrix4().makeRotationFromQuaternion(bindRoot)),
    );
    const frame = animatedFrame(
      frameMatrixFor(IDENTITY_ROTATION),
      bindRoot.toArray(),
      posed.toArray(),
    );
    expect(frame.equals(new Matrix4())).toBe(true);
    expect(nearestAxisRotation([0.9, 0.1, 0, -0.1, 0.9, 0, 0, 0, 1])).toEqual(IDENTITY_ROTATION);
    expect(nearestAxisRotation([0.7, 0.7, 0, -0.7, 0.7, 0, 0, 0, 1])).toBeNull();
  });

  it('posed frames: the idle skeleton must fit the hull (an HL2 view model swings its arm, not its frame)', () => {
    // v_portalgun: bind and clips share the (y, z, x) frame; the ref pose holds the root turned
    // 90° about X and the idle turns it forward, which animatedFrame reads as a frame change.
    const bind = new Matrix4();
    const guess = new Matrix4().makeRotationX(Math.PI / 2);
    const gun = { min: [-2.4, -12.5, -16.4], max: [37.4, 1, 5.3] };
    // Idle bones (GLB metres): bip01, the hand, the gun's front cover.
    const gunBones = [0, -16.4, 11.5, -8.2, -11.3, 7.3, -6.3, -9.4, 29.5].map((v) => v * S);
    expect(checkPosedFrame(bind, guess, gunBones, gun.min, gun.max)).toBe(bind);
    // HL2 human: Source-axes bind, clips in (y, z, x); the idle stands up in the guessed frame.
    const sourceBind = frameMatrixFor(IDENTITY_ROTATION);
    const human = { min: [-13, -13, 0], max: [13, 13, 72] };
    const humanBones = [0, 40, 0, 0, 70, 0, 8, 60, 0].map((v) => v * S);
    const identity = new Matrix4();
    expect(checkPosedFrame(sourceBind, identity, humanBones, human.min, human.max)).toBe(identity);
  });

  it('attachments: an entity transform × the model frame × a bone-local offset', () => {
    // A perm-frame model at (100, 0, 0) yawed 90°: its forward (Source +X, glTF +Z) points +Y.
    const placed = sourceTransformToMatrix(
      { x: 100, y: 0, z: 0 },
      { x: 0, y: 90, z: 0 },
      1,
      new Matrix4(),
    );
    const local = new Matrix4().makeTranslation(0, 0, 10 * S); // 10 units forward in GLB (y, z, x) axes
    const world = placed.multiply(frameMatrixFor(PERM_SOURCE_TO_GL)).multiply(local);
    const p = new Vector3().setFromMatrixPosition(world);
    const expected = srcToThree(100, 10, 0, new Vector3());
    expect(p.distanceTo(expected)).toBeLessThan(1e-6);
  });
});

// --- view model, effects, death --------------------------------------------------------

describe('view model', () => {
  it('maps networked activities through the item table to the arms activity', () => {
    const scattergun = STOCK_WEAPONS[13];
    expect(scattergun.vmActivities[vmActivityName(ACT.VM_PRIMARYATTACK)]).toBe(
      'ACT_PRIMARY_VM_PRIMARYATTACK',
    );
    expect(scattergun.vmActivities[vmActivityName(ACT.VM_IDLE)]).toBe('ACT_PRIMARY_VM_IDLE');
    expect(STOCK_WEAPONS[0].vmActivities[vmActivityName(ACT.VM_HITCENTER)]).toBe(
      'ACT_MELEE_VM_HITCENTER',
    );
    expect(vmActivityName(999)).toBe('');
  });

  it('bob: none standing, bounded and cyclic running (CalcViewModelBobHelper)', () => {
    const b = new BobState();
    for (let t = 0; t < 2; t += 1 / 60) b.calc(0, t);
    expect(b.verticalBob).toBe(0);
    const seen: number[] = [];
    for (let t = 2; t < 6; t += 1 / 60) {
      b.calc(320, t);
      seen.push(b.verticalBob);
    }
    expect(Math.max(...seen)).toBeLessThanOrEqual(4);
    expect(Math.min(...seen)).toBeGreaterThanOrEqual(-7);
    expect(Math.max(...seen) - Math.min(...seen)).toBeGreaterThan(1);
    const o = { x: 0, y: 0, z: 0 };
    const a = { x: 0, y: 0, z: 0 };
    b.apply(o, a);
    expect(a.z).toBeCloseTo(b.verticalBob * 0.5);
  });
});

describe('effects and objects', () => {
  it('picks impact systems by surface and projectile trails by model/team/crit', () => {
    expect(impactSystemFor('metal')).toBe('impact_metal');
    expect(impactSystemFor('wood_crate')).toBe('impact_wood');
    expect(impactSystemFor('dirt')).toBe('impact_dirt');
    expect(impactSystemFor('concrete')).toBe('impact_concrete');
    expect(impactSystemFor(undefined)).toBe('impact_concrete');
    expect(projectileTrail('models/weapons/w_models/w_rocket.mdl', 2, false)).toBe('rockettrail');
    expect(projectileTrail('models/weapons/w_models/w_rocket.mdl', 3, true)).toBe(
      'critical_rocket_blue',
    );
    expect(projectileTrail('models/weapons/w_models/w_stickybomb.mdl', 2, false)).toBe(
      'stickybombtrail_red',
    );
    expect(projectileTrail('models/weapons/w_models/w_grenade_grenadelauncher.mdl', 3, true)).toBe(
      'critical_pipe_blue',
    );
    expect(projectileTrail('models/weapons/w_models/w_syringe_proj.mdl', 2, false)).toBe(
      'nailtrails_medic_red',
    );
    expect(projectileTrail('models/props/whatever.mdl', 2, false)).toBeNull();
  });

  it('chooses a death sequence by kill kind', () => {
    const s = (name: string): SequenceDesc => ({
      name,
      looping: false,
      delta: false,
      post: false,
      fps: 30,
      frames: 30,
      clips: [],
    });
    const seqs = [
      s('stand_PRIMARY'),
      s('primary_death_backstab'),
      s('primary_death_headshot'),
      s('primary_death_burning'),
    ];
    expect(findDeathSequence(seqs, 'burning')?.name).toBe('primary_death_burning');
    expect(findDeathSequence(seqs, 'backstab')?.name).toBe('primary_death_backstab');
    expect(findDeathSequence([s('idle')], 'headshot')).toBeNull();
  });
});
