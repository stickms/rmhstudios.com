/**
 * The rigid-body world (the game's half of vphysics) on Rapier
 * (@dimforge/rapier3d-compat, loaded on demand by `loadRapier`).
 *
 * - Units: the simulation speaks Source units (inches, Z up); Rapier gets
 *   metres at vphysics' scale (METERS_PER_INCH 0.0254) with the same axes, so
 *   sv_gravity 600 in/s² is 15.24 m/s² and masses stay in kilograms.
 * - Static world: every solid world brush as a convex hull, displacements as
 *   triangle meshes, solid static props as their .phy hulls.
 * - Kinematic movers: brush entities (doors, trains, platforms) and the player
 *   and actor boxes, posed each tick by the game.
 * - Dynamic props: convex hulls with mass, damping, inertia scale and the
 *   surface's friction and elasticity; fixed 0.015 s ticks split into
 *   substeps; Rapier's islands sleep and wake them.
 * - Impact events: a body whose velocity changes sharply (beyond gravity) in a
 *   tick reports an impact with its surface's sound and the speed change.
 * - Collision groups keep held objects off the player, debris off players,
 *   func_clip_vphysics on props only, and implement portal passages (see
 *   `PHYS_GROUP` and lib/sp-game/portal/portals.ts).
 *
 * Every body keeps its hulls' plane sets in world space (refreshed when it
 * moves) so the game's box traces — player movement, use, bullets — collide
 * with the same shapes (`traceBodies`).
 */

import type * as RAPIER_NS from '@dimforge/rapier3d-compat';
import type { TraceResult } from '../../tf2-game/core/types';
import { vec3, type Vec3 } from '../../tf2-game/core/vec';
import type { BspFile } from '../../tf2-game/formats/bsp';
import { texInfoMaterial } from '../../tf2-game/formats/bsp';
import { convexHull, hullPlanes, type ConvexHull } from '../../tf2-game/world/convex';
import type { DisplacementSurface } from '../../tf2-game/formats/displacement';
import { anglesFromQuat, quatFromAngles, quatRotate, type Quat } from '../math';
import { clipBoxToPlaneSet } from '../world/convex-trace';
import { brushTexInfo, brushVertices } from './brush-hulls';
import type { SurfaceData, SurfacePropsTable } from './surface-props';

export type Rapier = typeof RAPIER_NS;

let rapierPromise: Promise<Rapier> | null = null;

/** Loads and initialises Rapier's WebAssembly once (browser, worker or Node). */
export function loadRapier(): Promise<Rapier> {
  if (!rapierPromise) {
    rapierPromise = import('@dimforge/rapier3d-compat').then(async (m) => {
      const R = ((m as unknown as { default?: Rapier }).default ?? m) as Rapier;
      await R.init();
      return R;
    });
  }
  return rapierPromise;
}

/** vphysics METERS_PER_INCH. */
export const METRES_PER_UNIT = 0.0254;
export const UNITS_PER_METRE = 1 / METRES_PER_UNIT;

/** Collision group bits (membership and filter share them). */
export const PHYS_GROUP = {
  WORLD: 1 << 0,
  PROP: 1 << 1,
  PLAYER: 1 << 2,
  BRUSH: 1 << 3,
  DEBRIS: 1 << 4,
  PORTAL_WALL_0: 1 << 5,
  PORTAL_WALL_1: 1 << 6,
  PORTAL_FRAME_0: 1 << 7,
  PORTAL_FRAME_1: 1 << 8,
  VPHYSICS_CLIP: 1 << 9,
  NPC: 1 << 10,
  HELD: 1 << 11,
} as const;

const ALL_WALLS = PHYS_GROUP.PORTAL_WALL_0 | PHYS_GROUP.PORTAL_WALL_1;
/** What an ordinary prop collides with. */
export const PROP_FILTER =
  PHYS_GROUP.WORLD | PHYS_GROUP.PROP | PHYS_GROUP.PLAYER | PHYS_GROUP.BRUSH | ALL_WALLS | PHYS_GROUP.VPHYSICS_CLIP | PHYS_GROUP.NPC | PHYS_GROUP.HELD;

const groups = (membership: number, filter: number): number => ((membership & 0xffff) << 16) | (filter & 0xffff);

export type BodyKind = 'dynamic' | 'kinematic' | 'fixed';

export interface BodyInit {
  /** Owning entity id (reported by traces and events). */
  entity: number;
  kind: BodyKind;
  /** Convex vertex sets, model space, Source units. */
  hulls: Float32Array[];
  origin: Vec3;
  angles: Vec3;
  /** kg (dynamic only). */
  mass?: number;
  damping?: number;
  rotDamping?: number;
  inertia?: number;
  surface?: string;
  membership?: number;
  filter?: number;
  velocity?: Vec3;
  /** deg/s about world axes. */
  angularVelocity?: Vec3;
  startAsleep?: boolean;
  /** Contents a trace sees (CONTENTS_SOLID by default). */
  contents?: number;
  /** Excluded from the game's traces (debris). */
  noTrace?: boolean;
}

export interface ImpactEvent {
  entity: number;
  /** Speed change, units/s. */
  speed: number;
  surface: string;
  sound: string;
  pos: Vec3;
}

