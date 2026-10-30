/**
 * Navigation mesh generation from a map's collision (the role of
 * CNavMesh::GenerateNavigationMesh, nav_generate.cpp — an independent
 * implementation of the same idea):
 *
 *   1. Seeds: the map's spawn points, control points, flags, payload track
 *      nodes, capture zones and pickups (CS:GO: team and deathmatch spawns,
 *      bomb sites and buy zones), each dropped to the ground.
 *   2. Flood fill: walkable ground is sampled on a `cellSize` (25-unit) grid
 *      with hull traces. From each sample the four neighbours are tried the
 *      way CGameMovement moves a player: a step (≤ 18 up/down), a walk off a
 *      ledge (a drop, ≤ 250), or a crouch-jump up to 64 units (swimming up
 *      out of water higher) — TF2's hull; `opts.hull` sets another game's
 *      (NAV_HULL_CS: 32 × 72, crouched 54, jump 56, drop 200). Steep ground (normal z < 0.7) and lethal
 *      trigger_hurt volumes are not walkable. Doors, toggled brushes and the
 *      payload cart are ignored while sampling (they move); the areas they
 *      overlap are marked so bots can test them at runtime.
 *   3. Merging: samples become rectangles of up to `maxAreaCells`² cells
 *      whose samples are walk-connected both ways, coplanar and share their
 *      TF attributes (spawn room team, capture area, water, crouch, door).
 *   4. Connections: area pairs linked by any sample link, with the easiest
 *      link kind and the portal segment between them.
 *   5. Visibility: areas are grouped into sectors (~512 units); sector pairs
 *      within `visRange` that the BSP's PVS allows are sampled with line
 *      traces between eye points. The result is a bitset.
 *
 * Generation is incremental: `step(budget)` does at most about `budget`
 * traces of work and returns whether it finished, so a host can spread it
 * over ticks. Deterministic (no randomness, no clocks).
 */

import {
  CONTENTS_SLIME,
  CONTENTS_WATER,
  MASK_BLOCKLOS,
  MASK_PLAYERSOLID,
  TF_TEAM_BLUE,
  TF_TEAM_RED,
} from '../../core/constants';
import { emptyTrace } from '../../core/types';
import { vec3, type Vec3 } from '../../core/vec';
import { decompressVis, findLeaf, visTest, type BspFile } from '../../formats/bsp';
import type { BspEntity } from '../../formats/keyvalues';
import type { MapCollision } from '../../world/map-collision';
import {
  BLOCKER_BRUSH,
  BLOCKER_DOOR,
  CONN_DROP,
  CONN_JUMP,
  CONN_WALK,
  NAV_AMMO,
  NAV_BLUE_SPAWN,
  NAV_CAPTURE,
  NAV_CAPTURE_ZONE,
  NAV_CART_PATH,
  NAV_CROUCH,
  NAV_DEEP_WATER,
  NAV_DOOR,
  NAV_HEALTH,
  NAV_RED_SPAWN,
  NAV_RESUPPLY,
  NAV_WATER,
  NavMesh,
  POI_AMMO,
  POI_BOMB_TARGET,
  POI_BUY_ZONE,
  POI_CAPTURE_AREA,
  POI_CAPTURE_ZONE,
  POI_CONTROL_POINT,
  POI_FLAG,
  POI_HEALTH,
  POI_PATH_TRACK,
  POI_RESUPPLY,
  POI_SPAWN,
  type NavBlocker,
  type NavMeshData,
  type NavPoi,
} from './nav-mesh';

// ─── Walkability (CGameMovement-compatible) ─────────────────────────────────

/** Sample spacing (GenerationStepSize). */
export const NAV_CELL = 25;
/** Hull half width used to test samples (HalfHumanWidth: samples hug walls closer than the TF hull). */
export const NAV_HALF_WIDTH = 24;
/** The crouched TF hull height; samples need at least this much headroom. */
export const NAV_CROUCH_HEIGHT = 62;
/** The standing TF hull height. */
export const NAV_STAND_HEIGHT = 82;
/** sv_stepsize. */
export const NAV_STEP = 18;
/** Safe crouch-jump height (TF reaches ~72; 64 leaves margin). */
export const NAV_JUMP = 64;
/** Deepest drop linked (fall damage starts above ~260 units). */
export const NAV_DROP = 250;
/** How far below a sample its centre may find ground (a stair edge yes, a ledge corner no). */
export const NAV_SUPPORT = Number(process.env.NAV_SUPPORT ?? 40);
/** Steepest walkable ground (MIN_STANDABLE_NORMAL_Z). */
export const NAV_MIN_NORMAL_Z = 0.7;
/** trigger_hurt damage at or above which a volume is treated as a pit. */
export const NAV_LETHAL_HURT = 50;

/**
 * The player hull and movement limits the samples are tested with. TF2's is the default; another
 * game on the same engine passes its own (CS:GO: NAV_HULL_CS).
 */
export interface NavHull {
  /** Half the hull width used to test samples. */
  halfWidth: number;
  /** Standing hull height. */
  standHeight: number;
  /** Crouched hull height; samples need at least this much headroom. */
  crouchHeight: number;
  /** sv_stepsize. */
  step: number;
  /** Highest (crouch-)jump linked, with margin. */
  jump: number;
  /** Deepest drop linked. */
  drop: number;
}

export const NAV_HULL_TF: NavHull = {
  halfWidth: NAV_HALF_WIDTH,
  standHeight: NAV_STAND_HEIGHT,
  crouchHeight: NAV_CROUCH_HEIGHT,
  step: NAV_STEP,
  jump: NAV_JUMP,
  drop: NAV_DROP,
};

/**
 * Counter-Strike: Global Offensive (cs_shareddefs: VEC_HULL 32 × 32 × 72, VEC_DUCK_HULL 54,
 * sv_stepsize 18; CS nav_generate's HalfHumanWidth 16). A crouch-jump reaches ~64 units (jump ~55
 * plus the 9 the duck lifts the feet); 56 leaves margin. Fall damage starts past ~210 units.
 */
