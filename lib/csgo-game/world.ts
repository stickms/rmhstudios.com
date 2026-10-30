/**
 * `CsWorld`: the shared GameWorld (lib/tf2-game/sim/world.ts — the entity list, the tick, traces, lag
 * compensation, triggers, I/O) running CS:GO: its players (CsPlayer), its rules (CsGameRules with the
 * bomb-defusal or deathmatch mode), its spawn selection (team spawns; deathmatch picks random spawns
 * away from enemies), and the CS questions the weapons and players ask the map — bomb targets, buy
 * zones, the bomb radius, friendly fire.
 */

import type { Vec3 } from '../tf2-game/core/vec';
import type { Player } from '../tf2-game/sim/player';
import type { GameRules, RulesOptions } from '../tf2-game/sim/rules';
import { SpawnSystem, TeamSpawn } from '../tf2-game/sim/spawn';
import { GameWorld, type GameWorldInit } from '../tf2-game/sim/world';
import { CS_TEAM_CT, CS_TEAM_T, DEFAULT_BOMB_RADIUS, type CsMode } from './constants';
import { CsBombTarget, CsBuyZone, CsMapParameters } from './entities';
import { CsPlayer } from './player';
import {
  CsDeathmatchMode,
  CsDefuseMode,
  CsGameRules,
  defaultCsSettings,
  type CsSettings,
} from './rules';

export interface CsWorldInit extends Omit<GameWorldInit, 'mode'> {
  /** 'de' bomb defusal (default) or 'dm' deathmatch. */
  mode?: CsMode;
  /** Overrides of the match settings (mp_* cvars). */
  settings?: Partial<CsSettings>;
}

/** With no func_buyzone a team may buy within this distance of its spawn points (CS's own fallback). */
export const SPAWN_BUY_RADIUS = 256;

/** Deathmatch spawns: never closer than this to a living enemy when a farther spot exists. */
export const DM_SPAWN_SAFE_DISTANCE = 600;

/** Team spawns as the shared rules pick them; deathmatch picks random free spawns away from enemies. */
export class CsSpawnSystem extends SpawnSystem {
  constructor(private readonly cs: CsWorld) {
    super(cs);
  }

  override selectSpawnPoint(player: Player): TeamSpawn | null {
    if (this.cs.csRules.csMode !== 'dm') return super.selectSpawnPoint(player);
    const all = this.spawnPoints();
    const dm = all.filter((s) => s.classname === 'info_deathmatch_spawn');
    const pool = dm.length > 0 ? dm : all;
    if (pool.length === 0) return null;
    const enemies = this.cs
      .players()
      .filter(
        (p) =>
          p.alive &&
          p !== player &&
          (this.cs.csRules.teammatesAreEnemies || p.team !== player.team),
      );
    const free: TeamSpawn[] = [];
    const safe: TeamSpawn[] = [];
    for (const s of pool) {
      // A team spawn of the other team is fine in deathmatch: test it as if it were ours.
      const team = s.team;
      s.team = player.team;
      const ok = !s.disabled && this.isSpawnPointValid(s, player, false);
      s.team = team;
      if (!ok) continue;
      free.push(s);
      if (
        enemies.every(
          (e) =>
            Math.hypot(e.origin.x - s.origin.x, e.origin.y - s.origin.y, e.origin.z - s.origin.z) >=
            DM_SPAWN_SAFE_DISTANCE,
        )
      )
        safe.push(s);
    }
    const choice = safe.length > 0 ? safe : free.length > 0 ? free : pool;
    const spot = choice[this.cs.random.randomInt(0, choice.length - 1)];
    player.lastSpawnPoint = spot.id;
    return spot;
  }
}

