/**
 * Source-style pose blending over the model channel's clips (docs/tf2-game.md "Models"), the
 * renderer's stand-in for bone_setup.cpp. Everything here is plain arrays — no three scene
 * objects — so it runs in tests and could move to a worker.
 *
 *   - A sequence is 1 clip or a blend grid of clips (`blend`: bilinear over two pose
 *     parameters, SDK Studio_SeqAnims + Studio_LocalPoseParameter, pose keys included).
 *   - AccumulatePose (SDK CBoneSetup::AccumulatePose): the sequence's pose is blended into the
 *     running pose with SlerpBones — per-bone weight × the sequence's weightlist; absolute
 *     sequences slerp toward their pose, delta sequences add translation and compose rotation
 *     d^w · base, or base · d^w when `post` — then its autolayers are accumulated on top
 *     (AddSequenceLayers: cycle- or pose-driven start/peak/tail/end ramps, spline, xfade, noblend).
 *   - `Animator` holds what C_BaseAnimatingOverlay holds: the main sequence and its cycle, the
 *     sequences it is still blending out of (CSequenceTransitioner: a stack of outgoing
 *     sequences that keep playing and fade over MIN(fade-out, the new fade-in) along the SDK
 *     spline), gesture layers in slots (MP animstate GESTURE_SLOT_*) with blend-in/out ramps,
 *     pose parameters in their own units, autoplay sequences, and animation events (footsteps)
 *     fired as cycles pass them. Cycles advance per render frame; an authoritative cycle is
 *     bled in (`syncCycle`), not snapped to. `lod` trims the work for distant and off-screen
 *     models. Nothing allocates per frame.
 *
 * Bones with no track hold the bind pose (absolute) or the identity (delta).
 */

export interface PoseParamDesc {
  name: string;
  start: number;
  end: number;
  loop: number;
}

export interface SeqBlend {
  groupsize: number[];
  params: string[];
  start: number[];
  end: number[];
  poseKeys?: number[][];
}

export interface SeqLayer {
  seq: string;
  flags: number;
  pose?: string;
  start: number;
  peak: number;
  tail: number;
  end: number;
}

export interface SeqEvent {
  frame?: number;
  cycle: number;
  event: number;
  type?: number;
  name?: string;
  options?: string;
}

export interface SequenceDesc {
  name: string;
  flags?: number;
  looping: boolean;
  delta: boolean;
  post: boolean;
  autoplay?: boolean;
  fps: number;
  frames: number;
  fadeIn?: number;
  fadeOut?: number;
  clips: string[];
  activity?: string;
  actweight?: number;
  blend?: SeqBlend;
  layers?: SeqLayer[];
  events?: SeqEvent[];
  weightlist?: number;
  hidden?: boolean;
  snap?: boolean;
  realtime?: boolean;
  world?: boolean;
  cyclePose?: string;
}

/** One clip's tracks, bound to a skeleton's bone order (null: no track for that bone). */
export interface BoundClip {
  name: string;
  fps: number;
  frames: number;
  delta: boolean;
  /** Units/s of root motion the clip was authored with (clip extras `groundSpeed`). */
  groundSpeed: number;
  pos: Array<{ times: Float32Array; values: Float32Array } | null>;
  rot: Array<{ times: Float32Array; values: Float32Array } | null>;
}

/** A clip as three's GLTFLoader gives it (AnimationClip): tracks named `<bone>.<property>`. */
export interface RawClip {
  name: string;
  userData?: { fps?: number; frames?: number; delta?: boolean; groundSpeed?: number };
  tracks: ReadonlyArray<{ name: string; times: ArrayLike<number>; values: ArrayLike<number> }>;
}

// mstudioautolayer_t flags.
export const STUDIO_AL_POST = 0x10;
export const STUDIO_AL_SPLINE = 0x40;
export const STUDIO_AL_XFADE = 0x80;
export const STUDIO_AL_NOBLEND = 0x200;
export const STUDIO_AL_LOCAL = 0x1000;
export const STUDIO_AL_POSE = 0x4000;

/** Gesture slots (multiplayer_animstate.h GestureSlot_t). */
export const GESTURE_SLOT_ATTACK_AND_RELOAD = 0;
export const GESTURE_SLOT_GRENADE = 1;
export const GESTURE_SLOT_JUMP = 2;
export const GESTURE_SLOT_SWIM = 3;
export const GESTURE_SLOT_FLINCH = 4;
export const GESTURE_SLOT_VCD = 5;
export const GESTURE_SLOT_CUSTOM = 6;
export const GESTURE_SLOT_COUNT = 7;

const MAX_DEPTH = 6;

/**
 * Everything a skeleton can play: sequences, clips bound to its bones, activities, pose
 * parameters and weightlists. Built once per model.
 */
export class AnimSet {
  readonly boneCount: number;
  readonly boneIndex = new Map<string, number>();
  readonly sequences = new Map<string, SequenceDesc>();
  private readonly lowerSeq = new Map<string, SequenceDesc>();
  readonly clips = new Map<string, BoundClip>();
  readonly activities = new Map<string, Array<{ seq: string; weight: number }>>();
  readonly poseParams: PoseParamDesc[];
  readonly poseIndex = new Map<string, number>();
  /** Per weightlist: a weight per bone (1 where unlisted). */
  readonly weightlists: Float32Array[];
  readonly autoplay: SequenceDesc[] = [];

