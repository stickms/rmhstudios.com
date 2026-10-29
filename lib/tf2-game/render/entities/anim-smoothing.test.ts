/**
 * Animation smoothness (pure): the Source-style sequence transitioner (CSequenceTransitioner:
 * outgoing sequences keep playing and blend out along the GetFadeout spline, stacked), no
 * restart for a re-requested looping sequence, cycle continuity under jittered authoritative
 * updates, the view model's parity rules (vm-anim.ts), pose-parameter smoothing, gesture
 * blend ramps, the SDK activity tables per anim group, and the animation level of detail.
 */
import { describe, expect, it } from 'vitest';
import { STOCK_WEAPONS } from '../../data/weapons';
import { ACT, vmActivityName } from '../../sim/weapons/constants';
import { PLAYER_ACTTABLES, VIEWMODEL_ACTTABLE } from './acttables';
import {
  ANIM_LOD_FULL,
  ANIM_LOD_HIDDEN,
  ANIM_LOD_MINIMAL,
  ANIM_LOD_REDUCED,
  ANIM_LOD_REDUCED_DISTANCE,
  AnimSet,
  Animator,
  animLod,
  CYCLE_SNAP_ERROR,
  fadeWeight,
  GESTURE_RAMP_SHARE,
  MAX_OUTGOING,
  transitionTime,
  type RawClip,
  type SequenceDesc,
} from './animator';
import {
  AIM_POSE_RATE,
  MOVE_POSE_RATE,
  TFPlayerAnimState,
  translateActivity,
  type PlayerAnimInput,
} from './player-anim-state';
import {
  playVmActivity,
  vmActivityCandidates,
  VM_SNAP_BLEND,
  type VmPlayResult,
  type VmWeaponTable,
} from './vm-anim';

// --- a one-bone rig: each sequence turns the bone about Z ---------------------------------

const DEG = Math.PI / 180;
const zq = (deg: number) => [0, 0, Math.sin((deg * DEG) / 2), Math.cos((deg * DEG) / 2)];

/** A clip turning the bone from `a0` to `a1` degrees over `seconds`. */
function clip(name: string, a0: number, a1: number, seconds = 1, fps = 30): RawClip {
  return {
    name,
    userData: { fps, frames: Math.round(seconds * fps) + 1 },
    tracks: [{ name: 'b.quaternion', times: [0, seconds], values: [...zq(a0), ...zq(a1)] }],
  };
}

function seq(name: string, over: Partial<SequenceDesc> = {}): SequenceDesc {
  return {
    name,
    looping: true,
    delta: false,
    post: false,
    fps: 30,
    frames: 31,
    fadeIn: 0.2,
    fadeOut: 0.2,
    clips: [name],
    ...over,
  };
}

function rig(
  seqs: Array<[SequenceDesc, number, number]>,
  activities: Record<string, string[]> = {},
): AnimSet {
  return new AnimSet(['b'], new Float32Array(3), new Float32Array([0, 0, 0, 1]), {
    sequences: seqs.map(([s]) => s),
    clips: seqs.map(([s, a0, a1]) => clip(s.name, a0, a1, (s.frames - 1) / s.fps)),
    activities: Object.fromEntries(
      Object.entries(activities).map(([k, v]) => [k, v.map((n) => ({ seq: n, weight: 1 }))]),
    ),
    poseParameters: [],
  });
}

/** The bone's Z angle (degrees) after evaluating. */
function angle(a: Animator): number {
  const pos = new Float32Array(3);
  const q = new Float32Array(4);
  a.evaluate(pos, q);
  return (2 * Math.atan2(q[2], q[3])) / DEG;
}

const A = seq('A');
const B = seq('B');
const C = seq('C');
const statics = (): AnimSet =>
  rig([
    [A, 0, 0],
    [B, 90, 90],
    [C, -90, -90],
  ]);

