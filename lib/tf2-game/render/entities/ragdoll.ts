/**
 * Client ragdolls (SDK C_ClientRagdoll / C_TFRagdoll / C_CSRagdoll): a body handed to physics when it
 * dies, from the pose it is in, with the killing blow's push on the part that was hit, then left to
 * settle against the world.
 *
 * The bodies come from the model's .phy (scripts/tf2-game/ragdoll.py → the GLB's `ragdoll` extras):
 * which bones are solids, their masses, and each joint's limits (degrees of the child's rotation about
 * its own axes, from its bind-pose orientation to its parent — vphysics' ragdoll constraint). A model
 * published before that data falls back to its hitbox bones with loose joints.
 *
 * The solver is position-based (Verlet particles kept rigid by shape matching):
 *   - every solid has particles at its bone origin (shared with its parent: the joint), at the far end
 *     and the side of its hitbox (a tip and a twist marker); the best rigid fit of its particles to
 *     their starting layout gives the solid's rotation (polar decomposition, warm started);
 *   - joint limits clamp the child's rotation relative to its parent about each axis;
 *   - particles at joints and tips collide with the world through a box trace their radius wide,
 *     losing their normal speed and some of their sliding speed on contact;
 *   - fixed 1/60 s steps; a ragdoll that stops moving sleeps (no traces, no pose writes), and at most
 *     MAX_AWAKE simulate at once (the oldest sleeps where it lies).
 * Bones that are not solids keep their pose relative to their parent (fingers, cloth, jiggle).
 */
