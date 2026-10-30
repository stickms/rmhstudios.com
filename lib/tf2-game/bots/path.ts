/**
 * Paths over the navigation mesh, and following them with user commands.
 *
 * - `NavBlockState`: which areas a door or toggled brush blocks right now,
 *   per team (CTFNavMesh::ComputeBlockedAreas' rules, tested with the live
 *   brush models every second): a bare closed door or a solid toggled brush
 *   blocks everyone; a trigger-opened door blocks only the team its trigger's
 *   filter keeps out.
 * - `NavPathfinder`: A* over areas (NavAreaBuildPath). The cost is distance,
 *   plus jumps, drops, crouching and swimming, plus the per-team danger map
 *   (where teammates died lately); the enemy's spawn rooms and blocked areas
 *   are forbidden. When the goal is unreachable the path leads to the
 *   reachable area closest to it (a bot waits at a closed setup gate).
 * - `PathFollower`: steers along the portals between the path's areas
 *   (each straight leg stays inside one convex area), jumps at jump
 *   connections and crouch-jumps ledges, crouches through crouch areas, swims
 *   up out of water, notices when it is stuck (jump, then repath around the
 *   blocked spot) and repaths when it falls off the path.
 *
 * Nothing allocates per tick: the pathfinder's buffers are per mesh, a
 * follower's per bot.
 */

import { FL_ONGROUND, MASK_PLAYERSOLID, TF_TEAM_BLUE, TF_TEAM_RED } from '../core/constants';
import { emptyTrace } from '../core/types';
import type { Vec3 } from '../core/vec';
import type { GameWorld } from '../sim/world';
import {
  BLOCKER_BRUSH,
  CONN_DROP,
  CONN_JUMP,
  NAV_BLUE_SPAWN,
  NAV_CROUCH,
  NAV_DEEP_WATER,
  NAV_DOOR,
  NAV_RED_SPAWN,
  NAV_WATER,
  type NavMesh,
} from './nav/nav-mesh';

// ─── Runtime blocking ───────────────────────────────────────────────────────

/** Seconds between re-tests of a door area. */
export const BLOCK_RECHECK = 1.0;

export class NavBlockState {
  private readonly world: GameWorld;
  private readonly mesh: NavMesh;
  private readonly checkedAt: Float32Array;
  /** bit 0: blocked for RED, bit 1: for BLU. */
  private readonly bits: Uint8Array;
  private readonly mins = { x: 0, y: 0, z: 0 };
  private readonly maxs = { x: 0, y: 0, z: 0 };

  constructor(world: GameWorld, mesh: NavMesh) {
    this.world = world;
    this.mesh = mesh;
    this.checkedAt = new Float32Array(mesh.areaCount).fill(-1000);
    this.bits = new Uint8Array(mesh.areaCount);
  }

  isBlocked(area: number, team: number): boolean {
    const m = this.mesh;
    if ((m.attrs[area] & NAV_DOOR) === 0) return false;
    const now = this.world.curtime;
    if (now - this.checkedAt[area] >= BLOCK_RECHECK) {
      this.checkedAt[area] = now;
      this.bits[area] = this.compute(area);
    }
    const bit = team === TF_TEAM_RED ? 1 : team === TF_TEAM_BLUE ? 2 : 3;
    return (this.bits[area] & bit) !== 0;
  }

  private compute(area: number): number {
    const m = this.mesh;
    const b = m.blocker[area];
    const brushes = this.world.brushes;
    if (b < 0 || !brushes) return 0;
    const info = m.blockers[b];
    if (!info || info.model <= 0 || info.model >= brushes.modelCount) return 0;
    if (!brushes.isModelSolid(info.model)) return 0;
    this.mins.x = m.minX[area] + 2;
    this.mins.y = m.minY[area] + 2;
    this.mins.z = m.cz[area] + 20;
    this.maxs.x = m.maxX[area] - 2;
    this.maxs.y = m.maxY[area] - 2;
    this.maxs.z = m.cz[area] + 70;
    if (!brushes.boxTouchesModel(info.model, this.mins, this.maxs)) return 0;
    if (info.kind === BLOCKER_BRUSH || !info.triggerControlled) return 3;
    if (info.ownerTeam === TF_TEAM_RED) return 2;
    if (info.ownerTeam === TF_TEAM_BLUE) return 1;
    return 0;
  }
}

