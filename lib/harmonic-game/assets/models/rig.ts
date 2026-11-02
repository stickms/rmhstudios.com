/**
 * The humanoid rig (plan H2.4): a named bone hierarchy, a forward-kinematics helper, the stances
 * (how each character holds itself) and the eight clips every character plays — idle, walk, run,
 * aim, fire, reload, die, hurt — built in code as `AnimationClip`s. Deterministic: every sample is
 * a closed-form function of time.
 *
 * Axes (three, as the renderer's model frame): +X the character's left, +Y up, +Z forward; units
 * are Source units until `parts.ts` scales them to metres. Every bone's bind rotation is the
 * identity and limbs hang along -Y, so a clip's quaternion is the pose rotation itself. Euler
 * angles below are degrees about the bone's X (pitch: negative swings a hanging limb forward),
 * Y (twist) and Z (roll: positive swings a hanging limb toward +X).
 */
import {
  AnimationClip,
  Euler,
  Matrix4,
  Quaternion,
  QuaternionKeyframeTrack,
  Vector3,
  VectorKeyframeTrack,
} from 'three';
import { CHARACTER_CLIPS, MODEL_FPS, type ClipSpec } from './info';
import { U, type BoneDef, type Part } from './parts';

export const BONES: readonly BoneDef[] = [
  { name: 'pelvis', parent: null, pos: [0, 36, 0] },
  { name: 'spine', parent: 'pelvis', pos: [0, 4, 0] },
  { name: 'chest', parent: 'spine', pos: [0, 8, 0] },
  { name: 'neck', parent: 'chest', pos: [0, 9, 0] },
  { name: 'head', parent: 'neck', pos: [0, 3, 0] },
  { name: 'upperarm_l', parent: 'chest', pos: [9, 8, 0] },
  { name: 'lowerarm_l', parent: 'upperarm_l', pos: [0, -11, 0] },
  { name: 'hand_l', parent: 'lowerarm_l', pos: [0, -10, 0] },
  { name: 'upperarm_r', parent: 'chest', pos: [-9, 8, 0] },
  { name: 'lowerarm_r', parent: 'upperarm_r', pos: [0, -11, 0] },
  { name: 'hand_r', parent: 'lowerarm_r', pos: [0, -10, 0] },
  { name: 'upperleg_l', parent: 'pelvis', pos: [4.5, -1, 0] },
  { name: 'lowerleg_l', parent: 'upperleg_l', pos: [0, -16.5, 0] },
  { name: 'foot_l', parent: 'lowerleg_l', pos: [0, -16.5, 0] },
  { name: 'upperleg_r', parent: 'pelvis', pos: [-4.5, -1, 0] },
  { name: 'lowerleg_r', parent: 'upperleg_r', pos: [0, -16.5, 0] },
  { name: 'foot_r', parent: 'lowerleg_r', pos: [0, -16.5, 0] },
];

export const BONE_NAMES: readonly string[] = BONES.map((b) => b.name);

export type Rot = readonly [number, number, number];
/** Euler degrees per bone; unlisted bones are at rest. */
export type Pose = Readonly<Record<string, Rot>>;
export interface Frame {
  rot: Pose;
  /** Offset added to the pelvis position, units. */
  pelvis: readonly [number, number, number];
}

const rad = Math.PI / 180;
const ZERO: Rot = [0, 0, 0];
const eulerQuat = (r: Rot, out = new Quaternion()): Quaternion =>
  out.setFromEuler(new Euler(r[0] * rad, r[1] * rad, r[2] * rad, 'XYZ'));

/** World matrices (units) of every bone in a pose. */
export function fk(
  pose: Pose,
  pelvis: readonly [number, number, number] = [0, 0, 0],
): Map<string, Matrix4> {
  const out = new Map<string, Matrix4>();
  for (const b of BONES) {
    const local = new Matrix4().compose(
      new Vector3(
        b.pos[0] + (b.parent ? 0 : pelvis[0]),
        b.pos[1] + (b.parent ? 0 : pelvis[1]),
        b.pos[2] + (b.parent ? 0 : pelvis[2]),
      ),
      eulerQuat(pose[b.name] ?? ZERO),
      new Vector3(1, 1, 1),
    );
    const parent = b.parent ? out.get(b.parent)! : null;
    out.set(b.name, parent ? parent.clone().multiply(local) : local);
  }
  return out;
}