import { type Bone, Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { SOURCE_UNIT, threeToSrc } from '../coords';
import type { ModelInstance } from './model-instance';

/** The model's `ragdoll` extras (scripts/tf2-game/ragdoll.py). */
export interface RagdollDesc {
  solids: Array<{ bone: string; mass: number }>;
  constraints: Array<{
    parent: number;
    child: number;
    x: [number, number];
    y: [number, number];
    z: [number, number];
  }>;
}

interface V3 {
  x: number;
  y: number;
  z: number;
}

/** A box trace of half-width `radius` (Source units and space) against the world. */
export type RagdollTrace = (
  from: V3,
  to: V3,
  radius: number,
) => { fraction: number; endPos: V3; normal: V3; startSolid: boolean } | null;

export interface RagdollOptions {
  trace: RagdollTrace | null;
  /** sv_gravity (Source units/s²). */
  gravity: number;
  /** Every part's starting velocity (Source units/s): the body's own. */
  velocity?: V3;
  /** Per-solid starting velocity from the animation (Source units/s), by bone name; added. */
  boneVelocity?: (bone: string) => V3 | null;
}

/** Seconds per step. */
export const RAGDOLL_STEP = 1 / 60;
/** Steps at most per frame (a slow frame drops the rest). */
const MAX_STEPS = 2;
/** Constraint passes per step. */
const ITERATIONS = 6;
/** Fraction of a joint-limit violation corrected per pass. */
const LIMIT_STIFFNESS = 0.4;
/** Velocity kept per step (air drag). */
const DAMPING = 0.996;
/** Sliding speed kept by a part touching the world, per contact. */
const CONTACT_KEEP = 0.55;
/** Part radius bounds (Source units) and the box trace's share of it. */
const MIN_RADIUS = 1.5;
const MAX_RADIUS = 7;
const TRACE_SHARE = 0.8;
/** Asleep after moving less than this (Source units per step) for SLEEP_TIME seconds, or after MAX_SIM. */
const SLEEP_SPEED = 0.03;
const SLEEP_TIME = 0.6;
const MAX_SIM = 8;
/** Ragdolls simulating at once (SDK g_ragdoll_maxcount keeps fewer around; this caps the cost). */
export const MAX_AWAKE = 6;
/** Loose limits (degrees) for a model published without its .phy data. */
const FALLBACK_LIMITS = { x: [-25, 25], y: [-50, 50], z: [-50, 50] } as const;
/** A death blow's push (the sim's force: whole-body Source units/s): on everything, and extra on the part hit. */
const PUSH_ALL = 0.6;
const PUSH_HIT = 1.6;
const MAX_PUSH = 1500;

interface Body {
  bone: Bone;
  boneIndex: number;
  name: string;
  parent: number;
  /** Particle indices: [0] is the bone origin. */
  parts: number[];
  /** Each part's starting offset from the starting centroid (three world), xyz per part. */
  rest: Float32Array;
  c0: Vector3;
  /** World rotation since the start (the shape-matching fit). */
  q: Quaternion;
  /** The bone's starting world matrix and rotation. */
  b0: Matrix4;
  o0: Quaternion;
  /** The child's bind-pose rotation relative to its parent body (joint frame). */
  bindRel: Quaternion;
  /** Radians: xmin, xmax, ymin, ymax, zmin, zmax. */
  limits: Float32Array;
}

const awake: Ragdoll[] = [];

const tv = new Vector3();
const tv2 = new Vector3();
const tq = new Quaternion();
const tq2 = new Quaternion();
const tq3 = new Quaternion();
const tq4 = new Quaternion();
const tm = new Matrix4();
const tm2 = new Matrix4();
const te = new Euler();
const src = { x: 0, y: 0, z: 0 };
const src2 = { x: 0, y: 0, z: 0 };
const IDENTITY = new Quaternion();
const em = new Matrix4();
const eq = new Quaternion();
const ev = new Vector3();

/** The ragdoll a model has: its .phy's, else its hitbox bones joined loosely; null when neither. */
export function ragdollDescFor(inst: ModelInstance): RagdollDesc | null {
  const ex = inst.asset.extras as {
    ragdoll?: RagdollDesc;
    hitboxSets?: Array<{ hitboxes: Array<{ bone: string; min: number[]; max: number[] }> }>;
  };
  if (ex.ragdoll?.solids?.length && ex.ragdoll.constraints?.length) return ex.ragdoll;
  const boxes = ex.hitboxSets?.[0]?.hitboxes ?? [];
  const seen = new Map<string, number>();
  for (const h of boxes) {
    const name = h.bone.toLowerCase();
    if (seen.has(name) || !inst.bone(name)) continue;
    const vol = Math.abs((h.max[0] - h.min[0]) * (h.max[1] - h.min[1]) * (h.max[2] - h.min[2]));
    seen.set(name, vol);
  }
  if (seen.size < 2) return null;
  const names = [...seen.keys()];
  // Parents first: order by depth in the skeleton.
  const depth = (n: string) => {
    let d = 0;
    for (let b = inst.bone(n)?.parent; b; b = b.parent) d++;
    return d;
  };
  names.sort((a, b) => depth(a) - depth(b));
  const total = [...seen.values()].reduce((a, b) => a + b, 0) || 1;
  const solids = names.map((bone) => ({
    bone,
    mass: Math.max(1, (70 * (seen.get(bone) ?? 0)) / total),
  }));
  const constraints: RagdollDesc['constraints'] = [];
  names.forEach((name, i) => {
    for (let b = inst.bone(name)?.parent; b; b = b.parent) {
      const p = names.indexOf(b.name.toLowerCase());
      if (p >= 0 && p !== i) {
        constraints.push({
          parent: p,
          child: i,
          x: [...FALLBACK_LIMITS.x],
          y: [...FALLBACK_LIMITS.y],
          z: [...FALLBACK_LIMITS.z],
        });
        break;
      }
    }
  });
  return { solids, constraints };
}

/** The asset's bind-pose rotation of every bone in model space (rest quaternions down the hierarchy). */
function bindRotations(inst: ModelInstance): Quaternion[] {
  const bones = inst.bones;
  const index = new Map<Bone, number>();
  bones.forEach((b, i) => index.set(b, i));
  const out: Quaternion[] = new Array(bones.length);
  const rq = inst.asset.restQuat;
  const get = (i: number): Quaternion => {
    if (out[i]) return out[i];
    const own = new Quaternion(rq[i * 4], rq[i * 4 + 1], rq[i * 4 + 2], rq[i * 4 + 3]);
    const p = bones[i].parent ? index.get(bones[i].parent as Bone) : undefined;
    out[i] = p !== undefined ? get(p).clone().multiply(own) : own;
    return out[i];
  };
  for (let i = 0; i < bones.length; i++) get(i);
  return out;
}

export class Ragdoll {
  private readonly bodies: Body[] = [];
  private readonly px: Float32Array;
  private readonly py: Float32Array;
  private readonly pz: Float32Array;
  private readonly ox: Float32Array;
  private readonly oy: Float32Array;
  private readonly oz: Float32Array;
  private readonly w: Float32Array;
  /** Collision radius (Source units), 0 for none. */
  private readonly rad: Float32Array;
  private readonly boneIndex = new Map<Bone, number>();
  private readonly worldNew: Matrix4[];
  private readonly isSolidBone: Int16Array;
  private readonly gravity: number;
  private acc = 0;
  private still = 0;
  private simTime = 0;
  asleep = false;

  private constructor(
    readonly inst: ModelInstance,
    count: number,
    private readonly trace: RagdollTrace | null,
    gravity: number,
  ) {
    this.px = new Float32Array(count);
    this.py = new Float32Array(count);
    this.pz = new Float32Array(count);
    this.ox = new Float32Array(count);
    this.oy = new Float32Array(count);
    this.oz = new Float32Array(count);
    this.w = new Float32Array(count);
    this.rad = new Float32Array(count);
    inst.bones.forEach((b, i) => this.boneIndex.set(b, i));
    this.worldNew = inst.bones.map(() => new Matrix4());
    this.isSolidBone = new Int16Array(inst.bones.length).fill(-1);
    this.gravity = gravity * SOURCE_UNIT;
  }

  /**
   * A ragdoll of the instance in its current pose (its matrices up to date), or null when the model
   * has no bodies to simulate. It wakes in the awake list, putting the oldest to sleep beyond MAX_AWAKE.
   */
  static create(inst: ModelInstance, opts: RagdollOptions): Ragdoll | null {
    const desc = ragdollDescFor(inst);
    if (!desc) return null;
    inst.updateMatrices();
    const solidBones = desc.solids.map((s) =>
      inst.bones.findIndex((b) => b.name.toLowerCase() === s.bone.toLowerCase()),
    );
    if (solidBones.some((i) => i < 0)) return null;
    const parentOf = new Int32Array(desc.solids.length).fill(-1);
    const limits = desc.solids.map(
      () => new Float32Array([-Math.PI, Math.PI, -Math.PI, Math.PI, -Math.PI, Math.PI]),
    );
    for (const c of desc.constraints) {
      if (parentOf[c.child] >= 0) continue;
      parentOf[c.child] = c.parent;
      const r = Math.PI / 180;
      limits[c.child].set([c.x[0] * r, c.x[1] * r, c.y[0] * r, c.y[1] * r, c.z[0] * r, c.z[1] * r]);
    }
    const boxes = new Map<string, { min: number[]; max: number[] }>();
    for (const h of inst.asset.extras.hitboxSets?.[0]?.hitboxes ?? []) {
      const k = h.bone.toLowerCase();
      if (!boxes.has(k)) boxes.set(k, h);
    }
    // Particles: an origin per solid, then a tip and a side per solid.
    const n = desc.solids.length;
    const r = new Ragdoll(inst, n * 3, opts.trace, opts.gravity);
    const binds = bindRotations(inst);
    const pos: Vector3[] = [];
    const radius: number[] = [];
    const owner: number[] = [];
    const bodyRadius: number[] = [];
    const tips: Array<[Vector3, Vector3]> = [];
    for (let i = 0; i < n; i++) {
      const bone = inst.bones[solidBones[i]];
      const m = bone.matrixWorld;
      const box = boxes.get(bone.name.toLowerCase());
      const scale = tv.setFromMatrixColumn(m, 0).length() || 1;
      let tip: Vector3;
      let side: Vector3;
      let rad: number;
      if (box) {
        const c = [0, 1, 2].map((k) => (box.min[k] + box.max[k]) / 2);
        const h = [0, 1, 2].map((k) => Math.abs(box.max[k] - box.min[k]) / 2);
        const order = [0, 1, 2].sort((a, b) => h[b] - h[a]);
        const [a1, a2, a3] = order;
        const plus = [...c];
        const minus = [...c];
        plus[a1] += h[a1];
        minus[a1] -= h[a1];
        const far = Math.hypot(...plus) >= Math.hypot(...minus) ? plus : minus;
        const s = [...c];
        s[a2] += h[a2];
        tip = new Vector3(far[0], far[1], far[2]).applyMatrix4(m);
        side = new Vector3(s[0], s[1], s[2]).applyMatrix4(m);
        rad = (Math.min(h[a2], h[a3] * 1.5) * scale) / SOURCE_UNIT;
      } else {
        const d = (4 * SOURCE_UNIT) / scale;
        tip = new Vector3(d, 0, 0).applyMatrix4(m);
        side = new Vector3(0, d, 0).applyMatrix4(m);
        rad = 3;
      }
      rad = Math.max(MIN_RADIUS, Math.min(MAX_RADIUS, rad));
      pos[i] = new Vector3().setFromMatrixPosition(m);
      radius[i] = rad;
      owner[i] = i;
      bodyRadius[i] = rad;
      tips[i] = [tip, side];
    }
    for (let i = 0; i < n; i++) {
      pos[n + i] = tips[i][0];
      radius[n + i] = bodyRadius[i];
      owner[n + i] = i;
      pos[2 * n + i] = tips[i][1];
      radius[2 * n + i] = 0;
      owner[2 * n + i] = i;
    }
    // A joint is as wide as the narrower of its two parts.
    for (let i = 0; i < n; i++)
      if (parentOf[i] >= 0) radius[i] = Math.min(radius[i], bodyRadius[parentOf[i]]);
    const mass = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const m = Math.max(0.5, desc.solids[i].mass) / 3;
      mass[i] += m;
      mass[n + i] += m;
      mass[2 * n + i] += m;
    }
    const v0 = opts.velocity ?? { x: 0, y: 0, z: 0 };
    for (let j = 0; j < n * 3; j++) {
      r.px[j] = r.ox[j] = pos[j].x;
      r.py[j] = r.oy[j] = pos[j].y;
      r.pz[j] = r.oz[j] = pos[j].z;
      r.w[j] = 1 / mass[j];
      r.rad[j] = radius[j];
      const bv = opts.boneVelocity?.(desc.solids[owner[j]].bone);
      r.setVelocity(j, v0.x + (bv?.x ?? 0), v0.y + (bv?.y ?? 0), v0.z + (bv?.z ?? 0));
    }
    for (let i = 0; i < n; i++) {
      const bone = inst.bones[solidBones[i]];
      const parts = [i, n + i, 2 * n + i];
      for (let c = 0; c < n; c++) if (parentOf[c] === i) parts.push(c);
      const b0 = bone.matrixWorld.clone();
      const o0 = new Quaternion();
      b0.decompose(tv, o0, tv2);
      const p = parentOf[i];
      const bindRel =
        p >= 0
          ? binds[solidBones[p]].clone().invert().multiply(binds[solidBones[i]])
          : new Quaternion();
      r.bodies.push({
        bone,
        boneIndex: solidBones[i],
        name: desc.solids[i].bone,
        parent: p,
        parts,
        rest: new Float32Array(parts.length * 3),
        c0: new Vector3(),
        q: new Quaternion(),
        b0,
        o0,
        bindRel,
        limits: limits[i],
      });
      r.isSolidBone[solidBones[i]] = i;
    }
    for (const b of r.bodies) {
      r.centroid(b, b.c0);
      b.parts.forEach((j, k) => {
        b.rest[k * 3] = r.px[j] - b.c0.x;
        b.rest[k * 3 + 1] = r.py[j] - b.c0.y;
        b.rest[k * 3 + 2] = r.pz[j] - b.c0.z;
      });
    }
    // Joints the pose starts beyond its limits ease into them; the rest is the pose.
    awake.push(r);
    while (awake.filter((a) => !a.asleep).length > MAX_AWAKE) awake.find((a) => !a.asleep)?.sleep();
    return r;
  }

  /** Sets a particle's velocity (Source units/s) for the next step. */
  private setVelocity(j: number, vx: number, vy: number, vz: number): void {
    // Source (x, y, z) → three (y, z, x), metres per step.
    const k = SOURCE_UNIT * RAGDOLL_STEP;
    this.ox[j] = this.px[j] - vy * k;
    this.oy[j] = this.py[j] - vz * k;
    this.oz[j] = this.pz[j] - vx * k;
  }

  private addVelocity(j: number, vx: number, vy: number, vz: number): void {
    const k = SOURCE_UNIT * RAGDOLL_STEP;
    this.ox[j] -= vy * k;
    this.oy[j] -= vz * k;
    this.oz[j] -= vx * k;
  }

  /**
   * The killing blow: `force` (the sim's push, whole-body Source units/s) on everything, and harder on
   * the part nearest `at` (a Source point: the hit or the blast) or on `bone` when named.
   */
  push(force: V3, at: V3 | null, bone?: string): void {
    let fx = force.x;
    let fy = force.y;
    let fz = force.z;
    const len = Math.hypot(fx, fy, fz);
    if (len > MAX_PUSH) {
      fx *= MAX_PUSH / len;
      fy *= MAX_PUSH / len;
      fz *= MAX_PUSH / len;
    }
    let hit = bone ? this.bodies.findIndex((b) => b.name === bone.toLowerCase()) : -1;
    if (hit < 0 && at) {
      let best = Infinity;
      this.bodies.forEach((b, i) => {
        const j = b.parts[0];
        tv.set(this.px[j], this.py[j], this.pz[j]);
        threeToSrc(tv, src);
        const d = (src.x - at.x) ** 2 + (src.y - at.y) ** 2 + (src.z - at.z) ** 2;
        if (d < best) {
          best = d;
          hit = i;
        }
      });
    }
    for (let j = 0; j < this.px.length; j++)
      this.addVelocity(j, fx * PUSH_ALL, fy * PUSH_ALL, fz * PUSH_ALL);
    if (hit >= 0)
      for (const j of this.bodies[hit].parts.slice(0, 3))
        this.addVelocity(j, fx * PUSH_HIT, fy * PUSH_HIT, fz * PUSH_HIT);
    this.wake();
  }

  wake(): void {
    if (!this.asleep) return;
    this.asleep = false;
    this.still = 0;
    if (!awake.includes(this)) awake.push(this);
  }

  sleep(): void {
    this.asleep = true;
  }

  /** Advances the physics and poses the bones (nothing while asleep). */
  update(dt: number): void {
    if (this.asleep) return;
    this.acc = Math.min(this.acc + dt, RAGDOLL_STEP * MAX_STEPS);
    let steps = 0;
    while (this.acc >= RAGDOLL_STEP && steps < MAX_STEPS) {
      this.acc -= RAGDOLL_STEP;
      steps++;
      this.step(RAGDOLL_STEP);
    }
    if (steps) this.writePose();
    this.simTime += dt;
    if (this.simTime > MAX_SIM) this.sleep();
  }

  dispose(): void {
    const i = awake.indexOf(this);
    if (i >= 0) awake.splice(i, 1);
    this.asleep = true;
  }

  // ─── simulation ─────────────────────────────────────────────────────────

  private step(h: number): void {
    const n = this.px.length;
    const g = this.gravity * h * h;
    for (let j = 0; j < n; j++) {
      const vx = (this.px[j] - this.ox[j]) * DAMPING;
      const vy = (this.py[j] - this.oy[j]) * DAMPING;
      const vz = (this.pz[j] - this.oz[j]) * DAMPING;
      this.ox[j] = this.px[j];
      this.oy[j] = this.py[j];
      this.oz[j] = this.pz[j];
      this.px[j] += vx;
      this.py[j] += vy - g;
      this.pz[j] += vz;
    }
    for (let it = 0; it < ITERATIONS; it++) {
      for (const b of this.bodies) this.match(b);
      for (const b of this.bodies) if (b.parent >= 0) this.limit(b);
    }
    for (const b of this.bodies) this.match(b);
    this.collide();
    let fastest = 0;
    for (let j = 0; j < n; j++) {
      const d = Math.hypot(
        this.px[j] - this.ox[j],
        this.py[j] - this.oy[j],
        this.pz[j] - this.oz[j],
      );
      if (d > fastest) fastest = d;
    }
    if (fastest / SOURCE_UNIT < SLEEP_SPEED) {
      this.still += h;
      if (this.still >= SLEEP_TIME) this.sleep();
    } else this.still = 0;
  }

  private centroid(b: Body, out: Vector3): Vector3 {
    let m = 0;
    out.set(0, 0, 0);
    for (const j of b.parts) {
      const wj = 1 / this.w[j];
      out.x += this.px[j] * wj;
      out.y += this.py[j] * wj;
      out.z += this.pz[j] * wj;
      m += wj;
    }
    return out.multiplyScalar(1 / m);
  }

  /** Shape matching: the body's best rigid fit to its particles, which then move onto it. */
  private match(b: Body): void {
    const c = this.centroid(b, tv2);
    // A = Σ m (x − c) restᵀ (row-major).
    let a00 = 0,
      a01 = 0,
      a02 = 0,
      a10 = 0,
      a11 = 0,
      a12 = 0,
      a20 = 0,
      a21 = 0,
      a22 = 0;
    b.parts.forEach((j, k) => {
      const m = 1 / this.w[j];
      const dx = (this.px[j] - c.x) * m;
      const dy = (this.py[j] - c.y) * m;
      const dz = (this.pz[j] - c.z) * m;
      const rx = b.rest[k * 3];
      const ry = b.rest[k * 3 + 1];
      const rz = b.rest[k * 3 + 2];
      a00 += dx * rx;
      a01 += dx * ry;
      a02 += dx * rz;
      a10 += dy * rx;
      a11 += dy * ry;
      a12 += dy * rz;
      a20 += dz * rx;
      a21 += dz * ry;
      a22 += dz * rz;
    });
    extractRotation(b.q, a00, a01, a02, a10, a11, a12, a20, a21, a22);
    const q = b.q;
    b.parts.forEach((j, k) => {
      tv.set(b.rest[k * 3], b.rest[k * 3 + 1], b.rest[k * 3 + 2]).applyQuaternion(q);
      this.px[j] = c.x + tv.x;
      this.py[j] = c.y + tv.y;
      this.pz[j] = c.z + tv.z;
    });
  }

  /** Clamps the child's rotation from its parent to the joint's limits, about its own axes. */
  private limit(b: Body): void {
    const p = this.bodies[b.parent];
    // World rotations now, the child relative to its parent, then from the bind-pose relation.
    tq.copy(p.q).multiply(p.o0); // parent world
    tq2.copy(b.q).multiply(b.o0); // child world
    tq3.copy(tq).invert().multiply(tq2); // relative
    tq3.premultiply(tq4.copy(b.bindRel).invert()); // deviation D
    te.setFromQuaternion(tq3, 'XYZ');
    const L = b.limits;
    const x = Math.max(L[0], Math.min(L[1], te.x));
    const y = Math.max(L[2], Math.min(L[3], te.y));
    const z = Math.max(L[4], Math.min(L[5], te.z));
    if (x === te.x && y === te.y && z === te.z) return;
    te.set(x, y, z, 'XYZ');
    // Target child world = parent · bindRel · D′; the correction rotates the child about its joint.
    tq3.setFromEuler(te);
    tq2.copy(tq).multiply(b.bindRel).multiply(tq3).multiply(tq4.copy(b.o0).invert());
    tq3.copy(tq2).multiply(tq4.copy(b.q).invert()); // world correction
    tq3.slerp(IDENTITY, 1 - LIMIT_STIFFNESS);
    const pivot = b.parts[0];
    const cx = this.px[pivot];
    const cy = this.py[pivot];
    const cz = this.pz[pivot];
    for (let k = 1; k < b.parts.length; k++) {
      const j = b.parts[k];
      tv.set(this.px[j] - cx, this.py[j] - cy, this.pz[j] - cz).applyQuaternion(tq3);
      this.px[j] = cx + tv.x;
      this.py[j] = cy + tv.y;
      this.pz[j] = cz + tv.z;
    }
    b.q.premultiply(tq3);
  }

  /** Joints and tips against the world: the step's move traced as a box of the part's radius. */
  private collide(): void {
    const trace = this.trace;
    if (!trace) return;
    for (let j = 0; j < this.px.length; j++) {
      const r = this.rad[j];
      if (r <= 0) continue;
      // From where the step started (the Verlet previous position) to where it ended.
      threeToSrc(tv.set(this.ox[j], this.oy[j], this.oz[j]), src);
      threeToSrc(tv.set(this.px[j], this.py[j], this.pz[j]), src2);
      const tr = trace(src, src2, r * TRACE_SHARE);
      if (!tr || tr.startSolid || tr.fraction >= 1) continue;
      const n = tr.normal;
      // Back onto the surface, a hair off it.
      src2.x = tr.endPos.x + n.x * 0.05;
      src2.y = tr.endPos.y + n.y * 0.05;
      src2.z = tr.endPos.z + n.z * 0.05;
      this.px[j] = src2.y * SOURCE_UNIT;
      this.py[j] = src2.z * SOURCE_UNIT;
      this.pz[j] = src2.x * SOURCE_UNIT;
      // Velocity (three, per step): drop what goes into the surface, keep some of the slide.
      const nx = n.y;
      const ny = n.z;
      const nz = n.x;
      let vx = this.px[j] - this.ox[j];
      let vy = this.py[j] - this.oy[j];
      let vz = this.pz[j] - this.oz[j];
      const vn = vx * nx + vy * ny + vz * nz;
      if (vn < 0) {
        vx -= vn * nx;
        vy -= vn * ny;
        vz -= vn * nz;
      }
      this.ox[j] = this.px[j] - vx * CONTACT_KEEP;
      this.oy[j] = this.py[j] - vy * CONTACT_KEEP;
      this.oz[j] = this.pz[j] - vz * CONTACT_KEEP;
    }
  }

  // ─── pose ───────────────────────────────────────────────────────────────

  /** Solid bones to their bodies; the others keep their pose under their parent. */
  private writePose(): void {
    const bones = this.inst.bones;
    for (let i = 0; i < bones.length; i++) {
      const bone = bones[i];
      const pi = bone.parent ? this.boneIndex.get(bone.parent as Bone) : undefined;
      const parentWorld =
        pi !== undefined && pi < i
          ? this.worldNew[pi]
          : (bone.parent?.matrixWorld ?? tm2.identity());
      const s = this.isSolidBone[i];
      if (s < 0) {
        bone.updateMatrix();
        this.worldNew[i].multiplyMatrices(parentWorld, bone.matrix);
        continue;
      }
      const b = this.bodies[s];
      const c = this.centroid(b, tv2);
      // World = T(c) · R · T(−c0) · B0.
      tm.makeRotationFromQuaternion(b.q);
      tv.copy(b.c0).applyQuaternion(b.q);
      tm.setPosition(c.x - tv.x, c.y - tv.y, c.z - tv.z);
      const world = this.worldNew[i].multiplyMatrices(tm, b.b0);
      tm.copy(parentWorld).invert().multiply(world);
      tm.decompose(bone.position, bone.quaternion, tv);
    }
    this.inst.updateMatrices();
  }

  /** A Source point near the body's middle (lighting, culling). */
  centre(out: V3): V3 {
    const b = this.bodies[0];
    const j = b.parts[0];
    threeToSrc(tv.set(this.px[j], this.py[j], this.pz[j]), out);
    return out;
  }
}