// ─── Danger ─────────────────────────────────────────────────────────────────

/** Seconds for remembered danger to fall to 1/e. */
export const DANGER_DECAY = 20;
/** Path cost (units) of one unit of danger. */
export const DANGER_COST = 400;

/** Where each team got killed lately (CTFNavArea::m_danger). */
export class DangerMap {
  private readonly value: Float32Array[];
  private readonly at: Float32Array[];

  constructor(areaCount: number) {
    this.value = [0, 1, 2, 3].map(() => new Float32Array(areaCount));
    this.at = [0, 1, 2, 3].map(() => new Float32Array(areaCount));
  }

  add(team: number, area: number, amount: number, now: number): void {
    if (team < 0 || team > 3 || area < 0) return;
    const v = this.get(team, area, now);
    this.value[team][area] = Math.min(10, v + amount);
    this.at[team][area] = now;
  }

  get(team: number, area: number, now: number): number {
    const v = this.value[team][area];
    if (v === 0) return 0;
    return v * Math.exp(-(now - this.at[team][area]) / DANGER_DECAY);
  }
}

// ─── A* ─────────────────────────────────────────────────────────────────────

export interface PathCostOptions {
  team: number;
  /** Weight of the danger map (0 = ignore). */
  dangerWeight: number;
  /** An area to avoid (stuck recovery), −1 none. */
  avoidArea: number;
  /** Stop after this many expansions (then use the closest area found). */
  maxExpansions: number;
}

/** Extra cost of a jump / drop connection, in units. */
const JUMP_COST = 60;
const DROP_COST = 20;
/** …plus this per unit a jump climbs above a step (high crouch-jumps are a last resort). */
const JUMP_RISE_COST = 6;

export class NavPathfinder {
  readonly mesh: NavMesh;
  private readonly blocks: NavBlockState | null;
  readonly danger: DangerMap;
  private readonly world: GameWorld | null;
  private readonly g: Float32Array;
  private readonly parent: Int32Array;
  private readonly parentConn: Int32Array;
  private readonly stamp: Uint32Array;
  private readonly closed: Uint32Array;
  private search = 0;
  private heapF: Float32Array;
  private heapA: Int32Array;
  private heapN = 0;
  /** Expansions of the last search (diagnostics). */
  lastExpansions = 0;

  constructor(mesh: NavMesh, world: GameWorld | null = null, blocks: NavBlockState | null = null) {
    this.mesh = mesh;
    this.world = world;
    this.blocks = blocks;
    const n = mesh.areaCount;
    this.g = new Float32Array(n);
    this.parent = new Int32Array(n);
    this.parentConn = new Int32Array(n);
    this.stamp = new Uint32Array(n);
    this.closed = new Uint32Array(n);
    this.heapF = new Float32Array(1024);
    this.heapA = new Int32Array(1024);
    this.danger = new DangerMap(n);
    // Static connection costs: distance, then crouching / swimming / jumps / drops.
    this.connCost = new Float32Array(mesh.connTo.length);
    for (let a = 0; a < n; a++) {
      for (let c = mesh.connStart[a]; c < mesh.connStart[a + 1]; c++) {
        const b = mesh.connTo[c];
        const dx = mesh.cx[b] - mesh.cx[a];
        const dy = mesh.cy[b] - mesh.cy[a];
        const dz = mesh.cz[b] - mesh.cz[a];
        let cost = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const at = mesh.attrs[b];
        if (at & NAV_CROUCH) cost *= 1.6;
        if (at & NAV_DEEP_WATER) cost *= 2;
        else if (at & NAV_WATER) cost *= 1.2;
        const type = mesh.connType[c];
        if (type === CONN_JUMP) cost += JUMP_COST + Math.max(0, dz - 18) * JUMP_RISE_COST;
        else if (type === CONN_DROP) cost += DROP_COST;
        this.connCost[c] = cost;
      }
    }
  }

  private readonly connCost: Float32Array;

  /** Can a member of `team` enter `area` at all? */
  passable(area: number, team: number): boolean {
    const at = this.mesh.attrs[area];
    if (team === TF_TEAM_RED && at & NAV_BLUE_SPAWN) return false;
    if (team === TF_TEAM_BLUE && at & NAV_RED_SPAWN) return false;
    if (this.blocks && this.blocks.isBlocked(area, team)) return false;
    return true;
  }

