/**
 * The game clients' pure logic: the camera (CalcView pieces against the SDK's
 * formulas), the zoom FOV, quality tiers and the frame-time governor, the
 * frame loop's pacing and pausing, the fixed-step clock, and the single-player
 * save format.
 */
import { describe, expect, it } from 'vitest';
import {
  calcChaseCam,
  calcDeathCam,
  calcFirstPerson,
  calcFreezeCam,
  calcRoll,
  CHASE_CAM_DISTANCE_MAX,
  CHASE_CAM_DISTANCE_MIN,
  FovState,
  simpleSpline,
  SPEC_FREEZE_TRAVELTIME,
  StairSmoother,
  STAIR_SMOOTH_MAX,
  TF_DEATH_ANIMATION_TIME,
  TF_WEAPON_ZOOM_FOV,
  TF_ZOOM_RATE,
  ViewController,
  type ViewFrame,
  type WallTrace,
} from './view';
import { deviceTier, FrameGovernor, GOVERNOR, planQuality, TIER_PRESETS, type DeviceInfo } from './quality';
import { FixedStep, GameLoop, MAX_FRAME_DT, type LoopHost } from './loop';
import { loadSave, makeSave, parseSave, saveKey, writeSave, type SaveStorage } from './sp-save';
import { TICK_INTERVAL } from '../core/constants';

const open: WallTrace = (_s, e, out) => {
  out.x = e.x;
  out.y = e.y;
  out.z = e.z;
  return { fraction: 1 };
};

