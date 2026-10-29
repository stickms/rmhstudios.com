/**
 * The base of Engineer buildings and sappers (the SDK's CBaseObject,
 * tf_obj.cpp / baseobject_shared.cpp): team, builder, health, level,
 * construction progress, sapped/disabled state, collision and the damage
 * entry point. The buildings module extends it with the sentry gun,
 * dispenser, teleporters and the sapper.
 */

import { NO_ENTITY } from '../core/types';
import { CONTENTS_BLUETEAM, CONTENTS_MONSTER, CONTENTS_REDTEAM, CONTENTS_SOLID, TF_TEAM_BLUE, TF_TEAM_RED } from '../core/constants';
import {
  COLLISION_GROUP_PLAYER_MOVEMENT,
  DAMAGE_NO,
  DAMAGE_YES,
  Entity,
  FL_OBJECT,
  SOLID_BBOX,
  TFCOLLISION_GROUP_OBJECT,
  TFCOLLISION_GROUP_OBJECT_SOLIDTOPLAYERMOVEMENT,
} from './entity';
import { NET_OBJECT, type NetRecord, type NetSchema } from './net-schema';
import { DMG_BLAST, type DamageInfo } from './damage';
import type { Player } from './player';

/** ObjectType_t (tf_shareddefs.h). */
export const OBJ_DISPENSER = 0;
export const OBJ_TELEPORTER = 1;
export const OBJ_SENTRYGUN = 2;
export const OBJ_ATTACHMENT_SAPPER = 3;
export const OBJ_LAST = 4;

/** Teleporter modes (TELEPORTER_TYPE_*). */
export const MODE_TELEPORTER_ENTRANCE = 0;
export const MODE_TELEPORTER_EXIT = 1;

/** tf_obj.h */
export const OBJECT_CONSTRUCTION_INTERVAL = 0.1;
export const OBJECT_CONSTRUCTION_STARTINGHEALTH = 0.1;
/** Max level of an upgradable building. */
export const OBJECT_MAX_LEVEL = 3;

export abstract class BaseObject extends Entity {
  /** OBJ_* */
  abstract readonly objectType: number;
  objectMode = 0;
  level = 1;
  /** Engineer (or Spy for sappers) that owns it — also `owner`. */
  builder: number = NO_ENTITY;
  /** Under construction (m_bBuilding). */
  building = false;
  /** Still a blueprint being positioned (m_bPlacing). */
  placing = false;
  /** Picked up by the Engineer (m_bCarried). */
  carried = false;
  /** A sapper is attached (m_bHasSapper). */
  sapped = false;
  /** Disabled by a sapper, plasma or the map (m_bDisabled). */
  disabled = false;
  /** Construction progress 0…1 (m_flPercentageConstructed). */
  buildProgress = 0;
  /** Seconds to build from scratch at 1× rate (m_flTotalConstructionTime). */
  totalConstructionTime = 10;
  /** Metal toward the next level. */
  upgradeMetal = 0;
  /** Fractional health accumulated while constructing. */
  protected constructionHealth = 0;
  /** Entities that have damaged it, for assists (id → curtime). */
  readonly damagers = new Map<number, number>();

  constructor(classname: string) {
    super(classname);
    this.flags |= FL_OBJECT;
    this.solid = SOLID_BBOX;
    this.contents = CONTENTS_SOLID | CONTENTS_MONSTER;
    this.collisionGroup = TFCOLLISION_GROUP_OBJECT;
    this.takeDamage = DAMAGE_YES;
  }

  override isBaseObject(): boolean {
    return true;
  }

  builderPlayer(): Player | null {
    const e = this.world.entity(this.builder);
    return e && e.isPlayer() ? (e as Player) : null;
  }

  /**
   * SDK: CBaseObject::ShouldCollide. While under construction a building is
   * solid only to the enemy's movement; once finished it is solid to every
   * player (TFCOLLISION_GROUP_OBJECT_SOLIDTOPLAYERMOVEMENT).
   */
  override shouldCollide(collisionGroup: number, contentsMask: number): boolean {
    if (collisionGroup === COLLISION_GROUP_PLAYER_MOVEMENT) {
      if (this.collisionGroup === TFCOLLISION_GROUP_OBJECT_SOLIDTOPLAYERMOVEMENT) return true;
      if (this.team === TF_TEAM_RED && !(contentsMask & CONTENTS_REDTEAM)) return false;
      if (this.team === TF_TEAM_BLUE && !(contentsMask & CONTENTS_BLUETEAM)) return false;
    }
    return true;
  }

