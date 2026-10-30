/**
 * The map entities CS:GO adds for de_dust2, written from the Valve Developer Community's entity pages,
 * on the shared engine's classes (lib/tf2-game/sim): team spawns reuse TeamSpawn, the bomb targets
 * and buy zones are shared BaseTriggers, and everything generic de_dust2 places — func_door(_rotating),
 * prop_dynamic, trigger_*, env_*, logic_* — is the shared implementation, unchanged.
 *
 *   - info_player_terrorist / info_player_counterterrorist: team spawn points (VDC);
 *   - info_deathmatch_spawn: deathmatch spawn points (VDC; any team);
 *   - func_bomb_target: where the bomb may be planted (VDC; outputs OnBombPlanted, OnBombExplode,
 *     OnBombDefused; `heistbomb` ignored);
 *   - func_buyzone: where a team may buy (VDC: TeamNum 2/3, 0 both);
 *   - info_map_parameters: `bombradius` (VDC: default 500);
 *   - cs_gamerules: the round state's network proxy (the engine-side CCSGameRulesProxy's role);
 *   - cs_dropped_weapon: a weapon on the ground (death drops, the drop command), picked up by walking
 *     over it into an empty slot (the C4 by Terrorists only).
 *
 * A synthetic world (tests) has no brush models: its bomb targets and buy zones take `mins` / `maxs`
 * keyvalues (relative to the origin) instead.
 */

import { FL_ONGROUND, MOVETYPE_FLYGRAVITY } from '../tf2-game/core/constants';
import { vec3, type Vec3 } from '../tf2-game/core/vec';
import {
  COLLISION_GROUP_DEBRIS,
  Entity,
  FSOLID_TRIGGER,
  MOVECOLLIDE_FLY_BOUNCE,
  SOLID_BBOX,
} from '../tf2-game/sim/entity';
import { registerEntityClass } from '../tf2-game/sim/entity-registry';
import { registerAlwaysTransmit } from '../tf2-game/net/snapshot';
import type { NetRecord, NetSchema } from '../tf2-game/sim/net-schema';
import { TeamSpawn } from '../tf2-game/sim/spawn';
import { BaseTrigger } from '../tf2-game/sim/triggers';
import type { Player } from '../tf2-game/sim/player';
import { CS_TEAM_CT, CS_TEAM_T, DEFAULT_BOMB_RADIUS } from './constants';
import { NET_CS_DROPPED, NET_CS_RULES } from './net-schema';
import type { CsPlayer } from './player';
import type { CsWeapon } from './weapons/base';
import type { CsWorld } from './world';

/** Reads `mins` / `maxs` keyvalues into a brushless volume's bounds. */
function synthBounds(e: Entity): void {
  if (e.world.brushes && e.bspModel > 0) return;
  const mins = e.kv?.getVec3('mins');
  const maxs = e.kv?.getVec3('maxs');
  if (mins && maxs) e.setSize(mins, maxs);
}

export class CsTeamSpawn extends TeamSpawn {
  override spawn(): void {
    super.spawn();
    this.changeTeam(
      this.classname === 'info_player_terrorist'
        ? CS_TEAM_T
        : this.classname === 'info_player_counterterrorist'
          ? CS_TEAM_CT
          : 0,
    );
  }
}

registerEntityClass('info_player_terrorist', CsTeamSpawn);
registerEntityClass('info_player_counterterrorist', CsTeamSpawn);
registerEntityClass('info_deathmatch_spawn', CsTeamSpawn);

export class CsBombTarget extends BaseTrigger {
  override spawn(): void {
    super.spawn();
    synthBounds(this);
  }

  /** Bomb targets do not care who touches them; the C4 asks `touchesBox` itself. */
  override wantsToucher(_other: Entity): boolean {
    return false;
  }
}

registerEntityClass('func_bomb_target', CsBombTarget);

export class CsBuyZone extends BaseTrigger {
  override spawn(): void {
    super.spawn();
    synthBounds(this);
  }

  override wantsToucher(_other: Entity): boolean {
    return false;
  }