export class CsWorld extends GameWorld {
  /** Set by the constructor before any player exists (the mode installs the settings). */
  constructor(init: CsWorldInit = {}) {
    const mode = init.mode ?? 'de';
    super({ ...init, mode: null, options: { friendlyFire: false, ...init.options } });
    const rules = this.csRules;
    rules.settings = { ...defaultCsSettings(mode), ...init.settings };
    this.setMode(mode === 'dm' ? new CsDeathmatchMode() : new CsDefuseMode());
    if (init.settings) Object.assign(rules.settings, init.settings);
    rules.applySettings();
    // The round state's network proxy.
    this.spawnEntity('cs_gamerules');
  }

  protected override createRules(options: Partial<RulesOptions>): GameRules {
    return new CsGameRules(this, options);
  }

  protected override createSpawnSystem(): SpawnSystem {
    return new CsSpawnSystem(this);
  }

  protected override createPlayer(name: string): Player {
    return new CsPlayer(name);
  }

  get csRules(): CsGameRules {
    return this.rules as CsGameRules;
  }

  get csMode(): CsMode {
    return this.csRules.csMode;
  }

  /** Do bullets, knives and grenades hurt teammates (mp_friendlyfire, or deathmatch free-for-all)? */
  bulletsHitTeammates(): boolean {
    return this.options.friendlyFire || this.csRules.teammatesAreEnemies;
  }

  /** Is `other` an enemy of `p` (another team, or anyone in free-for-all deathmatch)? */
  isEnemy(p: Player, other: Player): boolean {
    return p !== other && (p.team !== other.team || this.csRules.teammatesAreEnemies);
  }

  /** info_map_parameters' bombradius (500 without one). */
  get bombRadius(): number {
    let r = DEFAULT_BOMB_RADIUS;
    this.forEachEntity((e) => {
      if (e instanceof CsMapParameters) r = e.bombRadius;
    });
    return r;
  }

  bombTargets(): CsBombTarget[] {
    const out: CsBombTarget[] = [];
    this.forEachEntity((e) => {
      if (e instanceof CsBombTarget && !e.disabled) out.push(e);
    });
    return out;
  }

  /** 'A' or 'B' for a point inside a bomb target (by name, else by the targets' order), '' outside. */
  bombSiteAt(p: Vec3): string {
    const targets = this.bombTargets();
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      if (!t.touchesBox(p, { x: p.x + 1, y: p.y + 1, z: p.z + 1 })) continue;
      const n = t.targetnameLower;
      if (/(^|[_\s])a$|site_?a\b|bombsite_?a/.test(n)) return 'A';
      if (/(^|[_\s])b$|site_?b\b|bombsite_?b/.test(n)) return 'B';
      return i === 0 ? 'A' : 'B';
    }
    return '';
  }

  /** Is a box (absolute) inside a buy zone that serves `team`? With no buy zones, near the team's spawns. */
  inBuyZone(team: number, mins: Vec3, maxs: Vec3, origin: Vec3): boolean {
    if (team !== CS_TEAM_T && team !== CS_TEAM_CT) return false;
    let zones = 0;
    let inside = false;
    this.forEachEntity((e) => {
      if (inside || !(e instanceof CsBuyZone) || e.disabled) return;
      zones++;
      if (e.serves(team) && e.touchesBox(mins, maxs)) inside = true;
    });
    if (inside || zones > 0) return inside;
    let near = false;
    this.forEachEntity((e) => {
      if (near || !(e instanceof TeamSpawn) || e.team !== team) return;
      if (
        Math.hypot(e.origin.x - origin.x, e.origin.y - origin.y) <= SPAWN_BUY_RADIUS &&
        Math.abs(e.origin.z - origin.z) < 128
      )
        near = true;
    });
    return near;
  }

  /** The team with fewer players (joining, bots). */
  smallerCsTeam(): number {
    let t = 0;
    let ct = 0;
    this.forEachPlayer((p) => {
      if (p.team === CS_TEAM_T) t++;
      else if (p.team === CS_TEAM_CT) ct++;
    });
    return t <= ct ? CS_TEAM_T : CS_TEAM_CT;
  }
}
