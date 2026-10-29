/**
 * tf_projectile_arrow / tf_projectile_healing_bolt (CTFProjectile_Arrow,
 * CTFProjectile_HealingBolt over CTFBaseRocket; server/tf/tf_projectile_arrow.cpp):
 * the Huntsman's arrows, the Crusader's Crossbow's bolts and the Rescue Ranger's
 * repair claws.
 *
 * A ±1 MOVETYPE_FLYGRAVITY projectile at the launcher's speed and gravity. On a
 * player's box it traces on along its flight for a hitbox (else takes the hitbox
 * nearest the impact: ArrowTouch), then StrikeTarget: an enemy takes the arrow's
 * damage — a crit on a head hit (CanHeadshot), fire when the arrow was lit
 * (TF_DMG_CUSTOM_FLYINGBURN) — and the arrow sticks in him (parented, FadeOut 3 s); a
 * teammate is healed by a healing bolt (ImpactTeamPlayer: twice the bolt's damage,
 * which grows from 50 % to 100 % over its first 0.6 s, plus über for the shooter's
 * Medi Gun). Buildings: a repair claw mends a friendly one (BuildingHealingArrow →
 * Command_Repair). The world: it sticks for 3 s (FadeOut) with the surface's impact
 * sound. Airblast turns it round and lets it hit everyone again (Deflected).
 */

import { MOVETYPE_FLYGRAVITY, MOVETYPE_NONE, SURF_SKY, TF_TEAM_BLUE } from '../../core/constants';
import { HITGROUP_HEAD, NO_ENTITY, type TraceResult } from '../../core/types';
import { remapClamped, vec3, vectorAngles, type Vec3 } from '../../core/vec';
import { TF_DMG_CUSTOM } from '../../data/damage';
import { TF_COND } from '../conditions';
import {
  createDamageInfo,
  DMG_CRITICAL,
  DMG_IGNITE,
  resetDamageInfo,
  TF_DMG_CUSTOM_HEADSHOT,
  TF_WEAPON,
} from '../damage';
import {
  EF_NODRAW,
  FSOLID_NOT_SOLID,
  TFCOLLISION_GROUP_ROCKET_BUT_NOT_WITH_OTHER_ROCKETS,
  type Entity,
} from '../entity';
import { registerEntityClass } from '../entity-registry';
import { createHitboxTraceResult, hitboxSet, traceHitboxes } from '../hitboxes';
import { hookInt, hookPlayer, hookWeapon } from '../items/attributes';
import { ownsWeaponId, WID } from '../items/effects';
import { BaseProjectile } from '../physics';
import type { Player } from '../player';
import type { Weapon } from '../weapon-api';
import { PROJECTILE_KIND, type Deflectable } from './common';

/** ProjectileType_t values an arrow can be (g_szProjectileNames order). */
export const ARROW_TYPE = {
  ARROW: 8,
  HEALING_BOLT: 11,
  BUILDING_REPAIR_BOLT: 18,
  FESTIVE_ARROW: 19,
  FESTIVE_HEALING_BOLT: 23,
} as const;

/** g_pszArrowModels. */
export const ARROW_MODELS = {
  arrow: 'models/weapons/w_models/w_arrow.mdl',
  syringe: 'models/weapons/w_models/w_syringe_proj.mdl',
  claw: 'models/weapons/c_models/c_claymore/c_claymore.mdl',
  repair: 'models/weapons/w_models/w_repair_claw.mdl',
  festiveArrow: 'models/weapons/w_models/w_arrow_xmas.mdl',
  festiveBolt: 'models/weapons/c_models/c_crusaders_crossbow/c_crusaders_crossbow_xmas_proj.mdl',
} as const;

/** The arrow's flight: alive this long it is removed on its next touch (ArrowTouch's safety net). */
const ARROW_MAX_LIFE = 10;
/** FadeOut(3). */
const ARROW_FADE_TIME = 3;

const ARROW_MINS: Vec3 = { x: -1, y: -1, z: -1 };
const ARROW_MAXS: Vec3 = { x: 1, y: 1, z: 1 };
// Lazily created (projectiles sit on the sim/damage import cycle).
let arrowInfo: ReturnType<typeof createDamageInfo> | null = null;
let hb: ReturnType<typeof createHitboxTraceResult> | null = null;
const traceStart = vec3();
const traceEnd = vec3();
const probe = vec3();

/** A weapon that the Rescue Ranger's claw repairs through (the buildings module's Command_Repair). */
interface RepairableObject {
  commandRepair?(
    repairer: Player,
    amount: number,
    repairMult: number,
    healthPerMetal: number,
  ): number;
  hasSapper?: boolean;
  plasmaDisabled?: boolean;
  building?: boolean;
  placing?: boolean;
  shieldLevel?: number;
}