  private push(f: number, a: number): void {
    if (this.heapN === this.heapF.length) {
      const nf = new Float32Array(this.heapF.length * 2);
      nf.set(this.heapF);
      const na = new Int32Array(this.heapA.length * 2);
      na.set(this.heapA);
      this.heapF = nf;
      this.heapA = na;
    }
    let i = this.heapN++;
    const F = this.heapF;
    const A = this.heapA;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (F[p] <= f) break;
      F[i] = F[p];
      A[i] = A[p];
      i = p;
    }
    F[i] = f;
    A[i] = a;
  }

  private pop(): number {
    const F = this.heapF;
    const A = this.heapA;
    const top = A[0];
    const n = --this.heapN;
    const f = F[n];
    const a = A[n];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= n) break;
      if (c + 1 < n && F[c + 1] < F[c]) c++;
      if (F[c] >= f) break;
      F[i] = F[c];
      A[i] = A[c];
      i = c;
    }
    F[i] = f;
    A[i] = a;
    return top;
  }

  /**
   * A* from `start` to `goal` (areas). Fills `out` with the area sequence
   * (start … goal, or … the closest reachable area) and the connection used
   * into each; returns whether the goal itself was reached.
   */
  find(
    start: number,
    goal: number,
    gx: number,
    gy: number,
    gz: number,
    opts: PathCostOptions,
    out: NavPath,
  ): boolean {
    const m = this.mesh;
    out.length = 0;
    if (start < 0) return false;
    this.search = (this.search + 1) >>> 0 || 1;
    const s = this.search;
    this.heapN = 0;
    this.g[start] = 0;
    this.parent[start] = -1;
    this.parentConn[start] = -1;
    this.stamp[start] = s;
    const now = this.world ? this.world.curtime : 0;
    const team = opts.team;
    const sx = m.cx[start] - gx;
    const sy = m.cy[start] - gy;
    const sz = m.cz[start] - gz;
    const h0 = Math.sqrt(sx * sx + sy * sy + sz * sz);
    const useDanger = opts.dangerWeight > 0;
    this.push(h0, start);
    let best = start;
    let bestH = h0;
    let expansions = 0;
    let reached = false;
    while (this.heapN > 0) {
      const a = this.pop();
      if (this.closed[a] === s) continue;
      this.closed[a] = s;
      if (a === goal) {
        best = a;
        reached = true;
        break;
      }
      if (++expansions > opts.maxExpansions) break;
      for (let c = m.connStart[a]; c < m.connStart[a + 1]; c++) {
        const b = m.connTo[c];
        if (this.closed[b] === s) continue;
        if (!this.passable(b, team)) continue;
        let cost = this.connCost[c];
        if (b === opts.avoidArea) cost += 3000;
        if (useDanger) cost += this.danger.get(team, b, now) * DANGER_COST * opts.dangerWeight;
        const ng = this.g[a] + cost;
        if (this.stamp[b] === s && ng >= this.g[b]) continue;
        this.stamp[b] = s;
        this.g[b] = ng;
        this.parent[b] = a;
        this.parentConn[b] = c;
        const hx = m.cx[b] - gx;
        const hy = m.cy[b] - gy;
        const hz = m.cz[b] - gz;
        const h = Math.sqrt(hx * hx + hy * hy + hz * hz);
        if (h < bestH) {
          bestH = h;
          best = b;
        }
        this.push(ng + h, b);
      }
    }
    this.lastExpansions = expansions;
    // Walk back.
    let n = 0;
    for (let a = best; a >= 0; a = this.parent[a]) n++;
    out.ensure(n);
    let i = n - 1;
    for (let a = best; a >= 0; a = this.parent[a]) {
      out.areas[i] = a;
      out.conns[i] = this.parentConn[a];
      i--;
    }
    out.length = n;
    out.reachedGoal = reached;
    return reached;
  }

  /** Straight-line-free travel distance estimate (A* cost) between two areas, or −1. */
  travelDistance(
    start: number,
    goal: number,
    team: number,
    scratch: NavPath,
    maxExpansions = 4000,
  ): number {
    if (start < 0 || goal < 0) return -1;
    if (start === goal) return 0;
    const m = this.mesh;
    const ok = this.find(
      start,
      goal,
      m.cx[goal],
      m.cy[goal],
      m.cz[goal],
      { team, dangerWeight: 0, avoidArea: -1, maxExpansions },
      scratch,
    );
    return ok ? this.g[goal] : -1;
  }
}