export const NAV_HULL_CS: NavHull = {
  halfWidth: 16,
  standHeight: 72,
  crouchHeight: 54,
  step: 18,
  jump: 56,
  drop: 200,
};

export interface NavGenOptions {
  /** The player hull and movement limits (default NAV_HULL_TF). */
  hull?: NavHull;
  cellSize?: number;
  /** Largest area side, in cells. */
  maxAreaCells?: number;
  /** Farthest sector pair the visibility pass samples. */
  visRange?: number;
  /** Safety cap on samples. */
  maxNodes?: number;
}

export interface NavGenStats {
  seeds: number;
  seedsFailed: number;
  nodes: number;
  areas: number;
  connections: number;
  sectors: number;
  visPairs: number;
  traces: number;
}

const OUTPUT_ESC = String.fromCharCode(27);
const DIRS_X = [1, -1, 0, 0];
const DIRS_Y = [0, 0, 1, -1];
const OPPOSITE = [1, 0, 3, 2];

/** Entities whose brush models move or toggle: not solid while sampling. */
const DYNAMIC_BRUSH =
  /^(func_door|func_door_rotating|func_tracktrain|func_movelinear|func_physbox|func_physbox_multiplayer|func_breakable|func_train|func_rotating|func_wall_toggle)$/;

interface Volume {
  model: number;
  mins: Vec3;
  maxs: Vec3;
  team: number;
  /** POI / capture / blocker index, damage… */
  tag: number;
}

const PHASE_SEEDS = 0;
const PHASE_FLOOD = 1;
const PHASE_MERGE = 2;
const PHASE_CONNECT = 3;
const PHASE_VIS = 4;
const PHASE_DONE = 5;

/** Growable typed storage. */
class Grow<
  T extends Int32Array | Float32Array | Int16Array | Uint16Array | Uint8Array | Int8Array,
> {
  data: T;
  length = 0;
  private readonly make: (n: number) => T;
  constructor(make: (n: number) => T, initial = 4096) {
    this.make = make;
    this.data = make(initial);
  }
  push(v: number): number {
    if (this.length === this.data.length) {
      const next = this.make(this.data.length * 2);
      next.set(this.data);
      this.data = next;
    }
    this.data[this.length] = v;
    return this.length++;
  }
}

export class NavGenerator {
  readonly stats: NavGenStats = {
    seeds: 0,
    seedsFailed: 0,
    nodes: 0,
    areas: 0,
    connections: 0,
    sectors: 0,
    visPairs: 0,
    traces: 0,
  };
  private readonly bsp: BspFile;
  private readonly col: MapCollision;
  private readonly cell: number;
  private readonly maxCells: number;
  private readonly visRange: number;
  private readonly maxNodes: number;
  private readonly hull: NavHull;
  private phase = PHASE_SEEDS;
  private mesh: NavMesh | null = null;

  // Entity-derived volumes.
  private readonly dynamicModels: number[] = [];
  private readonly spawnRooms: Volume[] = [];
  private readonly captureAreas: Volume[] = [];
  private readonly captureZones: Volume[] = [];
  private readonly resupply: Volume[] = [];
  private readonly hurts: Volume[] = [];
  private readonly blockerVols: Volume[] = [];
  private readonly blockers: NavBlocker[] = [];
  private readonly pois: NavPoi[] = [];
  private readonly trackPoints: Vec3[] = [];
  private readonly seeds: Vec3[] = [];

  // Samples (nodes).
  private readonly nodeGX = new Grow((n) => new Int16Array(n));
  private readonly nodeGY = new Grow((n) => new Int16Array(n));
  private readonly nodeZ = new Grow((n) => new Float32Array(n));
  private readonly nodeAttr = new Grow((n) => new Uint16Array(n));
  private readonly nodeTag = new Grow((n) => new Int16Array(n)); // capture area index
  private readonly nodeBlocker = new Grow((n) => new Int16Array(n));
  private readonly nodeNext = new Grow((n) => new Int32Array(n));
  /** 4 links per node: target node (−1 none, −2 untested). */
  private readonly link = new Grow((n) => new Int32Array(n), 16384);
  private readonly linkType = new Grow((n) => new Uint8Array(n), 16384);
  private readonly columns = new Map<number, number>();
  private queue = new Int32Array(8192);
  private qHead = 0;
  private qTail = 0;
  private seedCursor = 0;

  // Areas (built in MERGE / CONNECT).
  private nodeArea = new Int32Array(0);
  private areaData: NavMeshData | null = null;

  // Visibility.
  private sectorSamples: Vec3[][] = [];
  private sectorClusters: number[][] = [];
  private visRows: Uint8Array = new Uint8Array(0);
  private visI = 0;
  private visJ = 1;
  private readonly pvsCache = new Map<number, Uint8Array>();

  // Scratch.
  private readonly tr = emptyTrace();
  private readonly a = vec3();
  private readonly b = vec3();
  private readonly hullMin: Vec3;
  private readonly crouchMax: Vec3;
  private readonly standMax: Vec3;
  private readonly supportMin = vec3(-8, -8, 0);
  private readonly supportMax = vec3(8, 8, 1);
  private savedSolid: boolean[] = [];

  constructor(bsp: BspFile, collision: MapCollision, opts: NavGenOptions = {}) {
    this.bsp = bsp;
    this.col = collision;
    this.cell = opts.cellSize ?? NAV_CELL;
    this.maxCells = opts.maxAreaCells ?? 12;
    this.visRange = opts.visRange ?? 5000;
    this.maxNodes = opts.maxNodes ?? 400_000;
    const h = (this.hull = opts.hull ?? NAV_HULL_TF);
    this.hullMin = vec3(-h.halfWidth, -h.halfWidth, 0);
    this.crouchMax = vec3(h.halfWidth, h.halfWidth, h.crouchHeight);
    this.standMax = vec3(h.halfWidth, h.halfWidth, h.standHeight);
    this.readEntities(bsp.entities);
  }