interface PlaneSetCache {
  planes: Float64Array;
  bevel: Uint8Array;
  count: number;
  mins: Vec3;
  maxs: Vec3;
}

/** One rigid body and the game's view of it. */
export class PhysBody {
  readonly world: PhysicsWorld;
  readonly rb: RAPIER_NS.RigidBody;
  readonly colliders: RAPIER_NS.Collider[] = [];
  readonly kind: BodyKind;
  entity: number;
  mass: number;
  surface: SurfaceData;
  contents: number;
  noTrace: boolean;
  membership: number;
  filter: number;
  /** Model-space hulls (for plane sets). */
  readonly hulls: ConvexHull[] = [];
  /** World-space bounds of all hulls (units), refreshed with the plane sets. */
  readonly mins = vec3();
  readonly maxs = vec3();
  /** Local bounding radius (units). */
  radius = 0;
  /** The body's local centre of its hulls' bounds (units, model space). */
  readonly localCenter = vec3();
  /** Half-extents of the hulls' local bounds (units). */
  readonly localHalf = vec3();
  private planeCache: PlaneSetCache[] = [];
  private cachePose = { x: NaN, y: NaN, z: NaN, qx: NaN, qy: NaN, qz: NaN, qw: NaN };
  /** Velocity at the start of the step (units/s), for impacts. */
  readonly prevVel = vec3();
  /** Set while the game holds it (+use carry). */
  held = false;
  removed = false;

  constructor(world: PhysicsWorld, rb: RAPIER_NS.RigidBody, init: BodyInit, surface: SurfaceData) {
    this.world = world;
    this.rb = rb;
    this.kind = init.kind;
    this.entity = init.entity;
    this.mass = init.mass ?? 0;
    this.surface = surface;
    this.contents = init.contents ?? 1;
    this.noTrace = !!init.noTrace;
    this.membership = init.membership ?? 0;
    this.filter = init.filter ?? 0;
  }

  get handle(): number {
    return this.rb.handle;
  }

  getOrigin(out: Vec3): Vec3 {
    const t = this.rb.translation();
    out.x = t.x * UNITS_PER_METRE;
    out.y = t.y * UNITS_PER_METRE;
    out.z = t.z * UNITS_PER_METRE;
    return out;
  }

  getQuat(out: Quat): Quat {
    const r = this.rb.rotation();
    out.x = r.x;
    out.y = r.y;
    out.z = r.z;
    out.w = r.w;
    return out;
  }

  getAngles(out: Vec3): Vec3 {
    return anglesFromQuat(this.getQuat(scratchQ), out);
  }

  /** World-space centre of the hull bounds (units). */
  getCenter(out: Vec3): Vec3 {
    this.getOrigin(out);
    quatRotate(this.getQuat(scratchQ), this.localCenter, scratchV);
    out.x += scratchV.x;
    out.y += scratchV.y;
    out.z += scratchV.z;
    return out;
  }

  /** units/s */
  getVelocity(out: Vec3): Vec3 {
    const v = this.rb.linvel();
    out.x = v.x * UNITS_PER_METRE;
    out.y = v.y * UNITS_PER_METRE;
    out.z = v.z * UNITS_PER_METRE;
    return out;
  }

  /** deg/s about world axes. */
  getAngularVelocity(out: Vec3): Vec3 {
    const w = this.rb.angvel();
    out.x = (w.x * 180) / Math.PI;
    out.y = (w.y * 180) / Math.PI;
    out.z = (w.z * 180) / Math.PI;
    return out;
  }

  setVelocity(v: Vec3, wake = true): void {
    this.rb.setLinvel({ x: v.x * METRES_PER_UNIT, y: v.y * METRES_PER_UNIT, z: v.z * METRES_PER_UNIT }, wake);
  }

  setAngularVelocity(w: Vec3, wake = true): void {
    const k = Math.PI / 180;
    this.rb.setAngvel({ x: w.x * k, y: w.y * k, z: w.z * k }, wake);
  }

  /** Teleports the body (SDK: IPhysicsObject::SetPosition with teleport). */
  setPose(origin: Vec3, angles: Vec3 | null, quat?: Quat): void {
    const t = { x: origin.x * METRES_PER_UNIT, y: origin.y * METRES_PER_UNIT, z: origin.z * METRES_PER_UNIT };
    const q = quat ?? (angles ? quatFromAngles(angles, scratchQ) : null);
    if (this.kind === 'kinematic') {
      this.rb.setNextKinematicTranslation(t);
      if (q) this.rb.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    }
    this.rb.setTranslation(t, true);
    if (q) this.rb.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
  }

  /** The kinematic target for the coming step (movers). */
  setKinematicTarget(origin: Vec3, angles: Vec3): void {
    this.rb.setNextKinematicTranslation({ x: origin.x * METRES_PER_UNIT, y: origin.y * METRES_PER_UNIT, z: origin.z * METRES_PER_UNIT });
    const q = quatFromAngles(angles, scratchQ);
    this.rb.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
  }

  /** SDK: IPhysicsObject::ApplyForceCenter in vphysics is an impulse: kg·units/s. */
  applyImpulse(impulse: Vec3): void {
    this.rb.applyImpulse({ x: impulse.x * METRES_PER_UNIT, y: impulse.y * METRES_PER_UNIT, z: impulse.z * METRES_PER_UNIT }, true);
  }

