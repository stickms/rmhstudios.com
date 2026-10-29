/**
 * What every bot in a world shares (the role of TheTFBots / CTFBotManager
 * plus the TF nav mesh's per-match state): the navigation mesh (from the map
 * package, a cache, or generated here a slice per tick when a package has
 * none), the pathfinder with its runtime door state and danger map, the
 * class roster (CTFBot::GetNextSpawnClassname's preset rosters), pickups
 * and dispensers to retreat to, capture-zone areas, and cached sentry and
 * sniper spots.
 *
 * One manager per GameWorld (`getBotManager`), updated once per tick by the
 * first bot that thinks.
 */

import {
  TF_CLASS_COUNT,
  TF_CLASS_DEMOMAN,
  TF_CLASS_ENGINEER,
  TF_CLASS_HEAVYWEAPONS,
  TF_CLASS_MEDIC,
  TF_CLASS_PYRO,
  TF_CLASS_SCOUT,
  TF_CLASS_SNIPER,
  TF_CLASS_SOLDIER,
  TF_CLASS_SPY,
  TF_TEAM_BLUE,
  TF_TEAM_RED,
  enemyTeam,
} from '../../core/constants';
import type { Vec3 } from '../../core/vec';
import type { Entity } from '../../sim/entity';
import { MAX_PLAYERS, type GameWorld } from '../../sim/world';
import type { Player } from '../../sim/player';
import { HealthKit, AmmoPack, TFPowerup } from '../../sim/pickups';
import { objectives, teamMayCapturePoint } from '../../sim/entities';
import type { TriggerAreaCapture } from '../../sim/entities';
import { NavGenerator } from '../nav/generate';
import {
  NAV_BLUE_SPAWN,
  NAV_CROUCH,
  NAV_DEEP_WATER,
  NAV_DOOR,
  NAV_RED_SPAWN,
  NAV_WATER,
  POI_RESUPPLY,
  POI_SPAWN,
  type NavMesh,
} from '../nav/nav-mesh';
import { NavBlockState, NavPathfinder } from '../path';
import type { BotSkill } from './difficulty';

// ─── Nav provisioning ───────────────────────────────────────────────────────

/** Path recomputations a world's bots may do per tick (the rest keep their paths a tick longer). */
export const PATH_SEARCHES_PER_TICK = 3;

/** Traces of nav generation per tick when a map package has no mesh. */
export const NAV_GEN_TRACES_PER_TICK = 1500;

const navCache = new Map<string, NavMesh>();

const navKey = (world: GameWorld): string | null =>
  world.map
    ? `${world.map.name}:${world.map.bsp.mapRevision}:${world.map.bsp.entityText.length}`
    : null;

/** Makes a mesh available to every world on this map (the package's nav.bin, decoded). */
export function provideNavMesh(world: GameWorld, mesh: NavMesh): void {
  const key = navKey(world);
  if (key) navCache.set(key, mesh);
  const m = managers.get(world);
  if (m) m.setMesh(mesh);
}

/** Forgets every cached mesh (tests). */
export function clearNavCache(): void {
  navCache.clear();
}

/** The cached mesh for a world's map, if any. */
export function cachedNavMesh(world: GameWorld): NavMesh | null {
  const key = navKey(world);
  return key ? (navCache.get(key) ?? null) : null;
}

// ─── Rosters (CTFBot::GetNextSpawnClassname) ────────────────────────────────

interface RosterEntry {
  cls: number;
  /** Team must have this many members to pick it. */
  minTeam: number;
  /** One per this many team members is wanted (0 = no quota). */
  perTeam: number;
  /** At least this many once the team is big enough. */
  min: number;
  /** At most this many, by difficulty (−1 = no limit). */
  max: readonly [number, number, number, number];
}

const NO_LIMIT = -1;