  get done(): boolean {
    return this.phase === PHASE_DONE;
  }

  /** The finished mesh (throws before `done`). */
  result(): NavMesh {
    if (!this.mesh) throw new Error('nav generation not finished');
    return this.mesh;
  }

  /** Runs to completion. */
  run(): NavMesh {
    while (!this.step(1e9));
    return this.result();
  }

  /**
   * Does about `budget` traces of work (the merge and connect phases run in
   * one step each; they trace nothing). Returns true when the mesh is done.
   */
  step(budget: number): boolean {
    if (this.phase === PHASE_DONE) return true;
    const stop = this.stats.traces + budget;
    this.disableDynamic();
    try {
      while (this.phase !== PHASE_DONE && this.stats.traces < stop) {
        switch (this.phase) {
          case PHASE_SEEDS:
            this.plantSeeds(stop);
            break;
          case PHASE_FLOOD:
            this.flood(stop);
            break;
          case PHASE_MERGE:
            this.merge();
            this.phase = PHASE_CONNECT;
            break;
          case PHASE_CONNECT:
            this.connect();
            this.phase = PHASE_VIS;
            break;
          case PHASE_VIS:
            this.visibility(stop);
            break;
        }
        if (this.phase === PHASE_MERGE || this.phase === PHASE_CONNECT) continue;
      }
    } finally {
      this.restoreDynamic();
    }
    return this.phase === PHASE_DONE;
  }

  // ─── Entities ─────────────────────────────────────────────────────────────

  private modelBox(e: BspEntity, m: number): { mins: Vec3; maxs: Vec3 } {
    const md = this.bsp.models[m];
    const o = e.getVec3('origin') ?? { x: 0, y: 0, z: 0 };
    return {
      mins: { x: md.mins.x + o.x, y: md.mins.y + o.y, z: md.mins.z + o.z },
      maxs: { x: md.maxs.x + o.x, y: md.maxs.y + o.y, z: md.maxs.z + o.z },
    };
  }

  private readEntities(entities: readonly BspEntity[]): void {
    const filters = new Map<string, number>();
    for (const e of entities) {
      if (e.classname.toLowerCase() === 'filter_activator_tfteam') {
        const name = (e.get('targetname') ?? '').toLowerCase();
        if (name) filters.set(name, e.getNumber('TeamNum', 0));
      }
    }
    const triggers: Array<{ mins: Vec3; maxs: Vec3; team: number; targets: string[] }> = [];
    for (const e of entities) {
      if (e.classname.toLowerCase() !== 'trigger_multiple') continue;
      const m = e.brushModelIndex;
      if (m <= 0 || m >= this.bsp.models.length) continue;
      if (e.getNumber('StartDisabled', 0) !== 0) continue;
      const box = this.modelBox(e, m);
      const filter = (e.get('filtername') ?? '').toLowerCase();
      const targets: string[] = [];
      for (const [k, v] of e.props) {
        if (!/^on/i.test(k)) continue;
        // Outputs separate their fields with ',' (older maps) or ESC (newer ones).
        const target = v.split(OUTPUT_ESC)[0].split(',')[0]?.trim().toLowerCase();
        if (target) targets.push(target);
      }
      triggers.push({ ...box, team: filters.get(filter) ?? 0, targets });
    }

    for (const e of entities) {
      const cls = e.classname.toLowerCase();
      const m = e.brushModelIndex;
      const hasModel = m > 0 && m < this.bsp.models.length;
      const origin = e.getVec3('origin');
      const team = e.getNumber('TeamNum', 0);
      const name = e.get('targetname') ?? '';
      if (hasModel && DYNAMIC_BRUSH.test(cls)) this.dynamicModels.push(m);
      if (hasModel && cls === 'func_brush' && name) this.dynamicModels.push(m);
      switch (cls) {
        case 'info_player_teamspawn':
          if (origin) {
            this.seeds.push(origin);
            this.pois.push({
              kind: POI_SPAWN,
              team,
              name: e.get('controlpoint') ?? '',
              index: -1,
              pos: origin,
              area: -1,
            });
          }
          break;
        // Counter-Strike: Global Offensive. Its teams use the same numbers as TF2's
        // (2 = Terrorists, 3 = Counter-Terrorists), so the spawn POIs read the same.
        case 'info_player_terrorist':
        case 'info_player_counterterrorist':
        case 'info_deathmatch_spawn':
          if (origin) {
            this.seeds.push(origin);
            this.pois.push({
              kind: POI_SPAWN,
              team:
                cls === 'info_player_terrorist'
                  ? TF_TEAM_RED
                  : cls === 'info_player_counterterrorist'
                    ? TF_TEAM_BLUE
                    : 0,
              name,
              index: -1,
              pos: origin,
              area: -1,
            });
          }
          break;
        case 'team_control_point':
          if (origin) {
            this.seeds.push(origin);
            this.pois.push({
              kind: POI_CONTROL_POINT,
              team: e.getNumber('point_default_owner', 0),
              name,
              index: e.getNumber('point_index', -1),
              pos: origin,
              area: -1,
            });
          }
          break;
        case 'item_teamflag':
          if (origin) {
            this.seeds.push(origin);
            this.pois.push({ kind: POI_FLAG, team, name, index: -1, pos: origin, area: -1 });
          }
          break;
        case 'path_track':
          if (origin) {
            this.seeds.push(origin);
            this.trackPoints.push(origin);
            this.pois.push({
              kind: POI_PATH_TRACK,
              team: 0,
              name,
              index: -1,
              pos: origin,
              area: -1,
            });
          }
          break;
        case 'item_healthkit_small':
        case 'item_healthkit_medium':
        case 'item_healthkit_full':
        case 'item_ammopack_small':
        case 'item_ammopack_medium':
        case 'item_ammopack_full':
          if (origin) {
            this.seeds.push(origin);
            const size = cls.endsWith('small') ? 1 : cls.endsWith('medium') ? 2 : 3;
            this.pois.push({
              kind: cls.startsWith('item_health') ? POI_HEALTH : POI_AMMO,
              team: 0,
              name,
              index: size,
              pos: origin,
              area: -1,
            });
          }
          break;
        default:
          break;
      }
      if (!hasModel) continue;
      const box = this.modelBox(e, m);
      const center = {
        x: (box.mins.x + box.maxs.x) / 2,
        y: (box.mins.y + box.maxs.y) / 2,
        z: box.mins.z + 8,
      };
      switch (cls) {
        case 'func_respawnroom':
          this.spawnRooms.push({ model: m, ...box, team, tag: 0 });
          break;
        case 'trigger_capture_area': {
          const idx = this.pois.length;
          this.pois.push({
            kind: POI_CAPTURE_AREA,
            team: 0,
            name: e.get('area_cap_point') ?? '',
            index: -1,
            pos: center,
            area: -1,
          });
          this.captureAreas.push({ model: m, ...box, team: 0, tag: idx });
          this.seeds.push(center);
          break;
        }
        case 'func_capturezone':
          this.captureZones.push({ model: m, ...box, team, tag: 0 });
          this.pois.push({ kind: POI_CAPTURE_ZONE, team, name, index: -1, pos: center, area: -1 });
          this.seeds.push(center);
          break;
        case 'func_bomb_target':
          this.pois.push({
            kind: POI_BOMB_TARGET,
            team: 0,
            name,
            index: -1,
            pos: center,
            area: -1,
          });
          this.seeds.push(center);
          break;
        case 'func_buyzone':
          this.pois.push({ kind: POI_BUY_ZONE, team, name, index: -1, pos: center, area: -1 });
          this.seeds.push(center);
          break;
        case 'func_regenerate':
          this.resupply.push({ model: m, ...box, team, tag: 0 });
          this.pois.push({ kind: POI_RESUPPLY, team, name, index: -1, pos: center, area: -1 });
          break;
        case 'trigger_hurt': {
          const dmg = e.getNumber('damage', 0);
          if (dmg >= NAV_LETHAL_HURT && e.getNumber('StartDisabled', 0) === 0)
            this.hurts.push({ model: m, ...box, team: 0, tag: dmg });
          break;
        }
        case 'func_door':
        case 'func_door_rotating': {
          let controlled = false;
          let owner = 0;
          const lname = name.toLowerCase();
          const bloatMin = { x: box.mins.x - 8, y: box.mins.y - 8, z: box.mins.z - 8 };
          const bloatMax = { x: box.maxs.x + 8, y: box.maxs.y + 8, z: box.maxs.z + 8 };
          for (const t of triggers) {
            const targeted =
              !!lname &&
              t.targets.some((n) =>
                n.endsWith('*') ? lname.startsWith(n.slice(0, -1)) : n === lname,
              );
            if (targeted || overlaps(t.mins, t.maxs, bloatMin, bloatMax)) {
              controlled = true;
              if (t.team) owner = t.team;
            }
          }
          this.blockerVols.push({ model: m, ...box, team: owner, tag: this.blockers.length });
          this.blockers.push({
            model: m,
            kind: BLOCKER_DOOR,
            triggerControlled: controlled,
            ownerTeam: owner,
          });
          break;
        }
        case 'func_brush':
          if (name) {
            this.blockerVols.push({ model: m, ...box, team: 0, tag: this.blockers.length });
            this.blockers.push({
              model: m,
              kind: BLOCKER_BRUSH,
              triggerControlled: false,
              ownerTeam: 0,
            });
          }
          break;
        default:
          break;
      }
    }
  }