export class TFProjectileArrow extends BaseProjectile implements Deflectable {
  /** m_iProjectileType. */
  arrowType: number = ARROW_TYPE.ARROW;
  /** m_bArrowAlight. */
  alight = false;
  /** m_bPenetrate (projectile_penetration: the Machina's … here unused by arrows in the stock schema). */
  penetrate = false;
  /** m_flInitTime. */
  initTime = 0;
  /** m_bStruckEnemy: stopped in a target, waiting to fade. */
  struckEnemy = false;
  /** m_HitEntities (penetrating arrows hit each target once). */
  readonly hitEntities: number[] = [];
  /** GetScorer: the player credited. */
  scorer: number = NO_ENTITY;
  /** m_bApplyMilkOnHit. */
  applyMilkOnHit = false;

  constructor(classname: string) {
    super(classname);
    this.moveType = MOVETYPE_FLYGRAVITY;
    this.setSize(ARROW_MINS, ARROW_MAXS);
    this.collisionGroup = TFCOLLISION_GROUP_ROCKET_BUT_NOT_WITH_OTHER_ROCKETS;
    this.projectileKind = PROJECTILE_KIND.ARROW;
    this.model = ARROW_MODELS.arrow;
    this.lifetime = ARROW_MAX_LIFE + ARROW_FADE_TIME;
    // CTFProjectile_HealingBolt::GetCollideWithTeammatesDelay is 0: bolts hit teammates at once.
    this.collideWithTeammates = classname === 'tf_projectile_healing_bolt';
  }

  /** Extra spawn fields from FireArrow: the projectile type, gravity, light, penetration. */
  applyExtra(x: Readonly<Record<string, number | string | boolean>>): void {
    if (typeof x.arrowType === 'number') this.arrowType = x.arrowType;
    if (typeof x.gravity === 'number') this.gravity = x.gravity;
    if (x.alight === true) this.alight = true;
    if (x.penetrate === true) this.penetrate = true;
    if (x.milk === true) this.applyMilkOnHit = true;
  }

  /** SDK: CTFProjectile_Arrow::InitArrow / Spawn. */
  override spawn(): void {
    super.spawn();
    this.initTime = this.world.curtime;
    this.scorer = this.owner;
    this.hitEntities.length = 0;
    this.hitEntities.push(this.owner);
    vectorAngles(this.velocity, this.angles);
    this.skin = this.arrowSkin();
    switch (this.arrowType) {
      case ARROW_TYPE.BUILDING_REPAIR_BOLT:
        this.model = ARROW_MODELS.repair;
        this.weaponId = 90; // TF_WEAPON_SHOTGUN_BUILDING_RESCUE
        break;
      case ARROW_TYPE.HEALING_BOLT:
        this.model = ARROW_MODELS.syringe;
        this.modelScale = 3;
        break;
      case ARROW_TYPE.FESTIVE_HEALING_BOLT:
        this.model = ARROW_MODELS.festiveBolt;
        this.modelScale = 3;
        break;
      case ARROW_TYPE.FESTIVE_ARROW:
        this.model = ARROW_MODELS.festiveArrow;
        break;
      default:
        this.model = ARROW_MODELS.arrow;
    }
    this.setThink(this.flyThink, this.world.curtime);
  }

  /** The client turns the arrow along its flight; the sim keeps the angles current for snapshots. */
  flyThink(): void {
    if (this.moveType === MOVETYPE_NONE) return;
    vectorAngles(this.velocity, this.angles);
    this.nextThink = this.world.curtime;
  }

  /** SDK: CTFProjectile_Arrow::GetArrowSkin — a disguised Spy's arrows wear the disguise. */
  arrowSkin(): number {
    let team = this.team;
    const o = this.world.entity(this.owner);
    if (o && o.isPlayer()) {
      const p = o as Player;
      if (p.playerClass === 8 && p.cond.has(TF_COND.DISGUISED)) team = p.disguiseTeam;
    }
    return team === TF_TEAM_BLUE ? 1 : 0;
  }

  isDeflectable(): boolean {
    return (
      this.moveType !== MOVETYPE_NONE &&
      this.arrowType !== ARROW_TYPE.HEALING_BOLT &&
      this.arrowType !== ARROW_TYPE.FESTIVE_HEALING_BOLT
    );
  }