  /** Impulse at a world point (kg·units/s at units). */
  applyImpulseAt(impulse: Vec3, point: Vec3): void {
    this.rb.applyImpulseAtPoint(
      { x: impulse.x * METRES_PER_UNIT, y: impulse.y * METRES_PER_UNIT, z: impulse.z * METRES_PER_UNIT },
      { x: point.x * METRES_PER_UNIT, y: point.y * METRES_PER_UNIT, z: point.z * METRES_PER_UNIT },
      true,
    );
  }

  /** Angular impulse, deg·kg… (applied as torque impulse about world axes, scaled to radians). */
  applyAngularImpulse(w: Vec3): void {
    const k = (Math.PI / 180) * METRES_PER_UNIT * METRES_PER_UNIT;
    this.rb.applyTorqueImpulse({ x: w.x * k, y: w.y * k, z: w.z * k }, true);
  }

  wake(): void {
    this.rb.wakeUp();
  }

  isSleeping(): boolean {
    return this.rb.isSleeping();
  }

  /** EnableMotion(false): the body is frozen in place. */
  setMotionEnabled(on: boolean): void {
    if (this.kind !== 'dynamic') return;
    this.rb.setBodyType(on ? this.world.R.RigidBodyType.Dynamic : this.world.R.RigidBodyType.Fixed, true);
  }

  isMotionEnabled(): boolean {
    return this.kind === 'dynamic' && this.rb.bodyType() === this.world.R.RigidBodyType.Dynamic;
  }

  setGravityEnabled(on: boolean): void {
    this.rb.setGravityScale(on ? 1 : 0, true);
  }

  /** Changes membership/filter of every collider. */
  setGroups(membership: number, filter: number): void {
    this.membership = membership;
    this.filter = filter;
    const g = groups(membership, filter);
    for (const c of this.colliders) c.setCollisionGroups(g);
  }

  /** Plane sets in world space, refreshed when the body moved. */
  planeSets(): readonly PlaneSetCache[] {
    // Kinematic bodies are where the game just put them (the solver catches up on the next step).
    const kin = this.kind === 'kinematic';
    const t = kin ? this.rb.nextTranslation() : this.rb.translation();
    const r = kin ? this.rb.nextRotation() : this.rb.rotation();
    const c = this.cachePose;
    if (c.x === t.x && c.y === t.y && c.z === t.z && c.qx === r.x && c.qy === r.y && c.qz === r.z && c.qw === r.w) return this.planeCache;
    c.x = t.x;
    c.y = t.y;
    c.z = t.z;
    c.qx = r.x;
    c.qy = r.y;
    c.qz = r.z;
    c.qw = r.w;
    const q: Quat = { x: r.x, y: r.y, z: r.z, w: r.w };
    const ox = t.x * UNITS_PER_METRE;
    const oy = t.y * UNITS_PER_METRE;
    const oz = t.z * UNITS_PER_METRE;
    const out: PlaneSetCache[] = [];
    let bminX = Infinity;
    let bminY = Infinity;
    let bminZ = Infinity;
    let bmaxX = -Infinity;
    let bmaxY = -Infinity;
    let bmaxZ = -Infinity;
    const p = vec3();
    for (const h of this.hulls) {
      const wp = new Float64Array(h.points.length);
      for (let i = 0; i < h.points.length; i += 3) {
        p.x = h.points[i];
        p.y = h.points[i + 1];
        p.z = h.points[i + 2];
        quatRotate(q, p, p);
        wp[i] = p.x + ox;
        wp[i + 1] = p.y + oy;
        wp[i + 2] = p.z + oz;
      }
      const ps = hullPlanes({ points: wp, triangles: h.triangles });
      const mins = vec3(Infinity, Infinity, Infinity);
      const maxs = vec3(-Infinity, -Infinity, -Infinity);
      for (let i = 0; i < wp.length; i += 3) {
        mins.x = Math.min(mins.x, wp[i]);
        mins.y = Math.min(mins.y, wp[i + 1]);
        mins.z = Math.min(mins.z, wp[i + 2]);
        maxs.x = Math.max(maxs.x, wp[i]);
        maxs.y = Math.max(maxs.y, wp[i + 1]);
        maxs.z = Math.max(maxs.z, wp[i + 2]);
      }
      bminX = Math.min(bminX, mins.x);
      bminY = Math.min(bminY, mins.y);
      bminZ = Math.min(bminZ, mins.z);
      bmaxX = Math.max(bmaxX, maxs.x);
      bmaxY = Math.max(bmaxY, maxs.y);
      bmaxZ = Math.max(bmaxZ, maxs.z);
      out.push({ planes: ps.planes, bevel: ps.bevel, count: ps.count, mins, maxs });
    }
    this.mins.x = bminX;
    this.mins.y = bminY;
    this.mins.z = bminZ;
    this.maxs.x = bmaxX;
    this.maxs.y = bmaxY;
    this.maxs.z = bmaxZ;
    this.planeCache = out;
    return out;
  }