export const BIND: ReadonlyMap<string, Matrix4> = fk({});

/**
 * Parts authored where `pose` puts `bone` (so a rifle is simply drawn level, at the hand), moved
 * into the bind pose so the skeleton carries them back to that spot when the pose is played.
 */
export function carry(
  parts: readonly Part[],
  bone: string,
  pose: Pose,
  placement = new Matrix4(),
): Part[] {
  const a = fk(pose).get(bone)!;
  const b = BIND.get(bone)!;
  const m = b.clone().multiply(a.clone().invert()).multiply(placement);
  return parts.map((p) => ({ ...p, bone, xf: p.xf ? m.clone().multiply(p.xf) : m }));
}

/** The world position of a bone in a pose. */
export const bonePosition = (pose: Pose, bone: string): Vector3 =>
  new Vector3().setFromMatrixPosition(fk(pose).get(bone)!);

// ─── stances ────────────────────────────────────────────────────────────────

export interface Stance {
  /** Held at rest (idle, locomotion). */
  low: Pose;
  /** Weapon up (aim, fire). */
  aim: Pose;
  /** Mid-reload: the support hand at the magazine / the chest. */
  work: Pose;
  /** Arm swing while walking, degrees. */
  armSwing: number;
  /** Extra forward lean while moving, degrees. */
  lean: number;
}

/** Both hands on a rifle; low-ready when not aiming. */
export const RIFLE_STANCE: Stance = {
  low: {
    upperarm_r: [-12, 12, 10],
    lowerarm_r: [-86, 0, 0],
    upperarm_l: [-52, -4, -18],
    lowerarm_l: [-30, 0, 0],
    chest: [0, 6, 0],
    head: [0, -4, 0],
  },
  aim: {
    // Solved (forward kinematics) so the right hand sits at the shoulder and the left on the fore-end.
    upperarm_r: [-17, 23, 13],
    lowerarm_r: [-123, 0, 0],
    upperarm_l: [-71, -8, -25],
    lowerarm_l: [-19, 0, 0],
    chest: [0, -6, 0],
    head: [0, 4, 0],
  },
  work: {
    upperarm_r: [-30, 0, 16],
    lowerarm_r: [-72, 0, 0],
    upperarm_l: [-30, 0, -28],
    lowerarm_l: [-98, 0, 0],
    chest: [0, 4, 0],
    head: [18, 0, 0],
  },
  armSwing: 5,
  lean: 3,
};

/** One-handed sidearm forward, the other arm braced out front (shield). */
export const SHIELD_STANCE: Stance = {
  low: {
    upperarm_r: [-30, 0, 10],
    lowerarm_r: [-50, 0, 0],
    upperarm_l: [-6, 8, 3],
    lowerarm_l: [-76, 0, 0],
    chest: [0, 4, 0],
  },
  aim: {
    upperarm_r: [-82, 0, 7],
    lowerarm_r: [-11, 0, 0],
    upperarm_l: [-8, 13, 3],
    lowerarm_l: [-83, 0, 0],
    chest: [0, -4, 0],
  },
  work: {
    upperarm_r: [-40, 0, 12],
    lowerarm_r: [-80, 0, 0],
    upperarm_l: [-52, 0, -16],
    lowerarm_l: [-66, 0, 0],
    head: [14, 0, 0],
  },
  armSwing: 3,
  lean: 3,
};