  private disableDynamic(): void {
    this.savedSolid.length = 0;
    for (const m of this.dynamicModels) {
      this.savedSolid.push(this.col.isModelSolid(m));
      this.col.setModelSolid(m, false);
    }
  }

  private restoreDynamic(): void {
    for (let i = 0; i < this.dynamicModels.length; i++)
      this.col.setModelSolid(this.dynamicModels[i], this.savedSolid[i]);
  }

  // ─── Traces ───────────────────────────────────────────────────────────────

  /** Ground under (x, y) between zTop and zBot for the crouch hull; NaN when none or too steep. */
  private ground(x: number, y: number, zTop: number, zBot: number): number {
    this.stats.traces++;
    const a = this.a;
    const b = this.b;
    a.x = x;
    a.y = y;
    a.z = zTop;
    b.x = x;
    b.y = y;
    b.z = zBot;
    const tr = this.col.traceHull(
      a,
      b,
      this.hullMin,
      this.crouchMax,
      MASK_PLAYERSOLID,
      null,
      this.tr,
    );
    if (tr.startSolid || tr.fraction >= 1) return NaN;
    if (tr.plane.normal.z < NAV_MIN_NORMAL_Z) return NaN;
    const z = tr.endPos.z;
    // The centre must be supported too (not a hull balanced on a ledge's corner).
    this.stats.traces++;
    a.z = z + 1;
    b.z = z - NAV_SUPPORT;
    // A small box, not a line: floors of planks with slits hold a player.
    const line = this.col.traceHull(
      a,
      b,
      this.supportMin,
      this.supportMax,
      MASK_PLAYERSOLID,
      null,
      this.tr,
    );
    if (line.fraction >= 1 && !line.startSolid) return NaN;
    return z;
  }

  /** Crouch- (or standing-) hull sweep; returns the fraction travelled (0 when starting solid). */
  private sweep(
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    stand = false,
  ): number {
    this.stats.traces++;
    const a = this.a;
    const b = this.b;
    a.x = x0;
    a.y = y0;
    a.z = z0;
    b.x = x1;
    b.y = y1;
    b.z = z1;
    const tr = this.col.traceHull(
      a,
      b,
      this.hullMin,
      stand ? this.standMax : this.crouchMax,
      MASK_PLAYERSOLID,
      null,
      this.tr,
    );
    return tr.startSolid ? 0 : tr.fraction;
  }