describe('sequence transitioner (CSequenceTransitioner)', () => {
  it('fades along the GetFadeout spline over MIN(fade-out, fade-in); snap cuts', () => {
    expect(fadeWeight(0, 0.2)).toBe(1);
    expect(fadeWeight(0.1, 0.2)).toBeCloseTo(0.5);
    expect(fadeWeight(0.05, 0.2)).toBeCloseTo(3 * 0.75 ** 2 - 2 * 0.75 ** 3); // 0.84375
    expect(fadeWeight(0.2, 0.2)).toBe(0);
    expect(fadeWeight(0.1, 0)).toBe(0);
    expect(transitionTime(seq('x', { fadeOut: 0.1 }), seq('y', { fadeIn: 0.3 }))).toBeCloseTo(0.1);
    expect(transitionTime(seq('x'), seq('y', { fadeIn: 0.5 }))).toBeCloseTo(0.2);
    expect(transitionTime(seq('x'), seq('y', { snap: true }))).toBe(0);
    expect(transitionTime(seq('x'), seq('y', { snap: true }), 0.05)).toBe(0.05);
  });

  it('the outgoing sequence keeps playing and blends out under the new one', () => {
    const a = new Animator(
      rig([
        [A, 0, 0],
        [B, 90, 90],
        [seq('R'), 0, 360],
      ]),
    );
    a.setSequence(a.set.seq('R')!);
    a.advance(0.25);
    a.setSequence(B);
    expect(a.transitionCount).toBe(1);
    const c0 = a.transition(0)!.cycle;
    a.advance(0.1);
    // R kept advancing (1 cycle/s) and weighs spline(0.5) = 0.5.
    expect(a.transition(0)!.cycle).toBeCloseTo(c0 + 0.1);
    expect(a.transition(0)!.weight).toBeCloseTo(0.5);
    a.advance(0.11);
    expect(a.transitionCount).toBe(0);
    expect(angle(a)).toBeCloseTo(90);
  });

  it('blends A → B continuously: halfway at half the fade, B at the end', () => {
    const a = new Animator(statics());
    a.setSequence(A);
    a.advance(0.1);
    expect(angle(a)).toBeCloseTo(0);
    a.setSequence(B);
    expect(angle(a)).toBeCloseTo(0, 4); // no pop on the change frame
    a.advance(0.1);
    expect(angle(a)).toBeCloseTo(45, 1);
    a.advance(0.1);
    expect(angle(a)).toBeCloseTo(90);
  });

  it('a change during a change stacks (newest first) without a pop, capped at MAX_OUTGOING', () => {
    const a = new Animator(statics());
    a.setSequence(A);
    a.setSequence(B);
    a.advance(0.07);
    const before = angle(a);
    a.setSequence(C);
    expect(a.transitionCount).toBe(2);
    expect(angle(a)).toBeCloseTo(before, 3);
    // Rapid changes never queue more than MAX_OUTGOING.
    for (let i = 0; i < 10; i++) {
      a.setSequence(i % 2 ? A : B);
      a.advance(0.01);
    }
    expect(a.transitionCount).toBeLessThanOrEqual(MAX_OUTGOING);
  });

  it('snap sequences cut (and clear the queue) unless a snap blend is set; fade:false cuts', () => {
    const S = seq('S', { snap: true });
    const set = rig([
      [A, 0, 0],
      [S, 90, 90],
      [B, 45, 45],
    ]);
    const a = new Animator(set);
    a.setSequence(A);
    a.setSequence(B);
    a.setSequence(S);
    expect(a.transitionCount).toBe(0);
    expect(angle(a)).toBeCloseTo(90);
    const v = new Animator(set);
    v.snapBlend = 0.05;
    v.setSequence(A);
    v.setSequence(S);
    expect(v.transitionCount).toBe(1);
    expect(v.transition(0)!.fadeTime).toBe(0.05);
    v.setSequence(A, { fade: false });
    expect(v.transitionCount).toBe(0);
  });

  it('never restarts the looping sequence already playing; restart is the parity (cross-faded)', () => {
    const a = new Animator(rig([[seq('R'), 0, 360]], { ACT_RUN: ['R'] }));
    a.setActivity('ACT_RUN');
    a.advance(0.4);
    a.setActivity('ACT_RUN');
    a.setSequence(a.set.seq('R')!);
    expect(a.main!.cycle).toBeCloseTo(0.4);
    expect(a.transitionCount).toBe(0);
    a.restartMain();
    expect(a.main!.cycle).toBe(0);
    expect(a.transitionCount).toBe(1);
    expect(a.transition(0)!.cycle).toBeCloseTo(0.4);
    // Restarting a sequence that has just started queues nothing.
    a.restartMain();
    expect(a.transitionCount).toBe(1);
  });
});