  /** SDK: CTFProjectile_Arrow::Deflected. */
  onDeflected(by: Player, _dir: Vec3): void {
    this.changeTeam(by.team);
    const w = by.activeWeapon();
    if (w) this.launcher = w;
    this.owner = by.id;
    if (by.cond.critBoosted) this.critType = 2;
    this.deflected++;
    this.deflectedBy = by.id;
    this.scorer = by.id;
    this.hitEntities.length = 0;
    this.hitEntities.push(by.id);
    this.skin = this.arrowSkin();
  }

  /** SDK: CTFProjectile_Arrow::GetDamage — a healing bolt grows 50 % → 100 % over its first 0.6 s. */
  currentDamage(): number {
    if (
      this.arrowType === ARROW_TYPE.HEALING_BOLT ||
      this.arrowType === ARROW_TYPE.FESTIVE_HEALING_BOLT
    ) {
      return this.damage * remapClamped(this.world.curtime - this.initTime, 0, 0.6, 0.5, 1);
    }
    return this.damage;
  }

  /** SDK: CTFProjectile_Arrow::CanHeadshot. */
  canHeadshot(): boolean {
    return (
      this.arrowType !== ARROW_TYPE.BUILDING_REPAIR_BOLT &&
      this.arrowType !== ARROW_TYPE.HEALING_BOLT &&
      this.arrowType !== ARROW_TYPE.FESTIVE_HEALING_BOLT
    );
  }

  /** SDK: CTFProjectile_Arrow::ArrowTouch. */
  override onImpact(other: Entity, tr: TraceResult): void {
    const w = this.world;
    if (w.curtime - this.initTime >= ARROW_MAX_LIFE) {
      w.remove(this);
      return;
    }
    if (this.struckEnemy || this.moveType === MOVETYPE_NONE) return;
    if (other.isTrigger()) return;
    if (other === w.worldEntity || (!other.isPlayer() && !other.isBaseObject())) {
      this.checkSkyboxImpact(other, tr);
      return;
    }
    if (other.isBaseObject()) {
      // StrikeTarget → OnArrowImpactObject: a friendly building is healed by the repair claw.
      if (other.team === this.team) this.buildingHealingArrow(other);
      this.breakArrow();
      return;
    }
    const victim = other as Player;
    // The hitbox the flight runs into, else the one nearest the impact.
    const dt = w.frametime;
    traceStart.x = this.origin.x - this.velocity.x * dt;
    traceStart.y = this.origin.y - this.velocity.y * dt;
    traceStart.z = this.origin.z - this.velocity.z * dt;
    traceEnd.x = this.origin.x + this.velocity.x * dt * 2;
    traceEnd.y = this.origin.y + this.velocity.y * dt * 2;
    traceEnd.z = this.origin.z + this.velocity.z * dt * 2;
    let group: number;
    if (
      victim.team !== this.team &&
      traceHitboxes(
        victim.origin,
        victim.eyeAngles.y,
        victim.playerClass,
        victim.move.ducked,
        traceStart,
        traceEnd,
        (hb ??= createHitboxTraceResult()),
      )
    ) {
      group = hb.group;
    } else group = nearestHitboxGroup(victim, this.origin, this.velocity);
    const stuck = this.strikeTarget(victim, group, tr);
    if (!stuck) this.breakArrow();
    if (!this.penetrate) this.struckEnemy = true;
  }