  constructor(
    readonly boneNames: readonly string[],
    /** Bind pose, local: xyz per bone. */
    readonly restPos: Float32Array,
    /** Bind pose, local: xyzw per bone. */
    readonly restQuat: Float32Array,
    data: {
      sequences?: SequenceDesc[];
      activities?: Record<string, Array<{ seq: string; weight: number }>>;
      poseParameters?: PoseParamDesc[];
      weightlists?: Array<Record<string, number>>;
      clips?: readonly RawClip[];
    },
  ) {
    this.boneCount = boneNames.length;
    boneNames.forEach((n, i) => this.boneIndex.set(sanitizeName(n), i));
    for (const s of data.sequences ?? []) {
      this.sequences.set(s.name, s);
      this.lowerSeq.set(s.name.toLowerCase(), s);
      if (s.autoplay) this.autoplay.push(s);
    }
    for (const [act, list] of Object.entries(data.activities ?? {})) this.activities.set(act, list);
    this.poseParams = data.poseParameters ?? [];
    this.poseParams.forEach((p, i) => this.poseIndex.set(p.name, i));
    this.weightlists = (data.weightlists ?? []).map((w) => {
      const out = new Float32Array(this.boneCount).fill(1);
      for (const [bone, v] of Object.entries(w)) {
        const i = this.boneIndex.get(sanitizeName(bone));
        if (i !== undefined) out[i] = v;
      }
      return out;
    });
    for (const c of data.clips ?? []) this.clips.set(c.name, this.bindClip(c));
  }

  private bindClip(c: RawClip): BoundClip {
    const pos: BoundClip['pos'] = new Array(this.boneCount).fill(null);
    const rot: BoundClip['rot'] = new Array(this.boneCount).fill(null);
    for (const t of c.tracks) {
      const dot = t.name.lastIndexOf('.');
      if (dot < 0) continue;
      const bone = this.boneIndex.get(t.name.slice(0, dot));
      if (bone === undefined) continue;
      const prop = t.name.slice(dot + 1);
      const track = { times: Float32Array.from(t.times), values: Float32Array.from(t.values) };
      if (prop === 'quaternion') rot[bone] = track;
      else if (prop === 'position') pos[bone] = track;
    }
    const ud = c.userData ?? {};
    return {
      name: c.name,
      fps: ud.fps ?? 30,
      frames: ud.frames ?? 1,
      delta: !!ud.delta,
      groundSpeed: ud.groundSpeed ?? 0,
      pos,
      rot,
    };
  }

  seq(name: string): SequenceDesc | undefined {
    return this.sequences.get(name) ?? this.lowerSeq.get(name.toLowerCase());
  }

  hasActivity(act: string): boolean {
    return (this.activities.get(act)?.length ?? 0) > 0;
  }

  /** SDK SelectWeightedSequence: a random entry of the activity, by weight. */
  selectWeightedSequence(act: string, random: () => number = Math.random): SequenceDesc | null {
    const list = this.activities.get(act);
    if (!list?.length) return null;
    let total = 0;
    for (const e of list) total += Math.max(0, e.weight);
    let pick = random() * total;
    for (const e of list) {
      pick -= Math.max(0, e.weight);
      if (pick <= 0) return this.seq(e.seq) ?? null;
    }
    return this.seq(list[list.length - 1].seq) ?? null;
  }
}

/** three's PropertyBinding.sanitizeNodeName (track names use it). */
export function sanitizeName(name: string): string {
  return name.replace(/\s/g, '_').replace(/[[\].:/]/g, '');
}

// --- quaternion helpers on flat arrays -------------------------------------------------

/** out = a · b (Hamilton product, xyzw). */
export function quatMul(
  a: ArrayLike<number>,
  ai: number,
  b: ArrayLike<number>,
  bi: number,
  out: Float32Array | number[],
  oi: number,
): void {
  const ax = a[ai];
  const ay = a[ai + 1];
  const az = a[ai + 2];
  const aw = a[ai + 3];
  const bx = b[bi];
  const by = b[bi + 1];
  const bz = b[bi + 2];
  const bw = b[bi + 3];
  out[oi] = ax * bw + aw * bx + ay * bz - az * by;
  out[oi + 1] = ay * bw + aw * by + az * bx - ax * bz;
  out[oi + 2] = az * bw + aw * bz + ax * by - ay * bx;
  out[oi + 3] = aw * bw - ax * bx - ay * by - az * bz;
}

/** Shortest-arc slerp of a[ai] toward b[bi] by t, written to out[oi] (SDK QuaternionSlerp). */
export function quatSlerp(
  a: ArrayLike<number>,
  ai: number,
  b: ArrayLike<number>,
  bi: number,
  t: number,
  out: Float32Array | number[],
  oi: number,
): void {
  const ax = a[ai];
  const ay = a[ai + 1];
  const az = a[ai + 2];
  const aw = a[ai + 3];
  let bx = b[bi];
  let by = b[bi + 1];
  let bz = b[bi + 2];
  let bw = b[bi + 3];
  let cos = ax * bx + ay * by + az * bz + aw * bw;
  if (cos < 0) {
    cos = -cos;
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }
  let s0: number;
  let s1: number;
  if (cos > 0.9999) {
    s0 = 1 - t;
    s1 = t;
  } else {
    const omega = Math.acos(Math.min(1, cos));
    const sin = Math.sin(omega);
    s0 = Math.sin((1 - t) * omega) / sin;
    s1 = Math.sin(t * omega) / sin;
  }
  let x = s0 * ax + s1 * bx;
  let y = s0 * ay + s1 * by;
  let z = s0 * az + s1 * bz;
  let w = s0 * aw + s1 * bw;
  const len = Math.hypot(x, y, z, w) || 1;
  x /= len;
  y /= len;
  z /= len;
  w /= len;
  out[oi] = x;
  out[oi + 1] = y;
  out[oi + 2] = z;
  out[oi + 3] = w;
}

const IDENTITY_Q = [0, 0, 0, 1];
const qs = [0, 0, 0, 1];

/** SDK QuaternionScale: the rotation q scaled by s (slerp from the identity). */
export function quatScale(
  q: ArrayLike<number>,
  qi: number,
  s: number,
  out: Float32Array | number[],
  oi: number,
): void {
  quatSlerp(IDENTITY_Q, 0, q, qi, s, out, oi);
}

/** SDK QuaternionMA: out = p · scale(q, s) — a `post` delta. */
export function quatMA(
  p: ArrayLike<number>,
  pi: number,
  s: number,
  q: ArrayLike<number>,
  qi: number,
  out: Float32Array | number[],
  oi: number,
): void {
  quatScale(q, qi, s, qs, 0);
  quatMul(p, pi, qs, 0, out, oi);
}