/** Hands free, arms easy. The aim is a reach (or a levelled hand) forward. */
export const EASY_STANCE: Stance = {
  low: {
    upperarm_r: [-3, 0, 5],
    lowerarm_r: [-14, 0, 0],
    upperarm_l: [-3, 0, -5],
    lowerarm_l: [-14, 0, 0],
  },
  aim: {
    upperarm_r: [-70, 0, 12],
    lowerarm_r: [-24, 0, 0],
    upperarm_l: [-66, 0, -12],
    lowerarm_l: [-24, 0, 0],
  },
  work: {
    upperarm_r: [-34, 0, 14],
    lowerarm_r: [-70, 0, 0],
    upperarm_l: [-34, 0, -14],
    lowerarm_l: [-70, 0, 0],
    head: [12, 0, 0],
  },
  armSwing: 22,
  lean: 0,
};

export type StanceName = 'rifle' | 'shield' | 'easy';
export const STANCES: Record<StanceName, Stance> = {
  rifle: RIFLE_STANCE,
  shield: SHIELD_STANCE,
  easy: EASY_STANCE,
};

// ─── pose arithmetic ────────────────────────────────────────────────────────

const smooth = (x: number): number => {
  const k = Math.min(1, Math.max(0, x));
  return k * k * (3 - 2 * k);
};

function lerpPose(a: Pose, b: Pose, k: number): Pose {
  const out: Record<string, Rot> = {};
  for (const n of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[n] ?? ZERO;
    const y = b[n] ?? ZERO;
    out[n] = [x[0] + (y[0] - x[0]) * k, x[1] + (y[1] - x[1]) * k, x[2] + (y[2] - x[2]) * k];
  }
  return out;
}

/** a + b·k, per bone. */
function addPose(a: Pose, b: Pose, k = 1): Pose {
  const out: Record<string, Rot> = { ...a };
  for (const n of Object.keys(b)) {
    const x = a[n] ?? ZERO;
    const y = b[n];
    out[n] = [x[0] + y[0] * k, x[1] + y[1] * k, x[2] + y[2] * k];
  }
  return out;
}

const still = (rot: Pose, pelvis: Frame['pelvis'] = [0, 0, 0]): Frame => ({ rot, pelvis });

function lerpFrame(a: Frame, b: Frame, k: number): Frame {
  return {
    rot: lerpPose(a.rot, b.rot, k),
    pelvis: [
      a.pelvis[0] + (b.pelvis[0] - a.pelvis[0]) * k,
      a.pelvis[1] + (b.pelvis[1] - a.pelvis[1]) * k,
      a.pelvis[2] + (b.pelvis[2] - a.pelvis[2]) * k,
    ],
  };
}

/** Piecewise smooth interpolation through keyed frames (times ascending, in seconds). */
function keyed(keys: readonly { t: number; f: Frame }[], t: number): Frame {
  if (t <= keys[0].t) return keys[0].f;
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i].t) {
      const span = keys[i].t - keys[i - 1].t;
      return lerpFrame(keys[i - 1].f, keys[i].f, smooth((t - keys[i - 1].t) / span));
    }
  }
  return keys[keys.length - 1].f;
}

// ─── the clips ──────────────────────────────────────────────────────────────

export interface Gait {
  /** Overall movement amplitude: 1 for a trooper, less for the old and hurt. */
  amp: number;
  /** Forward stoop (degrees at the spine), always on. */
  stoop: number;
}

interface LocoParams {
  leg: number;
  knee: number;
  arm: number;
  bob: number;
  lean: number;
}
const WALK: LocoParams = { leg: 26, knee: 46, arm: 1, bob: 0.9, lean: 0 };
const RUN: LocoParams = { leg: 52, knee: 92, arm: 2.4, bob: 1.8, lean: 11 };