  /** SDK: CTFProjectile_Arrow::StrikeTarget. Returns false when the arrow breaks instead of sticking. */
  strikeTarget(victim: Player, group: number, tr: TraceResult): boolean {
    const w = this.world;
    if (victim.id !== this.owner && victim.cond.invulnerable && victim.team !== this.team)
      return false;
    let apply = true;
    if (this.penetrate) {
      if (this.hitEntities.includes(victim.id)) apply = false;
      else this.hitEntities.push(victim.id);
    }
    const attacker = w.entity(this.scorer) ?? w.entity(this.owner);
    if (!attacker) return true;
    if (victim.team !== this.team) {
      if (apply) {
        let type = this.baseDamageType();
        let custom = 0;
        if (this.alight) {
          type |= DMG_IGNITE;
          custom = TF_DMG_CUSTOM.TF_DMG_CUSTOM_FLYINGBURN;
        }
        const headshot = group === HITGROUP_HEAD && this.canHeadshot();
        if (headshot) {
          type |= DMG_CRITICAL;
          custom = TF_DMG_CUSTOM_HEADSHOT;
        }
        if (this.critType === 2) type |= DMG_CRITICAL;
        // Apply milk first so the hit heals (the Apothecary's arrows).
        if (this.applyMilkOnHit) {
          const duration = remapClamped(this.currentDamage(), 25, 75, 6, 10);
          victim.cond.add(TF_COND.MAD_MILK, duration, attacker.id);
        }
        const info = resetDamageInfo((arrowInfo ??= createDamageInfo()));
        info.attacker = attacker.id;
        info.inflictor = this.id;
        info.weaponId = this.weaponId;
        info.weaponDefIndex = this.launcherDefIndex;
        info.killIcon = this.killIcon;
        info.damage = this.currentDamage();
        info.damageType = type;
        info.critType = type & DMG_CRITICAL ? 2 : 0;
        info.customKill = custom;
        info.hitGroup = group;
        info.position.x = this.origin.x;
        info.position.y = this.origin.y;
        info.position.z = this.origin.z;
        info.force.x = this.velocity.x;
        info.force.y = this.velocity.y;
        info.force.z = this.velocity.z;
        // Burning arrows set a longer afterburn (CTFCompoundBow::GetInitialAfterburnDuration 7.5).
        if (this.alight) info.afterburn = 7.5;
        w.applyDamage(victim, info);
        this.impactSound('Weapon_Arrow.ImpactFlesh', attacker.id);
      }
    } else if (apply) this.impactTeamPlayer(victim);
    if (!this.penetrate) {
      // OnArrowImpact: stick in the target (the client pins it to the bone), FadeOut(3).
      if (victim.alive) {
        this.setParent(victim);
      }
      w.emitEffect({
        kind: 'particle',
        system: 'arrow_impact',
        pos: { x: this.origin.x, y: this.origin.y, z: this.origin.z },
        entity: victim.id,
        value: this.arrowType,
      });
      this.fadeOut(ARROW_FADE_TIME);
    }
    void tr;
    return true;
  }

  /** g_aWeaponDamageTypes of the arrow's weapon id (the bow and crossbow: DMG_BULLET | DMG_USE_HITLOCATIONS). */
  baseDamageType(): number {
    const l = this.launcher as (Weapon & { stats?: { damageType: number } }) | null;
    return l?.stats?.damageType ?? (1 << 1) | (1 << 25);
  }

  /** SDK: CTFProjectile_HealingBolt::ImpactTeamPlayer — heal twice the bolt's damage, über for the Medic. */
  impactTeamPlayer(other: Player): void {
    if (
      this.arrowType !== ARROW_TYPE.HEALING_BOLT &&
      this.arrowType !== ARROW_TYPE.FESTIVE_HEALING_BOLT
    )
      return;
    const w = this.world;
    const ownerEnt = w.entity(this.owner);
    if (!ownerEnt || !ownerEnt.isPlayer()) return;
    const owner = ownerEnt as Player;
    const active = other.activeWeapon();
    if (active && hookInt(hookWeapon(active, other, 'weapon_blocks_healing', 0))) return;
    let health = this.currentDamage() * 2;
    health = hookPlayer(other, 'mult_healing_from_medics', health);
    if (active) health = hookWeapon(active, null, 'mult_health_fromhealers_penalty_active', health);
    const healed = other.takeHealth(health);
    if (healed <= 0) return;
    this.impactSound('Weapon_Arrow.ImpactFleshCrossbowHeal', owner.id);
    owner.stats.healing += healed;
    const medigun = ownsWeaponId(owner, WID.MEDIGUN) as
      (Weapon & { addCharge?: (amount: number) => void }) | null;
    if (medigun?.addCharge) {
      const since = w.curtime - other.lastDamageTime;
      const gain = 24 * remapClamped(since, 10, 15, 3, 1);
      medigun.addCharge((healed / gain) * w.frametime);
    }
    other.cond.add(TF_COND.HEALTH_OVERHEALED, 1.2);
  }

  /** SDK: CTFProjectile_Arrow::BuildingHealingArrow (arrow_heals_buildings on the shooter). */
  buildingHealingArrow(other: Entity): void {
    const w = this.world;
    const scorerEnt = w.entity(this.scorer);
    if (!scorerEnt || !scorerEnt.isPlayer() || other.team !== this.team) return;
    const scorer = scorerEnt as Player;
    let amount = hookInt(hookPlayer(scorer, 'arrow_heals_buildings', 0));
    if (amount === 0) return;
    if (!other.isBaseObject()) return;
    const obj = other as Entity & RepairableObject;
    if (obj.hasSapper || obj.plasmaDisabled || obj.building || obj.placing) return;
    // A wrangled (shielded) building takes SHIELD_NORMAL_VALUE of it.
    if (obj.shieldLevel === 1) amount = Math.trunc(amount * 0.33);
    const healed = obj.commandRepair ? obj.commandRepair(scorer, amount, 1, 4) : 0;
    if (healed > 0) {
      w.emitEffect({
        kind: 'particle',
        system: this.team === TF_TEAM_BLUE ? 'repair_claw_heal_blue' : 'repair_claw_heal_red',
        pos: { x: this.origin.x, y: this.origin.y, z: this.origin.z },
      });
    }
  }