/** SDK QuaternionSM: out = scale(p, s) · q — a pre delta. */
export function quatSM(
  s: number,
  p: ArrayLike<number>,
  pi: number,
  q: ArrayLike<number>,
  qi: number,
  out: Float32Array | number[],
  oi: number,
): void {
  quatScale(p, pi, s, qs, 0);
  quatMul(qs, 0, q, qi, out, oi);
}

// --- sampling ---------------------------------------------------------------------------

function findKey(times: Float32Array, t: number): number {
  let lo = 0;
  let hi = times.length - 1;
  if (t <= times[0]) return 0;
  if (t >= times[hi]) return hi;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Samples one clip at time t into pos/quat (all bones). */
export function sampleClip(
  clip: BoundClip,
  t: number,
  restPos: Float32Array,
  restQuat: Float32Array,
  outPos: Float32Array,
  outQuat: Float32Array,
): void {
  const n = clip.rot.length;
  for (let b = 0; b < n; b++) {
    const pt = clip.pos[b];
    const p3 = b * 3;
    if (pt) {
      const k = findKey(pt.times, t);
      const k1 = Math.min(k + 1, pt.times.length - 1);
      const span = pt.times[k1] - pt.times[k];
      const f = span > 0 ? Math.min(1, Math.max(0, (t - pt.times[k]) / span)) : 0;
      const v = pt.values;
      outPos[p3] = v[k * 3] + (v[k1 * 3] - v[k * 3]) * f;
      outPos[p3 + 1] = v[k * 3 + 1] + (v[k1 * 3 + 1] - v[k * 3 + 1]) * f;
      outPos[p3 + 2] = v[k * 3 + 2] + (v[k1 * 3 + 2] - v[k * 3 + 2]) * f;
    } else if (clip.delta) {
      outPos[p3] = 0;
      outPos[p3 + 1] = 0;
      outPos[p3 + 2] = 0;
    } else {
      outPos[p3] = restPos[p3];
      outPos[p3 + 1] = restPos[p3 + 1];
      outPos[p3 + 2] = restPos[p3 + 2];
    }
    const rt = clip.rot[b];
    const q4 = b * 4;
    if (rt) {
      const k = findKey(rt.times, t);
      const k1 = Math.min(k + 1, rt.times.length - 1);
      const span = rt.times[k1] - rt.times[k];
      const f = span > 0 ? Math.min(1, Math.max(0, (t - rt.times[k]) / span)) : 0;
      if (f <= 0 || k1 === k) {
        outQuat[q4] = rt.values[k * 4];
        outQuat[q4 + 1] = rt.values[k * 4 + 1];
        outQuat[q4 + 2] = rt.values[k * 4 + 2];
        outQuat[q4 + 3] = rt.values[k * 4 + 3];
      } else quatSlerp(rt.values, k * 4, rt.values, k1 * 4, f, outQuat, q4);
    } else if (clip.delta) {
      outQuat[q4] = 0;
      outQuat[q4 + 1] = 0;
      outQuat[q4 + 2] = 0;
      outQuat[q4 + 3] = 1;
    } else {
      outQuat[q4] = restQuat[q4];
      outQuat[q4 + 1] = restQuat[q4 + 1];
      outQuat[q4 + 2] = restQuat[q4 + 2];
      outQuat[q4 + 3] = restQuat[q4 + 3];
    }
  }
}

/** SDK Studio_SetPoseParameter's wrap + clamp, in the parameter's own units. */
export function clampPoseValue(p: PoseParamDesc, v: number): number {
  if (p.loop) {
    const wrap = (p.start + p.end) / 2 + p.loop / 2;
    const shift = p.loop - wrap;
    v = v - p.loop * Math.floor((v + shift) / p.loop);
  }
  const lo = Math.min(p.start, p.end);
  const hi = Math.max(p.start, p.end);
  return Math.min(hi, Math.max(lo, v));
}

/** SDK Studio_LocalPoseParameter: the grid cell index and fraction along one blend axis. */
export function localPoseParameter(
  pose: PoseParamDesc | undefined,
  value: number,
  blend: SeqBlend,
  axis: number,
): { index: number; setting: number } {
  if (!pose) return { index: 0, setting: 0 };
  const size = blend.groupsize[axis] ?? 1;
  if (size <= 1) return { index: 0, setting: 0 };
  const keys = blend.poseKeys?.[axis];
  let setting: number;
  let index = 0;
  if (!keys || keys.length < 2) {
    const range = pose.end - pose.start || 1;
    const norm = (value - pose.start) / range;
    const ls = ((blend.start[axis] ?? pose.start) - pose.start) / range;
    const le = ((blend.end[axis] ?? pose.end) - pose.start) / range;
    setting = le !== ls ? (norm - ls) / (le - ls) : 0;
    setting = Math.min(1, Math.max(0, setting));
    if (size > 2) {
      index = Math.floor(setting * (size - 1));
      if (index >= size - 1) index = size - 2;
      setting = setting * (size - 1) - index;
    }
  } else {
    for (;;) {
      const a = keys[index];
      const b = keys[index + 1];
      setting = b !== a ? (value - a) / (b - a) : 0;
      if (index < size - 2 && setting > 1) {
        index++;
        continue;
      }
      break;
    }
    setting = Math.min(1, Math.max(0, setting));
  }
  return { index, setting };
}

/** Clip names and weights of a sequence at the current pose (≤ 4, SDK Studio_SeqAnims). */
export function seqCells(
  set: AnimSet,
  seq: SequenceDesc,
  poseValues: ArrayLike<number>,
  outNames: string[],
  outWeights: number[],
): number {
  const b = seq.blend;
  if (!b || seq.clips.length <= 1) {
    outNames[0] = seq.clips[0];
    outWeights[0] = 1;
    return seq.clips.length ? 1 : 0;
  }
  const p0i = set.poseIndex.get(b.params[0]);
  const p1i = b.params[1] !== undefined ? set.poseIndex.get(b.params[1]) : undefined;
  const p0 = p0i !== undefined ? set.poseParams[p0i] : undefined;
  const p1 = p1i !== undefined ? set.poseParams[p1i] : undefined;
  const a0 = localPoseParameter(p0, p0i !== undefined ? poseValues[p0i] : 0, b, 0);
  const a1 = localPoseParameter(p1, p1i !== undefined ? poseValues[p1i] : 0, b, 1);
  const gx = b.groupsize[0] ?? 1;
  const gy = b.groupsize[1] ?? 1;
  const cell = (x: number, y: number) =>
    seq.clips[Math.min(seq.clips.length - 1, Math.min(gy - 1, y) * gx + Math.min(gx - 1, x))];
  const s0 = a0.setting;
  const s1 = a1.setting;
  outNames[0] = cell(a0.index, a1.index);
  outWeights[0] = (1 - s0) * (1 - s1);
  outNames[1] = cell(a0.index + 1, a1.index);
  outWeights[1] = s0 * (1 - s1);
  outNames[2] = cell(a0.index, a1.index + 1);
  outWeights[2] = (1 - s0) * s1;
  outNames[3] = cell(a0.index + 1, a1.index + 1);
  outWeights[3] = s0 * s1;
  return 4;
}

/** Seconds of clip time at a cycle (frames run 0 … frames−1). */
export function clipTime(clip: BoundClip, cycle: number, looping: boolean): number {
  const span = Math.max(0, clip.frames - 1) / (clip.fps || 30);
  let c = cycle;
  if (looping) c -= Math.floor(c);
  else c = Math.min(1, Math.max(0, c));
  return c * span;
}

/** Cycles per second of a sequence (SDK Studio_CPS). */
export function cycleRate(seq: SequenceDesc): number {
  const frames = Math.max(1, (seq.frames || 1) - 1);
  return (seq.fps || 30) / frames;
}

const simpleSpline = (s: number) => 3 * s * s - 2 * s * s * s;

/** Reusable buffers for one AccumulatePose depth. */
interface Scratch {
  pos: Float32Array;
  quat: Float32Array;
  cellPos: Float32Array;
  cellQuat: Float32Array;
  names: string[];
  weights: number[];
}

export class PoseBlender {
  private readonly scratch: Scratch[] = [];
  /** autolayerWeight's result, reused (no per-frame allocation). */
  private readonly layerOut = { cycle: 0, weight: 0 };

  constructor(readonly set: AnimSet) {
    const n = set.boneCount;
    for (let d = 0; d < MAX_DEPTH; d++) {
      this.scratch.push({
        pos: new Float32Array(n * 3),
        quat: new Float32Array(n * 4),
        cellPos: new Float32Array(n * 3),
        cellQuat: new Float32Array(n * 4),
        names: ['', '', '', ''],
        weights: [0, 0, 0, 0],
      });
    }
  }

  /** The bind pose. */
  initPose(pos: Float32Array, quat: Float32Array): void {
    pos.set(this.set.restPos);
    quat.set(this.set.restQuat);
  }

  /** A sequence's own pose (its blend cells mixed), into s.pos / s.quat. */
  private seqPose(seq: SequenceDesc, cycle: number, pose: ArrayLike<number>, s: Scratch): boolean {
    const set = this.set;
    const count = seqCells(set, seq, pose, s.names, s.weights);
    let acc = 0;
    for (let i = 0; i < count; i++) {
      const w = s.weights[i];
      if (w <= 1e-4) continue;
      const clip = set.clips.get(s.names[i]);
      if (!clip) continue;
      const t = clipTime(clip, cycle, seq.looping);
      if (acc === 0) {
        sampleClip(clip, t, set.restPos, set.restQuat, s.pos, s.quat);
        acc = w;
        continue;
      }
      sampleClip(clip, t, set.restPos, set.restQuat, s.cellPos, s.cellQuat);
      const f = w / (acc + w);
      const n = set.boneCount;
      for (let b = 0; b < n; b++) {
        const p = b * 3;
        s.pos[p] += (s.cellPos[p] - s.pos[p]) * f;
        s.pos[p + 1] += (s.cellPos[p + 1] - s.pos[p + 1]) * f;
        s.pos[p + 2] += (s.cellPos[p + 2] - s.pos[p + 2]) * f;
        quatSlerp(s.quat, b * 4, s.cellQuat, b * 4, f, s.quat, b * 4);
      }
      acc += w;
    }
    return acc > 0;
  }

  /** SDK SlerpBones: blends a sequence pose into the running pose. */
  slerpBones(
    pos: Float32Array,
    quat: Float32Array,
    seq: SequenceDesc,
    seqPos: Float32Array,
    seqQuat: Float32Array,
    weight: number,
  ): void {
    if (weight <= 0) return;
    const s = Math.min(1, weight);
    const wl = seq.weightlist !== undefined ? this.set.weightlists[seq.weightlist] : undefined;
    const n = this.set.boneCount;
    for (let b = 0; b < n; b++) {
      const s2 = wl ? s * wl[b] : s;
      if (s2 <= 0) continue;
      const p = b * 3;
      const q = b * 4;
      if (seq.delta) {
        if (seq.post) quatMA(quat, q, s2, seqQuat, q, quat, q);
        else quatSM(s2, seqQuat, q, quat, q, quat, q);
        pos[p] += seqPos[p] * s2;
        pos[p + 1] += seqPos[p + 1] * s2;
        pos[p + 2] += seqPos[p + 2] * s2;
      } else {
        quatSlerp(quat, q, seqQuat, q, s2, quat, q);
        pos[p] += (seqPos[p] - pos[p]) * s2;
        pos[p + 1] += (seqPos[p + 1] - pos[p + 1]) * s2;
        pos[p + 2] += (seqPos[p + 2] - pos[p + 2]) * s2;
      }
    }
  }

  /** SDK CBoneSetup::AccumulatePose (+ AddSequenceLayers). */
  accumulatePose(
    pos: Float32Array,
    quat: Float32Array,
    seq: SequenceDesc,
    cycle: number,
    weight: number,
    pose: ArrayLike<number>,
    depth = 0,
  ): void {
    if (weight <= 0 || depth >= MAX_DEPTH || seq.world) return;
    const s = this.scratch[depth];
    if (this.seqPose(seq, cycle, pose, s)) this.slerpBones(pos, quat, seq, s.pos, s.quat, weight);
    this.addSequenceLayers(pos, quat, seq, cycle, weight, pose, depth);
  }

  private addSequenceLayers(
    pos: Float32Array,
    quat: Float32Array,
    seq: SequenceDesc,
    cycle: number,
    weight: number,
    pose: ArrayLike<number>,
    depth: number,
  ): void {
    const layers = seq.layers;
    if (!layers) return;
    const r = this.layerOut;
    for (const l of layers) {
      const lseq = this.set.seq(l.seq);
      if (!lseq || lseq === seq) continue;
      if (!autolayerWeight(l, cycle, weight, this.set, pose, r)) continue;
      // Read before recursing: the nested call reuses the same scratch.
      const lc = r.cycle;
      const lw = r.weight;
      this.accumulatePose(pos, quat, lseq, lc, lw, pose, depth + 1);
    }
  }
}

/** SDK AddSequenceLayers: an autolayer's cycle and weight (null: not active). */
export function autolayerWeight(
  l: SeqLayer,
  cycle: number,
  weight: number,
  set: Pick<AnimSet, 'poseIndex'>,
  pose: ArrayLike<number>,
  out: { cycle: number; weight: number } = { cycle: 0, weight: 0 },
): { cycle: number; weight: number } | null {
  let layerCycle = cycle;
  let layerWeight = weight;
  if (l.start !== l.end) {
    let s = 1;
    let index: number;
    if (!(l.flags & STUDIO_AL_POSE)) index = cycle;
    else {
      const pi = l.pose !== undefined ? set.poseIndex.get(l.pose) : undefined;
      index = pi !== undefined ? pose[pi] : 0;
    }
    if (index < l.start || index >= l.end) return null;
    if (index < l.peak && l.start !== l.peak) s = (index - l.start) / (l.peak - l.start);
    else if (index > l.tail && l.end !== l.tail) s = (l.end - index) / (l.end - l.tail);
    if (l.flags & STUDIO_AL_SPLINE) s = simpleSpline(s);
    if (l.flags & STUDIO_AL_XFADE && index > l.tail)
      layerWeight = (s * weight) / (1 - weight + s * weight);
    else if (l.flags & STUDIO_AL_NOBLEND) layerWeight = s;
    else layerWeight = weight * s;
    layerCycle = (cycle - l.start) / (l.end - l.start);
  }
  if (!(layerWeight > 0)) return null;
  out.cycle = layerCycle;
  out.weight = layerWeight;
  return out;
}

// --- layered playback ----------------------------------------------------------------------

/** A sequence's fade when the studio data gives none (mstudioseqdesc_t fadein/fadeout default). */
export const DEFAULT_FADE_TIME = 0.2;
/** Outgoing sequences one layer keeps blending out at once (CSequenceTransitioner's queue, capped). */
export const MAX_OUTGOING = 3;
/** A drift from the authority's cycle (syncCycle) is bled off over this long, seconds. */
export const CYCLE_CORRECT_TIME = 0.1;
/** A drift larger than this (cycles) is not bled off: the authority's cycle cross-fades in. */
export const CYCLE_SNAP_ERROR = 0.25;
/** A gesture's blend-in plus blend-out never take more than this share of its length. */
export const GESTURE_RAMP_SHARE = 0.5;

/** Level of detail (`Animator.lod`): everything. */
export const ANIM_LOD_FULL = 0;
/** Distant: one outgoing transition per layer, gestures under 5 % weight skipped. */
export const ANIM_LOD_REDUCED = 1;
/** Far: sequence changes cut instead of cross-fading, no autoplay sequences. */
export const ANIM_LOD_MINIMAL = 2;
/** Off screen: cycles, transitions and events keep running; the pose is not evaluated. */
export const ANIM_LOD_HIDDEN = 3;
/** Source units from the camera where ANIM_LOD_REDUCED / ANIM_LOD_MINIMAL start. */
export const ANIM_LOD_REDUCED_DISTANCE = 1200;
export const ANIM_LOD_MINIMAL_DISTANCE = 3000;
const LOD_MIN_GESTURE_WEIGHT = 0.05;

/** The level of detail for a model `distance` units from the camera. */
export function animLod(distance: number, onScreen: boolean): number {
  if (!onScreen) return ANIM_LOD_HIDDEN;
  if (distance >= ANIM_LOD_MINIMAL_DISTANCE) return ANIM_LOD_MINIMAL;
  if (distance >= ANIM_LOD_REDUCED_DISTANCE) return ANIM_LOD_REDUCED;
  return ANIM_LOD_FULL;
}

/**
 * An outgoing layer's weight `age` seconds into a `fadeTime` fade (C_AnimationLayer::GetFadeout):
 * 1 → 0 along the SDK's spline, 3s² − 2s³.
 */
export function fadeWeight(age: number, fadeTime: number): number {
  if (fadeTime <= 0) return 0;
  const s = 1 - age / fadeTime;
  if (s <= 0) return 0;
  if (s >= 1) return 1;
  return simpleSpline(s);
}

/**
 * How long `prev` blends out under `next` (CSequenceTransitioner::CheckForSequenceChange):
 * MIN(prev fadeout, next fadein); a STUDIO_SNAP sequence cuts (`snapBlend`, normally 0).
 */
export function transitionTime(prev: SequenceDesc, next: SequenceDesc, snapBlend = 0): number {
  if (next.snap) return snapBlend;
  return Math.min(prev.fadeOut ?? DEFAULT_FADE_TIME, next.fadeIn ?? DEFAULT_FADE_TIME);
}

export interface LayerState {
  seq: SequenceDesc;
  cycle: number;
  rate: number;
  weight: number;
}

/** A sequence blending out (a CSequenceTransitioner queue entry). */
export interface TransitionLayer extends LayerState {
  /** Seconds the fade lasts, and how far into it the layer is. */
  fadeTime: number;
  age: number;
  /** Weight when the fade began (a gesture may have been mid-ramp). */
  startWeight: number;
}

export interface GestureState extends LayerState {
  slot: number;
  autoKill: boolean;
  /** Activity it was started for (IsGestureSlotPlaying). */
  activity: string;
  age: number;
  /** Blend-in / blend-out ramps, seconds (CAnimationLayer m_flBlendIn / m_flBlendOut). */
  fadeIn: number;
  fadeOut: number;
}

/**
 * A gesture's weight (CAnimationLayer::BlendWeight, in seconds): a linear ramp up over `fadeIn`
 * from its start, and for a one-shot autokill gesture down over its last `fadeOut` seconds.
 */
export function gestureWeight(g: GestureState): number {
  let w = 1;
  if (g.fadeIn > 0) w = Math.min(w, g.age / g.fadeIn);
  if (g.fadeOut > 0) {
    const cps = cycleRate(g.seq) * g.rate;
    const left = cps > 0 ? (1 - g.cycle) / cps : Infinity;
    w = Math.min(w, left / g.fadeOut);
  }
  return Math.min(1, Math.max(0, w));
}

export type AnimEventHandler = (ev: SeqEvent, seq: SequenceDesc) => void;

const newTransition = (seq: SequenceDesc): TransitionLayer => ({
  seq,
  cycle: 0,
  rate: 1,
  weight: 0,
  fadeTime: 0,
  age: 0,
  startWeight: 1,
});

const wrapCycle = (c: number, looping: boolean): number =>
  looping ? c - Math.floor(c) : Math.min(1, Math.max(0, c));

/**
 * The per-model playback state (C_BaseAnimatingOverlay): the main sequence and the ones it is
 * still fading from, gestures, pose parameters. `advance()` then `evaluate()` each frame.
 *
 *   - Sequence transitions (CSequenceTransitioner): a new main sequence starts at weight 1 while
 *     the outgoing one keeps advancing and blends out over MIN(its fade-out, the new fade-in)
 *     along the SDK's spline; up to MAX_OUTGOING outgoing sequences stack, accumulated newest
 *     first on top of the current one, so a change during a change stays continuous. Asking for
 *     the sequence already playing does nothing (a looping activity re-requested keeps its
 *     cycle); `restart` is the new-sequence parity — the same sequence from the start,
 *     cross-faded from where it was.
 *   - Cycles advance per render frame at fps × playback rate. An authoritative cycle
 *     (`syncCycle`) is not snapped to: the drift is bled off over CYCLE_CORRECT_TIME, or, past
 *     CYCLE_SNAP_ERROR, cross-faded in like a restart.
 *   - Gestures (MP animstate slots) ramp in and out (`gestureWeight`); one restarted while
 *     playing keeps fading out under the new one.
 */
export class Animator {
  readonly blender: PoseBlender;
  readonly poseValues: Float32Array;
  main: LayerState | null = null;
  /** Outgoing main sequences, oldest first; `outCount` of the pool are live. */
  private readonly outgoing: TransitionLayer[] = [];
  private outCount = 0;
  readonly gestures: Array<GestureState | null> = new Array(GESTURE_SLOT_COUNT).fill(null);
  /** Per slot: the gesture a restart replaced, fading out under the new one. */
  private readonly gestureOut: Array<TransitionLayer | null> = new Array(GESTURE_SLOT_COUNT).fill(
    null,
  );
  private readonly gesturePool: Array<GestureState | null> = new Array(GESTURE_SLOT_COUNT).fill(
    null,
  );
  private readonly gestureOutPool: Array<TransitionLayer | null> = new Array(
    GESTURE_SLOT_COUNT,
  ).fill(null);
  /** Global time (seconds) for realtime/autoplay sequences. */
  time = 0;
  /** Main cycle playback multiplier (CBaseAnimating m_flPlaybackRate). */
  playbackRate = 1;
  /** Blend time for a STUDIO_SNAP sequence change (Source cuts: 0). */
  snapBlend = 0;
  /** Level of detail (ANIM_LOD_*). */
  lod = ANIM_LOD_FULL;
  private cycleTarget = 0;
  private hasCycleTarget = false;
  private targetFresh = false;
  private readonly gsNames = ['', '', '', ''];
  private readonly gsWeights = [0, 0, 0, 0];
  private readonly clipGroundSpeed = (c: string): number => this.set.clips.get(c)?.groundSpeed ?? 0;
  onEvent: AnimEventHandler | null = null;

  constructor(readonly set: AnimSet) {
    this.blender = new PoseBlender(set);
    this.poseValues = new Float32Array(set.poseParams.length);
    set.poseParams.forEach((p, i) => {
      this.poseValues[i] = clampPoseValue(p, 0);
    });
  }

  setPoseParam(name: string, value: number): void {
    const i = this.set.poseIndex.get(name);
    if (i === undefined) return;
    this.poseValues[i] = clampPoseValue(this.set.poseParams[i], value);
  }

  getPoseParam(name: string): number {
    const i = this.set.poseIndex.get(name);
    return i === undefined ? 0 : this.poseValues[i];
  }

  /**
   * Sets the main sequence. A different one transitions in (the current one blends out over
   * `transitionTime`); the same one is left alone unless `restart` (the new-sequence parity),
   * which plays it again from `cycle`, cross-faded from where it was. `fade: false` cuts.
   */
  setSequence(
    seq: SequenceDesc | null,
    opts: { restart?: boolean; cycle?: number; fade?: boolean; rate?: number } = {},
  ): void {
    if (!seq) return;
    const m = this.main;
    const cycle = opts.cycle ?? 0;
    if (!m) {
      this.main = { seq, cycle, rate: opts.rate ?? 1, weight: 1 };
      return;
    }
    if (m.seq === seq && (!opts.restart || m.cycle === cycle)) return;
    const t =
      opts.fade === false || this.lod >= ANIM_LOD_MINIMAL
        ? 0
        : transitionTime(m.seq, seq, this.snapBlend);
    if (t > 0) this.pushOutgoing(m, t);
    else this.outCount = 0; // a cut drops every queued transition (SDK: RemoveAll on snap)
    m.seq = seq;
    m.cycle = cycle;
    m.rate = opts.rate ?? 1;
    m.weight = 1;
    this.hasCycleTarget = false;
  }

  private pushOutgoing(m: LayerState, fadeTime: number): void {
    const cap = this.lod >= ANIM_LOD_REDUCED ? 1 : MAX_OUTGOING;
    while (this.outCount >= cap) this.removeOutgoing(0);
    let o = this.outgoing[this.outCount];
    if (!o) {
      o = newTransition(m.seq);
      this.outgoing[this.outCount] = o;
    }
    this.outCount++;
    o.seq = m.seq;
    o.cycle = m.cycle;
    o.rate = m.rate * this.playbackRate;
    o.weight = 1;
    o.startWeight = 1;
    o.fadeTime = fadeTime;
    o.age = 0;
  }

  private removeOutgoing(i: number): void {
    const o = this.outgoing[i];
    for (let j = i; j < this.outCount - 1; j++) this.outgoing[j] = this.outgoing[j + 1];
    this.outgoing[this.outCount - 1] = o;
    this.outCount--;
  }

  /** Live outgoing transitions of the main layer, oldest first. */
  get transitionCount(): number {
    return this.outCount;
  }

  transition(i: number): Readonly<TransitionLayer> | undefined {
    return i >= 0 && i < this.outCount ? this.outgoing[i] : undefined;
  }

  /** Plays the weighted sequence for an activity unless one of its sequences already plays. */
  setActivity(act: string, opts: { restart?: boolean } = {}): boolean {
    const list = this.set.activities.get(act);
    if (!list?.length) return false;
    if (this.main && !opts.restart) {
      const name = this.main.seq.name;
      for (const e of list) if (e.seq === name) return true;
    }
    this.setSequence(this.set.selectWeightedSequence(act), opts);
    return true;
  }

  /** The main sequence again from the start, cross-faded (RestartMainSequence + new parity). */
  restartMain(): void {
    const m = this.main;
    if (m) this.setSequence(m.seq, { restart: true, rate: m.rate });
  }

  /**
   * The authority's cycle for the main sequence now (a server cycle, or one derived from a
   * networked start time). Cycles keep advancing per frame; the difference is bled off, not
   * snapped (see CYCLE_CORRECT_TIME / CYCLE_SNAP_ERROR).
   */
  syncCycle(target: number): void {
    this.cycleTarget = target;
    this.hasCycleTarget = true;
    this.targetFresh = true;
  }

  /** SDK RestartGesture: (re)starts a gesture sequence in a slot. */
  restartGesture(
    slot: number,
    seq: SequenceDesc | null,
    activity = '',
    autoKill = true,
    rate = 1,
  ): void {
    if (!seq) {
      this.gestures[slot] = null;
      this.gestureOut[slot] = null;
      return;
    }
    const cur = this.gestures[slot];
    this.gestureOut[slot] = null;
    if (cur && cur.weight > 0 && this.lod < ANIM_LOD_MINIMAL) {
      const t = transitionTime(cur.seq, seq);
      if (t > 0) {
        let o = this.gestureOutPool[slot];
        if (!o) o = this.gestureOutPool[slot] = newTransition(cur.seq);
        o.seq = cur.seq;
        o.cycle = cur.cycle;
        o.rate = cur.rate;
        o.startWeight = cur.weight;
        o.weight = cur.weight;
        o.fadeTime = t;
        o.age = 0;
        this.gestureOut[slot] = o;
      }
    }
    let g = this.gesturePool[slot];
    if (!g) {
      g = this.gesturePool[slot] = {
        slot,
        seq,
        cycle: 0,
        rate,
        weight: 0,
        autoKill,
        activity,
        age: 0,
        fadeIn: 0,
        fadeOut: 0,
      };
    }
    g.seq = seq;
    g.cycle = 0;
    g.rate = rate;
    g.autoKill = autoKill;
    g.activity = activity;
    g.age = 0;
    // Ramps from the studio fades, never more than GESTURE_RAMP_SHARE of the gesture.
    let fi = seq.snap ? 0 : (seq.fadeIn ?? DEFAULT_FADE_TIME);
    let fo = seq.looping || !autoKill ? 0 : (seq.fadeOut ?? DEFAULT_FADE_TIME);
    const cps = cycleRate(seq) * rate;
    const cap = cps > 0 ? GESTURE_RAMP_SHARE / cps : Infinity;
    if (fi + fo > cap) {
      const k = cap / (fi + fo);
      fi *= k;
      fo *= k;
    }
    g.fadeIn = fi;
    g.fadeOut = fo;
    g.weight = gestureWeight(g);
    this.gestures[slot] = g;
  }

  isGesturePlaying(slot: number, activity: string): boolean {
    const g = this.gestures[slot];
    return !!g && g.activity === activity && g.cycle < 1;
  }

  /** Clears every gesture slot; `fade` lets the playing ones blend out first (death). */
  clearGestures(fade = false): void {
    for (let i = 0; i < this.gestures.length; i++) {
      const g = this.gestures[i];
      this.gestureOut[i] = null;
      this.gestures[i] = null;
      if (!g || !fade || g.weight <= 0) continue;
      let o = this.gestureOutPool[i];
      if (!o) o = this.gestureOutPool[i] = newTransition(g.seq);
      o.seq = g.seq;
      o.cycle = g.cycle;
      o.rate = g.rate;
      o.startWeight = g.weight;
      o.weight = g.weight;
      o.fadeTime = g.seq.fadeOut ?? DEFAULT_FADE_TIME;
      o.age = 0;
      if (o.fadeTime > 0) this.gestureOut[i] = o;
    }
  }

  /** Advances cycles and fades, fires events, retires finished gestures and transitions. */
  advance(dt: number): void {
    this.time += dt;
    const m = this.main;
    if (m) {
      this.step(m, dt * this.playbackRate);
      if (this.hasCycleTarget) this.correctCycle(m, dt);
    }
    for (let i = 0; i < this.outCount;) {
      const o = this.outgoing[i];
      o.age += dt;
      if (o.age >= o.fadeTime) {
        this.removeOutgoing(i);
        continue;
      }
      this.step(o, dt, false);
      o.weight = fadeWeight(o.age, o.fadeTime);
      i++;
    }
    for (let i = 0; i < this.gestures.length; i++) {
      const o = this.gestureOut[i];
      if (o) {
        o.age += dt;
        if (o.age >= o.fadeTime) this.gestureOut[i] = null;
        else {
          this.step(o, dt, false);
          o.weight = o.startWeight * fadeWeight(o.age, o.fadeTime);
        }
      }
      const g = this.gestures[i];
      if (!g) continue;
      g.age += dt;
      this.step(g, dt);
      if (!g.seq.looping && g.cycle >= 1 && g.autoKill) this.gestures[i] = null;
      else g.weight = gestureWeight(g);
    }
  }

  /** Bleeds the main cycle toward the authority's (syncCycle), which advances at the same rate. */
  private correctCycle(m: LayerState, dt: number): void {
    const looping = m.seq.looping;
    if (!this.targetFresh)
      this.cycleTarget = wrapCycle(
        this.cycleTarget + dt * this.playbackRate * m.rate * cycleRate(m.seq),
        looping,
      );
    this.targetFresh = false;
    let e = this.cycleTarget - m.cycle;
    if (looping) e -= Math.round(e);
    if (Math.abs(e) > CYCLE_SNAP_ERROR) {
      this.setSequence(m.seq, { restart: true, cycle: this.cycleTarget, rate: m.rate });
      return;
    }
    const k = dt > 0 ? Math.min(1, dt / CYCLE_CORRECT_TIME) : 0;
    m.cycle = wrapCycle(m.cycle + e * k, looping);
    if (Math.abs(e * (1 - k)) < 1e-5) this.hasCycleTarget = false;
  }

  private step(l: LayerState, dt: number, events = true): void {
    const before = l.cycle;
    const seq = l.seq;
    const rate = cycleRate(seq) * l.rate;
    let after = before + dt * rate;
    if (seq.looping) {
      if (events && this.onEvent && seq.events) this.fireEvents(seq, before, after);
      after -= Math.floor(after);
    } else {
      after = Math.min(1, after);
      if (events && this.onEvent && seq.events && after > before)
        this.fireEvents(seq, before, after);
    }
    l.cycle = after;
  }

  private fireEvents(seq: SequenceDesc, from: number, to: number): void {
    for (const ev of seq.events ?? []) {
      // Events within (from, to], including after a wrap.
      for (let k = Math.floor(from); k <= Math.floor(to); k++) {
        const c = ev.cycle + k;
        if (c > from && c <= to) this.onEvent?.(ev, seq);
      }
    }
  }

  /** The current pose, local per bone (left as it was at ANIM_LOD_HIDDEN). */
  evaluate(pos: Float32Array, quat: Float32Array): void {
    if (this.lod >= ANIM_LOD_HIDDEN) return;
    const b = this.blender;
    b.initPose(pos, quat);
    const pose = this.poseValues;
    const m = this.main;
    if (m) b.accumulatePose(pos, quat, m.seq, this.cycleOf(m), 1, pose);
    // C_BaseAnimating::MaintainSequenceTransitions: the outgoing sequences, newest first, each
    // slerped in by its fade weight on top of the current one.
    const oldest = this.lod >= ANIM_LOD_REDUCED ? Math.max(0, this.outCount - 1) : 0;
    for (let i = this.outCount - 1; i >= oldest; i--) {
      const o = this.outgoing[i];
      if (o.weight > 0) b.accumulatePose(pos, quat, o.seq, this.cycleOf(o), o.weight, pose);
    }
    const minW = this.lod >= ANIM_LOD_REDUCED ? LOD_MIN_GESTURE_WEIGHT : 0;
    for (let i = 0; i < this.gestures.length; i++) {
      const o = this.gestureOut[i];
      if (o && o.weight > minW) b.accumulatePose(pos, quat, o.seq, this.cycleOf(o), o.weight, pose);
      const g = this.gestures[i];
      if (g && g.weight > minW) b.accumulatePose(pos, quat, g.seq, this.cycleOf(g), g.weight, pose);
    }
    if (this.lod >= ANIM_LOD_MINIMAL) return;
    for (const a of this.set.autoplay) {
      const c = (this.time * cycleRate(a)) % 1;
      b.accumulatePose(pos, quat, a, c, 1, pose);
    }
  }

  private cycleOf(l: LayerState): number {
    const seq = l.seq;
    if (seq.cyclePose) {
      const i = this.set.poseIndex.get(seq.cyclePose);
      if (i !== undefined) {
        const p = this.set.poseParams[i];
        return (this.poseValues[i] - p.start) / (p.end - p.start || 1);
      }
    }
    if (seq.realtime) return (this.time * cycleRate(seq)) % 1;
    return l.cycle;
  }

  /** Ground speed (units/s) of a sequence at the current pose: its cells' clip speeds, blended. */
  groundSpeed(
    seq: SequenceDesc,
    clipSpeed: (clip: string) => number = this.clipGroundSpeed,
  ): number {
    const names = this.gsNames;
    const weights = this.gsWeights;
    const n = seqCells(this.set, seq, this.poseValues, names, weights);
    let v = 0;
    for (let i = 0; i < n; i++) if (weights[i] > 0) v += clipSpeed(names[i]) * weights[i];
    return v;
  }
}