/** A path: areas start … end and the connection into each (conns[0] = −1). */
export class NavPath {
  areas = new Int32Array(64);
  conns = new Int32Array(64);
  length = 0;
  reachedGoal = false;

  ensure(n: number): void {
    if (this.areas.length >= n) return;
    let size = this.areas.length;
    while (size < n) size *= 2;
    this.areas = new Int32Array(size);
    this.conns = new Int32Array(size);
  }
}

// ─── Following ──────────────────────────────────────────────────────────────

/** What the follower wants this tick. */
export interface MoveIntent {
  /** Unit direction to move in (world xy); zero when standing still. */
  dirX: number;
  dirY: number;
  /** 0…1 of full speed. */
  speed: number;
  jump: boolean;
  duck: boolean;
  /** The point it steers at (the bot may look there). */
  look: Vec3;
}

export const newMoveIntent = (): MoveIntent => ({
  dirX: 0,
  dirY: 0,
  speed: 0,
  jump: false,
  duck: false,
  look: { x: 0, y: 0, z: 0 },
});

/** A* expansions per search (a whole map is ~1–3k areas). */
const MAX_EXPANSIONS = 4000;
/** Extra seconds before re-searching for a goal that was unreachable. */
const UNREACHABLE_BACKOFF = 2;
/** Seconds off the path before repathing. */
const OFF_PATH_TIME = 0.8;
/** An area this narrow (units) across its long axis is walked down the middle. */
const NARROW = 80;
const EDGE_MIN = { x: -24, y: -24, z: 0 };
const EDGE_MAX = { x: 24, y: 24, z: 62 };
/** How far ahead (units) the follower feels for a wall, and the probe's height above a step. */
const SLIDE_PROBE = 20;
const SLIDE_STEP = 18;
const SLIDE_HEIGHT = 36;
/** A wall at least this steep (normal z) is slid along; below it the floor rises (a slope). */
const SLIDE_WALL_NZ = 0.7;
/** The least sideways share of the move worth sliding (head on into a wall: the stuck logic acts). */
const SLIDE_MIN = 0.02;

/** Distance at which the goal counts as reached. */
export const GOAL_TOLERANCE = 24;
/** Seconds without progress before the follower calls itself stuck. */
export const STUCK_TIME = 1.2;
/** Seconds stuck before it repaths around the spot. */
export const STUCK_REPATH_TIME = 3.0;

/** Seconds a path to a moving goal is kept before recomputing. */
export const MOVING_GOAL_REPATH = 0.75;

export interface FollowerHost {
  pathfinder: NavPathfinder;
  /**
   * Takes one path search from the tick's budget (so a world's bots never all
   * repath in the same tick); false = keep following the old path for now.
   * Absent = unlimited.
   */
  takeSearch?: () => boolean;
}

export class PathFollower {
  readonly path = new NavPath();
  /** Waypoints (xyz per path step; [0] unused). */
  private wp = new Float32Array(64 * 3);
  /** Index of the path step whose portal we are heading for. */
  index = 1;
  readonly goal = { x: 0, y: 0, z: 0 };
  goalArea = -1;
  hasPath = false;
  /** curtime of the last path computation. */
  computedAt = -1000;
  /** Repath this often even when nothing went wrong (moving goals); bots stagger it. */
  repathInterval = 2.0;
  /** Half the player hull's width (TF2 24, CS:GO 16): the wall probe's size. */
  halfWidth = 24;
  private team = 0;
  private dangerWeight = 1;
  private avoidArea = -1;
  // Stuck tracking.
  private readonly lastProgressPos = { x: 0, y: 0, z: 0 };
  private lastProgressAt = 0;
  stuckSince = -1;
  private jumpHeld = 0;
  /** Diagnostics. */
  stuckEvents = 0;
  repaths = 0;