  /** World AABB of the rotated local bounds (cheap; slightly loose for rotated bodies). */
  fastBounds(mins: Vec3, maxs: Vec3): void {
    const kin = this.kind === 'kinematic';
    const r = kin ? this.rb.nextRotation() : this.rb.rotation();
    const t = kin ? this.rb.nextTranslation() : this.rb.translation();
    const { x, y, z, w } = r;
    const m0 = 1 - 2 * (y * y + z * z);
    const m1 = 2 * (x * y - w * z);
    const m2 = 2 * (x * z + w * y);
    const m3 = 2 * (x * y + w * z);
    const m4 = 1 - 2 * (x * x + z * z);
    const m5 = 2 * (y * z - w * x);
    const m6 = 2 * (x * z - w * y);
    const m7 = 2 * (y * z + w * x);
    const m8 = 1 - 2 * (x * x + y * y);
    const c = this.localCenter;
    const h = this.localHalf;
    const cx = m0 * c.x + m1 * c.y + m2 * c.z + t.x * UNITS_PER_METRE;
    const cy = m3 * c.x + m4 * c.y + m5 * c.z + t.y * UNITS_PER_METRE;
    const cz = m6 * c.x + m7 * c.y + m8 * c.z + t.z * UNITS_PER_METRE;
    const ex = Math.abs(m0) * h.x + Math.abs(m1) * h.y + Math.abs(m2) * h.z;
    const ey = Math.abs(m3) * h.x + Math.abs(m4) * h.y + Math.abs(m5) * h.z;
    const ez = Math.abs(m6) * h.x + Math.abs(m7) * h.y + Math.abs(m8) * h.z;
    mins.x = cx - ex;
    mins.y = cy - ey;
    mins.z = cz - ez;
    maxs.x = cx + ex;
    maxs.y = cy + ey;
    maxs.z = cz + ez;
  }

  /** World AABB (units), current pose. */
  bounds(mins: Vec3, maxs: Vec3): void {
    this.planeSets();
    mins.x = this.mins.x;
    mins.y = this.mins.y;
    mins.z = this.mins.z;
    maxs.x = this.maxs.x;
    maxs.y = this.maxs.y;
    maxs.z = this.maxs.z;
  }
}

const scratchQ: Quat = { x: 0, y: 0, z: 0, w: 1 };
const fbMin = vec3();
const tmpTrace: TraceResult = {
  fraction: 1,
  endPos: vec3(),
  plane: { normal: vec3(), dist: 0 },
  startSolid: false,
  allSolid: false,
  contents: 0,
  surfaceFlags: 0,
  surfaceName: '',
  entity: -1,
  hitGroup: 0,
};
function copyTraceInto(dst: TraceResult, src: TraceResult): void {
  dst.fraction = src.fraction;
  dst.endPos.x = src.endPos.x;
  dst.endPos.y = src.endPos.y;
  dst.endPos.z = src.endPos.z;
  dst.plane.normal.x = src.plane.normal.x;
  dst.plane.normal.y = src.plane.normal.y;
  dst.plane.normal.z = src.plane.normal.z;
  dst.plane.dist = src.plane.dist;
  dst.contents = src.contents;
  dst.surfaceFlags = src.surfaceFlags;
  dst.surfaceName = src.surfaceName;
  dst.entity = src.entity;
  dst.hitGroup = src.hitGroup;
}
const fbMax = vec3();
const scratchV = vec3();

function hullVolume(h: ConvexHull): number {
  const p = h.points;
  const t = h.triangles;
  let cx = 0;
  let cy = 0;
  let cz = 0;
  const n = p.length / 3;
  for (let i = 0; i < p.length; i += 3) {
    cx += p[i];
    cy += p[i + 1];
    cz += p[i + 2];
  }
  cx /= n;
  cy /= n;
  cz /= n;
  let v = 0;
  for (let i = 0; i < t.length; i += 3) {
    const a = t[i] * 3;
    const b = t[i + 1] * 3;
    const c = t[i + 2] * 3;
    const ax = p[a] - cx;
    const ay = p[a + 1] - cy;
    const az = p[a + 2] - cz;
    const bx = p[b] - cx;
    const by = p[b + 1] - cy;
    const bz = p[b + 2] - cz;
    const qx = p[c] - cx;
    const qy = p[c + 1] - cy;
    const qz = p[c + 2] - cz;
    v += ax * (by * qz - bz * qy) - ay * (bx * qz - bz * qx) + az * (bx * qy - by * qx);
  }
  return Math.abs(v) / 6;
}

export interface PhysicsWorldOptions {
  /** Units/s² (600 in HL2 and Portal). */
  gravity: number;
  /** Ticks are split into this many solver steps. */
  substeps?: number;
  tickInterval?: number;
}

/** A static world collider's bookkeeping (portal walls re-group them). */
interface StaticPiece {
  collider: RAPIER_NS.Collider;
  mins: Vec3;
  maxs: Vec3;
  membership: number;
}

export class PhysicsWorld {
  readonly R: Rapier;
  readonly world: RAPIER_NS.World;
  readonly surfaces: SurfacePropsTable;
  readonly tick: number;
  readonly substeps: number;
  readonly gravity: number;
  private readonly staticBody: RAPIER_NS.RigidBody;
  readonly staticPieces: StaticPiece[] = [];
  readonly bodies = new Map<number, PhysBody>();
  private readonly byCollider = new Map<number, PhysBody>();
  readonly impacts: ImpactEvent[] = [];
  private readonly vtmp = vec3();