const DEFENSE: readonly RosterEntry[] = [
  { cls: TF_CLASS_ENGINEER, minTeam: 0, perTeam: 4, min: 1, max: [1, 2, 3, 3] },
  {
    cls: TF_CLASS_SOLDIER,
    minTeam: 0,
    perTeam: 0,
    min: 0,
    max: [NO_LIMIT, NO_LIMIT, NO_LIMIT, NO_LIMIT],
  },
  { cls: TF_CLASS_DEMOMAN, minTeam: 0, perTeam: 0, min: 0, max: [2, 3, 3, 3] },
  {
    cls: TF_CLASS_PYRO,
    minTeam: 3,
    perTeam: 0,
    min: 0,
    max: [NO_LIMIT, NO_LIMIT, NO_LIMIT, NO_LIMIT],
  },
  { cls: TF_CLASS_HEAVYWEAPONS, minTeam: 3, perTeam: 0, min: 0, max: [1, 1, 2, 2] },
  { cls: TF_CLASS_MEDIC, minTeam: 4, perTeam: 4, min: 1, max: [1, 1, 2, 2] },
  { cls: TF_CLASS_SNIPER, minTeam: 5, perTeam: 0, min: 0, max: [0, 1, 1, 1] },
  { cls: TF_CLASS_SPY, minTeam: 5, perTeam: 0, min: 0, max: [0, 1, 2, 2] },
];

const OFFENSE: readonly RosterEntry[] = [
  { cls: TF_CLASS_SCOUT, minTeam: 0, perTeam: 0, min: 1, max: [3, 3, 3, 3] },
  {
    cls: TF_CLASS_SOLDIER,
    minTeam: 0,
    perTeam: 0,
    min: 0,
    max: [NO_LIMIT, NO_LIMIT, NO_LIMIT, NO_LIMIT],
  },
  { cls: TF_CLASS_DEMOMAN, minTeam: 0, perTeam: 0, min: 0, max: [2, 3, 3, 3] },
  {
    cls: TF_CLASS_PYRO,
    minTeam: 3,
    perTeam: 0,
    min: 0,
    max: [NO_LIMIT, NO_LIMIT, NO_LIMIT, NO_LIMIT],
  },
  { cls: TF_CLASS_HEAVYWEAPONS, minTeam: 3, perTeam: 0, min: 0, max: [1, 1, 2, 2] },
  { cls: TF_CLASS_MEDIC, minTeam: 4, perTeam: 4, min: 1, max: [1, 1, 2, 2] },
  { cls: TF_CLASS_SNIPER, minTeam: 5, perTeam: 0, min: 0, max: [0, 1, 1, 1] },
  { cls: TF_CLASS_SPY, minTeam: 5, perTeam: 0, min: 0, max: [0, 1, 2, 2] },
  { cls: TF_CLASS_ENGINEER, minTeam: 5, perTeam: 0, min: 0, max: [1, 1, 1, 1] },
];

// ─── Pickups ────────────────────────────────────────────────────────────────

export interface SupplySpot {
  entity: Entity | null;
  pos: Vec3;
  health: boolean;
  ammo: boolean;
  /** Team that may use it (0 any). */
  team: number;
}

// ─── The manager ────────────────────────────────────────────────────────────

const managers = new WeakMap<GameWorld, BotManager>();

export function getBotManager(world: GameWorld): BotManager {
  let m = managers.get(world);
  if (!m) {
    m = new BotManager(world);
    managers.set(world, m);
  }
  return m;
}