  private standFits(x: number, y: number, z: number): boolean {
    this.stats.traces++;
    const a = this.a;
    a.x = x;
    a.y = y;
    a.z = z + 0.5;
    const tr = this.col.traceHull(
      a,
      a,
      this.hullMin,
      this.standMax,
      MASK_PLAYERSOLID,
      null,
      this.tr,
    );
    return !tr.startSolid;
  }

  private inWater(x: number, y: number, z: number): boolean {
    const a = this.a;
    a.x = x;
    a.y = y;
    a.z = z;
    return (this.col.pointContents(a) & (CONTENTS_WATER | CONTENTS_SLIME)) !== 0;
  }

  private inVolume(list: readonly Volume[], x: number, y: number, z: number): Volume | null {
    for (const v of list) {
      if (
        x < v.mins.x ||
        x > v.maxs.x ||
        y < v.mins.y ||
        y > v.maxs.y ||
        z < v.mins.z ||
        z > v.maxs.z
      )
        continue;
      const a = this.a;
      a.x = x;
      a.y = y;
      a.z = z;
      if (this.col.pointInModel(v.model, a)) return v;
    }
    return null;
  }

  // ─── Samples ──────────────────────────────────────────────────────────────

  private columnKey(gx: number, gy: number): number {
    return (gx + 4096) * 8192 + (gy + 4096);
  }

  private findNode(gx: number, gy: number, z: number): number {
    let n = this.columns.get(this.columnKey(gx, gy)) ?? -1;
    while (n >= 0) {
      if (Math.abs(this.nodeZ.data[n] - z) <= 9) return n;
      n = this.nodeNext.data[n];
    }
    return -1;
  }

  /** Adds a sample (or returns the existing one); −1 when the spot is not walkable. */
  private addNode(gx: number, gy: number, z: number): number {
    const existing = this.findNode(gx, gy, z);
    if (existing >= 0) return existing;
    if (this.nodeGX.length >= this.maxNodes) return -1;
    const x = gx * this.cell;
    const y = gy * this.cell;
    if (this.inVolume(this.hurts, x, y, z + 20)) return -1;
    let attr = 0;
    let tag = -1;
    let blocker = -1;
    if (!this.standFits(x, y, z)) attr |= NAV_CROUCH;
    if (this.inWater(x, y, z + 8)) {
      attr |= NAV_WATER;
      if (this.inWater(x, y, z + 64)) attr |= NAV_DEEP_WATER;
    }
    const spawn = this.inVolume(this.spawnRooms, x, y, z + 24);
    if (spawn)
      attr |=
        spawn.team === TF_TEAM_RED
          ? NAV_RED_SPAWN
          : spawn.team === TF_TEAM_BLUE
            ? NAV_BLUE_SPAWN
            : 0;
    const cap = this.inVolume(this.captureAreas, x, y, z + 24);
    if (cap) {
      attr |= NAV_CAPTURE;
      tag = cap.tag;
    }
    if (this.inVolume(this.captureZones, x, y, z + 24)) attr |= NAV_CAPTURE_ZONE;
    if (this.inVolume(this.resupply, x, y, z + 24)) attr |= NAV_RESUPPLY;
    for (const v of this.blockerVols) {
      if (
        x + this.hull.halfWidth > v.mins.x &&
        x - this.hull.halfWidth < v.maxs.x &&
        y + this.hull.halfWidth > v.mins.y &&
        y - this.hull.halfWidth < v.maxs.y &&
        z + this.hull.standHeight > v.mins.z &&
        z + this.hull.step < v.maxs.z
      ) {
        attr |= NAV_DOOR;
        blocker = v.tag;
        break;
      }
    }
    for (const t of this.trackPoints) {
      const dx = t.x - x;
      const dy = t.y - y;
      if (dx * dx + dy * dy < 160 * 160 && Math.abs(t.z - z) < 120) {
        attr |= NAV_CART_PATH;
        break;
      }
    }
    const n = this.nodeGX.push(gx);
    this.nodeGY.push(gy);
    this.nodeZ.push(z);
    this.nodeAttr.push(attr);
    this.nodeTag.push(tag);
    this.nodeBlocker.push(blocker);
    const key = this.columnKey(gx, gy);
    this.nodeNext.push(this.columns.get(key) ?? -1);
    this.columns.set(key, n);
    for (let d = 0; d < 4; d++) {
      this.link.push(-2);
      this.linkType.push(0);
    }
    if (this.qTail === this.queue.length) {
      const q = new Int32Array(this.queue.length * 2);
      q.set(this.queue);
      this.queue = q;
    }
    this.queue[this.qTail++] = n;
    return n;
  }

  private plantSeeds(stop: number): void {
    const c = this.cell;
    while (this.seedCursor < this.seeds.length && this.stats.traces < stop) {
      const s = this.seeds[this.seedCursor++];
      this.stats.seeds++;
      let planted = false;
      // Try the snapped grid point, then its neighbours (a seed can sit in a prop).
      for (let r = 0; r <= 2 && !planted; r++) {
        for (let dy = -r; dy <= r && !planted; dy++) {
          for (let dx = -r; dx <= r && !planted; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
            const gx = Math.round(s.x / c) + dx;
            const gy = Math.round(s.y / c) + dy;
            for (const up of [40, 12, 80]) {
              const z = this.ground(gx * c, gy * c, s.z + up, s.z - 400);
              if (Number.isNaN(z)) continue;
              if (this.addNode(gx, gy, z) >= 0) {
                planted = true;
                break;
              }
            }
          }
        }
      }
      if (!planted) this.stats.seedsFailed++;
    }
    if (this.seedCursor >= this.seeds.length) this.phase = PHASE_FLOOD;
  }