/**
 * The rotation part of A (Müller et al. 2016, "A Robust Method to Extract the Rotational Part of
 * Deformations"), refining `q` in place from its last value.
 */
export function extractRotation(
  q: Quaternion,
  a00: number,
  a01: number,
  a02: number,
  a10: number,
  a11: number,
  a12: number,
  a20: number,
  a21: number,
  a22: number,
  iterations = 6,
): Quaternion {
  for (let it = 0; it < iterations; it++) {
    em.makeRotationFromQuaternion(q);
    const e = em.elements; // column-major
    const r0x = e[0],
      r0y = e[1],
      r0z = e[2];
    const r1x = e[4],
      r1y = e[5],
      r1z = e[6];
    const r2x = e[8],
      r2y = e[9],
      r2z = e[10];
    // ω = Σ rᵢ × aᵢ / |Σ rᵢ · aᵢ| over the columns.
    const wx = r0y * a20 - r0z * a10 + (r1y * a21 - r1z * a11) + (r2y * a22 - r2z * a12);
    const wy = r0z * a00 - r0x * a20 + (r1z * a01 - r1x * a21) + (r2z * a02 - r2x * a22);
    const wz = r0x * a10 - r0y * a00 + (r1x * a11 - r1y * a01) + (r2x * a12 - r2y * a02);
    const d =
      Math.abs(
        r0x * a00 +
          r0y * a10 +
          r0z * a20 +
          r1x * a01 +
          r1y * a11 +
          r1z * a21 +
          r2x * a02 +
          r2y * a12 +
          r2z * a22,
      ) + 1e-9;
    const ox = wx / d,
      oy = wy / d,
      oz = wz / d;
    const w = Math.hypot(ox, oy, oz);
    if (w < 1e-9) break;
    eq.setFromAxisAngle(ev.set(ox / w, oy / w, oz / w), w);
    q.premultiply(eq).normalize();
  }
  return q;
}

/** Ragdolls simulating now (stats). */
export function awakeRagdolls(): number {
  return awake.filter((r) => !r.asleep).length;
}