  /** Sets the goal (a point) and computes the path when needed. */
  setGoal(
    host: FollowerHost,
    world: GameWorld,
    from: Vec3,
    goal: Vec3,
    team: number,
    dangerWeight = 1,
    force = false,
  ): boolean {
    const dx = goal.x - this.goal.x;
    const dy = goal.y - this.goal.y;
    const dz = goal.z - this.goal.z;
    const moved = dx * dx + dy * dy + dz * dz > 48 * 48;
    const age = world.curtime - this.computedAt;
    const stale = age > this.repathInterval;
    if (!force && this.hasPath && team === this.team) {
      if (!moved && !stale) return this.path.reachedGoal;
      // A moving goal (a patient, a victim, the cart): follow the old path a while longer.
      if (moved && !stale && age < MOVING_GOAL_REPATH && dx * dx + dy * dy + dz * dz < 600 * 600) {
        this.goal.x = goal.x;
        this.goal.y = goal.y;
        this.goal.z = goal.z;
        return this.path.reachedGoal;
      }
      // Over the tick's search budget: keep the old path a tick longer.
      if (host.takeSearch && !host.takeSearch()) return this.path.reachedGoal;
    }
    this.goal.x = goal.x;
    this.goal.y = goal.y;
    this.goal.z = goal.z;
    this.team = team;
    this.dangerWeight = dangerWeight;
    return this.compute(host, world, from);
  }

  /** Forgets the path (death, new objective). */
  clear(): void {
    this.hasPath = false;
    this.path.length = 0;
    this.stuckSince = -1;
    this.avoidArea = -1;
    this.computedAt = -1000;
    this.goal.x = this.goal.y = this.goal.z = 1e9;
  }

  private compute(host: FollowerHost, world: GameWorld, from: Vec3): boolean {
    const pf = host.pathfinder;
    const m = pf.mesh;
    const start = m.nearestArea(from.x, from.y, from.z + 4, 200);
    this.goalArea = m.nearestArea(this.goal.x, this.goal.y, this.goal.z + 4, 300);
    this.computedAt = world.curtime;
    this.repaths++;
    if (start < 0) {
      this.hasPath = false;
      return false;
    }
    const reached = pf.find(
      start,
      this.goalArea,
      this.goal.x,
      this.goal.y,
      this.goal.z,
      {
        team: this.team,
        dangerWeight: this.dangerWeight,
        avoidArea: this.avoidArea,
        maxExpansions: MAX_EXPANSIONS,
      },
      this.path,
    );
    // An unreachable goal (a closed setup gate) is retried less often.
    this.computedAt = reached ? world.curtime : world.curtime + UNREACHABLE_BACKOFF;
    this.buildWaypoints(m);
    this.index = 1;
    this.hasPath = this.path.length > 0;
    return reached;
  }

  private buildWaypoints(m: NavMesh): void {
    const p = this.path;
    if (this.wp.length < p.length * 3) this.wp = new Float32Array(p.length * 3 * 2);
    for (let i = 1; i < p.length; i++) {
      const c = p.conns[i];
      const ax = m.portal[c * 5];
      const ay = m.portal[c * 5 + 1];
      const bx = m.portal[c * 5 + 2];
      const by = m.portal[c * 5 + 3];
      // Aim at the portal point nearest the next area's centre (or the goal), kept off the ends.
      const next = i + 1 < p.length ? p.areas[i + 1] : -1;
      const tx = next >= 0 ? m.cx[next] : p.reachedGoal ? this.goal.x : m.cx[p.areas[i]];
      const ty = next >= 0 ? m.cy[next] : p.reachedGoal ? this.goal.y : m.cy[p.areas[i]];
      const ex = bx - ax;
      const ey = by - ay;
      const len2 = ex * ex + ey * ey;
      let t = 0.5;
      if (len2 > 1) {
        t = ((tx - ax) * ex + (ty - ay) * ey) / len2;
        const len = Math.sqrt(len2);
        const margin = Math.min(0.5, 20 / len);
        t = t < margin ? margin : t > 1 - margin ? 1 - margin : t;
      }
      this.wp[i * 3] = ax + ex * t;
      this.wp[i * 3 + 1] = ay + ey * t;
      this.wp[i * 3 + 2] = m.portal[c * 5 + 4];
    }
  }

  /** Remaining straight-line distance along the path from `pos` (approx). */
  remainingDistance(pos: Vec3): number {
    if (!this.hasPath) return Infinity;
    let d = 0;
    let px = pos.x;
    let py = pos.y;
    for (let i = this.index; i < this.path.length; i++) {
      d += Math.hypot(this.wp[i * 3] - px, this.wp[i * 3 + 1] - py);
      px = this.wp[i * 3];
      py = this.wp[i * 3 + 1];
    }
    return d + Math.hypot(this.goal.x - px, this.goal.y - py);
  }