  private setLink(n: number, d: number, to: number, type: number): void {
    this.link.data[n * 4 + d] = to;
    this.linkType.data[n * 4 + d] = type;
  }

  private flood(stop: number): void {
    const c = this.cell;
    while (this.qHead < this.qTail && this.stats.traces < stop) {
      const n = this.queue[this.qHead++];
      const gx = this.nodeGX.data[n];
      const gy = this.nodeGY.data[n];
      const z = this.nodeZ.data[n];
      const x = gx * c;
      const y = gy * c;
      const water = (this.nodeAttr.data[n] & NAV_WATER) !== 0;
      for (let d = 0; d < 4; d++) {
        if (this.link.data[n * 4 + d] !== -2) continue;
        const ngx = gx + DIRS_X[d];
        const ngy = gy + DIRS_Y[d];
        const nx = ngx * c;
        const ny = ngy * c;
        // A neighbour that already walks to us is walkable back (steps are symmetric).
        const known = this.findNode(ngx, ngy, z);
        if (
          known >= 0 &&
          this.link.data[known * 4 + OPPOSITE[d]] === n &&
          this.linkType.data[known * 4 + OPPOSITE[d]] === CONN_WALK
        ) {
          this.setLink(n, d, known, CONN_WALK);
          continue;
        }
        let target = -1;
        let type = CONN_WALK;
        // Walk / step / drop: across at step height, then down — standing if
        // the standing hull fits, else crouched (both ends become crouch areas).
        let h = z + this.hull.step;
        let crouch = false;
        let f = this.sweep(x, y, h, nx, ny, h, true);
        if (f < 1) {
          h = z + 1;
          f = this.sweep(x, y, h, nx, ny, h, true);
        }
        if (f < 1) {
          crouch = true;
          h = z + this.hull.step;
          f = this.sweep(x, y, h, nx, ny, h);
          if (f === 0) {
            h = z + 1;
            f = this.sweep(x, y, h, nx, ny, h);
          }
        }
        if (f >= 1) {
          const gz = this.ground(nx, ny, h, z - this.hull.drop);
          if (!Number.isNaN(gz)) {
            if (gz <= z + this.hull.step + 0.5 && gz >= z - this.hull.step - 0.5) type = CONN_WALK;
            else if (gz < z) type = CONN_DROP;
            else type = CONN_JUMP;
            target = this.addNode(ngx, ngy, gz);
            if (target >= 0 && crouch) {
              this.nodeAttr.data[n] |= NAV_CROUCH;
              this.nodeAttr.data[target] |= NAV_CROUCH;
            }
          }
        }
        if (target < 0) {
          // Jump (or swim) up, across, down.
          let jump = this.hull.jump;
          if (water) {
            let top = z + 8;
            while (top < z + 1024 && this.inWater(x, y, top)) top += 16;
            jump = Math.max(jump, top - z + 40);
          }
          const fu = this.sweep(x, y, z + 1, x, y, z + jump);
          const hz = z + 1 + (jump - 1) * fu;
          if (fu > 0 && hz - z >= this.hull.step + 2) {
            // Land in the next cell, or the one after (over a lip a hull can't stand on).
            for (let k = 1; k <= 2 && target < 0; k++) {
              const lgx = gx + DIRS_X[d] * k;
              const lgy = gy + DIRS_Y[d] * k;
              const fa = this.sweep(x, y, hz, lgx * c, lgy * c, hz);
              if (fa < 1) break;
              const gz = this.ground(lgx * c, lgy * c, hz, z - this.hull.drop);
              if (!Number.isNaN(gz)) {
                type = CONN_JUMP;
                target = this.addNode(lgx, lgy, gz);
              }
            }
          }
        }
        this.setLink(n, d, target, target >= 0 ? type : 0);
      }
    }
    if (this.qHead >= this.qTail || this.nodeGX.length >= this.maxNodes) {
      // Untested links (the node cap was hit) are dead ends.
      const L = this.link.data;
      for (let i = 0; i < this.link.length; i++) if (L[i] === -2) L[i] = -1;
      this.stats.nodes = this.nodeGX.length;
      this.phase = PHASE_MERGE;
    }
  }

  // ─── Areas ────────────────────────────────────────────────────────────────

  private walkTo(n: number, d: number): number {
    const m = this.link.data[n * 4 + d];
    if (m < 0 || this.linkType.data[n * 4 + d] !== CONN_WALK) return -1;
    if (
      this.link.data[m * 4 + OPPOSITE[d]] !== n ||
      this.linkType.data[m * 4 + OPPOSITE[d]] !== CONN_WALK
    )
      return -1;
    return m;
  }

  private compatible(s: number, m: number): boolean {
    const MERGE =
      NAV_CROUCH |
      NAV_WATER |
      NAV_DEEP_WATER |
      NAV_RED_SPAWN |
      NAV_BLUE_SPAWN |
      NAV_CAPTURE |
      NAV_RESUPPLY |
      NAV_DOOR |
      NAV_CAPTURE_ZONE;
    return (
      (this.nodeAttr.data[s] & MERGE) === (this.nodeAttr.data[m] & MERGE) &&
      this.nodeTag.data[s] === this.nodeTag.data[m] &&
      this.nodeBlocker.data[s] === this.nodeBlocker.data[m]
    );
  }