  constructor(R: Rapier, surfaces: SurfacePropsTable, opts: PhysicsWorldOptions) {
    this.R = R;
    this.surfaces = surfaces;
    this.gravity = opts.gravity;
    this.tick = opts.tickInterval ?? 0.015;
    this.substeps = Math.max(1, opts.substeps ?? 2);
    this.world = new R.World({ x: 0, y: 0, z: -opts.gravity * METRES_PER_UNIT });
    this.world.timestep = this.tick / this.substeps;
    this.world.integrationParameters.numSolverIterations = 4;
    this.staticBody = this.world.createRigidBody(R.RigidBodyDesc.fixed());
  }

  // ─── Static world ─────────────────────────────────────────────────────────

  private addStaticConvex(points: Float32Array, surface: SurfaceData, membership = PHYS_GROUP.WORLD): boolean {
    const m = new Float32Array(points.length);
    const mins = vec3(Infinity, Infinity, Infinity);
    const maxs = vec3(-Infinity, -Infinity, -Infinity);
    for (let i = 0; i < points.length; i += 3) {
      m[i] = points[i] * METRES_PER_UNIT;
      m[i + 1] = points[i + 1] * METRES_PER_UNIT;
      m[i + 2] = points[i + 2] * METRES_PER_UNIT;
      mins.x = Math.min(mins.x, points[i]);
      mins.y = Math.min(mins.y, points[i + 1]);
      mins.z = Math.min(mins.z, points[i + 2]);
      maxs.x = Math.max(maxs.x, points[i]);
      maxs.y = Math.max(maxs.y, points[i + 1]);
      maxs.z = Math.max(maxs.z, points[i + 2]);
    }
    const desc = this.R.ColliderDesc.convexHull(m);
    if (!desc) return false;
    desc.setFriction(surface.friction).setRestitution(surface.elasticity);
    desc.setCollisionGroups(groups(membership, 0xffff));
    const c = this.world.createCollider(desc, this.staticBody);
    this.staticPieces.push({ collider: c, mins, maxs, membership });
    return true;
  }

  /**
   * Adds the world model's solid brushes (and optionally only those whose
   * contents match `contentsMask`). `materialSurface` maps a material to its
   * surface property name. Returns the number of hulls added.
   */
  addWorldBrushes(bsp: BspFile, brushes: ArrayLike<number>, contentsMask: number, materialSurface: (material: string) => string): number {
    let n = 0;
    for (let i = 0; i < brushes.length; i++) {
      const b = brushes[i];
      if (!(bsp.brushes.contents[b] & contentsMask)) continue;
      const pts = brushVertices(bsp, b);
      if (!pts) continue;
      const ti = brushTexInfo(bsp, b);
      const surf = this.surfaces.get(ti >= 0 ? materialSurface(texInfoMaterial(bsp, ti)) : 'default');
      if (this.addStaticConvex(pts, surf)) n++;
    }
    return n;
  }

  /** Displacements as triangle meshes. */
  addDisplacements(surfaces: ReadonlyArray<DisplacementSurface | null>, materialSurface: (texInfo: number) => string): number {
    let n = 0;
    for (const d of surfaces) {
      if (!d) continue;
      // DISP_SURF_NOPHYSICS_COLL
      if (d.flags & 0x2) continue;
      const v = new Float32Array(d.positions.length);
      for (let i = 0; i < v.length; i++) v[i] = d.positions[i] * METRES_PER_UNIT;
      const idx = new Uint32Array(d.indices);
      const desc = this.R.ColliderDesc.trimesh(v, idx);
      const surf = this.surfaces.get(materialSurface(d.texInfo));
      desc.setFriction(surf.friction).setRestitution(surf.elasticity);
      desc.setCollisionGroups(groups(PHYS_GROUP.WORLD, 0xffff));
      const c = this.world.createCollider(desc, this.staticBody);
      this.staticPieces.push({
        collider: c,
        mins: vec3(d.mins[0], d.mins[1], d.mins[2]),
        maxs: vec3(d.maxs[0], d.maxs[1], d.maxs[2]),
        membership: PHYS_GROUP.WORLD,
      });
      n++;
    }
    return n;
  }

  /** A static prop's hulls at its pose. */
  addStaticHulls(hulls: Float32Array[], origin: Vec3, angles: Vec3, surface: string): number {
    const q = quatFromAngles(angles);
    const p = vec3();
    let n = 0;
    const surf = this.surfaces.get(surface);
    for (const h of hulls) {
      const w = new Float32Array(h.length);
      for (let i = 0; i < h.length; i += 3) {
        p.x = h[i];
        p.y = h[i + 1];
        p.z = h[i + 2];
        quatRotate(q, p, p);
        w[i] = p.x + origin.x;
        w[i + 1] = p.y + origin.y;
        w[i + 2] = p.z + origin.z;
      }
      if (this.addStaticConvex(w, surf)) n++;
    }
    return n;
  }