export class BotManager {
  readonly world: GameWorld;
  mesh: NavMesh | null = null;
  pathfinder: NavPathfinder | null = null;
  blocks: NavBlockState | null = null;
  private generator: NavGenerator | null = null;
  private lastTick = -1;
  private readonly wasAlive = new Uint8Array(MAX_PLAYERS + 1);
  /** Bots per team will choose from these classes, in order (offline player's choice). */
  readonly classPreference = new Map<number, number[]>();
  /** tf_bot_force_class (0 = off). */
  forceClass = 0;
  supplies: SupplySpot[] = [];
  private suppliesAt = -1000;
  private readonly captureAreaCache = new Map<number, Int32Array>();
  private readonly spotCache = new Map<string, Int32Array>();
  /** Ticks spent generating the mesh (diagnostics). */
  navGenTicks = 0;
  /** Path searches left this tick (NavPathfinder.find calls by followers). */
  searchesLeft = PATH_SEARCHES_PER_TICK;
  /** The follower host every bot of this world shares. */
  readonly followerHost = {
    pathfinder: null as unknown as NavPathfinder,
    takeSearch: (): boolean => {
      if (this.searchesLeft <= 0) return false;
      this.searchesLeft--;
      return true;
    },
  };
  /** Each player's nav area this tick (−1 off the mesh / dead). */
  readonly playerArea = new Int32Array(MAX_PLAYERS + 1).fill(-1);

  constructor(world: GameWorld) {
    this.world = world;
    const cached = cachedNavMesh(world);
    if (cached) this.setMesh(cached);
    else if (world.map) this.generator = new NavGenerator(world.map.bsp, world.map.collision);
  }

  setMesh(mesh: NavMesh): void {
    this.mesh = mesh;
    this.generator = null;
    this.blocks = new NavBlockState(this.world, mesh);
    this.pathfinder = new NavPathfinder(mesh, this.world, this.blocks);
    this.followerHost.pathfinder = this.pathfinder;
    this.captureAreaCache.clear();
    this.spotCache.clear();
  }

  /** Once per tick (the first bot to think calls it). */
  update(): void {
    const world = this.world;
    if (this.lastTick === world.tickCount) return;
    this.lastTick = world.tickCount;
    this.searchesLeft = PATH_SEARCHES_PER_TICK;
    if (!this.mesh && this.generator) {
      this.navGenTicks++;
      if (this.generator.step(NAV_GEN_TRACES_PER_TICK)) {
        const mesh = this.generator.result();
        provideNavMesh(world, mesh);
        this.setMesh(mesh);
      }
    }
    // Deaths mark danger for the victim's team.
    const pf = this.pathfinder;
    for (let i = 1; i <= MAX_PLAYERS; i++) {
      const e = world.entities[i] as Player | undefined;
      const alive = !!e && !e.removed && e.alive;
      if (this.wasAlive[i] && !alive && e && !e.removed && pf && this.mesh) {
        const a = this.mesh.nearestArea(e.origin.x, e.origin.y, e.origin.z + 4, 200);
        if (a >= 0) pf.danger.add(e.team, a, 1, world.curtime);
      }
      this.wasAlive[i] = alive ? 1 : 0;
      this.playerArea[i] =
        alive && this.mesh
          ? this.mesh.areaAt(e!.origin.x, e!.origin.y, e!.origin.z + 4, 160, 40)
          : -1;
    }
    if (world.curtime - this.suppliesAt > 2) this.refreshSupplies();
  }

  private refreshSupplies(): void {
    this.suppliesAt = this.world.curtime;
    const out: SupplySpot[] = [];
    this.world.forEachEntity((e) => {
      if (e instanceof TFPowerup) {
        if (e.disabled || e.respawning) return;
        out.push({
          entity: e,
          pos: e.origin,
          health: e instanceof HealthKit,
          ammo: e instanceof AmmoPack,
          team: 0,
        });
      }
    });
    if (this.mesh) {
      for (const p of this.mesh.pois) {
        if (p.kind === POI_RESUPPLY)
          out.push({ entity: null, pos: p.pos, health: true, ammo: true, team: p.team });
      }
    }
    this.supplies = out;
  }

  // ─── Class choice ────────────────────────────────────────────────────────

