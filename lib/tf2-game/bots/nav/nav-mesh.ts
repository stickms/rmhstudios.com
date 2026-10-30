/**
 * The navigation mesh the bots path over: rectangular walkable areas on a
 * grid, the connections between them (walk / jump / drop), TF attributes
 * (spawn rooms, capture areas, doors, water, crouch-only, pickups), the
 * points of interest the generator found (spawns, control points, flags…)
 * and a coarse potentially-visible-set between groups of areas ("sectors").
 *
 * The SDK's CNavMesh / CNavArea / CTFNavArea fill the same role; this is an
 * independent, compact layout: struct-of-arrays, no per-area objects, so the
 * hub worker holds a map's mesh in a few hundred kilobytes and A* runs over
 * typed arrays without allocating.
 *
 * Areas are axis-aligned rectangles (in grid cells of `cellSize`) whose
 * floor is a plane: z = cz + dzdx·(x − centre x) + dzdy·(y − centre y).
 *
 * Environment-agnostic, deterministic, no allocation in queries.
 */

import type { Vec3 } from '../../core/vec';

// ─── Attributes ─────────────────────────────────────────────────────────────

/** The standing hull does not fit: crouch through. */
export const NAV_CROUCH = 1 << 0;
/** Feet in water. */
export const NAV_WATER = 1 << 1;
/** Inside a RED / BLU func_respawnroom. */
export const NAV_RED_SPAWN = 1 << 2;
export const NAV_BLUE_SPAWN = 1 << 3;
/** Inside a trigger_capture_area. */
export const NAV_CAPTURE = 1 << 4;
/** Inside a func_regenerate (resupply cabinet). */
export const NAV_RESUPPLY = 1 << 5;
/** Holds a health kit / an ammo pack. */
export const NAV_HEALTH = 1 << 6;
export const NAV_AMMO = 1 << 7;
/** Overlaps a door or toggled brush (see `blocker`): checked at runtime. */
export const NAV_DOOR = 1 << 8;
/** Head under water (swimming). */
export const NAV_DEEP_WATER = 1 << 9;
/** Near a payload track (path_track). */
export const NAV_CART_PATH = 1 << 10;
/** Inside a func_capturezone (CTF). */
export const NAV_CAPTURE_ZONE = 1 << 11;

/** Connection kinds, easiest first. */
export const CONN_WALK = 0;
/** Needs a (crouch-)jump: a ledge up to the jump height, or an obstacle to hop. */
export const CONN_JUMP = 1;
/** A drop: walk off a ledge (one way when too high to jump back). */
export const CONN_DROP = 2;

/** Points of interest. */
export const POI_SPAWN = 0;
export const POI_CONTROL_POINT = 1;
export const POI_CAPTURE_AREA = 2;
export const POI_FLAG = 3;
export const POI_CAPTURE_ZONE = 4;
export const POI_PATH_TRACK = 5;
export const POI_HEALTH = 6;
export const POI_AMMO = 7;
export const POI_RESUPPLY = 8;
/** CS:GO: a bomb site (func_bomb_target), its centre. */
export const POI_BOMB_TARGET = 9;
/** CS:GO: a buy zone (func_buyzone), its centre; `team` is the zone's TeamNum. */
export const POI_BUY_ZONE = 10;

export interface NavPoi {
  kind: number;
  /** TEAM_* (0 = any). */
  team: number;
  /** Targetname (spawn: its control point; capture area: area_cap_point). */
  name: string;
  /** point_index for control points; pickup size 1 small … 3 full; −1 otherwise. */
  index: number;
  pos: Vec3;
  /** Nearest area (−1 when the generator found none). */
  area: number;
}

/** A door or toggled brush that may block areas at runtime (CTFNavMesh::ComputeBlockedAreas). */
export interface NavBlocker {
  /** Brush model index (`*N`). */
  model: number;
  /** 0 = func_door*, 1 = func_brush and other toggled walls. */
  kind: number;
  /** A trigger_multiple overlaps the door: it opens on approach. */
  triggerControlled: boolean;
  /** The trigger's filter_activator_tfteam team (0 = anyone). */
  ownerTeam: number;
}