  /** Does this zone serve `team` (TeamNum 0 serves both)? */
  serves(team: number): boolean {
    return this.team === 0 || this.team === team;
  }
}

registerEntityClass('func_buyzone', CsBuyZone);

export class CsMapParameters extends Entity {
  bombRadius = DEFAULT_BOMB_RADIUS;

  override spawn(): void {
    super.spawn();
    const r = this.kvNumber('bombradius', DEFAULT_BOMB_RADIUS);
    this.bombRadius = r > 0 ? Math.min(2048, r) : DEFAULT_BOMB_RADIUS;
  }
}

registerEntityClass('info_map_parameters', CsMapParameters);

/** The round state on the wire (always transmitted, survives CleanUpMap). */
export class CsRulesProxy extends Entity {
  constructor(classname = 'cs_gamerules') {
    super(classname);
    this.preserved = true;
  }

  override netSchema(): NetSchema {
    return NET_CS_RULES;
  }

  override writeNet(out: NetRecord): void {
    (this.world as CsWorld).csRules.writeCsNet(out);
  }
}

registerEntityClass('cs_gamerules', CsRulesProxy);
registerAlwaysTransmit('cs_gamerules');

// ─── Weapons on the ground ──────────────────────────────────────────────────────────────────

/** Seconds before the dropper may pick their own weapon up again. */
export const DROP_PICKUP_DELAY = 1.0;
/** Seconds a dropped weapon lies before it is cleaned up (deathmatch litter). */
export const DROPPED_LIFETIME = 60;

export class CsDroppedWeapon extends Entity {
  weapon: CsWeapon | null = null;
  droppedBy = -1;

  constructor(classname = 'cs_dropped_weapon') {
    super(classname);
  }

  override spawn(): void {
    super.spawn();
    this.solid = SOLID_BBOX;
    this.solidFlags = FSOLID_TRIGGER;
    this.collisionGroup = COLLISION_GROUP_DEBRIS;
    this.moveType = MOVETYPE_FLYGRAVITY;
    this.moveCollide = MOVECOLLIDE_FLY_BOUNCE;
    this.elasticity = 0.3;
    this.setSize(vec3(-8, -8, 0), vec3(8, 8, 8));
    if (this.weapon && !this.model) this.model = this.weapon.worldModel;
    this.spawnTime = this.world.curtime;
    this.world.registerTrigger(this);
    // The bomb never disappears on its own; other litter does.
    if (this.weapon && this.weapon.info.category !== 'c4')
      this.setThink(this.subRemove, this.world.curtime + DROPPED_LIFETIME);
  }

  wantsToucher(other: Entity): boolean {
    return other.isPlayer();
  }

  touchesBox(mins: Vec3, maxs: Vec3): boolean {
    return (
      mins.x < this.origin.x + this.maxs.x + 8 &&
      maxs.x > this.origin.x + this.mins.x - 8 &&
      mins.y < this.origin.y + this.maxs.y + 8 &&
      maxs.y > this.origin.y + this.mins.y - 8 &&
      mins.z < this.origin.z + this.maxs.z + 8 &&
      maxs.z > this.origin.z + this.mins.z
    );
  }

  override touch(other: Entity): void {
    if (!other.isPlayer()) {
      if (other === this.world.worldEntity && this.flags & FL_ONGROUND)
        this.velocity.x = this.velocity.y = this.velocity.z = 0;
      return;
    }
    const p = other as Player;
    const w = this.weapon;
    if (!w || !p.alive || this.removed) return;
    if (p.id === this.droppedBy && this.world.curtime - this.spawnTime < DROP_PICKUP_DELAY) return;
    if ((p as CsPlayer).pickUp(w)) {
      this.weapon = null;
      this.world.remove(this);
    }
  }

  override netSchema(): NetSchema {
    return NET_CS_DROPPED;
  }

  override writeNet(out: NetRecord): void {
    super.writeNet(out);
    out.defindex = this.weapon ? this.weapon.defindex : -1;
    out.weaponName = this.weapon ? this.weapon.classname : '';
  }
}

registerEntityClass('cs_dropped_weapon', CsDroppedWeapon);