  /** Is `team` attacking (offense roster) or defending right now? */
  teamIsDefending(team: number): boolean {
    const o = objectives(this.world);
    if (o.gameType === 'pl') return team === TF_TEAM_RED;
    if (o.gameType === 'koth') {
      const p = o.points[0];
      return !!p && p.ownerTeam === team;
    }
    if (o.gameType === 'cp' || o.gameType === 'cp_ad') {
      let capture = 0;
      let defend = 0;
      for (const p of o.points) {
        if (p.removed || !p.inMiniRound) continue;
        if (p.ownerTeam !== team && teamMayCapturePoint(this.world, team, p.pointIndex)) capture++;
        else if (
          p.ownerTeam === team &&
          teamMayCapturePoint(this.world, enemyTeam(team), p.pointIndex)
        )
          defend++;
      }
      return capture === 0 && defend > 0;
    }
    return false;
  }

  /** The class a bot should (re)spawn as (CTFBot::GetNextSpawnClassname's roster rules). */
  chooseClass(bot: Player, skill: BotSkill, pick: (n: number) => number): number {
    if (this.forceClass > 0 && this.forceClass < TF_CLASS_COUNT) return this.forceClass;
    const team = bot.team;
    const pref = this.classPreference.get(team);
    if (pref && pref.length > 0) {
      // The offline player's line-up, in order among the bots of the team.
      let ordinal = 0;
      this.world.forEachPlayer((p) => {
        if (p.isBot && p.team === team && p.id < bot.id) ordinal++;
      });
      return pref[ordinal % pref.length];
    }
    const counts = new Array<number>(TF_CLASS_COUNT).fill(0);
    let teamSize = 0;
    this.world.forEachPlayer((p) => {
      if (p.team !== team || p === bot) return;
      teamSize++;
      const c = p.desiredClass || p.playerClass;
      if (c > 0 && c < TF_CLASS_COUNT) counts[c]++;
    });
    const roster = this.teamIsDefending(team) ? DEFENSE : OFFENSE;
    const level = skill.level;
    let required: number[] = [];
    let requiredMin = Infinity;
    const allowed: number[] = [];
    for (const r of roster) {
      if (teamSize < r.minTeam) continue;
      const have = counts[r.cls];
      if (required.length > 0 && have > requiredMin) continue;
      if (have < r.min) {
        if (have < requiredMin) {
          requiredMin = have;
          required = [];
        }
        required.push(r.cls);
        continue;
      }
      const max = r.max[level];
      if (max !== NO_LIMIT && have >= max) continue;
      if (r.perTeam > 0 && have - r.minTeam < Math.floor(teamSize / r.perTeam)) {
        if (have < requiredMin) {
          requiredMin = have;
          required = [];
        }
        required.push(r.cls);
        continue;
      }
      if (required.length === 0) allowed.push(r.cls);
    }
    const from = required.length > 0 ? required : allowed.length > 0 ? allowed : [TF_CLASS_SOLDIER];
    return from[pick(from.length)];
  }

  // ─── Places ──────────────────────────────────────────────────────────────

  /** Nav areas inside a capture trigger (cached). */
  captureAreas(trigger: TriggerAreaCapture): Int32Array {
    const hit = this.captureAreaCache.get(trigger.id);
    if (hit && !trigger.trainWatcher) return hit;
    const mesh = this.mesh;
    if (!mesh) return new Int32Array(0);
    const c = trigger.worldSpaceCenter({ x: 0, y: 0, z: 0 });
    const mins = {
      x: trigger.origin.x + trigger.mins.x,
      y: trigger.origin.y + trigger.mins.y,
      z: trigger.origin.z + trigger.mins.z,
    };
    const maxs = {
      x: trigger.origin.x + trigger.maxs.x,
      y: trigger.origin.y + trigger.maxs.y,
      z: trigger.origin.z + trigger.maxs.z,
    };
    const list: number[] = [];
    const p = { x: 0, y: 0, z: 0 };
    mesh.forAreasInBox(mins.x, mins.y, maxs.x, maxs.y, mins.z - 80, maxs.z + 20, (a) => {
      p.x = mesh.cx[a];
      p.y = mesh.cy[a];
      p.z = mesh.cz[a] + 24;
      if (this.world.pointInBrushEntity(trigger, p)) list.push(a);
    });
    if (list.length === 0) {
      const a = mesh.nearestArea(c.x, c.y, mins.z + 8, 400);
      if (a >= 0) list.push(a);
    }
    const out = Int32Array.from(list);
    this.captureAreaCache.set(trigger.id, out);
    return out;
  }