export const BLOCKER_DOOR = 0;
export const BLOCKER_BRUSH = 1;

/** The arrays a mesh is made of (what the generator produces and nav.bin stores). */
export interface NavMeshData {
  cellSize: number;
  areaCount: number;
  /** Grid cell bounds, inclusive. */
  gx0: Int16Array;
  gy0: Int16Array;
  gx1: Int16Array;
  gy1: Int16Array;
  cz: Float32Array;
  dzdx: Float32Array;
  dzdy: Float32Array;
  attrs: Uint32Array;
  /** Index into `blockers`, −1 none. */
  blocker: Int16Array;
  /** Visibility sector. */
  sector: Uint16Array;
  /** CSR: connections of area a are connStart[a] … connStart[a+1]−1. */
  connStart: Uint32Array;
  connTo: Uint32Array;
  connType: Uint8Array;
  /** Per connection: portal segment ax, ay, bx, by and the floor z there. */
  portal: Float32Array;
  sectorCount: number;
  /** sectorCount × sectorCount bits, row-major. */
  vis: Uint8Array;
  pois: NavPoi[];
  blockers: NavBlocker[];
}

/** Grid cell of the area lookup, in units. */
const LOOKUP_CELL = 128;

export class NavMesh implements NavMeshData {
  readonly cellSize: number;
  readonly areaCount: number;
  readonly gx0: Int16Array;
  readonly gy0: Int16Array;
  readonly gx1: Int16Array;
  readonly gy1: Int16Array;
  readonly cz: Float32Array;
  readonly dzdx: Float32Array;
  readonly dzdy: Float32Array;
  readonly attrs: Uint32Array;
  readonly blocker: Int16Array;
  readonly sector: Uint16Array;
  readonly connStart: Uint32Array;
  readonly connTo: Uint32Array;
  readonly connType: Uint8Array;
  readonly portal: Float32Array;
  readonly sectorCount: number;
  readonly vis: Uint8Array;
  readonly pois: NavPoi[];
  readonly blockers: NavBlocker[];

  /** Area extents in units (derived). */
  readonly minX: Float32Array;
  readonly minY: Float32Array;
  readonly maxX: Float32Array;
  readonly maxY: Float32Array;
  /** Centre x/y. */
  readonly cx: Float32Array;
  readonly cy: Float32Array;

  // Lookup grid (CSR of area ids per cell).
  private readonly lookX0: number;
  private readonly lookY0: number;
  private readonly lookW: number;
  private readonly lookH: number;
  private readonly lookStart: Uint32Array;
  private readonly lookAreas: Uint32Array;
  private readonly rowBytes: number;

