/**
 * The SP world's `CollisionWorld`: what player movement, +use, bullets and
 * actors trace against.
 *
 *   1. the map (MapCollision: world brushes, displacements, static props and
 *      brush entities at their current pose), with a portal's wall carved out
 *      for a box that is passing through it (see `PortalCarve`);
 *   2. rigid bodies (dynamic props and solid prop_dynamics) through their
 *      convex hulls' plane sets (PhysicsWorld.traceBodies);
 *   3. box entities (actors and other solid point entities) as AABBs.
 *
 * The trace filter (entity id, mask) → boolean decides per entity, as in the
 * engine's ITraceFilter.
 */

import type { CollisionWorld, TraceFilter, TraceResult } from '../../tf2-game/core/types';
import { NO_ENTITY } from '../../tf2-game/core/types';
import { vec3, type Vec3 } from '../../tf2-game/core/vec';
import type { MapCollision } from '../../tf2-game/world/map-collision';
import type { PhysicsWorld } from '../physics/physics-world';
import { clipBoxToAabb } from './convex-trace';

/** A solid box entity traces can hit (actors, the player for other movers). */
export interface BoxSolid {
  readonly id: number;
  readonly origin: Vec3;
  readonly mins: Vec3;
  readonly maxs: Vec3;
  removed: boolean;
  /** CONTENTS_* reported on a hit. */
  contents: number;
  isSolid(): boolean;
}

/**
 * Portal passage for box traces (implemented by the portal service). When a
 * box is inside a linked portal's mouth, the map trace runs with the hull cut
 * off at the portal plane (so the wall behind does not block) and the portal's
 * frame is traced separately.
 */
export interface PortalCarve {
  /**
   * Returns the carving portal (≥ 0) and writes the hull to use for the map
   * trace into `hullMins/hullMaxs`, or −1 when no portal applies.
   */
  carveHull(start: Vec3, end: Vec3, mins: Vec3, maxs: Vec3, hullMins: Vec3, hullMaxs: Vec3): number;
  /** Clips the full hull against the portal's frame (the hole's sides behind the wall). */
  clipFrame(portal: number, start: Vec3, end: Vec3, mins: Vec3, maxs: Vec3, out: TraceResult): void;
}

const ZERO = Object.freeze(vec3());

export class SpCollision implements CollisionWorld {
  readonly map: MapCollision;
  physics: PhysicsWorld | null = null;
  portals: PortalCarve | null = null;
  /** Portal carving is applied only to hull traces made while this is set (player and prop movement). */
  carving = false;
  readonly boxes: BoxSolid[] = [];
  private readonly hullMins = vec3();
  private readonly hullMaxs = vec3();
  private filterFn: TraceFilter | null = null;
  private filterMask = 0;
  private readonly skip = (entity: number): boolean => {
    const f = this.filterFn;
    return f !== null && !f(entity, this.filterMask);
  };

  constructor(map: MapCollision) {
    this.map = map;
  }

  traceHull(start: Vec3, end: Vec3, mins: Vec3, maxs: Vec3, mask: number, filter: TraceFilter | null, out: TraceResult): TraceResult {
    let portal = -1;
    if (this.carving && this.portals) portal = this.portals.carveHull(start, end, mins, maxs, this.hullMins, this.hullMaxs);
    if (portal >= 0) {
      this.map.traceHull(start, end, this.hullMins, this.hullMaxs, mask, filter, out);
      // The trace ran with a shorter hull: report the real hull's end position (same origin).
      this.portals!.clipFrame(portal, start, end, mins, maxs, out);
    } else {
      this.map.traceHull(start, end, mins, maxs, mask, filter, out);
    }
    if (out.allSolid) return out;
    if (this.physics && mask & 0x1) {
      this.filterFn = filter;
      this.filterMask = mask;
      this.physics.traceBodies(start, end, mins, maxs, this.skip, out);
      this.filterFn = null;
      if (out.allSolid) return out;
    }
    const list = this.boxes;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.removed || !e.isSolid()) continue;
      if (!(e.contents & mask)) continue;
      if (filter && !filter(e.id, mask)) continue;
      bmin.x = e.origin.x + e.mins.x;
      bmin.y = e.origin.y + e.mins.y;
      bmin.z = e.origin.z + e.mins.z;
      bmax.x = e.origin.x + e.maxs.x;
      bmax.y = e.origin.y + e.maxs.y;
      bmax.z = e.origin.z + e.maxs.z;
      clipBoxToAabb(bmin, bmax, start, end, mins, maxs, e.id, e.contents, out);
      if (out.allSolid) break;
    }
    return out;
  }

  traceLine(start: Vec3, end: Vec3, mask: number, filter: TraceFilter | null, out: TraceResult): TraceResult {
    return this.traceHull(start, end, ZERO, ZERO, mask, filter, out);
  }

  pointContents(point: Vec3): number {
    return this.map.pointContents(point);
  }

  /** The map only (brushes, displacements, static props). */
  traceMap(start: Vec3, end: Vec3, mins: Vec3, maxs: Vec3, mask: number, filter: TraceFilter | null, out: TraceResult): TraceResult {
    return this.map.traceHull(start, end, mins, maxs, mask, filter, out);
  }

  addBox(b: BoxSolid): void {
    if (!this.boxes.includes(b)) this.boxes.push(b);
  }

  removeBox(b: BoxSolid): void {
    const i = this.boxes.indexOf(b);
    if (i >= 0) this.boxes.splice(i, 1);
  }

  hitNothing(out: TraceResult): boolean {
    return out.fraction >= 1 && out.entity === NO_ENTITY && !out.startSolid;
  }
}

const bmin = vec3();
const bmax = vec3();