  /**
   * One tick of following: fills `out` from the player's position. Returns
   * false when there is no path (the caller should set a goal).
   */
  update(
    host: FollowerHost,
    world: GameWorld,
    pos: Vec3,
    vel: Vec3,
    flags: number,
    waterLevel: number,
    out: MoveIntent,
  ): boolean {
    out.dirX = out.dirY = out.speed = 0;
    out.jump = out.duck = false;
    if (!this.hasPath) return false;
    const m = host.pathfinder.mesh;
    const p = this.path;
    const onGround = (flags & FL_ONGROUND) !== 0;
    const now = world.curtime;

    // Where are we on the path?
    const here = m.areaAt(pos.x, pos.y, pos.z + 4, 80, 40);
    if (here >= 0) {
      for (let k = Math.min(p.length - 1, this.index + 4); k >= this.index; k--) {
        if (p.areas[k] === here) {
          this.index = k + 1;
          break;
        }
      }
    }
    while (this.index < p.length) {
      const wx = this.wp[this.index * 3];
      const wy = this.wp[this.index * 3 + 1];
      const wz = this.wp[this.index * 3 + 2];
      const ddx = wx - pos.x;
      const ddy = wy - pos.y;
      if (ddx * ddx + ddy * ddy < 16 * 16 && Math.abs(wz - pos.z) < 40) this.index++;
      else break;
    }

    // Off the path (fell, got pushed): repath.
    if (here >= 0 && onGround && this.index < p.length) {
      let near = false;
      for (let k = Math.max(0, this.index - 2); k < Math.min(p.length, this.index + 5); k++) {
        if (p.areas[k] === here) {
          near = true;
          break;
        }
      }
      if (near) this.offPathSince = -1;
      else if (this.offPathSince < 0) this.offPathSince = now;
      // Drifting into a neighbouring area is fine; off the path for a while (a fall, a push) is not.
      if (!near && now - this.offPathSince > OFF_PATH_TIME && now - this.computedAt > 0.5) {
        this.offPathSince = -1;
        this.compute(host, world, pos);
        return this.update(host, world, pos, vel, flags, waterLevel, out);
      }
    }

    let tx: number;
    let ty: number;
    let tz: number;
    let connType = 0;
    if (this.index < p.length) {
      tx = this.wp[this.index * 3];
      ty = this.wp[this.index * 3 + 1];
      tz = this.wp[this.index * 3 + 2];
      connType = m.connType[p.conns[this.index]];
      // Push through the portal: aim a little past it, along the edge's
      // outward normal from the area we are leaving.
      const d = Math.hypot(tx - pos.x, ty - pos.y);
      const src = p.areas[this.index - 1];
      if (d < 48 && here === src) {
        const c = p.conns[this.index];
        const ex = Math.abs(m.portal[c * 5 + 2] - m.portal[c * 5]);
        const ey = Math.abs(m.portal[c * 5 + 3] - m.portal[c * 5 + 1]);
        if (ex <= ey) tx += tx >= m.cx[src] ? 28 : -28;
        else ty += ty >= m.cy[src] ? 28 : -28;
      }
    } else {
      tx = p.reachedGoal ? this.goal.x : m.cx[p.areas[p.length - 1]];
      ty = p.reachedGoal ? this.goal.y : m.cy[p.areas[p.length - 1]];
      tz = p.reachedGoal ? this.goal.z : m.cz[p.areas[p.length - 1]];
    }
    // Narrow areas (ramps, beams, catwalks): keep to the centre line until the far end.
    if (here >= 0) {
      const w = m.maxX[here] - m.minX[here];
      const h = m.maxY[here] - m.minY[here];
      if (
        h <= NARROW &&
        w > h * 2 &&
        Math.abs(tx - pos.x) > 40 &&
        Math.abs(tx - pos.x) > Math.abs(ty - pos.y)
      )
        ty = m.cy[here];
      else if (
        w <= NARROW &&
        h > w * 2 &&
        Math.abs(ty - pos.y) > 40 &&
        Math.abs(ty - pos.y) > Math.abs(tx - pos.x)
      )
        tx = m.cx[here];
    }
    out.look.x = tx;
    out.look.y = ty;
    out.look.z = tz + 60;
    const dx = tx - pos.x;
    const dy = ty - pos.y;
    const dist = Math.hypot(dx, dy);
    const atEnd = this.index >= p.length;
    if (atEnd && dist < GOAL_TOLERANCE) {
      this.lastProgressAt = now;
      this.stuckSince = -1;
      return true;
    }
    if (dist > 0.01) {
      out.dirX = dx / dist;
      out.dirY = dy / dist;
      out.speed = 1;
    }
    // Off the mesh on a perch right above where we need to be (a prop or ledge top
    // the mesh does not know): walk off the nearest edge.
    if (here < 0 && onGround && dist < 48 && tz < pos.z - 48) {
      if (now >= this.escapeAt) {
        this.escapeAt = now + 1;
        this.findEdge(world, pos);
      }
      if (this.escapeX !== 0 || this.escapeY !== 0) {
        out.dirX = this.escapeX;
        out.dirY = this.escapeY;
        out.speed = 1;
      }
    }

    // Jumps: a jump connection near its portal, or a ledge ahead of us.
    const rise = tz - pos.z;
    // Corners: a straight leg can clip a wall the areas do not show (an area reaches half a cell past
    // the last spot a player fits, so a strip beside a crate is really a line). Feel ahead with the
    // player's hull and slide along a wall at full speed rather than grind into it.
    if (onGround && out.speed > 0 && connType !== CONN_JUMP && rise <= SLIDE_STEP) this.slideAlongWalls(world, pos, out);
    if (onGround && dist < 70 && (connType === CONN_JUMP || rise > 20) && rise > -40) {
      out.jump = true;
      this.jumpHeld = 1;
    }
    if (!onGround) {
      // Crouch-jump: tuck the legs while rising toward a higher ledge.
      if (this.jumpHeld > 0 && pos.z < tz + 8) out.duck = true;
      else this.jumpHeld = 0;
    } else if (!out.jump) this.jumpHeld = 0;
    const cur = here >= 0 ? m.attrs[here] : 0;
    const nextAttr = this.index < p.length ? m.attrs[p.areas[this.index]] : 0;
    if ((cur | nextAttr) & NAV_CROUCH) out.duck = true;
    // Swim up toward a higher target.
    if (waterLevel >= 2 && tz > pos.z - 10) out.jump = true;

    // Stuck?
    const px = pos.x - this.lastProgressPos.x;
    const py = pos.y - this.lastProgressPos.y;
    const pz = pos.z - this.lastProgressPos.z;
    if (px * px + py * py + pz * pz > 40 * 40) {
      this.lastProgressPos.x = pos.x;
      this.lastProgressPos.y = pos.y;
      this.lastProgressPos.z = pos.z;
      this.lastProgressAt = now;
      this.stuckSince = -1;
    } else if (now - this.lastProgressAt > STUCK_TIME) {
      if (this.stuckSince < 0) {
        this.stuckSince = now;
        this.stuckEvents++;
      }
      // Hop and wiggle.
      if (onGround && ((world.tickCount + (this.repaths & 7)) & 31) === 0) out.jump = true;
      const wiggle = Math.sin(now * 3 + this.repaths) * 0.6;
      const ox = out.dirX;
      out.dirX = ox - out.dirY * wiggle;
      out.dirY = out.dirY + ox * wiggle;
      const l = Math.hypot(out.dirX, out.dirY) || 1;
      out.dirX /= l;
      out.dirY /= l;
      if (now - this.stuckSince > STUCK_REPATH_TIME) {
        this.avoidArea = this.index < p.length ? p.areas[this.index] : -1;
        this.lastProgressAt = now;
        this.stuckSince = -1;
        this.compute(host, world, pos);
      }
    }
    return true;
  }