describe('cycle continuity', () => {
  /** Deterministic jitter. */
  const rng = (seed: number) => () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };

  it('advances per frame and bleeds off drift from jittered authoritative cycles', () => {
    const R = seq('R', { frames: 31 }); // 1 cycle per second
    const a = new Animator(rig([[R, 0, 360]]));
    a.setSequence(R);
    const r = rng(7);
    let server = 0;
    let nextSnap = 0.03;
    let prev = 0;
    let maxStep = 0;
    let minStep = Infinity;
    // A client clock running 2 % slow against the server, frames of 12–20 ms, snapshots every
    // 25–45 ms whose cycle carries ±0.01 cycles of noise.
    for (let i = 0; i < 600; i++) {
      const dt = 0.012 + r() * 0.008;
      server += dt;
      if (server >= nextSnap) {
        a.syncCycle((server + (r() - 0.5) * 0.02) % 1);
        nextSnap = server + 0.025 + r() * 0.02;
      }
      a.advance(dt * 0.98);
      let step = a.main!.cycle - prev;
      step -= Math.floor(step);
      prev = a.main!.cycle;
      if (i > 0) {
        maxStep = Math.max(maxStep, step / dt);
        minStep = Math.min(minStep, step / dt);
      }
      expect(a.transitionCount).toBe(0); // never a restart
    }
    // Always moving forward near 1 cycle/s: no snaps, no stalls.
    expect(minStep).toBeGreaterThan(0.5);
    expect(maxStep).toBeLessThan(1.6);
    let err = (server % 1) - a.main!.cycle;
    err -= Math.round(err);
    expect(Math.abs(err)).toBeLessThan(0.03);
  });

  it('keeps advancing between sparse updates, and cross-fades a desync it cannot bleed', () => {
    const R = seq('R');
    const a = new Animator(rig([[R, 0, 360]]));
    a.setSequence(R);
    a.syncCycle(0.1);
    for (let i = 0; i < 30; i++) a.advance(1 / 60);
    // The target (the cycle as of that first frame) ran on at the sequence rate for the other
    // 29 frames, and the cycle converged on it: no pull back toward the stale 0.1.
    const now = 0.1 + 29 / 60;
    expect(a.main!.cycle).toBeCloseTo(now, 2);
    a.syncCycle(now + 1 / 60 + CYCLE_SNAP_ERROR + 0.1);
    a.advance(1 / 60);
    expect(a.transitionCount).toBe(1);
    expect(a.main!.cycle).toBeCloseTo(now + 1 / 60 + CYCLE_SNAP_ERROR + 0.1, 5);
  });
});

/** viewmodel.ts's driving rule: play when the activity, its counter or the weapon changed. */
class VmDriver {
  private lastSeq = -1;
  private lastAct = -1;
  private lastDef = -2;
  /** The counter moved on the last update (a new SendWeaponAnim: the muzzle flash keys off it). */
  parityChanged = false;

