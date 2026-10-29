/**
 * The map as a collision world: the map half of `CollisionWorld`.
 *
 * - Brushes: the classic BSP box trace — walk the node tree splitting the
 *   swept box at each plane (CM_RecursiveHullCheck), and in each leaf clip the
 *   box against every brush through its sides (CM_ClipBoxToBrush), keeping the
 *   trace DIST_EPSILON (1/32 unit) off the surface. Those routines live in
 *   the engine (cmodel.cpp), which the SDK does not include; this follows the
 *   long-published algorithm with Source's conventions (centred extents,
 *   bevel sides skipped for rays, startsolid / allsolid, contents masks).
 * - Displacements: swept AABB vs triangle per CDispCollTree::SweepAABBTriIntersect
 *   (SDK: public/dispcoll_common.cpp), one-sided like the SDK, over a BVH.
 * - Static props: convex hulls → plane sets with bevels, traced like brushes,
 *   over a BVH.
 * - Brush entity models (*1..*N): their own subtrees from dmodel_t.headnode,
 *   traced in model space at their current origin/angles; per-model solidity
 *   and contents override (respawn room visualizers use CONTENTS_REDTEAM /
 *   CONTENTS_BLUETEAM).
 *
 * Nothing in the trace path allocates: all state is preallocated scratch.
 */

import type { BspFile } from '../formats/bsp';
import { DISP_SURF_NOHULL_COLL, DISP_SURF_NORAY_COLL } from '../formats/bsp';
import { buildDisplacements, type DisplacementSurface } from '../formats/displacement';
import type { BspEntity } from '../formats/keyvalues';
import { CONTENTS_SOLID } from '../core/constants';
import type { QAngle, Vec3 } from '../core/vec';
import {
  NO_ENTITY,
  WORLD_ENTITY,
  type CollisionWorld,
  type TraceFilter,
  type TraceResult,
} from '../core/types';
import { AabbBvh } from './bvh';
import { boxPoints, convexHull, hullPlanes, type ConvexHull } from './convex';

/** SDK: DIST_EPSILON (cmodel_private.h) — traces stop 1/32 unit short of surfaces. */
export const DIST_EPSILON = 0.03125;
/** SDK: DISPCOLL_DIST_EPSILON */
const DISPCOLL_DIST_EPSILON = 0.03125;
const NEVER_UPDATED = -9999;
const DISPCOLL_INVALID_FRAC = -99999.9;
const BARY_EPS = 1e-5;

export const SOLID_NONE = 0;
export const SOLID_BSP = 1;
export const SOLID_BBOX = 2;
export const SOLID_OBB = 3;
export const SOLID_VPHYSICS = 6;

/** Surface kinds recorded for the hit. */
const SURF_KIND_NONE = 0;
const SURF_KIND_BRUSHSIDE = 1;
const SURF_KIND_PROP = 2;
const SURF_KIND_DISP = 3;

/**
 * Brush entity classes that are solid by default. Everything else (trigger_*,
 * func_respawnroom, func_regenerate, func_capturezone, func_nobuild,
 * func_areaportal, func_illusionary, func_occluder, …) is not.
 */
const SOLID_BRUSH_CLASSES = new Set([
  'func_door',
  'func_door_rotating',
  'func_brush',
  'func_wall',
  'func_wall_toggle',
  'func_breakable',
  'func_breakable_surf',
  'func_movelinear',
  'func_tracktrain',
  'func_tanktrain',
  'func_train',
  'func_rotating',
  'func_button',
  'func_rot_button',
  'func_physbox',
  'func_physbox_multiplayer',
  'func_plat',
  'func_platrot',
  'func_conveyor',
  'func_lod',
  'func_forcefield',
  'func_respawnroomvisualizer',
  'func_reflective_glass',
  'func_monitor',
  'func_pushable',
]);

export interface MapCollisionOptions {
  /** Prebuilt displacements (e.g. shared with the renderer); built here when omitted. */
  displacements?: Array<DisplacementSurface | null>;
  /**
   * Place brush entities from the entity lump: origin from "origin", solidity
   * from the class (see SOLID_BRUSH_CLASSES; func_brush "Solidity" 1 = never),
   * respawn room visualizers inert (contents 0) until the game gives them a
   * team. Angles are NOT applied (for doors/buttons "angles" is a move
   * direction); the game sets rotation with setModelTransform. Default true.
   */
  placeBrushEntities?: boolean;
}

export interface StaticPropOptions {
  /** Box for SOLID_BBOX (model hull_min/max), and the fallback when hulls are empty. */
  mins?: Vec3;
  maxs?: Vec3;
  /** Contents reported for the prop (default CONTENTS_SOLID). */
  contents?: number;
  /** Surface name reported on hits (e.g. the model's $surfaceprop). */
  surfaceName?: string;
}

/** SDK: AngleMatrix — columns forward, left, up. Row-major 3×3 into out[0..8]. */
function angleMatrix(a: QAngle, out: Float64Array): void {
  const d = Math.PI / 180;
  const sy = Math.sin(a.y * d);
  const cy = Math.cos(a.y * d);
  const sp = Math.sin(a.x * d);
  const cp = Math.cos(a.x * d);
  const sr = Math.sin(a.z * d);
  const cr = Math.cos(a.z * d);
  out[0] = cp * cy;
  out[3] = cp * sy;
  out[6] = -sp;
  out[1] = sr * sp * cy + cr * -sy;
  out[4] = sr * sp * sy + cr * cy;
  out[7] = sr * cp;
  out[2] = cr * sp * cy + -sr * -sy;
  out[5] = cr * sp * sy + -sr * cy;
  out[8] = cr * cp;
}

/** Growable Float64 storage. */
class F64List {
  data = new Float64Array(1024);
  length = 0;
  push4(a: number, b: number, c: number, d: number): void {
    if (this.length + 4 > this.data.length) {
      const n = new Float64Array(this.data.length * 2);
      n.set(this.data);
      this.data = n;
    }
    this.data[this.length++] = a;
    this.data[this.length++] = b;
    this.data[this.length++] = c;
    this.data[this.length++] = d;
  }
}

export class MapCollision implements CollisionWorld {
  readonly bsp: BspFile;

  // --- BSP tree ---
  private readonly pnx: Float64Array;
  private readonly pny: Float64Array;
  private readonly pnz: Float64Array;
  private readonly pd: Float64Array;
  private readonly ptype: Int32Array;
  private readonly nodePlane: Int32Array;
  private readonly nodeChildren: Int32Array;
  private readonly leafFirstBrush: Uint16Array;
  private readonly leafNumBrushes: Uint16Array;
  private readonly leafBrushes: Uint16Array;
  private readonly brushFirstSide: Int32Array;
  private readonly brushNumSides: Int32Array;
  private readonly brushContents: Int32Array;
  private readonly brushCheck: Int32Array;
  /** Brush sides flattened as plane sets: nx, ny, nz, d per side. */
  private readonly sidePlanes: Float64Array;
  private readonly sideBevel: Uint8Array;
  private readonly sideTexInfo: Int16Array;
  private readonly texInfoFlags: Int32Array;
  private readonly texInfoName: string[];

  // --- brush models ---
  readonly modelCount: number;
  private readonly modelHead: Int32Array;
  private readonly modelLocalBounds: Float64Array;
  private readonly modelWorldBounds: Float64Array;
  private readonly modelOrigin: Float64Array;
  private readonly modelAngles: Float64Array;
  private readonly modelMatrix: Float64Array;
  private readonly modelRotated: Uint8Array;
  private readonly modelSolid: Uint8Array;
  /** −1 = use brush contents. */
  private readonly modelContents: Int32Array;
  private readonly modelEntity: Int32Array;
  private readonly modelBrushCache: Array<Int32Array | null>;

  // --- displacements ---
  private readonly dispVerts: Float64Array;
  private readonly dispTris: Int32Array;
  private readonly dispTriPlane: Float64Array;
  private readonly dispTriOwner: Int32Array;
  private readonly dispFlags: Int32Array;
  private readonly dispContents: Int32Array;
  private readonly dispTexInfo: Int32Array;
  private readonly dispBvh: AabbBvh;
  /** Displacement surfaces used for collision (null where a base face was malformed). */
  readonly displacements: Array<DisplacementSurface | null>;

  // --- static props ---
  private readonly propPlanes = new F64List();
  private propBevel = new Uint8Array(1024);
  private convexFirst = new Int32Array(64);
  private convexCount = new Int32Array(64);
  private convexOwner = new Int32Array(64);
  private convexBounds = new Float64Array(64 * 6);
  private convexTotal = 0;
  private readonly propContents: number[] = [];
  private readonly propSurface: string[] = [];
  private propBvh: AabbBvh | null = null;
  private readonly hullCache = new WeakMap<object, ConvexHull | null>();
  private propCheck = new Int32Array(64);