  /** SDK: CTFProjectile_Arrow::CheckSkyboxImpact — the sky removes it, the world keeps it 3 s. */
  checkSkyboxImpact(other: Entity, tr: TraceResult): void {
    const w = this.world;
    if (tr.surfaceFlags & SURF_SKY) {
      this.fadeOut(ARROW_FADE_TIME);
      this.effects |= EF_NODRAW;
      return;
    }
    if (other !== w.worldEntity && other.bspModel <= 0) {
      this.breakArrow();
      return;
    }
    w.emitEffect({
      kind: 'impact',
      system: 'TFBoltImpact',
      pos: { x: tr.endPos.x, y: tr.endPos.y, z: tr.endPos.z },
      normal: { x: tr.plane.normal.x, y: tr.plane.normal.y, z: tr.plane.normal.z },
      material: tr.surfaceName,
      value: this.arrowType,
    });
    this.fadeOut(ARROW_FADE_TIME);
    const m = tr.surfaceName.toLowerCase();
    const sound = /wood/.test(m)
      ? 'Weapon_Arrow.ImpactWood'
      : /concrete|rock|brick|tile|plaster|dirt|gravel|sand/.test(m)
        ? 'Weapon_Arrow.ImpactConcrete'
        : 'Weapon_Arrow.ImpactMetal';
    this.impactSound(sound);
  }

  /** SDK: CTFProjectile_Arrow::ImpactSound — louder for the shooter. */
  impactSound(name: string, attacker = NO_ENTITY): void {
    const w = this.world;
    if (attacker !== NO_ENTITY) {
      w.emitSound(name, { pos: this.origin, predictedBy: attacker });
      w.emitSound(name, { entity: attacker, to: attacker });
    } else w.emitSound(name, { pos: this.origin });
  }

  /** SDK: CTFProjectile_Arrow::BreakArrow — gibs (BreakModel) and a fade. */
  breakArrow(): void {
    this.world.emitEffect({
      kind: 'gibs',
      pos: { x: this.origin.x, y: this.origin.y, z: this.origin.z },
      entity: this.id,
      system: this.model,
    });
    this.fadeOut(ARROW_FADE_TIME);
    this.effects |= EF_NODRAW;
  }

  /** SDK: CTFProjectile_Arrow::FadeOut — stop, stop colliding, remove after `time`. */
  fadeOut(time: number): void {
    this.moveType = MOVETYPE_NONE;
    this.velocity.x = 0;
    this.velocity.y = 0;
    this.velocity.z = 0;
    this.solidFlags |= FSOLID_NOT_SOLID;
    this.setThink(this.subRemove, this.world.curtime + time);
  }

  /** Arrows don't bounce. */
  override resolveFlyCollisionCustom(): void {}
}

/** The hitbox nearest the arrow's point a little ahead of the impact (ArrowTouch's fallback). */
function nearestHitboxGroup(victim: Player, origin: Vec3, velocity: Vec3): number {
  const speed = Math.hypot(velocity.x, velocity.y, velocity.z) || 1;
  probe.x = origin.x + (velocity.x / speed) * 16;
  probe.y = origin.y + (velocity.y / speed) * 16;
  probe.z = origin.z + (velocity.z / speed) * 16;
  const boxes = hitboxSet(victim.playerClass, victim.move.ducked);
  const rad = (victim.eyeAngles.y * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  let best = Infinity;
  let group = 0;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    const cx = victim.origin.x + b.cx * c - b.cy * s;
    const cy = victim.origin.y + b.cx * s + b.cy * c;
    const cz = victim.origin.z + b.cz;
    const d = (cx - probe.x) ** 2 + (cy - probe.y) ** 2 + (cz - probe.z) ** 2;
    if (d < best) {
      best = d;
      group = b.group;
    }
  }
  return group;
}

/** The Huntsman's weapon id (for the bow-specific knockback and burn kill types). */
export const ARROW_WEAPON_ID = TF_WEAPON.COMPOUND_BOW;

registerEntityClass('tf_projectile_arrow', TFProjectileArrow);
registerEntityClass('tf_projectile_healing_bolt', TFProjectileArrow);