  update(
    anim: Animator,
    act: number,
    counter: number,
    def: number,
    w: VmWeaponTable,
  ): VmPlayResult {
    this.parityChanged = counter !== this.lastSeq;
    if (!this.parityChanged && act === this.lastAct && def === this.lastDef) return 'none';
    this.lastSeq = counter;
    this.lastAct = act;
    this.lastDef = def;
    return playVmActivity(anim, vmActivityName(act), w, this.parityChanged);
  }
}

describe('view model (vm-anim)', () => {
  // The heavy's arms: idle, the spool-up (one-shot, snap), the spin and fire loops, a shotgun fire.
  const arms = () =>
    rig(
      [
        [seq('m_idle', { frames: 51 }), 0, 10],
        [seq('m_spool_up', { looping: false, snap: true }), 10, 40],
        [seq('m_spool_idle', { frames: 10, snap: true }), 40, 50],
        [seq('m_fire', { frames: 18, snap: true }), 40, 60],
        [seq('m_spool_down', { looping: false, frames: 41, snap: true }), 40, 0],
        [seq('fire', { looping: false, frames: 26, snap: true }), 0, 30],
      ],
      {
        ACT_PRIMARY_VM_IDLE: ['m_idle'],
        ACT_PRIMARY_ATTACK_STAND_PREFIRE: ['m_spool_up'],
        ACT_PRIMARY_VM_SECONDARYATTACK: ['m_spool_idle'],
        ACT_PRIMARY_VM_PRIMARYATTACK: ['m_fire'],
        ACT_PRIMARY_ATTACK_STAND_POSTFIRE: ['m_spool_down'],
        ACT_SECONDARY_VM_PRIMARYATTACK: ['fire'],
      },
    );
  const minigun = STOCK_WEAPONS[15];

  it('translates through the item table, then s_viewmodelacttable for the role', () => {
    // The minigun's item table has no PREFIRE row: the role table supplies the wind-up.
    expect(minigun.vmActivities.ACT_MP_ATTACK_STAND_PREFIRE).toBeUndefined();
    expect(vmActivityCandidates('ACT_MP_ATTACK_STAND_PREFIRE', minigun)).toEqual([
      'ACT_PRIMARY_ATTACK_STAND_PREFIRE',
      'ACT_MP_ATTACK_STAND_PREFIRE',
    ]);
    expect(vmActivityCandidates('ACT_VM_PRIMARYATTACK', minigun)[0]).toBe(
      'ACT_PRIMARY_VM_PRIMARYATTACK',
    );
    // Fists alternate: HITLEFT / HITRIGHT are separate arms activities.
    const fists = STOCK_WEAPONS[5];
    expect(vmActivityCandidates('ACT_VM_HITLEFT', fists)[0]).toBe('ACT_FISTS_VM_HITLEFT');
    expect(vmActivityCandidates('ACT_VM_HITRIGHT', fists)[0]).toBe('ACT_FISTS_VM_HITRIGHT');
    expect(VIEWMODEL_ACTTABLE.SECONDARY.ACT_RELOAD_START).toBe('ACT_SECONDARY_RELOAD_START');
  });

  it('wind-up → spin → fire → wind-down: loops keep their cycle however often they are re-sent', () => {
    const anim = new Animator(arms());
    const vm = new VmDriver();
    let counter = 0;
    const send = (act: number) =>
      vm.update(anim, act, (counter = (counter + 1) & 255), 15, minigun);
    send(ACT.VM_IDLE);
    expect(anim.main!.seq.name).toBe('m_idle');
    anim.advance(0.3);
    expect(send(ACT.MP_ATTACK_STAND_PREFIRE)).toBe('change');
    expect(anim.main!.seq.name).toBe('m_spool_up');
    // A snap sequence blends over VM_SNAP_BLEND on the view model.
    expect(anim.transition(0)?.fadeTime).toBe(VM_SNAP_BLEND);
    anim.advance(0.75);
    // SPINNING re-sends SECONDARYATTACK every tick (bumping the counter each time).
    expect(send(ACT.VM_SECONDARYATTACK)).toBe('change');
    let last = anim.main!.cycle;
    let total = 0;
    for (let i = 0; i < 40; i++) {
      anim.advance(0.015);
      expect(send(ACT.VM_SECONDARYATTACK)).toBe('continue');
      let d = anim.main!.cycle - last;
      d -= Math.floor(d);
      total += d;
      last = anim.main!.cycle;
    }
    expect(anim.main!.seq.name).toBe('m_spool_idle');
    // 0.6 s of a 9-frame 30 fps loop: (30 / 9) × 0.6 = 2 cycles, uninterrupted.
    expect(total).toBeCloseTo(0.6 * (30 / 9), 3);
    // FIRING: PRIMARYATTACK per shot; the fire loop is not restarted by later shots.
    expect(send(ACT.VM_PRIMARYATTACK)).toBe('change');
    anim.advance(0.05);
    const c = anim.main!.cycle;
    anim.advance(0.05);
    expect(send(ACT.VM_PRIMARYATTACK)).toBe('continue');
    expect(anim.main!.cycle).toBeGreaterThan(c);
    expect(vm.parityChanged).toBe(true); // a new shot still flashes the muzzle
    expect(send(ACT.MP_ATTACK_STAND_POSTFIRE)).toBe('change');
    expect(anim.main!.seq.name).toBe('m_spool_down');
  });

  it('restarts a one-shot only when the counter moves (the parity), cross-faded', () => {
    const anim = new Animator(arms());
    const shotgun = { role: 'SECONDARY', vmActivities: {} };
    const vm = new VmDriver();
    vm.update(anim, ACT.VM_PRIMARYATTACK, 1, 9, shotgun);
    expect(anim.main!.seq.name).toBe('fire');
    anim.advance(0.3);
    // Same activity and counter: nothing.
    expect(vm.update(anim, ACT.VM_PRIMARYATTACK, 1, 9, shotgun)).toBe('none');
    expect(anim.main!.cycle).toBeGreaterThan(0.3);
    // A new shot: from the start, the old one blending out.
    expect(vm.update(anim, ACT.VM_PRIMARYATTACK, 2, 9, shotgun)).toBe('restart');
    expect(anim.main!.cycle).toBe(0);
    expect(anim.transitionCount).toBe(1);
  });

  it('prediction replays that re-derive the counter never restart a loop', () => {
    const anim = new Animator(arms());
    const vm = new VmDriver();
    vm.update(anim, ACT.VM_IDLE, 10, 15, minigun);
    anim.advance(0.5);
    const c = anim.main!.cycle;
    for (const n of [11, 10, 12, 11, 13])
      expect(vm.update(anim, ACT.VM_IDLE, n, 15, minigun)).toBe('continue');
    expect(anim.main!.cycle).toBe(c);
    expect(anim.transitionCount).toBe(0);
    // An activity the arms do not have changes nothing.
    expect(playVmActivity(anim, 'ACT_VM_PULLBACK', minigun, true)).toBe('none');
    expect(anim.main!.seq.name).toBe('m_idle');
  });
});