  // --- trace scratch (current frame: world or a model's local space) ---
  private sx = 0;
  private sy = 0;
  private sz = 0;
  private ex = 0;
  private ey = 0;
  private ez = 0;
  private extX = 0;
  private extY = 0;
  private extZ = 0;
  private isPoint = false;
  private mask = 0;
  private contentsOverride = -1;
  private checkCount = 0;
  private fraction = 1;
  private startSolid = false;
  private allSolid = false;
  private hitNx = 0;
  private hitNy = 0;
  private hitNz = 0;
  private hitD = 0;
  private hitContents = 0;
  private hitKind = SURF_KIND_NONE;
  private hitIndex = -1;
  private hitEntity = NO_ENTITY;
  private readonly visitDisp: (t: number) => boolean;
  private readonly visitProp: (c: number) => boolean;
  private readonly visitDispTest: (t: number) => boolean;
  // displacement helper (CDispCollHelper)
  private hStart = 0;
  private hEnd = 0;
  private hNx = 0;
  private hNy = 0;
  private hNz = 0;
  private hD = 0;

  constructor(bsp: BspFile, options: MapCollisionOptions = {}) {
    this.bsp = bsp;
    const { planes, nodes, leafs, brushes, brushSides } = bsp;

    this.pnx = new Float64Array(planes.count);
    this.pny = new Float64Array(planes.count);
    this.pnz = new Float64Array(planes.count);
    this.pd = new Float64Array(planes.count);
    this.ptype = new Int32Array(planes.count);
    for (let i = 0; i < planes.count; i++) {
      this.pnx[i] = planes.normal[i * 3];
      this.pny[i] = planes.normal[i * 3 + 1];
      this.pnz[i] = planes.normal[i * 3 + 2];
      this.pd[i] = planes.dist[i];
      // Trust the axial type only when the normal really is axial.
      const t = planes.type[i];
      const n = t === 0 ? this.pnx[i] : t === 1 ? this.pny[i] : t === 2 ? this.pnz[i] : 0;
      this.ptype[i] = t < 3 && n === 1 ? t : 3;
    }
    this.nodePlane = nodes.planeNum;
    this.nodeChildren = nodes.children;
    this.leafFirstBrush = leafs.firstLeafBrush;
    this.leafNumBrushes = leafs.numLeafBrushes;
    this.leafBrushes = bsp.leafBrushes;
    this.brushFirstSide = brushes.firstSide;
    this.brushNumSides = brushes.numSides;
    this.brushContents = brushes.contents;
    this.brushCheck = new Int32Array(brushes.count);

    this.sidePlanes = new Float64Array(brushSides.count * 4);
    this.sideBevel = new Uint8Array(brushSides.count);
    this.sideTexInfo = brushSides.texInfo;
    for (let s = 0; s < brushSides.count; s++) {
      const p = brushSides.planeNum[s];
      this.sidePlanes[s * 4] = this.pnx[p];
      this.sidePlanes[s * 4 + 1] = this.pny[p];
      this.sidePlanes[s * 4 + 2] = this.pnz[p];
      this.sidePlanes[s * 4 + 3] = this.pd[p];
      this.sideBevel[s] = brushSides.bevel[s] ? 1 : 0;
    }
    this.texInfoFlags = new Int32Array(bsp.texInfo.length);
    this.texInfoName = [];
    for (let i = 0; i < bsp.texInfo.length; i++) {
      this.texInfoFlags[i] = bsp.texInfo[i].flags;
      this.texInfoName.push(bsp.texData[bsp.texInfo[i].texData]?.name ?? '');
    }

    // Models.
    const mc = bsp.models.length;
    this.modelCount = mc;
    this.modelHead = new Int32Array(mc);
    this.modelLocalBounds = new Float64Array(mc * 6);
    this.modelWorldBounds = new Float64Array(mc * 6);
    this.modelOrigin = new Float64Array(mc * 3);
    this.modelAngles = new Float64Array(mc * 3);
    this.modelMatrix = new Float64Array(mc * 9);
    this.modelRotated = new Uint8Array(mc);
    this.modelSolid = new Uint8Array(mc).fill(1);
    this.modelContents = new Int32Array(mc).fill(-1);
    this.modelEntity = new Int32Array(mc).fill(WORLD_ENTITY);
    this.modelBrushCache = new Array<Int32Array | null>(mc).fill(null);
    for (let m = 0; m < mc; m++) {
      const md = bsp.models[m];
      this.modelHead[m] = md.headNode;
      const b = this.modelLocalBounds;
      // Grow by 1 unit: dmodel_t bounds are rounded and do not include bevels.
      b[m * 6] = md.mins.x - 1;
      b[m * 6 + 1] = md.mins.y - 1;
      b[m * 6 + 2] = md.mins.z - 1;
      b[m * 6 + 3] = md.maxs.x + 1;
      b[m * 6 + 4] = md.maxs.y + 1;
      b[m * 6 + 5] = md.maxs.z + 1;
      this.modelMatrix[m * 9] = this.modelMatrix[m * 9 + 4] = this.modelMatrix[m * 9 + 8] = 1;
      this.updateModelBounds(m);
    }

    // Displacements.
    this.displacements = options.displacements ?? buildDisplacements(bsp);
    let nv = 0;
    let nt = 0;
    for (const d of this.displacements) {
      if (!d) continue;
      nv += d.positions.length / 3;
      nt += d.indices.length / 3;
    }
    this.dispVerts = new Float64Array(nv * 3);
    this.dispTris = new Int32Array(nt * 3);
    this.dispTriPlane = new Float64Array(nt * 4);
    this.dispTriOwner = new Int32Array(nt);
    const nd = this.displacements.length;
    this.dispFlags = new Int32Array(nd);
    this.dispContents = new Int32Array(nd);
    this.dispTexInfo = new Int32Array(nd);
    const triMin = new Float64Array(nt * 3);
    const triMax = new Float64Array(nt * 3);
    let vbase = 0;
    let t = 0;
    for (let di = 0; di < nd; di++) {
      const d = this.displacements[di];
      if (!d) continue;
      this.dispFlags[di] = d.flags;
      this.dispContents[di] = d.contents || CONTENTS_SOLID;
      this.dispTexInfo[di] = d.texInfo;
      this.dispVerts.set(d.positions, vbase * 3);
      for (let k = 0; k < d.indices.length; k += 3, t++) {
        const a = vbase + d.indices[k];
        const b = vbase + d.indices[k + 1];
        const c = vbase + d.indices[k + 2];
        this.dispTris[t * 3] = a;
        this.dispTris[t * 3 + 1] = b;
        this.dispTris[t * 3 + 2] = c;
        this.dispTriOwner[t] = di;
        this.computeTriPlane(t);
        const V = this.dispVerts;
        for (let ax = 0; ax < 3; ax++) {
          triMin[t * 3 + ax] = Math.min(V[a * 3 + ax], V[b * 3 + ax], V[c * 3 + ax]);
          triMax[t * 3 + ax] = Math.max(V[a * 3 + ax], V[b * 3 + ax], V[c * 3 + ax]);
        }
      }
      vbase += d.positions.length / 3;
    }
    this.dispBvh = new AabbBvh(triMin, triMax, nt, 4);

    this.visitDisp = (tri: number) => {
      this.sweepDispTri(tri);
      return false;
    };
    this.visitDispTest = (tri: number) => this.testDispTri(tri);
    this.visitProp = (c: number) => {
      if (this.propCheck[c] === this.checkCount) return false;
      this.propCheck[c] = this.checkCount;
      const contents = this.propContents[this.convexOwner[c]];
      if (!(contents & this.mask)) return false;
      this.clipConvex(
        this.propPlanes.data,
        this.propBevel,
        this.convexFirst[c],
        this.convexCount[c],
        contents,
        SURF_KIND_PROP,
        c,
      );
      return this.allSolid;
    };

    if (options.placeBrushEntities ?? true) this.placeBrushEntities(bsp.entities);
  }

  // --- setup ------------------------------------------------------------------

  private placeBrushEntities(entities: BspEntity[]): void {
    for (const e of entities) {
      const m = e.brushModelIndex;
      if (m <= 0 || m >= this.modelCount) continue;
      const cls = e.classname.toLowerCase();
      const o = e.getVec3('origin');
      if (o) this.setModelTransform(m, o, { x: 0, y: 0, z: 0 });
      let solid = SOLID_BRUSH_CLASSES.has(cls);
      if (cls === 'func_brush' && e.get('Solidity') === '1') solid = false;
      this.modelSolid[m] = solid ? 1 : 0;
      if (cls === 'func_respawnroomvisualizer') this.modelContents[m] = 0;
    }
  }