  /**
   * The largest rectangle growing from `s` in +x/+y (primary axis first),
   * as row-major node ids; w × h.
   */
  private grow(s: number, xFirst: boolean, out: number[]): { w: number; h: number } {
    const dA = xFirst ? 0 : 2; // primary direction (+x or +y)
    const dB = xFirst ? 2 : 0; // secondary
    const Z = this.nodeZ.data;
    const area = this.nodeArea;
    out.length = 0;
    // First line along the primary axis.
    const line: number[] = [s];
    let cur = s;
    while (line.length < this.maxCells) {
      const nxt = this.walkTo(cur, dA);
      if (nxt < 0 || area[nxt] >= 0 || !this.compatible(s, nxt)) break;
      line.push(nxt);
      cur = nxt;
    }
    const slopeA = line.length > 1 ? Z[line[1]] - Z[line[0]] : 0;
    for (let i = 0; i < line.length; i++) {
      if (Math.abs(Z[line[i]] - (Z[s] + slopeA * i)) > 10) {
        line.length = i;
        break;
      }
    }
    out.push(...line);
    const w = line.length;
    let h = 1;
    let prev = line;
    let slopeB = NaN;
    while (h < this.maxCells) {
      const row: number[] = [];
      let ok = true;
      for (let i = 0; i < w; i++) {
        const m = this.walkTo(prev[i], dB);
        if (m < 0 || area[m] >= 0 || !this.compatible(s, m)) {
          ok = false;
          break;
        }
        if (i > 0 && this.walkTo(row[i - 1], dA) !== m) {
          ok = false;
          break;
        }
        row.push(m);
      }
      if (!ok) break;
      if (Number.isNaN(slopeB)) slopeB = Z[row[0]] - Z[s];
      for (let i = 0; i < w && ok; i++) {
        if (Math.abs(Z[row[i]] - (Z[s] + slopeA * i + slopeB * h)) > 10) ok = false;
      }
      if (!ok) break;
      out.push(...row);
      prev = row;
      h++;
    }
    return xFirst ? { w, h } : { w: h, h: w };
  }

  private merge(): void {
    const N = this.nodeGX.length;
    this.nodeArea = new Int32Array(N).fill(-1);
    const order = new Int32Array(N);
    for (let i = 0; i < N; i++) order[i] = i;
    const GX = this.nodeGX.data;
    const GY = this.nodeGY.data;
    const Z = this.nodeZ.data;
    order.sort((p, q) => GY[p] - GY[q] || GX[p] - GX[q] || Z[p] - Z[q]);
    const gx0: number[] = [];
    const gy0: number[] = [];
    const gx1: number[] = [];
    const gy1: number[] = [];
    const cz: number[] = [];
    const dzdx: number[] = [];
    const dzdy: number[] = [];
    const attrs: number[] = [];
    const blocker: number[] = [];
    const rectA: number[] = [];
    const rectB: number[] = [];
    for (let k = 0; k < N; k++) {
      const s = order[k];
      if (this.nodeArea[s] >= 0) continue;
      this.grow(s, true, rectA);
      this.grow(s, false, rectB);
      const rect = rectB.length > rectA.length ? rectB : rectA;
      const id = gx0.length;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      let sz = 0;
      let attr = 0;
      for (const n of rect) {
        this.nodeArea[n] = id;
        minX = Math.min(minX, GX[n]);
        maxX = Math.max(maxX, GX[n]);
        minY = Math.min(minY, GY[n]);
        maxY = Math.max(maxY, GY[n]);
        sz += Z[n];
        attr |= this.nodeAttr.data[n];
      }
      const mz = sz / rect.length;
      const mx = (minX + maxX) / 2;
      const my = (minY + maxY) / 2;
      let sxz = 0;
      let sxx = 0;
      let syz = 0;
      let syy = 0;
      for (const n of rect) {
        const dx = (GX[n] - mx) * this.cell;
        const dy = (GY[n] - my) * this.cell;
        sxz += dx * (Z[n] - mz);
        sxx += dx * dx;
        syz += dy * (Z[n] - mz);
        syy += dy * dy;
      }
      gx0.push(minX);
      gy0.push(minY);
      gx1.push(maxX);
      gy1.push(maxY);
      cz.push(mz);
      dzdx.push(sxx > 0 ? sxz / sxx : 0);
      dzdy.push(syy > 0 ? syz / syy : 0);
      attrs.push(attr);
      blocker.push(this.nodeBlocker.data[s]);
    }
    const n = gx0.length;
    this.stats.areas = n;
    this.areaData = {
      cellSize: this.cell,
      areaCount: n,
      gx0: Int16Array.from(gx0),
      gy0: Int16Array.from(gy0),
      gx1: Int16Array.from(gx1),
      gy1: Int16Array.from(gy1),
      cz: Float32Array.from(cz),
      dzdx: Float32Array.from(dzdx),
      dzdy: Float32Array.from(dzdy),
      attrs: Uint32Array.from(attrs),
      blocker: Int16Array.from(blocker),
      sector: new Uint16Array(n),
      connStart: new Uint32Array(n + 1),
      connTo: new Uint32Array(0),
      connType: new Uint8Array(0),
      portal: new Float32Array(0),
      sectorCount: 0,
      vis: new Uint8Array(0),
      pois: this.pois,
      blockers: this.blockers,
    };
  }