function locomotion(phase: number, p: LocoParams, s: Stance, g: Gait): Frame {
  const f = phase * Math.PI * 2;
  const sin = Math.sin(f);
  const cos = Math.cos(f);
  const leg = p.leg * g.amp;
  const knee = p.knee * g.amp;
  const ulL = -leg * sin;
  const ulR = leg * sin;
  const llL = knee * Math.max(0, cos);
  const llR = knee * Math.max(0, -cos);
  const swing = s.armSwing * p.arm * g.amp;
  const swingPose: Pose = {
    upperleg_l: [ulL, 0, 0],
    upperleg_r: [ulR, 0, 0],
    lowerleg_l: [llL, 0, 0],
    lowerleg_r: [llR, 0, 0],
    foot_l: [-(ulL + llL) * 0.8, 0, 0],
    foot_r: [-(ulR + llR) * 0.8, 0, 0],
    upperarm_l: [swing * sin, 0, 0],
    upperarm_r: [-swing * sin, 0, 0],
    spine: [p.lean * g.amp + s.lean * (p.lean > 0 ? 1 : 0), 3 * sin * g.amp, 0],
    pelvis: [0, -4 * sin * g.amp, 1.2 * cos * g.amp],
  };
  return {
    rot: addPose(addPose(s.low, swingPose), { spine: [g.stoop, 0, 0] }),
    pelvis: [1.1 * sin * g.amp, p.bob * g.amp * Math.cos(2 * f), 0],
  };
}

const bump = (t01: number, peak = 0.2): number =>
  t01 <= 0 || t01 >= 1 ? 0 : t01 < peak ? smooth(t01 / peak) : smooth((1 - t01) / (1 - peak));

/** One sample of a character clip. `t` seconds into a clip of `spec.duration`. */
export function sampleCharacterClip(
  name: string,
  t: number,
  spec: ClipSpec,
  s: Stance,
  g: Gait,
): Frame {
  const u = t / spec.duration;
  const stoop: Pose = { spine: [g.stoop, 0, 0] };
  const low = addPose(s.low, stoop);
  const aim = addPose(s.aim, stoop);
  switch (name) {
    case 'idle': {
      const b = Math.sin(u * Math.PI * 2);
      return still(
        addPose(low, {
          chest: [1.1 * b, 0, 0],
          head: [-0.8 * b, 0.9 * Math.sin(u * Math.PI * 4), 0],
          upperarm_l: [0.6 * b, 0, 0],
          upperarm_r: [0.5 * b, 0, 0],
        }),
        [0, 0.12 * b, 0],
      );
    }
    case 'walk':
      return locomotion(u, WALK, s, g);
    case 'run':
      return locomotion(u, RUN, s, g);
    case 'aim': {
      const b = Math.sin(u * Math.PI * 2);
      return still(addPose(aim, { chest: [0.7 * b, 0, 0], head: [0.4 * b, 0, 0] }), [
        0,
        0.05 * b,
        0,
      ]);
    }
    case 'fire': {
      // A sharp kick through the arms and shoulders, settling back onto the aim.
      const k = Math.exp(-t * 16);
      return still(
        addPose(
          aim,
          {
            chest: [-3.4, 0.6, 0],
            head: [-2.4, 0, 0],
            upperarm_r: [7, 0, 0],
            upperarm_l: [5, 0, 0],
            lowerarm_r: [3, 0, 0],
          },
          k,
        ),
        [0, 0, -0.7 * k],
      );
    }
    case 'reload': {
      const wig = Math.sin(t * 18) * 3;
      const keys = [
        { t: 0, f: still(aim) },
        { t: 0.25, f: still(low) },
        { t: 0.6, f: still(addPose(addPose(s.work, stoop), { lowerarm_l: [0, 0, 0] })) },
        {
          t: 0.95,
          f: still(
            addPose(addPose(s.work, stoop), {
              lowerarm_l: [-8 + wig, 0, 0],
              upperarm_l: [0, 0, 4],
            }),
          ),
        },
        { t: 1.25, f: still(low) },
        { t: 1.8, f: still(aim) },
      ];
      return keyed(keys, t);
    }
    case 'die': {
      const stagger = still(
        addPose(low, {
          chest: [-9, 0, 0],
          head: [-16, 0, 0],
          upperarm_l: [12, 0, -26],
          upperarm_r: [12, 0, 26],
          lowerarm_l: [10, 0, 0],
          lowerarm_r: [10, 0, 0],
        }),
        [0, -1, -3],
      );
      const kneel = still(
        addPose(low, {
          chest: [-14, 0, 0],
          head: [-12, 0, 0],
          upperleg_l: [-48, 0, 6],
          upperleg_r: [-36, 0, -6],
          lowerleg_l: [88, 0, 0],
          lowerleg_r: [70, 0, 0],
          foot_l: [-30, 0, 0],
          upperarm_l: [8, 0, -40],
          upperarm_r: [8, 0, 40],
        }),
        [0, -14, -3],
      );
      const down = still(
        addPose(low, {
          pelvis: [-90, 0, 0],
          spine: [-4, 0, 0],
          chest: [-3, 0, 0],
          head: [-8, 0, 12],
          upperleg_l: [-8, 0, 8],
          upperleg_r: [-3, 0, -12],
          lowerleg_l: [10, 0, 0],
          lowerleg_r: [22, 0, 0],
          foot_l: [10, 0, 6],
          foot_r: [14, 0, -6],
          upperarm_l: [-6, 0, -34],
          upperarm_r: [4, 0, 42],
          lowerarm_l: [-8, 0, 0],
          lowerarm_r: [-16, 0, 0],
        }),
        [0, -31, 2],
      );
      return keyed(
        [
          { t: 0, f: still(low) },
          { t: 0.14, f: stagger },
          { t: 0.62, f: kneel },
          { t: 1.2, f: down },
        ],
        t,
      );
    }
    case 'hurt': {
      const k = bump(u, 0.22);
      return still(
        addPose(
          low,
          {
            chest: [-8, 4, 0],
            head: [-13, -6, 0],
            spine: [-4, 0, 0],
            upperarm_l: [10, 0, -6],
            upperarm_r: [10, 0, 6],
          },
          k,
        ),
        [0, -0.8 * k, -1.2 * k],
      );
    }
    default:
      throw new Error(`no character clip "${name}"`);
  }
}