  private computeTriPlane(t: number): void {
    // SDK: CDispCollTri::CalcPlane — normal = (v2 − v0) × (v1 − v0).
    const V = this.dispVerts;
    const a = this.dispTris[t * 3] * 3;
    const b = this.dispTris[t * 3 + 1] * 3;
    const c = this.dispTris[t * 3 + 2] * 3;
    const e0x = V[b] - V[a];
    const e0y = V[b + 1] - V[a + 1];
    const e0z = V[b + 2] - V[a + 2];
    const e1x = V[c] - V[a];
    const e1y = V[c + 1] - V[a + 1];
    const e1z = V[c + 2] - V[a + 2];
    let nx = e1y * e0z - e1z * e0y;
    let ny = e1z * e0x - e1x * e0z;
    let nz = e1x * e0y - e1y * e0x;
    const l = Math.hypot(nx, ny, nz);
    if (l > 0) {
      nx /= l;
      ny /= l;
      nz /= l;
    }
    this.dispTriPlane[t * 4] = nx;
    this.dispTriPlane[t * 4 + 1] = ny;
    this.dispTriPlane[t * 4 + 2] = nz;
    this.dispTriPlane[t * 4 + 3] = nx * V[a] + ny * V[a + 1] + nz * V[a + 2];
  }

  /**
   * Adds a static prop. `hulls` are convex vertex sets in model space (xyz,
   * Source units — e.g. PHY convexes); `solidType` SOLID_VPHYSICS (6) uses
   * them, SOLID_BBOX (2) uses options.mins/maxs as an oriented box, SOLID_NONE
   * adds nothing. Returns the prop's index, or −1 when nothing was added.
   */
  addStaticProp(
    hulls: ReadonlyArray<ArrayLike<number>> | null,
    origin: Vec3,
    angles: QAngle,
    solidType: number,
    options: StaticPropOptions = {},
  ): number {
    if (solidType === SOLID_NONE) return -1;
    const sets: Array<ArrayLike<number>> = [];
    if (solidType !== SOLID_BBOX && hulls) for (const h of hulls) if (h.length >= 12) sets.push(h);
    if (sets.length === 0 && options.mins && options.maxs)
      sets.push(boxPoints(options.mins, options.maxs));
    if (sets.length === 0) return -1;

    const prop = this.propContents.length;
    this.propContents.push(options.contents ?? CONTENTS_SOLID);
    this.propSurface.push(options.surfaceName ?? '');
    const R = new Float64Array(9);
    angleMatrix(angles, R);
    let added = 0;
    for (const set of sets) {
      let hull = this.hullCache.get(set as object);
      if (hull === undefined) {
        hull = convexHull(set);
        this.hullCache.set(set as object, hull);
      }
      if (!hull) continue;
      // Hull to world space; planes and bevels are computed there so the
      // axial bevels are world-axial.
      const lp = hull.points;
      const wp = new Float64Array(lp.length);
      for (let i = 0; i < lp.length; i += 3) {
        const x = lp[i];
        const y = lp[i + 1];
        const z = lp[i + 2];
        wp[i] = R[0] * x + R[1] * y + R[2] * z + origin.x;
        wp[i + 1] = R[3] * x + R[4] * y + R[5] * z + origin.y;
        wp[i + 2] = R[6] * x + R[7] * y + R[8] * z + origin.z;
      }
      const ps = hullPlanes({ points: wp, triangles: hull.triangles });
      this.appendConvex(prop, ps.planes, ps.bevel, ps.count, wp);
      added++;
    }
    if (added === 0) {
      this.propContents.pop();
      this.propSurface.pop();
      return -1;
    }
    this.propBvh = null;
    return prop;
  }