  private readonly slideMin = { x: 0, y: 0, z: 0 };
  private readonly slideMax = { x: 0, y: 0, z: SLIDE_HEIGHT };

  /**
   * Turns a move into a wall along the wall at full speed (the side the move leans to), from a hull probe
   * SLIDE_PROBE ahead at step height. Head on into a wall it changes nothing: the stuck logic acts.
   */
  private slideAlongWalls(world: GameWorld, pos: Vec3, out: MoveIntent): void {
    const w = this.halfWidth - 1;
    this.slideMin.x = this.slideMin.y = -w;
    this.slideMax.x = this.slideMax.y = w;
    const a = this.ea;
    const b = this.eb;
    a.x = pos.x;
    a.y = pos.y;
    a.z = pos.z + SLIDE_STEP;
    b.x = pos.x + out.dirX * SLIDE_PROBE;
    b.y = pos.y + out.dirY * SLIDE_PROBE;
    b.z = a.z;
    const tr = world.mapCollision.traceHull(a, b, this.slideMin, this.slideMax, MASK_PLAYERSOLID, null, this.etr);
    if (tr.startSolid || tr.fraction >= 1) return;
    const n = tr.plane.normal;
    if (n.z >= SLIDE_WALL_NZ) return;
    const nl = Math.hypot(n.x, n.y);
    if (nl < 1e-3) return;
    const nx = n.x / nl;
    const ny = n.y / nl;
    const into = out.dirX * nx + out.dirY * ny;
    if (into >= 0) return;
    const sx = out.dirX - nx * into;
    const sy = out.dirY - ny * into;
    const sl = Math.hypot(sx, sy);
    if (sl < SLIDE_MIN) return;
    out.dirX = sx / sl;
    out.dirY = sy / sl;
  }