/** The character `AnimationClip`s, sampled at the model frame rate, bone-named tracks. */
export function buildCharacterClips(s: Stance, g: Gait): AnimationClip[] {
  return CHARACTER_CLIPS.map((spec) => {
    const frames = Math.round(spec.duration * MODEL_FPS) + 1;
    const times = new Float32Array(frames);
    const quats = new Map<string, Float32Array>(
      BONE_NAMES.map((n) => [n, new Float32Array(frames * 4)]),
    );
    const pelvisPos = new Float32Array(frames * 3);
    const prev = new Map<string, Quaternion>();
    const q = new Quaternion();
    const pelvisBind = BONES[0].pos;
    for (let i = 0; i < frames; i++) {
      const t = i / MODEL_FPS;
      times[i] = t;
      // A looping clip ends on its first frame.
      const frame = sampleCharacterClip(
        spec.name,
        spec.looping && i === frames - 1 ? 0 : t,
        spec,
        s,
        g,
      );
      for (const n of BONE_NAMES) {
        eulerQuat(frame.rot[n] ?? ZERO, q);
        const last = prev.get(n);
        if (last && last.dot(q) < 0) q.set(-q.x, -q.y, -q.z, -q.w);
        (prev.get(n) ?? prev.set(n, new Quaternion()).get(n)!).copy(q);
        q.toArray(quats.get(n)!, i * 4);
      }
      pelvisPos[i * 3] = (pelvisBind[0] + frame.pelvis[0]) * U;
      pelvisPos[i * 3 + 1] = (pelvisBind[1] + frame.pelvis[1]) * U;
      pelvisPos[i * 3 + 2] = (pelvisBind[2] + frame.pelvis[2]) * U;
    }
    const tracks = [
      ...BONE_NAMES.map(
        (n) => new QuaternionKeyframeTrack(`${n}.quaternion`, times, quats.get(n)!),
      ),
      new VectorKeyframeTrack('pelvis.position', times, pelvisPos),
    ];
    const clip = new AnimationClip(spec.name, spec.duration, tracks);
    clip.userData = { fps: MODEL_FPS, frames };
    return clip;
  });
}