  private appendConvex(
    prop: number,
    planes: Float64Array,
    bevel: Uint8Array,
    count: number,
    points: Float64Array,
  ): void {
    const c = this.convexTotal++;
    if (c >= this.convexFirst.length) {
      const grow = <T extends Int32Array | Float64Array>(a: T, n: number): T => {
        const b = new (a.constructor as new (n: number) => T)(n);
        b.set(a);
        return b;
      };
      const n = this.convexFirst.length * 2;
      this.convexFirst = grow(this.convexFirst, n);
      this.convexCount = grow(this.convexCount, n);
      this.convexOwner = grow(this.convexOwner, n);
      this.propCheck = grow(this.propCheck, n);
      this.convexBounds = grow(this.convexBounds, n * 6);
    }
    const first = this.propPlanes.length / 4;
    for (let i = 0; i < count; i++) {
      this.propPlanes.push4(planes[i * 4], planes[i * 4 + 1], planes[i * 4 + 2], planes[i * 4 + 3]);
    }
    if (first + count > this.propBevel.length) {
      const b = new Uint8Array(Math.max(this.propBevel.length * 2, first + count));
      b.set(this.propBevel);
      this.propBevel = b;
    }
    this.propBevel.set(bevel.subarray(0, count), first);
    this.convexFirst[c] = first;
    this.convexCount[c] = count;
    this.convexOwner[c] = prop;
    const bb = this.convexBounds;
    bb[c * 6] = bb[c * 6 + 1] = bb[c * 6 + 2] = Infinity;
    bb[c * 6 + 3] = bb[c * 6 + 4] = bb[c * 6 + 5] = -Infinity;
    for (let i = 0; i < points.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        if (points[i + k] < bb[c * 6 + k]) bb[c * 6 + k] = points[i + k];
        if (points[i + k] > bb[c * 6 + 3 + k]) bb[c * 6 + 3 + k] = points[i + k];
      }
    }
  }

  /** Number of static props added. */
  get staticPropCount(): number {
    return this.propContents.length;
  }

  private ensurePropBvh(): AabbBvh {
    if (!this.propBvh) {
      const n = this.convexTotal;
      const mins = new Float64Array(n * 3);
      const maxs = new Float64Array(n * 3);
      for (let c = 0; c < n; c++) {
        for (let k = 0; k < 3; k++) {
          mins[c * 3 + k] = this.convexBounds[c * 6 + k] - 1;
          maxs[c * 3 + k] = this.convexBounds[c * 6 + 3 + k] + 1;
        }
      }
      this.propBvh = new AabbBvh(mins, maxs, n, 2);
    }
    return this.propBvh;
  }

  // --- brush models -------------------------------------------------------------

  /** Moves/rotates brush model `modelIndex` (its local frame → world). Model 0 is the static world. */
  setModelTransform(modelIndex: number, origin: Vec3, angles: QAngle): void {
    if (modelIndex <= 0 || modelIndex >= this.modelCount) return;
    const m = modelIndex;
    this.modelOrigin[m * 3] = origin.x;
    this.modelOrigin[m * 3 + 1] = origin.y;
    this.modelOrigin[m * 3 + 2] = origin.z;
    this.modelAngles[m * 3] = angles.x;
    this.modelAngles[m * 3 + 1] = angles.y;
    this.modelAngles[m * 3 + 2] = angles.z;
    const rotated = angles.x !== 0 || angles.y !== 0 || angles.z !== 0;
    this.modelRotated[m] = rotated ? 1 : 0;
    const M = this.modelMatrix.subarray(m * 9, m * 9 + 9);
    if (rotated) angleMatrix(angles, M);
    else {
      M.fill(0);
      M[0] = M[4] = M[8] = 1;
    }
    this.updateModelBounds(m);
  }

  /** The model's current origin/angles (copies into the outs). */
  getModelTransform(modelIndex: number, origin: Vec3, angles: QAngle): void {
    const m = modelIndex;
    origin.x = this.modelOrigin[m * 3];
    origin.y = this.modelOrigin[m * 3 + 1];
    origin.z = this.modelOrigin[m * 3 + 2];
    angles.x = this.modelAngles[m * 3];
    angles.y = this.modelAngles[m * 3 + 1];
    angles.z = this.modelAngles[m * 3 + 2];
  }

  /** Whether traces hit this brush model at all. */
  setModelSolid(modelIndex: number, solid: boolean): void {
    if (modelIndex > 0 && modelIndex < this.modelCount) this.modelSolid[modelIndex] = solid ? 1 : 0;
  }

  isModelSolid(modelIndex: number): boolean {
    return this.modelSolid[modelIndex] === 1;
  }

  /** Replaces the contents of every brush in the model (null = the brushes' own). */
  setModelContents(modelIndex: number, contents: number | null): void {
    if (modelIndex > 0 && modelIndex < this.modelCount)
      this.modelContents[modelIndex] = contents === null ? -1 : (contents >>> 0) | 0;
  }

  /** The entity id reported (and passed to the trace filter) for hits on this model. */
  setModelEntity(modelIndex: number, entity: number): void {
    if (modelIndex > 0 && modelIndex < this.modelCount) this.modelEntity[modelIndex] = entity;
  }

  private updateModelBounds(m: number): void {
    const L = this.modelLocalBounds;
    const W = this.modelWorldBounds;
    const ox = this.modelOrigin[m * 3];
    const oy = this.modelOrigin[m * 3 + 1];
    const oz = this.modelOrigin[m * 3 + 2];
    if (!this.modelRotated[m]) {
      W[m * 6] = L[m * 6] + ox;
      W[m * 6 + 1] = L[m * 6 + 1] + oy;
      W[m * 6 + 2] = L[m * 6 + 2] + oz;
      W[m * 6 + 3] = L[m * 6 + 3] + ox;
      W[m * 6 + 4] = L[m * 6 + 4] + oy;
      W[m * 6 + 5] = L[m * 6 + 5] + oz;
      return;
    }
    // Rotated: bound the rotated local box (TransformAABB).
    const M = this.modelMatrix;
    const o = m * 9;
    const cx = (L[m * 6] + L[m * 6 + 3]) * 0.5;
    const cy = (L[m * 6 + 1] + L[m * 6 + 4]) * 0.5;
    const cz = (L[m * 6 + 2] + L[m * 6 + 5]) * 0.5;
    const hx = (L[m * 6 + 3] - L[m * 6]) * 0.5;
    const hy = (L[m * 6 + 4] - L[m * 6 + 1]) * 0.5;
    const hz = (L[m * 6 + 5] - L[m * 6 + 2]) * 0.5;
    const origin = [ox, oy, oz];
    for (let r = 0; r < 3; r++) {
      const wc = M[o + r * 3] * cx + M[o + r * 3 + 1] * cy + M[o + r * 3 + 2] * cz + origin[r];
      const wh =
        Math.abs(M[o + r * 3]) * hx +
        Math.abs(M[o + r * 3 + 1]) * hy +
        Math.abs(M[o + r * 3 + 2]) * hz;
      W[m * 6 + r] = wc - wh;
      W[m * 6 + 3 + r] = wc + wh;
    }
  }

  /** The brushes of a model (unique), gathered from its subtree's leaves. */
  modelBrushes(modelIndex: number): Int32Array {
    const cached = this.modelBrushCache[modelIndex];
    if (cached) return cached;
    const seen = new Set<number>();
    const stack = [this.modelHead[modelIndex]];
    while (stack.length) {
      const n = stack.pop()!;
      if (n < 0) {
        const leaf = -1 - n;
        const f = this.leafFirstBrush[leaf];
        for (let i = 0; i < this.leafNumBrushes[leaf]; i++) seen.add(this.leafBrushes[f + i]);
      } else {
        stack.push(this.nodeChildren[n * 2], this.nodeChildren[n * 2 + 1]);
      }
    }
    const out = Int32Array.from([...seen].sort((a, b) => a - b));
    this.modelBrushCache[modelIndex] = out;
    return out;
  }

  // --- queries ------------------------------------------------------------------

  /** CollisionWorld.traceLine */
  traceLine(
    start: Vec3,
    end: Vec3,
    mask: number,
    filter: TraceFilter | null,
    out: TraceResult,
  ): TraceResult {
    return this.trace(
      start.x,
      start.y,
      start.z,
      end.x,
      end.y,
      end.z,
      0,
      0,
      0,
      0,
      0,
      0,
      mask,
      filter,
      out,
    );
  }

  /** CollisionWorld.traceHull — sweeps the box [mins, maxs] (relative to the origin) from start to end. */
  traceHull(
    start: Vec3,
    end: Vec3,
    mins: Vec3,
    maxs: Vec3,
    mask: number,
    filter: TraceFilter | null,
    out: TraceResult,
  ): TraceResult {
    const ox = (mins.x + maxs.x) * 0.5;
    const oy = (mins.y + maxs.y) * 0.5;
    const oz = (mins.z + maxs.z) * 0.5;
    return this.trace(
      start.x,
      start.y,
      start.z,
      end.x,
      end.y,
      end.z,
      ox,
      oy,
      oz,
      maxs.x - ox,
      maxs.y - oy,
      maxs.z - oz,
      mask,
      filter,
      out,
    );
  }

  private trace(
    sx: number,
    sy: number,
    sz: number,
    ex: number,
    ey: number,
    ez: number,
    ox: number,
    oy: number,
    oz: number,
    hx: number,
    hy: number,
    hz: number,
    mask: number,
    filter: TraceFilter | null,
    out: TraceResult,
  ): TraceResult {
    // Centre the box (SDK: Ray_t::Init — m_Start is the box centre, m_Extents half-size).
    const wsx = sx + ox;
    const wsy = sy + oy;
    const wsz = sz + oz;
    const wex = ex + ox;
    const wey = ey + oy;
    const wez = ez + oz;
    this.isPoint = hx < 1e-6 && hy < 1e-6 && hz < 1e-6;
    this.mask = mask;
    this.fraction = 1;
    this.startSolid = false;
    this.allSolid = false;
    this.hitKind = SURF_KIND_NONE;
    this.hitIndex = -1;
    this.hitContents = 0;
    this.hitEntity = NO_ENTITY;
    this.hitNx = this.hitNy = this.hitNz = this.hitD = 0;
    this.checkCount++;

    // World (model 0), in world space.
    this.setFrame(wsx, wsy, wsz, wex, wey, wez, hx, hy, hz);
    this.contentsOverride = -1;
    const before = this.fraction;
    this.recursiveHullCheck(this.modelHead[0], 0, 1, wsx, wsy, wsz, wex, wey, wez);
    if (this.fraction < before || this.startSolid) this.hitEntity = WORLD_ENTITY;

    // Displacements.
    if (!this.allSolid && this.dispBvh.itemCount > 0) {
      const dx = wex - wsx;
      const dy = wey - wsy;
      const dz = wez - wsz;
      const e = DISPCOLL_DIST_EPSILON;
      if (dx === 0 && dy === 0 && dz === 0) {
        if (!this.isPoint)
          this.dispBvh.query(wsx, wsy, wsz, 0, 0, 0, hx + e, hy + e, hz + e, this.visitDispTest);
      } else {
        const f0 = this.fraction;
        this.dispBvh.query(wsx, wsy, wsz, dx, dy, dz, hx + e, hy + e, hz + e, this.visitDisp);
        if (this.fraction < f0) this.hitEntity = WORLD_ENTITY;
      }
      if (this.allSolid) this.hitEntity = WORLD_ENTITY;
    }

    // Static props.
    if (!this.allSolid && this.convexTotal > 0) {
      const f0 = this.fraction;
      const ss = this.startSolid;
      this.ensurePropBvh().query(
        wsx,
        wsy,
        wsz,
        wex - wsx,
        wey - wsy,
        wez - wsz,
        hx,
        hy,
        hz,
        this.visitProp,
      );
      if (this.fraction < f0 || (this.startSolid && !ss)) this.hitEntity = WORLD_ENTITY;
    }

    // Brush entity models.
    if (!this.allSolid) {
      const minX = Math.min(wsx, wex) - hx;
      const minY = Math.min(wsy, wey) - hy;
      const minZ = Math.min(wsz, wez) - hz;
      const maxX = Math.max(wsx, wex) + hx;
      const maxY = Math.max(wsy, wey) + hy;
      const maxZ = Math.max(wsz, wez) + hz;
      const W = this.modelWorldBounds;
      for (let m = 1; m < this.modelCount && !this.allSolid; m++) {
        if (!this.modelSolid[m]) continue;
        if (
          W[m * 6] > maxX ||
          W[m * 6 + 1] > maxY ||
          W[m * 6 + 2] > maxZ ||
          W[m * 6 + 3] < minX ||
          W[m * 6 + 4] < minY ||
          W[m * 6 + 5] < minZ
        ) {
          continue;
        }
        const override = this.modelContents[m];
        if (override >= 0 && !(override & mask)) continue;
        const ent = this.modelEntity[m];
        if (ent !== WORLD_ENTITY && filter && !filter(ent, mask)) continue;
        this.traceModelInternal(m, wsx, wsy, wsz, wex, wey, wez, hx, hy, hz);
      }
    }

    return this.finish(sx, sy, sz, ex, ey, ez, out);
  }

  /** Traces against one brush model only (ignores its solidity flag). */
  traceModel(
    modelIndex: number,
    start: Vec3,
    end: Vec3,
    mins: Vec3,
    maxs: Vec3,
    mask: number,
    out: TraceResult,
  ): TraceResult {
    const ox = (mins.x + maxs.x) * 0.5;
    const oy = (mins.y + maxs.y) * 0.5;
    const oz = (mins.z + maxs.z) * 0.5;
    const hx = maxs.x - ox;
    const hy = maxs.y - oy;
    const hz = maxs.z - oz;
    this.isPoint = hx < 1e-6 && hy < 1e-6 && hz < 1e-6;
    this.mask = mask;
    this.fraction = 1;
    this.startSolid = this.allSolid = false;
    this.hitKind = SURF_KIND_NONE;
    this.hitIndex = -1;
    this.hitContents = 0;
    this.hitEntity = NO_ENTITY;
    this.hitNx = this.hitNy = this.hitNz = this.hitD = 0;
    this.checkCount++;
    if (modelIndex === 0) {
      this.contentsOverride = -1;
      this.setFrame(
        start.x + ox,
        start.y + oy,
        start.z + oz,
        end.x + ox,
        end.y + oy,
        end.z + oz,
        hx,
        hy,
        hz,
      );
      this.recursiveHullCheck(
        this.modelHead[0],
        0,
        1,
        this.sx,
        this.sy,
        this.sz,
        this.ex,
        this.ey,
        this.ez,
      );
      if (this.fraction < 1 || this.startSolid) this.hitEntity = WORLD_ENTITY;
    } else {
      this.traceModelInternal(
        modelIndex,
        start.x + ox,
        start.y + oy,
        start.z + oz,
        end.x + ox,
        end.y + oy,
        end.z + oz,
        hx,
        hy,
        hz,
      );
    }
    return this.finish(start.x, start.y, start.z, end.x, end.y, end.z, out);
  }

  private traceModelInternal(
    m: number,
    wsx: number,
    wsy: number,
    wsz: number,
    wex: number,
    wey: number,
    wez: number,
    hx: number,
    hy: number,
    hz: number,
  ): void {
    const ox = this.modelOrigin[m * 3];
    const oy = this.modelOrigin[m * 3 + 1];
    const oz = this.modelOrigin[m * 3 + 2];
    const f0 = this.fraction;
    const ss0 = this.startSolid;
    this.contentsOverride = this.modelContents[m];
    if (!this.modelRotated[m]) {
      this.setFrame(wsx - ox, wsy - oy, wsz - oz, wex - ox, wey - oy, wez - oz, hx, hy, hz);
      this.recursiveHullCheck(
        this.modelHead[m],
        0,
        1,
        this.sx,
        this.sy,
        this.sz,
        this.ex,
        this.ey,
        this.ez,
      );
      if (this.fraction < f0) {
        // Plane back to world: translate.
        this.hitD += this.hitNx * ox + this.hitNy * oy + this.hitNz * oz;
        this.hitEntity = this.modelEntity[m];
      }
    } else {
      // SDK: CM_TransformedBoxTrace — rotate the ray into the model's frame; the box
      // becomes the AABB of the rotated box (conservative for non-axial angles).
      const M = this.modelMatrix;
      const o = m * 9;
      const lx0 = wsx - ox;
      const ly0 = wsy - oy;
      const lz0 = wsz - oz;
      const lx1 = wex - ox;
      const ly1 = wey - oy;
      const lz1 = wez - oz;
      // local = Mᵀ · world
      const s0 = M[o] * lx0 + M[o + 3] * ly0 + M[o + 6] * lz0;
      const s1 = M[o + 1] * lx0 + M[o + 4] * ly0 + M[o + 7] * lz0;
      const s2 = M[o + 2] * lx0 + M[o + 5] * ly0 + M[o + 8] * lz0;
      const e0 = M[o] * lx1 + M[o + 3] * ly1 + M[o + 6] * lz1;
      const e1 = M[o + 1] * lx1 + M[o + 4] * ly1 + M[o + 7] * lz1;
      const e2 = M[o + 2] * lx1 + M[o + 5] * ly1 + M[o + 8] * lz1;
      const lhx = Math.abs(M[o]) * hx + Math.abs(M[o + 3]) * hy + Math.abs(M[o + 6]) * hz;
      const lhy = Math.abs(M[o + 1]) * hx + Math.abs(M[o + 4]) * hy + Math.abs(M[o + 7]) * hz;
      const lhz = Math.abs(M[o + 2]) * hx + Math.abs(M[o + 5]) * hy + Math.abs(M[o + 8]) * hz;
      const wasPoint = this.isPoint;
      this.setFrame(s0, s1, s2, e0, e1, e2, lhx, lhy, lhz);
      this.isPoint = wasPoint;
      this.recursiveHullCheck(this.modelHead[m], 0, 1, s0, s1, s2, e0, e1, e2);
      if (this.fraction < f0) {
        const nx = M[o] * this.hitNx + M[o + 1] * this.hitNy + M[o + 2] * this.hitNz;
        const ny = M[o + 3] * this.hitNx + M[o + 4] * this.hitNy + M[o + 5] * this.hitNz;
        const nz = M[o + 6] * this.hitNx + M[o + 7] * this.hitNy + M[o + 8] * this.hitNz;
        this.hitNx = nx;
        this.hitNy = ny;
        this.hitNz = nz;
        this.hitD += nx * ox + ny * oy + nz * oz;
        this.hitEntity = this.modelEntity[m];
      }
    }
    if (this.startSolid && !ss0 && this.hitEntity === NO_ENTITY)
      this.hitEntity = this.modelEntity[m];
    this.contentsOverride = -1;
  }

  private setFrame(
    sx: number,
    sy: number,
    sz: number,
    ex: number,
    ey: number,
    ez: number,
    hx: number,
    hy: number,
    hz: number,
  ): void {
    this.sx = sx;
    this.sy = sy;
    this.sz = sz;
    this.ex = ex;
    this.ey = ey;
    this.ez = ez;
    this.extX = hx;
    this.extY = hy;
    this.extZ = hz;
  }

  private finish(
    sx: number,
    sy: number,
    sz: number,
    ex: number,
    ey: number,
    ez: number,
    out: TraceResult,
  ): TraceResult {
    const f = this.allSolid ? 0 : this.fraction;
    out.fraction = f;
    if (f === 1) {
      out.endPos.x = ex;
      out.endPos.y = ey;
      out.endPos.z = ez;
    } else {
      out.endPos.x = sx + (ex - sx) * f;
      out.endPos.y = sy + (ey - sy) * f;
      out.endPos.z = sz + (ez - sz) * f;
    }
    out.startSolid = this.startSolid;
    out.allSolid = this.allSolid;
    out.plane.normal.x = this.hitNx;
    out.plane.normal.y = this.hitNy;
    out.plane.normal.z = this.hitNz;
    out.plane.dist = this.hitD;
    out.contents = this.hitContents;
    out.hitGroup = 0;
    out.entity =
      f < 1 || this.startSolid
        ? this.hitEntity === NO_ENTITY
          ? WORLD_ENTITY
          : this.hitEntity
        : NO_ENTITY;
    let flags = 0;
    let name = '';
    switch (this.hitKind) {
      case SURF_KIND_BRUSHSIDE: {
        const ti = this.sideTexInfo[this.hitIndex];
        if (ti >= 0 && ti < this.texInfoFlags.length) {
          flags = this.texInfoFlags[ti];
          name = this.texInfoName[ti];
        }
        break;
      }
      case SURF_KIND_DISP: {
        const ti = this.dispTexInfo[this.hitIndex];
        if (ti >= 0 && ti < this.texInfoFlags.length) {
          flags = this.texInfoFlags[ti];
          name = this.texInfoName[ti];
        }
        break;
      }
      case SURF_KIND_PROP:
        name = this.propSurface[this.convexOwner[this.hitIndex]] ?? '';
        break;
    }
    out.surfaceFlags = flags;
    out.surfaceName = name;
    return out;
  }

  // --- BSP brush trace ----------------------------------------------------------

  /** SDK: CM_RecursiveHullCheck (engine) — splits the swept box down the tree. */
  private recursiveHullCheck(
    num: number,
    p1f: number,
    p2f: number,
    p1x: number,
    p1y: number,
    p1z: number,
    p2x: number,
    p2y: number,
    p2z: number,
  ): void {
    if (this.fraction <= p1f || this.allSolid) return; // already hit something nearer
    if (num < 0) {
      this.traceToLeaf(-1 - num);
      return;
    }
    const pl = this.nodePlane[num];
    const type = this.ptype[pl];
    let t1: number;
    let t2: number;
    let offset: number;
    if (type === 0) {
      t1 = p1x - this.pd[pl];
      t2 = p2x - this.pd[pl];
      offset = this.extX;
    } else if (type === 1) {
      t1 = p1y - this.pd[pl];
      t2 = p2y - this.pd[pl];
      offset = this.extY;
    } else if (type === 2) {
      t1 = p1z - this.pd[pl];
      t2 = p2z - this.pd[pl];
      offset = this.extZ;
    } else {
      const nx = this.pnx[pl];
      const ny = this.pny[pl];
      const nz = this.pnz[pl];
      t1 = nx * p1x + ny * p1y + nz * p1z - this.pd[pl];
      t2 = nx * p2x + ny * p2y + nz * p2z - this.pd[pl];
      offset = this.isPoint
        ? 0
        : Math.abs(this.extX * nx) + Math.abs(this.extY * ny) + Math.abs(this.extZ * nz);
    }
    const c0 = this.nodeChildren[num * 2];
    const c1 = this.nodeChildren[num * 2 + 1];
    if (t1 >= offset && t2 >= offset) {
      this.recursiveHullCheck(c0, p1f, p2f, p1x, p1y, p1z, p2x, p2y, p2z);
      return;
    }
    if (t1 < -offset && t2 < -offset) {
      this.recursiveHullCheck(c1, p1f, p2f, p1x, p1y, p1z, p2x, p2y, p2z);
      return;
    }
    // Put the cross point DIST_EPSILON on the near side.
    let side: number;
    let frac: number;
    let frac2: number;
    if (t1 < t2) {
      const idist = 1 / (t1 - t2);
      side = 1;
      frac2 = (t1 + offset + DIST_EPSILON) * idist;
      frac = (t1 - offset - DIST_EPSILON) * idist;
    } else if (t1 > t2) {
      const idist = 1 / (t1 - t2);
      side = 0;
      frac2 = (t1 - offset - DIST_EPSILON) * idist;
      frac = (t1 + offset + DIST_EPSILON) * idist;
    } else {
      side = 0;
      frac = 1;
      frac2 = 0;
    }
    if (frac < 0) frac = 0;
    else if (frac > 1) frac = 1;
    if (frac2 < 0) frac2 = 0;
    else if (frac2 > 1) frac2 = 1;

    const dx = p2x - p1x;
    const dy = p2y - p1y;
    const dz = p2z - p1z;
    let midf = p1f + (p2f - p1f) * frac;
    this.recursiveHullCheck(
      side === 0 ? c0 : c1,
      p1f,
      midf,
      p1x,
      p1y,
      p1z,
      p1x + frac * dx,
      p1y + frac * dy,
      p1z + frac * dz,
    );
    midf = p1f + (p2f - p1f) * frac2;
    this.recursiveHullCheck(
      side === 0 ? c1 : c0,
      midf,
      p2f,
      p1x + frac2 * dx,
      p1y + frac2 * dy,
      p1z + frac2 * dz,
      p2x,
      p2y,
      p2z,
    );
  }

  /** SDK: CM_TraceToLeaf — clip against each brush in the leaf once per trace. */
  private traceToLeaf(leaf: number): void {
    const first = this.leafFirstBrush[leaf];
    const n = this.leafNumBrushes[leaf];
    for (let i = 0; i < n; i++) {
      const b = this.leafBrushes[first + i];
      if (this.brushCheck[b] === this.checkCount) continue;
      this.brushCheck[b] = this.checkCount;
      const contents = this.contentsOverride >= 0 ? this.contentsOverride : this.brushContents[b];
      if (!(contents & this.mask)) continue;
      this.clipConvex(
        this.sidePlanes,
        this.sideBevel,
        this.brushFirstSide[b],
        this.brushNumSides[b],
        contents,
        SURF_KIND_BRUSHSIDE,
        -1,
      );
      if (this.allSolid) return;
    }
  }

  /**
   * SDK: CM_ClipBoxToBrush (engine) over a plane set (brush sides or a prop
   * hull). `surfIndex` −1 means "the plane index" (brush sides).
   */
  private clipConvex(
    planes: Float64Array,
    bevel: Uint8Array,
    first: number,
    count: number,
    contents: number,
    surfKind: number,
    surfIndex: number,
  ): void {
    if (count <= 0) return;
    let enterfrac = NEVER_UPDATED;
    let leavefrac = 1;
    let clip = -1;
    let getout = false;
    let startout = false;
    const isPoint = this.isPoint;
    const sx = this.sx;
    const sy = this.sy;
    const sz = this.sz;
    const ex = this.ex;
    const ey = this.ey;
    const ez = this.ez;
    const hx = this.extX;
    const hy = this.extY;
    const hz = this.extZ;
    for (let i = first, end = first + count; i < end; i++) {
      let dist: number;
      const nx = planes[i * 4];
      const ny = planes[i * 4 + 1];
      const nz = planes[i * 4 + 2];
      if (isPoint) {
        // Bevel planes only exist for box sweeps.
        if (bevel[i]) continue;
        dist = planes[i * 4 + 3];
      } else {
        // Push the plane out by the box's support distance.
        dist = planes[i * 4 + 3] + Math.abs(nx * hx) + Math.abs(ny * hy) + Math.abs(nz * hz);
      }
      const d1 = nx * sx + ny * sy + nz * sz - dist;
      const d2 = nx * ex + ny * ey + nz * ez - dist;
      if (d1 > 0) {
        startout = true;
        if (d2 > 0) return; // completely in front of this face: no intersection
      } else {
        if (d2 <= 0) continue; // doesn't cross the plane
        getout = true;
      }
      // Crosses the face.
      if (d1 > d2) {
        // enter
        let f = d1 - DIST_EPSILON;
        if (f < 0) f = 0;
        f /= d1 - d2;
        if (f > enterfrac) {
          enterfrac = f;
          clip = i;
        }
      } else {
        // leave
        const f = (d1 + DIST_EPSILON) / (d1 - d2);
        if (f < leavefrac) leavefrac = f;
      }
    }

    if (!startout) {
      // Original point was inside the brush.
      this.startSolid = true;
      this.hitContents = contents;
      if (!getout) {
        this.allSolid = true;
        this.fraction = 0;
      }
      return;
    }
    if (enterfrac < leavefrac && enterfrac > NEVER_UPDATED && enterfrac < this.fraction) {
      if (enterfrac < 0) enterfrac = 0;
      this.fraction = enterfrac;
      this.hitNx = planes[clip * 4];
      this.hitNy = planes[clip * 4 + 1];
      this.hitNz = planes[clip * 4 + 2];
      this.hitD = planes[clip * 4 + 3];
      this.hitContents = contents;
      this.hitKind = surfKind;
      this.hitIndex = surfIndex < 0 ? clip : surfIndex;
      this.hitEntity = NO_ENTITY; // resolved by the caller
    }
  }

  // --- displacements --------------------------------------------------------------

  /** SDK: CDispCollTree::ResolveRayPlaneIntersect */
  private resolve(
    start: number,
    end: number,
    nx: number,
    ny: number,
    nz: number,
    dist: number,
  ): boolean {
    if (start > 0 && end > 0) return false;
    if (start < 0 && end < 0) return true;
    const denom = start - end;
    const zero = denom === 0;
    if (start >= 0 && end <= 0) {
      const t = !zero ? (start - DISPCOLL_DIST_EPSILON) / denom : 0;
      if (t > this.hStart) {
        this.hStart = t;
        this.hNx = nx;
        this.hNy = ny;
        this.hNz = nz;
        this.hD = dist;
      }
    } else {
      const t = !zero ? (start + DISPCOLL_DIST_EPSILON) / denom : 0;
      if (t < this.hEnd) this.hEnd = t;
    }
    return true;
  }

  /**
   * SDK: CDispCollTree::EdgeCrossAxis for one edge (v → v + edge, off-edge
   * point o) and axis. Returns false if separated.
   */
  private edgeCrossAxis(
    axis: number,
    ex: number,
    ey: number,
    ez: number,
    vx: number,
    vy: number,
    vz: number,
    ox: number,
    oy: number,
    oz: number,
  ): boolean {
    // Plane normal = edge × axis, in the two non-axis components (SDK: Cache_EdgeCrossAxisX/Y/Z).
    let a: number; // component on OTHER_AXIS1 = (axis + 1) % 3
    let b: number; // component on OTHER_AXIS2 = (axis + 2) % 3
    let v1: number;
    let v2: number;
    let o1: number;
    let o2: number;
    let s1: number;
    let s2: number;
    let d1: number;
    let d2: number;
    let h1: number;
    let h2: number;
    if (axis === 0) {
      // (0, ez, -ey): OTHER1 = y, OTHER2 = z
      a = ez;
      b = -ey;
      v1 = vy;
      v2 = vz;
      o1 = oy;
      o2 = oz;
      s1 = this.sy;
      s2 = this.sz;
      d1 = this.ey - this.sy;
      d2 = this.ez - this.sz;
      h1 = this.extY;
      h2 = this.extZ;
    } else if (axis === 1) {
      // (-ez, 0, ex): OTHER1 = z, OTHER2 = x
      a = ex;
      b = -ez;
      v1 = vz;
      v2 = vx;
      o1 = oz;
      o2 = ox;
      s1 = this.sz;
      s2 = this.sx;
      d1 = this.ez - this.sz;
      d2 = this.ex - this.sx;
      h1 = this.extZ;
      h2 = this.extX;
    } else {
      // (ey, -ex, 0): OTHER1 = x, OTHER2 = y
      a = ey;
      b = -ex;
      v1 = vx;
      v2 = vy;
      o1 = ox;
      o2 = oy;
      s1 = this.sx;
      s2 = this.sy;
      d1 = this.ex - this.sx;
      d2 = this.ey - this.sy;
      h1 = this.extX;
      h2 = this.extY;
    }
    const l = Math.hypot(a, b);
    if (l === 0) return true;
    a /= l;
    b /= l;
    if (a === 0 || b === 0) return true; // DISPCOLL_NORMAL_UNDEF: covered by the axial planes
    let dist = a * v1 + b * v2;
    const offDist = a * o1 + b * o2;
    if (!(Math.abs(offDist - dist) < DISPCOLL_DIST_EPSILON) && offDist > dist) {
      // Triangle must be behind the plane.
      a = -a;
      b = -b;
      dist = -dist;
    }
    const ext1 = a < 0 ? h1 : -h1;
    const ext2 = b < 0 ? h2 : -h2;
    const expand = dist - (a * ext1 + b * ext2);
    const start = a * s1 + b * s2 - expand;
    const end = a * (s1 + d1) + b * (s2 + d2) - expand;
    // World-space normal for the impact plane.
    let nx = 0;
    let ny = 0;
    let nz = 0;
    if (axis === 0) {
      ny = a;
      nz = b;
    } else if (axis === 1) {
      nz = a;
      nx = b;
    } else {
      nx = a;
      ny = b;
    }
    return this.resolve(start, end, nx, ny, nz, dist);
  }

  /**
   * Ray vs displacement triangle (SDK: CDispCollTree::AABBTree_Ray →
   * IntersectRayWithTriangle, one-sided, vertices passed as 0, 2, 1). The
   * barycentric test is exact at shared edges and vertices; the hit is then
   * pulled back DIST_EPSILON along the normal like a brush hit.
   */
  private rayDispTri(t: number): void {
    const owner = this.dispTriOwner[t];
    if (!(this.dispContents[owner] & this.mask)) return;
    if (this.dispFlags[owner] & DISP_SURF_NORAY_COLL) return;
    const P = this.dispTriPlane;
    const nx = P[t * 4];
    const ny = P[t * 4 + 1];
    const nz = P[t * 4 + 2];
    const dx = this.ex - this.sx;
    const dy = this.ey - this.sy;
    const dz = this.ez - this.sz;
    const nDotD = nx * dx + ny * dy + nz * dz;
    if (nDotD >= 0) return; // back face
    const V = this.dispVerts;
    const i1 = this.dispTris[t * 3] * 3;
    const i2 = this.dispTris[t * 3 + 2] * 3;
    const i3 = this.dispTris[t * 3 + 1] * 3;
    const e1x = V[i2] - V[i1];
    const e1y = V[i2 + 1] - V[i1 + 1];
    const e1z = V[i2 + 2] - V[i1 + 2];
    const e2x = V[i3] - V[i1];
    const e2y = V[i3 + 1] - V[i1 + 1];
    const e2z = V[i3 + 2] - V[i1 + 2];
    // dirCrossEdge2 = D × E2
    const px = dy * e2z - dz * e2y;
    const py = dz * e2x - dx * e2z;
    const pz = dx * e2y - dy * e2x;
    let denom = px * e1x + py * e1y + pz * e1z;
    if (Math.abs(denom) < 1e-6) return;
    denom = 1 / denom;
    const ox = this.sx - V[i1];
    const oy = this.sy - V[i1 + 1];
    const oz = this.sz - V[i1 + 2];
    const u = (px * ox + py * oy + pz * oz) * denom;
    // A hair of slack on the barycentric bounds so a ray through a shared vertex or edge
    // cannot slip between neighbouring triangles on float rounding.
    if (u < -BARY_EPS || u > 1 + BARY_EPS) return;
    // orgCrossEdge1 = O × E1
    const qx = oy * e1z - oz * e1y;
    const qy = oz * e1x - ox * e1z;
    const qz = ox * e1y - oy * e1x;
    const v = (qx * dx + qy * dy + qz * dz) * denom;
    if (v < -BARY_EPS || u + v > 1 + BARY_EPS) return;
    const frac = (qx * e2x + qy * e2y + qz * e2z) * denom;
    if (frac < 0 || frac > 1) return;
    let f = frac + DIST_EPSILON / nDotD; // nDotD < 0: pull back 1/32 along the normal
    if (f < 0) f = 0;
    if (f < this.fraction) {
      this.fraction = f;
      this.hitNx = nx;
      this.hitNy = ny;
      this.hitNz = nz;
      this.hitD = P[t * 4 + 3];
      this.hitContents = this.dispContents[owner];
      this.hitKind = SURF_KIND_DISP;
      this.hitIndex = owner;
    }
  }

  /** SDK: CDispCollTree::SweepAABBTriIntersect */
  private sweepDispTri(t: number): void {
    const owner = this.dispTriOwner[t];
    if (!(this.dispContents[owner] & this.mask)) return;
    if (this.isPoint) {
      this.rayDispTri(t);
      return;
    }
    if (this.dispFlags[owner] & DISP_SURF_NOHULL_COLL) return;
    const P = this.dispTriPlane;
    const nx = P[t * 4];
    const ny = P[t * 4 + 1];
    const nz = P[t * 4 + 2];
    const nd = P[t * 4 + 3];
    const dx = this.ex - this.sx;
    const dy = this.ey - this.sy;
    const dz = this.ez - this.sz;
    // Objects must be moving toward one another (one-sided).
    if (nx * dx + ny * dy + nz * dz > DISPCOLL_DIST_EPSILON) return;
    this.hStart = DISPCOLL_INVALID_FRAC;
    this.hEnd = 1;
    const V = this.dispVerts;
    const ia = this.dispTris[t * 3] * 3;
    const ib = this.dispTris[t * 3 + 1] * 3;
    const ic = this.dispTris[t * 3 + 2] * 3;

    // Axis planes (z, y, x) — SDK: AxisPlanesXYZ.
    for (let axis = 2; axis >= 0; axis--) {
      const s = axis === 0 ? this.sx : axis === 1 ? this.sy : this.sz;
      const d = axis === 0 ? dx : axis === 1 ? dy : dz;
      const h = axis === 0 ? this.extX : axis === 1 ? this.extY : this.extZ;
      const va = V[ia + axis];
      const vb = V[ib + axis];
      const vc = V[ic + axis];
      const mn = va < vb ? (va < vc ? va : vc) : vb < vc ? vb : vc;
      const mx = va > vb ? (va > vc ? va : vc) : vb > vc ? vb : vc;
      let st = mn - h - s;
      if (
        !this.resolve(st, st - d, axis === 0 ? -1 : 0, axis === 1 ? -1 : 0, axis === 2 ? -1 : 0, mn)
      )
        return;
      st = s - (mx + h);
      if (!this.resolve(st, st + d, axis === 0 ? 1 : 0, axis === 1 ? 1 : 0, axis === 2 ? 1 : 0, mx))
        return;
    }

    // Edge × axis planes: edges (v1−v0, on v0, off v2), (v2−v1, on v1, off v0), (v0−v2, on v2, off v1).
    const ax = V[ia];
    const ay = V[ia + 1];
    const az = V[ia + 2];
    const bx = V[ib];
    const by = V[ib + 1];
    const bz = V[ib + 2];
    const cx = V[ic];
    const cy = V[ic + 1];
    const cz = V[ic + 2];
    for (let axis = 0; axis < 3; axis++) {
      if (!this.edgeCrossAxis(axis, bx - ax, by - ay, bz - az, ax, ay, az, cx, cy, cz)) return;
      if (!this.edgeCrossAxis(axis, cx - bx, cy - by, cz - bz, bx, by, bz, ax, ay, az)) return;
      if (!this.edgeCrossAxis(axis, ax - cx, ay - cy, az - cz, cx, cy, cz, bx, by, bz)) return;
    }

    // Face plane (SDK: FacePlane with CalcClosestExtents).
    const cex = nx < 0 ? this.extX : -this.extX;
    const cey = ny < 0 ? this.extY : -this.extY;
    const cez = nz < 0 ? this.extZ : -this.extZ;
    const expand = nd - (nx * cex + ny * cey + nz * cez);
    const fs = nx * this.sx + ny * this.sy + nz * this.sz - expand;
    const fe = nx * this.ex + ny * this.ey + nz * this.ez - expand;
    if (!this.resolve(fs, fe, nx, ny, nz, nd)) return;

    if (this.hStart < this.hEnd || Math.abs(this.hStart - this.hEnd) < 0.001) {
      if (this.hStart !== DISPCOLL_INVALID_FRAC && this.hStart < this.fraction) {
        this.fraction = this.hStart < 0 ? 0 : this.hStart;
        this.hitNx = this.hNx;
        this.hitNy = this.hNy;
        this.hitNz = this.hNz;
        this.hitD = this.hD;
        this.hitContents = this.dispContents[owner];
        this.hitKind = SURF_KIND_DISP;
        this.hitIndex = owner;
      }
    }
  }

  /**
   * Position test of the box against a displacement triangle (SDK:
   * IsBoxIntersectingTriangle, a separating-axis test). Marks startsolid/allsolid.
   */
  private testDispTri(t: number): boolean {
    const owner = this.dispTriOwner[t];
    if (!(this.dispContents[owner] & this.mask)) return false;
    if (this.dispFlags[owner] & DISP_SURF_NOHULL_COLL) return false;
    const V = this.dispVerts;
    const ia = this.dispTris[t * 3] * 3;
    const ib = this.dispTris[t * 3 + 1] * 3;
    const ic = this.dispTris[t * 3 + 2] * 3;
    const hx = this.extX;
    const hy = this.extY;
    const hz = this.extZ;
    // Triangle relative to the box centre.
    const v0x = V[ia] - this.sx;
    const v0y = V[ia + 1] - this.sy;
    const v0z = V[ia + 2] - this.sz;
    const v1x = V[ib] - this.sx;
    const v1y = V[ib + 1] - this.sy;
    const v1z = V[ib + 2] - this.sz;
    const v2x = V[ic] - this.sx;
    const v2y = V[ic + 1] - this.sy;
    const v2z = V[ic + 2] - this.sz;
    // Box axes.
    if (Math.max(v0x, v1x, v2x) < -hx || Math.min(v0x, v1x, v2x) > hx) return false;
    if (Math.max(v0y, v1y, v2y) < -hy || Math.min(v0y, v1y, v2y) > hy) return false;
    if (Math.max(v0z, v1z, v2z) < -hz || Math.min(v0z, v1z, v2z) > hz) return false;
    // Triangle normal.
    const P = this.dispTriPlane;
    const nx = P[t * 4];
    const ny = P[t * 4 + 1];
    const nz = P[t * 4 + 2];
    const dn = nx * v0x + ny * v0y + nz * v0z;
    const rn = hx * Math.abs(nx) + hy * Math.abs(ny) + hz * Math.abs(nz);
    if (Math.abs(dn) > rn) return false;
    // Edge × box-axis.
    const edges = this.edgeScratch;
    edges[0] = v1x - v0x;
    edges[1] = v1y - v0y;
    edges[2] = v1z - v0z;
    edges[3] = v2x - v1x;
    edges[4] = v2y - v1y;
    edges[5] = v2z - v1z;
    edges[6] = v0x - v2x;
    edges[7] = v0y - v2y;
    edges[8] = v0z - v2z;
    for (let e = 0; e < 3; e++) {
      const fx = edges[e * 3];
      const fy = edges[e * 3 + 1];
      const fz = edges[e * 3 + 2];
      for (let axis = 0; axis < 3; axis++) {
        // a = axis × f
        const axx = axis === 0 ? 0 : axis === 1 ? fz : -fy;
        const axy = axis === 0 ? -fz : axis === 1 ? 0 : fx;
        const axz = axis === 0 ? fy : axis === 1 ? -fx : 0;
        const p0 = axx * v0x + axy * v0y + axz * v0z;
        const p1 = axx * v1x + axy * v1y + axz * v1z;
        const p2 = axx * v2x + axy * v2y + axz * v2z;
        const r = hx * Math.abs(axx) + hy * Math.abs(axy) + hz * Math.abs(axz);
        if (Math.min(p0, p1, p2) > r || Math.max(p0, p1, p2) < -r) return false;
      }
    }
    this.startSolid = true;
    this.allSolid = true;
    this.fraction = 0;
    this.hitContents = this.dispContents[owner];
    this.hitKind = SURF_KIND_DISP;
    this.hitIndex = owner;
    return true;
  }

  // --- contents / triggers ------------------------------------------------------

  /** Whether point (in the model's local frame) is inside brush b (non-bevel sides). */
  private pointInBrush(b: number, x: number, y: number, z: number): boolean {
    const f = this.brushFirstSide[b];
    const n = this.brushNumSides[b];
    if (n <= 0) return false;
    const P = this.sidePlanes;
    for (let i = f; i < f + n; i++) {
      if (P[i * 4] * x + P[i * 4 + 1] * y + P[i * 4 + 2] * z - P[i * 4 + 3] > 0) return false;
    }
    return true;
  }

  /** Contents at a point from one model's tree: OR of the brushes containing it. */
  private modelPointContents(m: number, x: number, y: number, z: number): number {
    let n = this.modelHead[m];
    while (n >= 0) {
      const pl = this.nodePlane[n];
      const d = this.pnx[pl] * x + this.pny[pl] * y + this.pnz[pl] * z - this.pd[pl];
      n = this.nodeChildren[n * 2 + (d >= 0 ? 0 : 1)];
    }
    const leaf = -1 - n;
    let contents = 0;
    const first = this.leafFirstBrush[leaf];
    for (let i = 0; i < this.leafNumBrushes[leaf]; i++) {
      const b = this.leafBrushes[first + i];
      if (this.pointInBrush(b, x, y, z)) contents |= this.brushContents[b];
    }
    return contents;
  }

  /** CollisionWorld.pointContents — the world plus solid brush models at their transforms. */
  pointContents(p: Vec3): number {
    let contents = this.modelPointContents(0, p.x, p.y, p.z);
    for (let m = 1; m < this.modelCount; m++) {
      if (!this.modelSolid[m]) continue;
      const W = this.modelWorldBounds;
      if (
        p.x < W[m * 6] ||
        p.y < W[m * 6 + 1] ||
        p.z < W[m * 6 + 2] ||
        p.x > W[m * 6 + 3] ||
        p.y > W[m * 6 + 4] ||
        p.z > W[m * 6 + 5]
      ) {
        continue;
      }
      const l = this.toLocal(m, p.x, p.y, p.z);
      const c = this.modelPointContents(m, l[0], l[1], l[2]);
      if (c) contents |= this.modelContents[m] >= 0 ? this.modelContents[m] : c;
    }
    return contents;
  }

  private readonly localScratch: [number, number, number] = [0, 0, 0];
  private readonly edgeScratch = new Float64Array(9);

  private toLocal(m: number, x: number, y: number, z: number): [number, number, number] {
    const lx = x - this.modelOrigin[m * 3];
    const ly = y - this.modelOrigin[m * 3 + 1];
    const lz = z - this.modelOrigin[m * 3 + 2];
    const o = this.localScratch;
    if (!this.modelRotated[m]) {
      o[0] = lx;
      o[1] = ly;
      o[2] = lz;
    } else {
      const M = this.modelMatrix;
      const b = m * 9;
      o[0] = M[b] * lx + M[b + 3] * ly + M[b + 6] * lz;
      o[1] = M[b + 1] * lx + M[b + 4] * ly + M[b + 7] * lz;
      o[2] = M[b + 2] * lx + M[b + 5] * ly + M[b + 8] * lz;
    }
    return o;
  }

  /** Whether `p` is inside any brush of model `modelIndex` (at its current transform). Ignores solidity. */
  pointInModel(modelIndex: number, p: Vec3): boolean {
    const l = this.toLocal(modelIndex, p.x, p.y, p.z);
    const brushes = this.modelBrushes(modelIndex);
    for (let i = 0; i < brushes.length; i++)
      if (this.pointInBrush(brushes[i], l[0], l[1], l[2])) return true;
    return false;
  }

  /**
   * Whether the world-space box [mins, maxs] touches any brush of the model
   * (triggers are the union of their brushes). For rotated models the box is
   * taken as the AABB of its rotation into model space. Ignores solidity.
   */
  boxTouchesModel(modelIndex: number, mins: Vec3, maxs: Vec3): boolean {
    const m = modelIndex;
    const W = this.modelWorldBounds;
    if (
      mins.x > W[m * 6 + 3] ||
      mins.y > W[m * 6 + 4] ||
      mins.z > W[m * 6 + 5] ||
      maxs.x < W[m * 6] ||
      maxs.y < W[m * 6 + 1] ||
      maxs.z < W[m * 6 + 2]
    ) {
      return false;
    }
    let hx = (maxs.x - mins.x) * 0.5;
    let hy = (maxs.y - mins.y) * 0.5;
    let hz = (maxs.z - mins.z) * 0.5;
    const l = this.toLocal(
      m,
      (mins.x + maxs.x) * 0.5,
      (mins.y + maxs.y) * 0.5,
      (mins.z + maxs.z) * 0.5,
    );
    const cx = l[0];
    const cy = l[1];
    const cz = l[2];
    if (this.modelRotated[m]) {
      const M = this.modelMatrix;
      const o = m * 9;
      const lx = Math.abs(M[o]) * hx + Math.abs(M[o + 3]) * hy + Math.abs(M[o + 6]) * hz;
      const ly = Math.abs(M[o + 1]) * hx + Math.abs(M[o + 4]) * hy + Math.abs(M[o + 7]) * hz;
      const lz = Math.abs(M[o + 2]) * hx + Math.abs(M[o + 5]) * hy + Math.abs(M[o + 8]) * hz;
      hx = lx;
      hy = ly;
      hz = lz;
    }
    const brushes = this.modelBrushes(m);
    const P = this.sidePlanes;
    outer: for (let i = 0; i < brushes.length; i++) {
      const b = brushes[i];
      const f = this.brushFirstSide[b];
      const n = this.brushNumSides[b];
      if (n <= 0) continue;
      for (let s = f; s < f + n; s++) {
        const nx = P[s * 4];
        const ny = P[s * 4 + 1];
        const nz = P[s * 4 + 2];
        const d =
          nx * cx +
          ny * cy +
          nz * cz -
          P[s * 4 + 3] -
          (Math.abs(nx) * hx + Math.abs(ny) * hy + Math.abs(nz) * hz);
        if (d >= 0) continue outer; // separated by this side (touching counts as outside)
      }
      return true;
    }
    return false;
  }

  /** Local-space bounds of a brush model (dmodel_t mins/maxs). */
  modelBounds(modelIndex: number): { mins: Vec3; maxs: Vec3 } {
    const md = this.bsp.models[modelIndex];
    return { mins: { ...md.mins }, maxs: { ...md.maxs } };
  }
}