  constructor(d: NavMeshData) {
    this.cellSize = d.cellSize;
    this.areaCount = d.areaCount;
    this.gx0 = d.gx0;
    this.gy0 = d.gy0;
    this.gx1 = d.gx1;
    this.gy1 = d.gy1;
    this.cz = d.cz;
    this.dzdx = d.dzdx;
    this.dzdy = d.dzdy;
    this.attrs = d.attrs;
    this.blocker = d.blocker;
    this.sector = d.sector;
    this.connStart = d.connStart;
    this.connTo = d.connTo;
    this.connType = d.connType;
    this.portal = d.portal;
    this.sectorCount = d.sectorCount;
    this.vis = d.vis;
    this.pois = d.pois;
    this.blockers = d.blockers;
    this.rowBytes = (d.sectorCount + 7) >> 3;

    const n = d.areaCount;
    const h = d.cellSize * 0.5;
    this.minX = new Float32Array(n);
    this.minY = new Float32Array(n);
    this.maxX = new Float32Array(n);
    this.maxY = new Float32Array(n);
    this.cx = new Float32Array(n);
    this.cy = new Float32Array(n);
    let bx0 = Infinity;
    let by0 = Infinity;
    let bx1 = -Infinity;
    let by1 = -Infinity;
    for (let a = 0; a < n; a++) {
      this.minX[a] = d.gx0[a] * d.cellSize - h;
      this.minY[a] = d.gy0[a] * d.cellSize - h;
      this.maxX[a] = d.gx1[a] * d.cellSize + h;
      this.maxY[a] = d.gy1[a] * d.cellSize + h;
      this.cx[a] = (this.minX[a] + this.maxX[a]) * 0.5;
      this.cy[a] = (this.minY[a] + this.maxY[a]) * 0.5;
      if (this.minX[a] < bx0) bx0 = this.minX[a];
      if (this.minY[a] < by0) by0 = this.minY[a];
      if (this.maxX[a] > bx1) bx1 = this.maxX[a];
      if (this.maxY[a] > by1) by1 = this.maxY[a];
    }
    if (n === 0) bx0 = by0 = bx1 = by1 = 0;
    this.lookX0 = Math.floor(bx0 / LOOKUP_CELL);
    this.lookY0 = Math.floor(by0 / LOOKUP_CELL);
    this.lookW = Math.floor(bx1 / LOOKUP_CELL) - this.lookX0 + 1;
    this.lookH = Math.floor(by1 / LOOKUP_CELL) - this.lookY0 + 1;
    const cells = this.lookW * this.lookH;
    const counts = new Uint32Array(cells + 1);
    const forCells = (a: number, fn: (c: number) => void): void => {
      const x0 = Math.floor(this.minX[a] / LOOKUP_CELL) - this.lookX0;
      const x1 = Math.floor((this.maxX[a] - 0.01) / LOOKUP_CELL) - this.lookX0;
      const y0 = Math.floor(this.minY[a] / LOOKUP_CELL) - this.lookY0;
      const y1 = Math.floor((this.maxY[a] - 0.01) / LOOKUP_CELL) - this.lookY0;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) fn(y * this.lookW + x);
    };
    for (let a = 0; a < n; a++) forCells(a, (c) => counts[c + 1]++);
    for (let c = 0; c < cells; c++) counts[c + 1] += counts[c];
    this.lookStart = counts;
    this.lookAreas = new Uint32Array(counts[cells]);
    const fill = counts.slice(0, cells);
    for (let a = 0; a < n; a++) forCells(a, (c) => (this.lookAreas[fill[c]++] = a));
  }

  /** Floor height of area `a` at (x, y) (the plane extended past the edges). */
  zAt(a: number, x: number, y: number): number {
    return this.cz[a] + this.dzdx[a] * (x - this.cx[a]) + this.dzdy[a] * (y - this.cy[a]);
  }

  /** The area's centre on its floor. */
  center(a: number, out: Vec3): Vec3 {
    out.x = this.cx[a];
    out.y = this.cy[a];
    out.z = this.cz[a];
    return out;
  }

  contains2D(a: number, x: number, y: number, tolerance = 0): boolean {
    return (
      x >= this.minX[a] - tolerance &&
      x <= this.maxX[a] + tolerance &&
      y >= this.minY[a] - tolerance &&
      y <= this.maxY[a] + tolerance
    );
  }

  /**
   * The area a point stands in: one whose rectangle holds (x, y) with its
   * floor at most `above` below the point's feet and at most `below` above
   * them, the highest such floor (CNavMesh::GetNavArea). −1 when none.
   */
  areaAt(x: number, y: number, z: number, above = 120, below = 30): number {
    const cxi = Math.floor(x / LOOKUP_CELL) - this.lookX0;
    const cyi = Math.floor(y / LOOKUP_CELL) - this.lookY0;
    if (cxi < 0 || cyi < 0 || cxi >= this.lookW || cyi >= this.lookH) return -1;
    const c = cyi * this.lookW + cxi;
    let best = -1;
    let bestZ = -Infinity;
    for (let i = this.lookStart[c]; i < this.lookStart[c + 1]; i++) {
      const a = this.lookAreas[i];
      if (x < this.minX[a] || x > this.maxX[a] || y < this.minY[a] || y > this.maxY[a]) continue;
      const fz = this.zAt(a, x, y);
      if (fz > z + below || fz < z - above) continue;
      if (fz > bestZ) {
        bestZ = fz;
        best = a;
      }
    }
    return best;
  }

  /**
   * The nearest area to a point within `radius` (CNavMesh::GetNearestNavArea,
   * without the LOS check): areaAt first, then the closest rectangle by 3D
   * distance to its floor.
   */
  nearestArea(x: number, y: number, z: number, radius = 300): number {
    const hit = this.areaAt(x, y, z);
    if (hit >= 0) return hit;
    const r = Math.ceil(radius / LOOKUP_CELL);
    const cxi = Math.floor(x / LOOKUP_CELL) - this.lookX0;
    const cyi = Math.floor(y / LOOKUP_CELL) - this.lookY0;
    let best = -1;
    let bestD = radius * radius;
    for (let yy = cyi - r; yy <= cyi + r; yy++) {
      if (yy < 0 || yy >= this.lookH) continue;
      for (let xx = cxi - r; xx <= cxi + r; xx++) {
        if (xx < 0 || xx >= this.lookW) continue;
        const c = yy * this.lookW + xx;
        for (let i = this.lookStart[c]; i < this.lookStart[c + 1]; i++) {
          const a = this.lookAreas[i];
          const px = x < this.minX[a] ? this.minX[a] : x > this.maxX[a] ? this.maxX[a] : x;
          const py = y < this.minY[a] ? this.minY[a] : y > this.maxY[a] ? this.maxY[a] : y;
          const pz = this.zAt(a, px, py);
          const dx = px - x;
          const dy = py - y;
          // Floors above the point count double (prefer the ground under us).
          const dz = pz > z ? (pz - z) * 2 : z - pz;
          const d = dx * dx + dy * dy + dz * dz;
          if (d < bestD) {
            bestD = d;
            best = a;
          }
        }
      }
    }
    return best;
  }

  /** Calls `fn` for every area whose rectangle overlaps the box (2D) with a floor in [zMin, zMax]. */
  forAreasInBox(
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
    zMin: number,
    zMax: number,
    fn: (a: number) => void,
  ): void {
    const x0 = Math.max(0, Math.floor(minX / LOOKUP_CELL) - this.lookX0);
    const x1 = Math.min(this.lookW - 1, Math.floor(maxX / LOOKUP_CELL) - this.lookX0);
    const y0 = Math.max(0, Math.floor(minY / LOOKUP_CELL) - this.lookY0);
    const y1 = Math.min(this.lookH - 1, Math.floor(maxY / LOOKUP_CELL) - this.lookY0);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const c = y * this.lookW + x;
        for (let i = this.lookStart[c]; i < this.lookStart[c + 1]; i++) {
          const a = this.lookAreas[i];
          if (
            this.maxX[a] < minX ||
            this.minX[a] > maxX ||
            this.maxY[a] < minY ||
            this.minY[a] > maxY
          )
            continue;
          // An area spanning several cells is reported once: only from its first overlapped cell.
          const fx = Math.max(x0, Math.floor(this.minX[a] / LOOKUP_CELL) - this.lookX0);
          const fy = Math.max(y0, Math.floor(this.minY[a] / LOOKUP_CELL) - this.lookY0);
          if (fx !== x || fy !== y) continue;
          if (this.cz[a] < zMin || this.cz[a] > zMax) continue;
          fn(a);
        }
      }
    }
  }

  /** Potentially visible (sector PVS, symmetric). */
  isPotentiallyVisible(a: number, b: number): boolean {
    const sa = this.sector[a];
    const sb = this.sector[b];
    if (sa === sb) return true;
    return (this.vis[sa * this.rowBytes + (sb >> 3)] & (1 << (sb & 7))) !== 0;
  }

  /** Sector-level test (for callers iterating sectors). */
  sectorsVisible(sa: number, sb: number): boolean {
    if (sa === sb) return true;
    return (this.vis[sa * this.rowBytes + (sb >> 3)] & (1 << (sb & 7))) !== 0;
  }

  /** Area size in square units. */
  areaSize(a: number): number {
    return (this.maxX[a] - this.minX[a]) * (this.maxY[a] - this.minY[a]);
  }

  /** The connection index from a to b, or −1. */
  connectionBetween(a: number, b: number): number {
    for (let c = this.connStart[a]; c < this.connStart[a + 1]; c++)
      if (this.connTo[c] === b) return c;
    return -1;
  }

  /** Total connection count. */
  get connectionCount(): number {
    return this.connTo.length;
  }
}