  /** Re-groups static colliders (portal walls); `predicate` picks them by bounds. */
  regroupStatic(predicate: (mins: Vec3, maxs: Vec3) => boolean, membership: number): StaticPiece[] {
    const hit: StaticPiece[] = [];
    for (const s of this.staticPieces) {
      if (!predicate(s.mins, s.maxs)) continue;
      s.membership = membership;
      s.collider.setCollisionGroups(groups(membership, 0xffff));
      hit.push(s);
    }
    return hit;
  }

  /** Puts static pieces back in the world group. */
  restoreStatic(pieces: StaticPiece[], membership = PHYS_GROUP.WORLD): void {
    for (const s of pieces) {
      s.membership = membership;
      s.collider.setCollisionGroups(groups(membership, 0xffff));
    }
  }

  /** A fixed box collider (portal frames, invisible blockers); returns a remover. */
  addStaticBox(mins: Vec3, maxs: Vec3, membership: number, filter = 0xffff): () => void {
    const hx = ((maxs.x - mins.x) / 2) * METRES_PER_UNIT;
    const hy = ((maxs.y - mins.y) / 2) * METRES_PER_UNIT;
    const hz = ((maxs.z - mins.z) / 2) * METRES_PER_UNIT;
    const desc = this.R.ColliderDesc.cuboid(Math.max(hx, 1e-3), Math.max(hy, 1e-3), Math.max(hz, 1e-3))
      .setTranslation(((mins.x + maxs.x) / 2) * METRES_PER_UNIT, ((mins.y + maxs.y) / 2) * METRES_PER_UNIT, ((mins.z + maxs.z) / 2) * METRES_PER_UNIT)
      .setCollisionGroups(groups(membership, filter));
    const c = this.world.createCollider(desc, this.staticBody);
    return () => this.world.removeCollider(c, true);
  }

  // ─── Bodies ───────────────────────────────────────────────────────────────

  createBody(init: BodyInit): PhysBody | null {
    const R = this.R;
    const desc =
      init.kind === 'dynamic'
        ? R.RigidBodyDesc.dynamic()
        : init.kind === 'kinematic'
          ? R.RigidBodyDesc.kinematicPositionBased()
          : R.RigidBodyDesc.fixed();
    const q = quatFromAngles(init.angles);
    desc
      .setTranslation(init.origin.x * METRES_PER_UNIT, init.origin.y * METRES_PER_UNIT, init.origin.z * METRES_PER_UNIT)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    if (init.kind === 'dynamic') {
      desc.setLinearDamping(init.damping ?? 0).setAngularDamping(Math.max(init.rotDamping ?? 0, 0.05)).setCanSleep(true);
      if (init.velocity) desc.setLinvel(init.velocity.x * METRES_PER_UNIT, init.velocity.y * METRES_PER_UNIT, init.velocity.z * METRES_PER_UNIT);
      if (init.angularVelocity) {
        const k = Math.PI / 180;
        desc.setAngvel({ x: init.angularVelocity.x * k, y: init.angularVelocity.y * k, z: init.angularVelocity.z * k });
      }
      if (init.startAsleep) desc.setSleeping(true);
      desc.setCcdEnabled(true);
    }
    const rb = this.world.createRigidBody(desc);
    const surface = this.surfaces.get(init.surface ?? 'default');
    const body = new PhysBody(this, rb, init, surface);
    const hullObjs: ConvexHull[] = [];
    let totalVol = 0;
    const vols: number[] = [];
    for (const h of init.hulls) {
      const ch = convexHull(h);
      if (!ch) continue;
      hullObjs.push(ch);
      const v = hullVolume(ch) * METRES_PER_UNIT ** 3;
      vols.push(v);
      totalVol += v;
    }
    if (hullObjs.length === 0) {
      this.world.removeRigidBody(rb);
      return null;
    }
    const mass = init.kind === 'dynamic' ? Math.max(init.mass ?? 10, 0.01) : 0;
    body.mass = mass;
    const membership = init.membership ?? (init.kind === 'dynamic' ? PHYS_GROUP.PROP : PHYS_GROUP.BRUSH);
    const filter = init.filter ?? (init.kind === 'dynamic' ? PROP_FILTER : 0xffff);
    body.membership = membership;
    body.filter = filter;
    let lminX = Infinity;
    let lminY = Infinity;
    let lminZ = Infinity;
    let lmaxX = -Infinity;
    let lmaxY = -Infinity;
    let lmaxZ = -Infinity;
    for (let i = 0; i < hullObjs.length; i++) {
      const ch = hullObjs[i];
      const m = new Float32Array(ch.points.length);
      for (let k = 0; k < m.length; k++) m[k] = ch.points[k] * METRES_PER_UNIT;
      for (let k = 0; k < ch.points.length; k += 3) {
        lminX = Math.min(lminX, ch.points[k]);
        lminY = Math.min(lminY, ch.points[k + 1]);
        lminZ = Math.min(lminZ, ch.points[k + 2]);
        lmaxX = Math.max(lmaxX, ch.points[k]);
        lmaxY = Math.max(lmaxY, ch.points[k + 1]);
        lmaxZ = Math.max(lmaxZ, ch.points[k + 2]);
      }
      const cd = R.ColliderDesc.convexHull(m);
      if (!cd) continue;
      cd.setFriction(surface.friction)
        .setRestitution(Math.min(surface.elasticity, 1))
        .setRestitutionCombineRule(R.CoefficientCombineRule.Multiply)
        .setCollisionGroups(groups(membership, filter));
      if (init.kind === 'dynamic') {
        const share = totalVol > 0 ? vols[i] / totalVol : 1 / hullObjs.length;
        cd.setMass(mass * share);
      }
      const c = this.world.createCollider(cd, rb);
      body.colliders.push(c);
      this.byCollider.set(c.handle, body);
      body.hulls.push(ch);
    }
    if (body.colliders.length === 0) {
      this.world.removeRigidBody(rb);
      return null;
    }
    body.localCenter.x = (lminX + lmaxX) / 2;
    body.localCenter.y = (lminY + lmaxY) / 2;
    body.localCenter.z = (lminZ + lmaxZ) / 2;
    body.radius = Math.hypot(lmaxX - lminX, lmaxY - lminY, lmaxZ - lminZ) / 2;
    body.localHalf.x = (lmaxX - lminX) / 2;
    body.localHalf.y = (lmaxY - lminY) / 2;
    body.localHalf.z = (lmaxZ - lminZ) / 2;
    if (init.kind === 'dynamic' && init.inertia && init.inertia > 1) {
      // The phy "inertia" multiplier: add the extra principal inertia on top of the shape's.
      const pi = rb.principalInertia();
      const k = init.inertia - 1;
      rb.setAdditionalMassProperties(0, rb.localCom(), { x: pi.x * k, y: pi.y * k, z: pi.z * k }, rb.principalInertiaLocalFrame(), true);
    }
    this.bodies.set(rb.handle, body);
    return body;
  }