describe('gesture blend ramps', () => {
  it('ramps in over the fade-in and out over the last fade-out, then retires', () => {
    const G = seq('G', { looping: false, frames: 61 }); // 2 s
    const a = new Animator(
      rig([
        [A, 0, 0],
        [G, 90, 90],
      ]),
    );
    a.setSequence(A);
    a.restartGesture(0, G, 'ACT_G');
    expect(a.gestures[0]!.weight).toBe(0);
    a.advance(0.1);
    expect(a.gestures[0]!.weight).toBeCloseTo(0.5);
    expect(angle(a)).toBeCloseTo(45, 0);
    a.advance(0.9);
    expect(a.gestures[0]!.weight).toBe(1);
    a.advance(0.9);
    expect(a.gestures[0]!.weight).toBeCloseTo(0.5, 1);
    a.advance(0.2);
    expect(a.gestures[0]).toBeNull();
  });

  it('short gestures keep their ramps within GESTURE_RAMP_SHARE; snap gestures start at full weight', () => {
    const short = seq('Q', { looping: false, frames: 10 }); // 0.3 s
    const snap = seq('P', { looping: false, snap: true });
    const a = new Animator(
      rig([
        [A, 0, 0],
        [short, 30, 30],
        [snap, 30, 30],
      ]),
    );
    a.setSequence(A);
    a.restartGesture(0, short, 'Q');
    const g = a.gestures[0]!;
    expect(g.fadeIn + g.fadeOut).toBeCloseTo(GESTURE_RAMP_SHARE * 0.3);
    a.restartGesture(1, snap, 'P');
    expect(a.gestures[1]!.weight).toBe(1);
  });

  it('a gesture restarted while playing fades out under the new one (no pop)', () => {
    const G = seq('G', { looping: false, frames: 61 });
    const H = seq('H', { looping: false, frames: 61 });
    const a = new Animator(
      rig([
        [A, 0, 0],
        [G, 60, 60],
        [H, -60, -60],
      ]),
    );
    a.setSequence(A);
    a.restartGesture(0, G, 'G');
    a.advance(0.5);
    const before = angle(a);
    a.restartGesture(0, H, 'H');
    expect(angle(a)).toBeCloseTo(before, 3);
    a.advance(0.25);
    expect(angle(a)).toBeCloseTo(-60, 0);
  });
});