  private offPathSince = -1;
  private escapeAt = 0;
  private escapeX = 0;
  private escapeY = 0;
  private readonly ea = { x: 0, y: 0, z: 0 };
  private readonly eb = { x: 0, y: 0, z: 0 };
  private readonly etr = emptyTrace();

  /** The first of 8 directions with no floor within a step-and-a-bit past 64 units (map collision only). */
  private findEdge(world: GameWorld, pos: Vec3): void {
    this.escapeX = this.escapeY = 0;
    const col = world.mapCollision;
    const a = this.ea;
    const b = this.eb;
    const start = this.repaths & 7;
    for (let k = 0; k < 8; k++) {
      const ang = ((start + k) * Math.PI) / 4;
      const cx = Math.cos(ang);
      const cy = Math.sin(ang);
      a.x = pos.x;
      a.y = pos.y;
      a.z = pos.z + 2;
      b.x = pos.x + cx * 64;
      b.y = pos.y + cy * 64;
      b.z = pos.z + 2;
      const tr = col.traceHull(a, b, EDGE_MIN, EDGE_MAX, MASK_PLAYERSOLID, null, this.etr);
      if (tr.startSolid || tr.fraction < 0.9) continue;
      a.x = tr.endPos.x;
      a.y = tr.endPos.y;
      b.x = tr.endPos.x;
      b.y = tr.endPos.y;
      b.z = pos.z - 40;
      const down = col.traceHull(a, b, EDGE_MIN, EDGE_MAX, MASK_PLAYERSOLID, null, this.etr);
      if (down.fraction >= 1 && !down.startSolid) {
        this.escapeX = cx;
        this.escapeY = cy;
        return;
      }
    }
  }

  /** The area the path ends in (−1 none). */
  get endArea(): number {
    return this.path.length > 0 ? this.path.areas[this.path.length - 1] : -1;
  }

  /** True when the follower is at its goal. */
  atGoal(pos: Vec3, tolerance = GOAL_TOLERANCE * 2): boolean {
    const dx = this.goal.x - pos.x;
    const dy = this.goal.y - pos.y;
    return dx * dx + dy * dy < tolerance * tolerance && Math.abs(this.goal.z - pos.z) < 72;
  }
}

/** cl_forwardspeed / cl_sidespeed. */
const MOVE_INPUT = 450;

/**
 * Turns a world-space move intent into the command's forward/side inputs for
 * a view yaw (right = (sin yaw, −cos yaw), as AngleVectors gives).
 */
export function applyMoveIntent(
  intent: MoveIntent,
  viewYawDeg: number,
  cmd: { forwardMove: number; sideMove: number; buttons: number },
  jumpBit: number,
  duckBit: number,
): void {
  const r = (viewYawDeg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const sp = MOVE_INPUT * intent.speed;
  cmd.forwardMove = (intent.dirX * c + intent.dirY * s) * sp;
  cmd.sideMove = (intent.dirX * s - intent.dirY * c) * sp;
  if (intent.jump) cmd.buttons |= jumpBit;
  if (intent.duck) cmd.buttons |= duckBit;
}