  /** A kinematic box (player / actor hull) in units. */
  createKinematicBox(entity: number, mins: Vec3, maxs: Vec3, origin: Vec3, membership: number, filter: number): PhysBody {
    const hull = new Float32Array([
      mins.x, mins.y, mins.z, maxs.x, mins.y, mins.z, mins.x, maxs.y, mins.z, maxs.x, maxs.y, mins.z,
      mins.x, mins.y, maxs.z, maxs.x, mins.y, maxs.z, mins.x, maxs.y, maxs.z, maxs.x, maxs.y, maxs.z,
    ]);
    const b = this.createBody({ entity, kind: 'kinematic', hulls: [hull], origin, angles: vec3(), membership, filter, noTrace: true });
    if (!b) throw new Error('kinematic box failed');
    return b;
  }

  removeBody(body: PhysBody): void {
    if (body.removed) return;
    body.removed = true;
    for (const c of body.colliders) this.byCollider.delete(c.handle);
    this.bodies.delete(body.rb.handle);
    this.world.removeRigidBody(body.rb);
  }

  bodyOfCollider(handle: number): PhysBody | null {
    return this.byCollider.get(handle) ?? null;
  }

  // ─── Joints (phys_ballsocket / phys_hinge / phys_lengthconstraint) ────────

  /** Ball socket at a world point between a body and another body or the world. */
  addBallJoint(a: PhysBody, b: PhysBody | null, anchor: Vec3): RAPIER_NS.ImpulseJoint {
    const la = this.localPoint(a, anchor);
    const lb = b ? this.localPoint(b, anchor) : { x: anchor.x * METRES_PER_UNIT, y: anchor.y * METRES_PER_UNIT, z: anchor.z * METRES_PER_UNIT };
    const data = this.R.JointData.spherical(la, lb);
    return this.world.createImpulseJoint(data, a.rb, b ? b.rb : this.staticBody, true);
  }

  /** Hinge about a world axis through a world point. */
  addHingeJoint(a: PhysBody, b: PhysBody | null, anchor: Vec3, axis: Vec3): RAPIER_NS.ImpulseJoint {
    const la = this.localPoint(a, anchor);
    const lb = b ? this.localPoint(b, anchor) : { x: anchor.x * METRES_PER_UNIT, y: anchor.y * METRES_PER_UNIT, z: anchor.z * METRES_PER_UNIT };
    const qa = a.getQuat({ x: 0, y: 0, z: 0, w: 1 });
    const inv: Quat = { x: -qa.x, y: -qa.y, z: -qa.z, w: qa.w };
    const ax = quatRotate(inv, axis, vec3());
    const data = this.R.JointData.revolute(la, lb, { x: ax.x, y: ax.y, z: ax.z });
    return this.world.createImpulseJoint(data, a.rb, b ? b.rb : this.staticBody, true);
  }

  /** A rope: keeps two points within `length` (a rope joint). */
  addLengthJoint(a: PhysBody, b: PhysBody | null, pa: Vec3, pb: Vec3, length: number): RAPIER_NS.ImpulseJoint {
    const la = this.localPoint(a, pa);
    const lb = b ? this.localPoint(b, pb) : { x: pb.x * METRES_PER_UNIT, y: pb.y * METRES_PER_UNIT, z: pb.z * METRES_PER_UNIT };
    const data = this.R.JointData.rope(Math.max(length, 1) * METRES_PER_UNIT, la, lb);
    return this.world.createImpulseJoint(data, a.rb, b ? b.rb : this.staticBody, true);
  }