describe('player pose parameters', () => {
  const inp = (over: Partial<PlayerAnimInput> = {}): PlayerAnimInput => ({
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
    inCond: () => false,
    suffix: 'PRIMARY',
    isMinigun: false,
    isSniperRifle: false,
    hasActivity: () => true,
    ...over,
  });

  it('move_x / move_y approach their goal at MOVE_POSE_RATE; body yaw/pitch at AIM_POSE_RATE', () => {
    const s = new TFPlayerAnimState();
    s.update(inp(), 0, () => 300);
    expect(s.moveX).toBe(0);
    s.update(inp({ vx: 300, time: 10 + 1 / 60 }), 0, () => 300);
    expect(s.moveX).toBeCloseTo(MOVE_POSE_RATE / 60);
    for (let i = 2; i <= 12; i++) s.update(inp({ vx: 300, time: 10 + i / 60 }), 0, () => 300);
    expect(s.moveX).toBeCloseTo(1);
    // Stopping eases back the same way (no snap to 0).
    s.update(inp({ time: 11 }), 0, () => 300);
    expect(s.moveX).toBeCloseTo(1 - MOVE_POSE_RATE / 60);
    // A pitch flick of 60° moves the pose AIM_POSE_RATE / 60 per frame.
    const p = new TFPlayerAnimState();
    p.update(inp(), 0, () => 300);
    p.update(inp({ eyePitch: 60 }), 0, () => 300);
    expect(p.bodyPitch).toBeCloseTo(-AIM_POSE_RATE / 60);
    for (let i = 0; i < 10; i++) p.update(inp({ eyePitch: 60 }), 0, () => 300);
    expect(p.bodyPitch).toBeCloseTo(-60);
  });
});