  /** SDK: CBaseObject::StartBuilding. */
  startBuilding(builder: Player | null): void {
    this.building = true;
    this.placing = false;
    this.buildProgress = 0;
    if (builder) {
      this.builder = builder.id;
      this.owner = builder.id;
      this.team = builder.team;
    }
    this.health = OBJECT_CONSTRUCTION_STARTINGHEALTH;
    this.constructionHealth = OBJECT_CONSTRUCTION_STARTINGHEALTH;
    this.setThink(this.buildingThink, this.world.curtime + OBJECT_CONSTRUCTION_INTERVAL);
  }

  /** Construction speed multiplier (wrench hits, redeploys). GetConstructionMultiplier. */
  constructionMultiplier(): number {
    return 1;
  }

  /** SDK: CBaseObject::BuildingThink → Construct. */
  readonly buildingThink = (): void => {
    if (!this.building) return;
    const rate = ((this.maxHealth - OBJECT_CONSTRUCTION_STARTINGHEALTH) / this.totalConstructionTime) * this.constructionMultiplier();
    this.constructionHealth += rate * OBJECT_CONSTRUCTION_INTERVAL;
    this.health = Math.min(this.maxHealth, this.constructionHealth);
    this.buildProgress = Math.min(1, this.constructionHealth / this.maxHealth);
    if (this.constructionHealth >= this.maxHealth) {
      this.health = this.maxHealth;
      this.finishedBuilding();
      return;
    }
    this.nextThink = this.world.curtime + OBJECT_CONSTRUCTION_INTERVAL;
  };

  /** SDK: CBaseObject::FinishedBuilding. */
  finishedBuilding(): void {
    this.building = false;
    this.buildProgress = 1;
    this.collisionGroup = TFCOLLISION_GROUP_OBJECT_SOLIDTOPLAYERMOVEMENT;
    this.setThink(null, -1);
    this.world.events.push({
      type: 'object',
      kind: 'built',
      object: this.id,
      objectType: this.objectType,
      owner: this.builder,
    });
    this.onFinishedBuilding();
  }

  /** Subclass hook: start the operating think. */
  protected onFinishedBuilding(): void {}

  /** SDK: CBaseObject::OnTakeDamage (no damage from teammates or while placing). */
  override onTakeDamage(info: DamageInfo): number {
    if (this.removed || this.takeDamage === DAMAGE_NO || this.placing) return 0;
    const attacker = this.world.entity(info.attacker);
    if (attacker && attacker !== this && this.inSameTeam(attacker)) return 0;
    if (attacker) this.damagers.set(attacker.id, this.world.curtime);
    const dmg = this.modifyDamage(info);
    if (dmg <= 0) return 0;
    this.health -= dmg;
    this.world.events.push({
      type: 'damage',
      victim: this.id,
      attacker: info.attacker,
      amount: Math.round(dmg),
      health: Math.max(0, Math.round(this.health)),
      crit: info.critType,
      customKill: info.customKill,
      pos: { x: info.position.x, y: info.position.y, z: info.position.z },
    });
    if (this.health <= 0) this.onKilled(info);
    return dmg;
  }

  /** Hook for per-building damage rules (sentry wrangler shield, etc.). */
  protected modifyDamage(info: DamageInfo): number {
    return info.damage;
  }

  /** SDK: CBaseObject::Killed — explode, credit the kill, remove. */
  override onKilled(info: DamageInfo): void {
    this.takeDamage = DAMAGE_NO;
    let assister = NO_ENTITY;
    let best = -Infinity;
    for (const [id, t] of this.damagers) {
      if (id !== info.attacker && t > best && this.world.curtime - t < 10) {
        best = t;
        assister = id;
      }
    }
    this.world.events.push({
      type: 'object',
      kind: 'destroyed',
      object: this.id,
      objectType: this.objectType,
      owner: this.builder,
      attacker: info.attacker,
      assister,
      weapon: info.killIcon,
    });
    this.world.emitEffect({ kind: 'explosion', pos: { ...this.origin }, value: info.damageType & DMG_BLAST ? 1 : 0 });
    this.world.rules.onObjectDestroyed(this, info, assister);
    this.world.remove(this);
  }

  /** The builder removed it (destroy PDA, changing class, disconnect). DetonateObject. */
  detonate(): void {
    this.world.events.push({ type: 'object', kind: 'detonated', object: this.id, objectType: this.objectType, owner: this.builder });
    this.world.remove(this);
  }

  override netSchema(): NetSchema | null {
    return NET_OBJECT;
  }

  override writeNet(out: NetRecord): void {
    super.writeNet(out);
    out.objectType = this.objectType;
    out.objectMode = this.objectMode;
    out.level = this.level;
    out.health = Math.max(0, Math.ceil(this.health));
    out.maxHealth = this.maxHealth;
    out.buildProgress = this.buildProgress;
    out.building = this.building;
    out.placing = this.placing;
    out.carried = this.carried;
    out.sapped = this.sapped;
    out.disabled = this.disabled;
    out.upgradeMetal = this.upgradeMetal;
  }
}