  private localPoint(b: PhysBody, p: Vec3): { x: number; y: number; z: number } {
    const o = b.getOrigin(vec3());
    const q = b.getQuat({ x: 0, y: 0, z: 0, w: 1 });
    const inv: Quat = { x: -q.x, y: -q.y, z: -q.z, w: q.w };
    const d = quatRotate(inv, { x: p.x - o.x, y: p.y - o.y, z: p.z - o.z }, vec3());
    return { x: d.x * METRES_PER_UNIT, y: d.y * METRES_PER_UNIT, z: d.z * METRES_PER_UNIT };
  }

  // ─── Stepping ─────────────────────────────────────────────────────────────

  /** One game tick: substeps, then impact detection. */
  step(): void {
    for (const b of this.bodies.values()) if (b.kind === 'dynamic' && !b.rb.isSleeping()) b.getVelocity(b.prevVel);
    for (let i = 0; i < this.substeps; i++) this.world.step();
    const v = this.vtmp;
    const g = this.gravity * this.tick;
    for (const b of this.bodies.values()) {
      if (b.kind !== 'dynamic' || b.rb.isSleeping() || b.held) continue;
      b.getVelocity(v);
      const dx = v.x - b.prevVel.x;
      const dy = v.y - b.prevVel.y;
      const dz = v.z - b.prevVel.z + g;
      const dv = Math.sqrt(dx * dx + dy * dy + dz * dz);
      // vphysics' impact sounds start around 70 in/s of collision speed.
      if (dv > 70) {
        const hard = dv > 300;
        this.impacts.push({
          entity: b.entity,
          speed: dv,
          surface: b.surface.name,
          sound: hard ? b.surface.impactHard : b.surface.impactSoft,
          pos: b.getCenter(vec3()),
        });
      }
    }
  }

  drainImpacts(): ImpactEvent[] {
    const out = this.impacts.slice();
    this.impacts.length = 0;
    return out;
  }

  // ─── Game traces against bodies ────────────────────────────────────────────

  /**
   * Clips a box sweep against every traceable body (dynamic props and
   * kinematic brush shapes are not included — brushes trace through the map's
   * own collision). `skip(entity)` excludes bodies (the mover, a held object).
   */
  traceBodies(
    start: Vec3,
    end: Vec3,
    mins: Vec3,
    maxs: Vec3,
    skip: ((entity: number) => boolean) | null,
    out: TraceResult,
  ): void {
    const sminX = Math.min(start.x, end.x) + mins.x - 1;
    const sminY = Math.min(start.y, end.y) + mins.y - 1;
    const sminZ = Math.min(start.z, end.z) + mins.z - 1;
    const smaxX = Math.max(start.x, end.x) + maxs.x + 1;
    const smaxY = Math.max(start.y, end.y) + maxs.y + 1;
    const smaxZ = Math.max(start.z, end.z) + maxs.z + 1;
    for (const b of this.bodies.values()) {
      if (b.noTrace || b.kind === 'fixed' || b.removed) continue;
      if (skip && skip(b.entity)) continue;
      b.fastBounds(fbMin, fbMax);
      if (fbMin.x > smaxX || fbMax.x < sminX || fbMin.y > smaxY || fbMax.y < sminY || fbMin.z > smaxZ || fbMax.z < sminZ) continue;
      const sets = b.planeSets();
      if (b.mins.x > smaxX || b.maxs.x < sminX || b.mins.y > smaxY || b.maxs.y < sminY || b.mins.z > smaxZ || b.maxs.z < sminZ) continue;
      for (const s of sets) {
        if (s.mins.x > smaxX || s.maxs.x < sminX || s.mins.y > smaxY || s.maxs.y < sminY || s.mins.z > smaxZ || s.maxs.z < sminZ) continue;
        if (b.kind === 'dynamic') {
          // A box already inside a moving prop (the solver let them overlap) is not held by it:
          // the player walks out and the solver pushes the prop away (the engine's player
          // shadow does the same).
          tmpTrace.fraction = out.fraction;
          tmpTrace.startSolid = false;
          tmpTrace.allSolid = false;
          if (!clipBoxToPlaneSet(s.planes, s.bevel, s.count, start, end, mins, maxs, b.entity, b.contents, b.surface.name, tmpTrace)) continue;
          if (tmpTrace.startSolid) continue;
          copyTraceInto(out, tmpTrace);
          continue;
        }
        clipBoxToPlaneSet(s.planes, s.bevel, s.count, start, end, mins, maxs, b.entity, b.contents, b.surface.name, out);
        if (out.allSolid) return;
      }
    }
  }

  /** Bodies whose bounds overlap a box (units). */
  bodiesInBox(mins: Vec3, maxs: Vec3, out: PhysBody[]): PhysBody[] {
    for (const b of this.bodies.values()) {
      if (b.kind !== 'dynamic' || b.removed) continue;
      b.fastBounds(fbMin, fbMax);
      if (fbMin.x > maxs.x || fbMax.x < mins.x || fbMin.y > maxs.y || fbMax.y < mins.y || fbMin.z > maxs.z || fbMax.z < mins.z) continue;
      out.push(b);
    }
    return out;
  }

  free(): void {
    this.world.free();
  }
}