describe('view: SDK pieces', () => {
  it('SimpleSpline eases in and out', () => {
    expect(simpleSpline(0)).toBe(0);
    expect(simpleSpline(1)).toBe(1);
    expect(simpleSpline(0.5)).toBeCloseTo(0.5);
    expect(simpleSpline(0.25)).toBeCloseTo(3 * 0.0625 - 2 * 0.015625);
  });

  it('CalcRoll: proportional below rollspeed, capped at rollangle, signed by the side', () => {
    const angles = { x: 0, y: 0, z: 0 };
    // Facing +x, right is −y: moving toward −y is moving right.
    expect(calcRoll(angles, { x: 0, y: -100, z: 0 }, 2, 200)).toBeCloseTo(1);
    expect(calcRoll(angles, { x: 0, y: -400, z: 0 }, 2, 200)).toBeCloseTo(2);
    expect(calcRoll(angles, { x: 0, y: 100, z: 0 }, 2, 200)).toBeCloseTo(-1);
    // Source 2013's default sv_rollangle is 0: no roll.
    expect(calcRoll(angles, { x: 0, y: -400, z: 0 })).toBe(0);
  });

  it('first person: eye height, roll and the punch angle added to the view', () => {
    const out = { origin: { x: 0, y: 0, z: 0 }, angles: { x: 0, y: 0, z: 0 } };
    calcFirstPerson(
      {
        origin: { x: 10, y: 20, z: 30 },
        viewOffsetZ: 68,
        angles: { x: 5, y: 90, z: 0 },
        velocity: { x: 0, y: 0, z: 0 },
        punch: { x: -2, y: 1, z: 0.5 },
        onStaticGround: true,
        frametime: 0.016,
      },
      new StairSmoother(),
      out,
    );
    expect(out.origin).toEqual({ x: 10, y: 20, z: 98 });
    expect(out.angles).toEqual({ x: 3, y: 91, z: 0.5 });
  });

  it('SmoothViewOnStairs: a step up glides at 150 u/s, never lagging more than 18 units', () => {
    const s = new StairSmoother();
    expect(s.update(0, 68, true, 0.016)).toBe(0);
    // An 18-unit step: the eye starts 18 below and catches up at 150 u/s.
    const first = s.update(18, 68, true, 0.016);
    expect(first).toBeCloseTo(-18 + 150 * 0.016);
    let off = first;
    for (let i = 0; i < 20; i++) off = s.update(18, 68, true, 0.016);
    expect(off).toBe(0);
    // A teleport-sized jump never shows more than the step size.
    expect(s.update(500, 68, true, 0.016)).toBeGreaterThanOrEqual(-STAIR_SMOOTH_MAX);
    // In the air (or on a moving platform) nothing is smoothed.
    expect(s.update(600, 68, false, 0.016)).toBe(0);
  });

  it('zoom FOV: SetFOV(20, 0.1) reaches 20° along SimpleSpline, and back', () => {
    const f = new FovState(90);
    expect(f.current(0)).toBe(90);
    f.set(TF_WEAPON_ZOOM_FOV, TF_ZOOM_RATE, 1);
    expect(f.current(1)).toBe(90);
    expect(f.current(1 + TF_ZOOM_RATE / 2)).toBeCloseTo(55);
    expect(f.current(1 + TF_ZOOM_RATE * 0.25)).toBeCloseTo(90 + (20 - 90) * simpleSpline(0.25));
    expect(f.current(1 + TF_ZOOM_RATE)).toBe(20);
    expect(f.zoomed).toBe(true);
    f.set(0, TF_ZOOM_RATE, 2);
    expect(f.current(2 + TF_ZOOM_RATE)).toBe(90);
    // fov_desired changes apply at once when not zoomed.
    f.setDefault(75);
    expect(f.current(3)).toBe(75);
  });

  it('chase cam: distance clamped to CHASE_CAM_DISTANCE_MIN/MAX and pulled in by walls', () => {
    const out = { x: 0, y: 0, z: 0 };
    const d = calcChaseCam({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 1000, open, out);
    expect(d).toBe(CHASE_CAM_DISTANCE_MAX);
    expect(out.x).toBeCloseTo(-CHASE_CAM_DISTANCE_MAX);
    expect(calcChaseCam({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 0, open, out)).toBe(CHASE_CAM_DISTANCE_MIN);
    const wall: WallTrace = (s, e, o) => {
      o.x = s.x + (e.x - s.x) * 0.25;
      o.y = s.y;
      o.z = s.z;
      return { fraction: 0.25 };
    };
    expect(calcChaseCam({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 96, wall, out)).toBeCloseTo(24);
  });

  it('death cam turns toward the killer over the death animation', () => {
    const out = { origin: { x: 0, y: 0, z: 0 }, angles: { x: 0, y: 0, z: 0 } };
    const base = { corpse: { x: 0, y: 0, z: 0 }, deathAngles: { x: 0, y: 0, z: 0 }, killerEye: { x: 0, y: 500, z: 14 }, distance: 50 };
    calcDeathCam({ ...base, elapsed: 0 }, open, out);
    expect(out.angles.y).toBeCloseTo(0);
    calcDeathCam({ ...base, elapsed: TF_DEATH_ANIMATION_TIME / 2 }, open, out);
    expect(out.angles.y).toBeCloseTo(45);
    calcDeathCam({ ...base, elapsed: TF_DEATH_ANIMATION_TIME * 2 }, open, out);
    expect(out.angles.y).toBeCloseTo(90);
    // Backed away from the corpse along the view.
    expect(out.origin.y).toBeCloseTo(-50);
  });

  it('freeze cam travels to a point in front of the killer and looks at their chest', () => {
    const out = { origin: { x: 0, y: 0, z: 0 }, angles: { x: 0, y: 0, z: 0 } };
    const p = { start: { x: 0, y: 0, z: 64 }, targetEye: { x: 1000, y: 0, z: 64 }, targetAlive: true, distance: 100, zOffset: 0 };
    calcFreezeCam({ ...p, elapsed: 0 }, open, out);
    expect(out.origin).toEqual({ x: 0, y: 0, z: 64 });
    calcFreezeCam({ ...p, elapsed: SPEC_FREEZE_TRAVELTIME }, open, out);
    expect(out.origin.x).toBeCloseTo(900);
    expect(out.origin.z).toBeCloseTo(64);
    expect(out.angles.y).toBeCloseTo(0);
    // Looking down at the chest: half the hull height below the eyes.
    expect(out.angles.x).toBeCloseTo((Math.atan2(41, 100) * 180) / Math.PI);
  });

  it('the controller runs death cam → freeze cam → chase, and first person again on respawn', () => {
    const v = new ViewController(() => 0.5);
    const killer = { id: 7, eye: { x: 300, y: 0, z: 64 }, angles: { x: 0, y: 180, z: 0 }, alive: true };
    const frame = (now: number, alive: boolean): ViewFrame => ({
      now,
      frametime: 0.016,
      alive,
      spectator: false,
      first: { origin: { x: 0, y: 0, z: 0 }, viewOffsetZ: 68, angles: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, punch: { x: 0, y: 0, z: 0 }, onStaticGround: true, frametime: 0.016 },
      viewAngles: { x: 0, y: 0, z: 0 },
      roamOrigin: { x: 0, y: 0, z: 0 },
      player: (id) => (id === 7 ? killer : null),
      pickTarget: () => 7,
      fov: 90,
      thirdPerson: false,
      trace: open,
    });
    expect(v.update(frame(0, true)).drawViewModel).toBe(true);
    v.onLocalDeath(1, 7, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
    v.update(frame(1.5, false));
    expect(v.mode).toBe('deathcam');
    v.update(frame(1 + TF_DEATH_ANIMATION_TIME + 0.01, false));
    expect(v.mode).toBe('freezecam');
    expect(v.target).toBe(7);
    v.update(frame(1 + TF_DEATH_ANIMATION_TIME + 5, false));
    expect(v.mode).toBe('chase');
    expect(v.update(frame(20, true)).drawViewModel).toBe(true);
    expect(v.mode).toBe('firstperson');
  });
});

const device = (over: Partial<DeviceInfo> = {}): DeviceInfo => ({
  webgl2: true,
  maxTextureSize: 16384,
  deviceMemory: 8,
  cores: 8,
  touchFirst: false,
  mobileUa: false,
  gpu: 'NVIDIA GeForce RTX 3070',
  dpr: 1,
  ...over,
});

describe('quality tiers', () => {
  it('detects desktop, laptop and mobile', () => {
    expect(deviceTier(device())).toBe('desktop');
    expect(deviceTier(device({ cores: 4 }))).toBe('laptop');
    expect(deviceTier(device({ gpu: 'Intel(R) UHD Graphics 620' }))).toBe('laptop');
    expect(deviceTier(device({ maxTextureSize: 4096 }))).toBe('laptop');
    expect(deviceTier(device({ touchFirst: true }))).toBe('mobile');
    expect(deviceTier(device({ mobileUa: true }))).toBe('mobile');
  });

  it('plans from the tier, capped by the GPU and memory; the setting overrides', () => {
    const d = planQuality(device());
    expect(d.tier).toBe('desktop');
    expect(d.maxTextureSize).toBe(TIER_PRESETS.desktop.textureCap);
    expect(d.portalRecursion).toBe(2);
    const m = planQuality(device({ touchFirst: true, dpr: 3 }));
    expect(m.portalRecursion).toBe(1);
    expect(m.maxTextureSize).toBe(512);
    expect(m.dprCap).toBe(1.5);
    expect(planQuality(device({ maxTextureSize: 256 })).maxTextureSize).toBe(256);
    expect(planQuality(device({ deviceMemory: 2 })).maxTextureSize).toBe(512);
    expect(planQuality(device(), 'low').tier).toBe('mobile');
    expect(planQuality(device({ touchFirst: true }), 'high').tier).toBe('desktop');
  });

  it('the governor drops resolution under sustained load and recovers slowly', () => {
    const g = new FrameGovernor({ resolutionScale: 1, minResolutionScale: 0.5, targetFrameMs: 1000 / 60 });
    // 30 fps for a while: steps down.
    let changed = 0;
    for (let i = 0; i < 120; i++) if (g.sample(33.3)) changed++;
    expect(g.scale).toBeLessThan(1);
    expect(changed).toBeGreaterThan(0);
    const low = g.scale;
    // Hitches are ignored.
    expect(g.sample(GOVERNOR.hitchMs + 1)).toBe(false);
    // Back to 60 fps: it climbs only after the cooldown.
    let t = 0;
    while (g.scale === low && t < 10000) {
      g.sample(16.6);
      t += 16.6;
    }
    expect(t).toBeGreaterThanOrEqual(GOVERNOR.upCooldownMs);
    expect(g.scale).toBeCloseTo(low + GOVERNOR.upStep);
    // Never below the floor.
    for (let i = 0; i < 2000; i++) g.sample(100);
    expect(g.scale).toBe(0.5);
  });
});

class FakeHost implements LoopHost {
  t = 0;
  hiddenNow = false;
  private cb: ((t: number) => void) | null = null;
  private vis: (() => void) | null = null;
  requests = 0;
  requestFrame(cb: (t: number) => void): number {
    this.cb = cb;
    this.requests++;
    return this.requests;
  }
  cancelFrame(): void {
    this.cb = null;
  }
  now(): number {
    return this.t;
  }
  hidden(): boolean {
    return this.hiddenNow;
  }
  onVisibility(fn: () => void): () => void {
    this.vis = fn;
    return () => (this.vis = null);
  }
  /** Advance `ms` and deliver the pending frame. */
  frame(ms: number): boolean {
    this.t += ms;
    const cb = this.cb;
    this.cb = null;
    cb?.(this.t);
    return !!cb;
  }
  setHidden(h: boolean): void {
    this.hiddenNow = h;
    this.vis?.();
  }
  get pending(): boolean {
    return this.cb !== null;
  }
}

describe('frame loop', () => {
  it('runs one frame per callback, clamps long frames and stops on stop()', () => {
    const host = new FakeHost();
    const dts: number[] = [];
    const loop = new GameLoop((f) => dts.push(f.dt), host);
    loop.start();
    host.frame(16);
    host.frame(16);
    host.frame(1000);
    expect(dts[0]).toBe(0);
    expect(dts[1]).toBeCloseTo(0.016);
    expect(dts[2]).toBe(MAX_FRAME_DT);
    loop.stop();
    expect(host.pending).toBe(false);
  });

  it('schedules nothing while hidden and resumes with a zero-length frame', () => {
    const host = new FakeHost();
    const dts: number[] = [];
    const paused: boolean[] = [];
    const loop = new GameLoop((f) => dts.push(f.dt), host, (p) => paused.push(p));
    loop.start();
    host.frame(16);
    host.setHidden(true);
    expect(host.pending).toBe(false);
    host.t += 60_000;
    host.setHidden(false);
    expect(host.pending).toBe(true);
    host.frame(16);
    expect(dts[dts.length - 1]).toBe(0);
    expect(paused).toEqual([true, false]);
    loop.stop();
  });

  it('fixed step: whole ticks, the remainder carried, a backlog capped', () => {
    const s = new FixedStep(TICK_INTERVAL, 5);
    let ticks = 0;
    for (let i = 0; i < 60; i++) ticks += s.advance(1 / 60);
    // One second of frames is 66 or 67 ticks of 15 ms.
    expect(ticks).toBeGreaterThanOrEqual(66);
    expect(ticks).toBeLessThanOrEqual(67);
    expect(s.alpha).toBeGreaterThanOrEqual(0);
    expect(s.alpha).toBeLessThan(1);
    expect(s.advance(1)).toBe(5);
    expect(s.dropped).toBeGreaterThan(0);
  });
});

class MemoryStorage implements SaveStorage {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

describe('single-player saves', () => {
  const maps = ['testchmb_a_00', 'testchmb_a_01'];
  const transition = {
    fromMap: 'testchmb_a_00',
    toMap: 'testchmb_a_01',
    landmark: 'landmark',
    player: {
      offset: { x: 1, y: 2, z: 3 },
      velocity: { x: 0, y: 0, z: 0 },
      eyeAngles: { x: 0, y: 90, z: 0 },
      ducked: false,
      health: 100,
      armor: 0,
      hasSuit: false,
      suitPower: 100,
      flashlight: false,
      portalgun: { canFire1: true, canFire2: false },
    },
    entities: [],
    globals: { g: 1 },
  };

  it('round-trips a level start with its transition', () => {
    const st = new MemoryStorage();
    expect(writeSave(makeSave('portal', 'testchmb_a_01', transition, 2, 123), st)).toBe(true);
    const back = loadSave('portal', maps, st);
    expect(back).toEqual({ v: 1, game: 'portal', map: 'testchmb_a_01', transition, savedAt: 123, checkpoints: 2 });
  });

  it('rejects other games, unknown maps and malformed data; drops a transition for another map', () => {
    expect(parseSave({ v: 1, game: 'hl2', map: 'testchmb_a_00' }, 'portal', maps)).toBeNull();
    expect(parseSave({ v: 1, game: 'portal', map: 'd1_trainstation_01' }, 'portal', maps)).toBeNull();
    expect(parseSave({ v: 2, game: 'portal', map: 'testchmb_a_00' }, 'portal', maps)).toBeNull();
    expect(parseSave('nope', 'portal', maps)).toBeNull();
    const s = parseSave({ v: 1, game: 'portal', map: 'testchmb_a_00', transition }, 'portal', maps);
    expect(s?.transition).toBeNull();
    const st = new MemoryStorage();
    st.setItem(saveKey('portal'), '{broken');
    expect(loadSave('portal', maps, st)).toBeNull();
  });

  it('tolerates a storage that throws', () => {
    const bad: SaveStorage = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {},
    };
    expect(writeSave(makeSave('hl2', 'd1_trainstation_01', null), bad)).toBe(false);
    expect(loadSave('hl2', ['d1_trainstation_01'], bad)).toBeNull();
  });
});