  /** Spawn-room-free, dry, standing area test for spots. */
  private spotOk(a: number, team: number): boolean {
    const mesh = this.mesh!;
    const at = mesh.attrs[a];
    if (at & (NAV_RED_SPAWN | NAV_BLUE_SPAWN | NAV_DOOR | NAV_CROUCH | NAV_WATER | NAV_DEEP_WATER))
      return false;
    void team;
    return true;
  }

  /** Mean position of a team's spawn points (for "our side" tests). */
  spawnCenter(team: number, out: Vec3): Vec3 {
    out.x = out.y = out.z = 0;
    let n = 0;
    if (this.mesh) {
      for (const p of this.mesh.pois) {
        if (p.kind !== POI_SPAWN || p.team !== team) continue;
        out.x += p.pos.x;
        out.y += p.pos.y;
        out.z += p.pos.z;
        n++;
      }
    }
    if (n > 0) {
      out.x /= n;
      out.y /= n;
      out.z /= n;
    }
    return out;
  }

  /**
   * Spots around `target` (best first): areas `minR`…`maxR` away that see
   * it (sector PVS), for sentries (close, a little above) or snipers (far,
   * on our side of it).
   */
  spots(kind: 'sentry' | 'sniper', target: Vec3, team: number, key: string): Int32Array {
    const cacheKey = `${kind}:${team}:${key}`;
    const hit = this.spotCache.get(cacheKey);
    if (hit) return hit;
    const mesh = this.mesh;
    if (!mesh) return new Int32Array(0);
    const ta = mesh.nearestArea(target.x, target.y, target.z + 8, 400);
    if (ta < 0) return new Int32Array(0);
    const [minR, maxR] = kind === 'sentry' ? [180, 900] : [1000, 3200];
    const own = this.spawnCenter(team, { x: 0, y: 0, z: 0 });
    const foe = this.spawnCenter(enemyTeam(team), { x: 0, y: 0, z: 0 });
    const scored: Array<[number, number]> = [];
    mesh.forAreasInBox(
      target.x - maxR,
      target.y - maxR,
      target.x + maxR,
      target.y + maxR,
      target.z - 600,
      target.z + 800,
      (a) => {
        if (!this.spotOk(a, team)) return;
        if (mesh.areaSize(a) < 50 * 50) return;
        const dx = mesh.cx[a] - target.x;
        const dy = mesh.cy[a] - target.y;
        const dz = mesh.cz[a] - target.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < minR || d > maxR) return;
        if (!mesh.isPotentiallyVisible(a, ta)) return;
        const dOwn = Math.hypot(mesh.cx[a] - own.x, mesh.cy[a] - own.y);
        const dFoe = Math.hypot(mesh.cx[a] - foe.x, mesh.cy[a] - foe.y);
        let score: number;
        if (kind === 'sentry') {
          score = -Math.abs(d - 450) + Math.min(120, dz) * 1.5 + (dOwn < dFoe ? 150 : 0);
        } else {
          score = Math.min(dz, 400) * 1.2 - Math.abs(d - 1800) * 0.3 + (dOwn < dFoe ? 600 : -600);
        }
        scored.push([a, score]);
      },
    );
    scored.sort((p, q) => q[1] - p[1] || p[0] - q[0]);
    const out = Int32Array.from(scored.slice(0, 12).map((s) => s[0]));
    this.spotCache.set(cacheKey, out);
    return out;
  }
}

/** Both playable teams. */
export const PLAYING_TEAMS = [TF_TEAM_RED, TF_TEAM_BLUE] as const;