  private connect(): void {
    const d = this.areaData!;
    const n = d.areaCount;
    const N = this.nodeGX.length;
    const GX = this.nodeGX.data;
    const GY = this.nodeGY.data;
    const Z = this.nodeZ.data;
    const c = this.cell;
    interface Acc {
      from: number;
      to: number;
      type: number;
      minX: number;
      minY: number;
      maxX: number;
      maxY: number;
      sz: number;
      count: number;
    }
    const map = new Map<number, Acc>();
    for (let a = 0; a < N; a++) {
      const A = this.nodeArea[a];
      for (let k = 0; k < 4; k++) {
        const b = this.link.data[a * 4 + k];
        if (b < 0) continue;
        const B = this.nodeArea[b];
        if (A === B) continue;
        const key = A * n + B;
        let acc = map.get(key);
        if (!acc) {
          acc = {
            from: A,
            to: B,
            type: 3,
            minX: Infinity,
            minY: Infinity,
            maxX: -Infinity,
            maxY: -Infinity,
            sz: 0,
            count: 0,
          };
          map.set(key, acc);
        }
        acc.type = Math.min(acc.type, this.linkType.data[a * 4 + k]);
        const mx = ((GX[a] + GX[b]) / 2) * c;
        const my = ((GY[a] + GY[b]) / 2) * c;
        acc.minX = Math.min(acc.minX, mx);
        acc.minY = Math.min(acc.minY, my);
        acc.maxX = Math.max(acc.maxX, mx);
        acc.maxY = Math.max(acc.maxY, my);
        acc.sz += Z[b];
        acc.count++;
      }
    }
    const list = [...map.values()].sort((p, q) => p.from - q.from || p.to - q.to);
    const m = list.length;
    d.connTo = new Uint32Array(m);
    d.connType = new Uint8Array(m);
    d.portal = new Float32Array(m * 5);
    const counts = new Uint32Array(n + 1);
    for (const acc of list) counts[acc.from + 1]++;
    for (let i = 0; i < n; i++) counts[i + 1] += counts[i];
    d.connStart = counts;
    for (let i = 0; i < m; i++) {
      const acc = list[i];
      d.connTo[i] = acc.to;
      d.connType[i] = acc.type;
      d.portal[i * 5] = acc.minX;
      d.portal[i * 5 + 1] = acc.minY;
      d.portal[i * 5 + 2] = acc.maxX;
      d.portal[i * 5 + 3] = acc.maxY;
      d.portal[i * 5 + 4] = acc.sz / acc.count;
    }
    this.stats.connections = m;

    // Pickups mark their areas.
    const mesh = new NavMesh(d);
    for (const p of this.pois) {
      p.area = mesh.nearestArea(p.pos.x, p.pos.y, p.pos.z + 8, 400);
      if (p.area < 0) continue;
      if (p.kind === POI_HEALTH) d.attrs[p.area] |= NAV_HEALTH;
      else if (p.kind === POI_AMMO) d.attrs[p.area] |= NAV_AMMO;
    }

    // Sectors.
    const SXY = 512;
    const SZ = 192;
    const keyToSector = new Map<string, number>();
    const members: number[][] = [];
    for (let a = 0; a < n; a++) {
      const key = `${Math.floor(mesh.cx[a] / SXY)},${Math.floor(mesh.cy[a] / SXY)},${Math.floor(d.cz[a] / SZ)}`;
      let s = keyToSector.get(key);
      if (s === undefined) {
        s = members.length;
        keyToSector.set(key, s);
        members.push([]);
      }
      d.sector[a] = s;
      members[s].push(a);
    }
    d.sectorCount = members.length;
    this.stats.sectors = members.length;
    const rowBytes = (members.length + 7) >> 3;
    this.visRows = new Uint8Array(rowBytes * members.length);
    d.vis = this.visRows;
    const leafs = this.bsp.leafs;
    this.sectorSamples = members.map((list) => {
      const sorted = list.slice().sort((p, q) => mesh.areaSize(q) - mesh.areaSize(p) || p - q);
      return sorted.slice(0, 3).map((a) => ({
        x: mesh.cx[a],
        y: mesh.cy[a],
        z: d.cz[a] + ((d.attrs[a] & NAV_CROUCH) !== 0 ? 40 : 64),
      }));
    });
    this.sectorClusters = this.sectorSamples.map((ps) =>
      ps.map((p) => {
        const leaf = findLeaf(this.bsp, p);
        return leaf >= 0 && leaf < leafs.count ? leafs.cluster[leaf] : -1;
      }),
    );
    this.visI = 0;
    this.visJ = 1;
  }

  private pvsRow(cluster: number): Uint8Array | null {
    const vis = this.bsp.visibility;
    if (!vis || cluster < 0) return null;
    let row = this.pvsCache.get(cluster);
    if (!row) {
      row = decompressVis(vis, cluster, 0);
      this.pvsCache.set(cluster, row);
    }
    return row;
  }

  private visibility(stop: number): void {
    const S = this.sectorSamples.length;
    const rowBytes = (S + 7) >> 3;
    const range2 = this.visRange * this.visRange;
    while (this.visI < S && this.stats.traces < stop) {
      const i = this.visI;
      const j = this.visJ;
      if (j >= S) {
        this.visI++;
        this.visJ = this.visI + 1;
        continue;
      }
      this.visJ++;
      const A = this.sectorSamples[i];
      const B = this.sectorSamples[j];
      let visible = false;
      for (let p = 0; p < A.length && !visible; p++) {
        const row = this.pvsRow(this.sectorClusters[i][p]);
        for (let q = 0; q < B.length && !visible; q++) {
          const a = A[p];
          const b = B[q];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dz = a.z - b.z;
          if (dx * dx + dy * dy + dz * dz > range2) continue;
          if (row && !visTest(row, this.sectorClusters[j][q])) continue;
          this.stats.traces++;
          const tr = this.col.traceLine(a, b, MASK_BLOCKLOS, null, this.tr);
          if (tr.fraction >= 1 && !tr.startSolid) visible = true;
        }
      }
      if (visible) {
        this.visRows[i * rowBytes + (j >> 3)] |= 1 << (j & 7);
        this.visRows[j * rowBytes + (i >> 3)] |= 1 << (i & 7);
        this.stats.visPairs++;
      }
    }
    if (this.visI >= S) {
      this.mesh = new NavMesh(this.areaData!);
      // Free the samples.
      this.columns.clear();
      this.pvsCache.clear();
      this.phase = PHASE_DONE;
    }
  }
}

function overlaps(aMin: Vec3, aMax: Vec3, bMin: Vec3, bMax: Vec3): boolean {
  return (
    aMin.x <= bMax.x &&
    aMax.x >= bMin.x &&
    aMin.y <= bMax.y &&
    aMax.y >= bMin.y &&
    aMin.z <= bMax.z &&
    aMax.z >= bMin.z
  );
}

/** Generates a map's mesh in one go. */
export function generateNavMesh(
  bsp: BspFile,
  collision: MapCollision,
  opts: NavGenOptions = {},
): { mesh: NavMesh; stats: NavGenStats } {
  const g = new NavGenerator(bsp, collision, opts);
  const mesh = g.run();
  return { mesh, stats: g.stats };
}