describe('activity translation by anim group (TranslateActivity, tf_weaponbase.cpp acttables)', () => {
  it('maps each role through its own table; no row keeps the base, no role translates nothing', () => {
    const cases: Array<[string, string, string]> = [
      ['ACT_MP_STAND_IDLE', 'PRIMARY', 'ACT_MP_STAND_PRIMARY'],
      ['ACT_MP_DEPLOYED_IDLE', 'PRIMARY', 'ACT_MP_DEPLOYED_IDLE'], // no primary row
      ['ACT_MP_RUN', 'SECONDARY', 'ACT_MP_RUN_SECONDARY'],
      ['ACT_MP_ATTACK_STAND_PRIMARYFIRE', 'MELEE', 'ACT_MP_ATTACK_STAND_MELEE'],
      ['ACT_MP_ATTACK_STAND_SECONDARYFIRE', 'MELEE', 'ACT_MP_ATTACK_STAND_MELEE_SECONDARY'],
      ['ACT_MP_JUMP_START', 'PDA', 'ACT_MP_JUMP_START_PDA'],
      ['ACT_MP_ATTACK_CROUCH_GRENADE', 'BUILDING', 'ACT_MP_ATTACK_STAND_GRENADE_BUILDING'],
      ['ACT_MP_DEPLOYED_IDLE', 'ITEM1', 'ACT_MP_DEPLOYED_IDLE_ITEM1'],
      ['ACT_MP_STAND_IDLE', 'ITEM2', 'ACT_MP_STAND_ITEM2'],
      ['ACT_MP_RUN', 'MELEE_ALLCLASS', 'ACT_MP_RUN_MELEE_ALLCLASS'],
      // MELEE_ALLCLASS shares the melee secondary attack and double-jump rows.
      [
        'ACT_MP_ATTACK_STAND_SECONDARYFIRE',
        'MELEE_ALLCLASS',
        'ACT_MP_ATTACK_STAND_MELEE_SECONDARY',
      ],
      ['ACT_MP_DOUBLEJUMP_CROUCH', 'MELEE_ALLCLASS', 'ACT_MP_DOUBLEJUMP_CROUCH_MELEE'],
      ['ACT_MP_STAND_IDLE', 'SECONDARY2', 'ACT_MP_STAND_SECONDARY2'],
      ['ACT_MP_STAND_IDLE', 'PRIMARY2', 'ACT_MP_STAND_PRIMARY'],
      ['ACT_MP_ATTACK_STAND_PREFIRE', 'PRIMARY', 'ACT_MP_ATTACK_STAND_PREFIRE'],
      ['ACT_MP_STAND_IDLE', 'HEAD', 'ACT_MP_STAND_PRIMARY'], // SDK default: the primary table
      ['ACT_MP_STAND_IDLE', '', 'ACT_MP_STAND_IDLE'],
    ];
    for (const [base, role, want] of cases)
      expect(`${role}:${translateActivity(base, role)}`).toBe(`${role}:${want}`);
    for (const role of [
      'PRIMARY',
      'SECONDARY',
      'MELEE',
      'BUILDING',
      'PDA',
      'ITEM1',
      'ITEM2',
      'ITEM3',
      'ITEM4',
      'MELEE_ALLCLASS',
      'PRIMARY2',
      'SECONDARY2',
    ])
      expect(PLAYER_ACTTABLES[role]?.ACT_MP_STAND_IDLE).toBeDefined();
  });
});

describe('animation level of detail', () => {
  it('trims transitions and skips evaluation off screen', () => {
    expect(animLod(100, true)).toBe(ANIM_LOD_FULL);
    expect(animLod(ANIM_LOD_REDUCED_DISTANCE + 1, true)).toBe(ANIM_LOD_REDUCED);
    expect(animLod(5000, true)).toBe(ANIM_LOD_MINIMAL);
    expect(animLod(10, false)).toBe(ANIM_LOD_HIDDEN);
    const a = new Animator(statics());
    a.setSequence(A);
    a.lod = ANIM_LOD_REDUCED;
    a.setSequence(B);
    a.setSequence(C);
    expect(a.transitionCount).toBe(1);
    a.lod = ANIM_LOD_MINIMAL;
    a.setSequence(A);
    expect(a.transitionCount).toBe(0);
    a.lod = ANIM_LOD_HIDDEN;
    const pos = new Float32Array(3);
    const q = new Float32Array([1, 2, 3, 4]);
    a.evaluate(pos, q);
    expect(Array.from(q)).toEqual([1, 2, 3, 4]);
  });
});
