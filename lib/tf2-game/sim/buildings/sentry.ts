/**
 * The Sentry Gun (the SDK's CObjectSentrygun, tf_obj_sentrygun.cpp) and its
 * level 3 rocket (CTFProjectile_SentryRocket, same file).
 *
 * SentryThink runs every SENTRY_THINK_DELAY (0.05 s → 3 ticks): searching
 * sweeps ±50° around the build yaw (SentryRotate / MoveTurret) and looks for
 * a target (FindTarget: the nearest visible enemy player, else the nearest
 * enemy building; a new target must be 25 % closer than the current one);
 * attacking tracks it (Attack) and fires once the turret is within 10° of
 * the goal angles (Fire: one 16-damage bullet, no spread, every 0.2 s at
 * level 1 and 0.1 s at 2–3; at level 3 a 100-damage rocket every 3 s).
 */

import { emptyTrace, NO_ENTITY, WORLD_ENTITY } from '../../core/types';
import {
  CONTENTS_GRATE,
  FL_NOTARGET,
  MASK_SHOT,
  MASK_SOLID,
  MASK_WATER,
  TF_TEAM_BLUE,
  TF_TEAM_RED,
  WL_EYES,
} from '../../core/constants';
import { angleVectors, copy, normalize, set, vec3, vectorAngles, type Vec3 } from '../../core/vec';
import { SENTRY } from '../../data';
import { OBJ_ATTACHMENT_SAPPER, OBJ_SENTRYGUN } from '../building-api';
import { TF_COND } from '../conditions';
import {
  createDamageInfo,
  createRadiusDamageInfo,
  DMG_BLAST,
  DMG_BULLET,
  DMG_HALF_FALLOFF,
  DMG_NOCLOSEDISTANCEMOD,
  DMG_USEDISTANCEMOD,
  resetDamageInfo,
  TF_DMG_CUSTOM_MINIGUN,
  TF_WEAPON,
  type DamageInfo,
  TF_DMG_CUSTOM_PLAYER_SENTRY,
} from '../damage';
import { COLLISION_GROUP_NONE, LIFE_ALIVE, type Entity } from '../entity';
import { BaseProjectile } from '../physics';
import type { NetRecord, NetSchema } from '../net-schema';
import type { Player } from '../player';
import type { FireBulletsParams } from '../weapon-api';
import type { TraceResult } from '../../core/types';
import { angleMod, objectsOf, TFBaseObject } from './base-object';
import { NET_SENTRYGUN } from './net';

/** SENTRY_STATE_* (tf_obj_sentrygun.h). */
export const SENTRY_STATE_INACTIVE = 0;
export const SENTRY_STATE_SEARCHING = 1;
export const SENTRY_STATE_ATTACKING = 2;
export const SENTRY_STATE_UPGRADING = 3;

/** SENTRY_THINK_DELAY. */
export const SENTRY_THINK_DELAY = SENTRY.thinkInterval;
/** CTFBaseRocket launch speed and TF_ROCKET_RADIUS / TF_ROCKET_RADIUS_FOR_RJS. */
export const SENTRY_ROCKET_SPEED = 1100;
export const SENTRY_ROCKET_RADIUS = 146;
export const SENTRY_ROCKET_RADIUS_FOR_RJS = 110 * 1.1;
/** Attack: fire once within 10 (degrees, QAngle length) of the goal. */
const FIRE_TOLERANCE = SENTRY.fireAngleTolerance;
/** FindTarget: a new target must be this much closer (distance² ratio). */
const NEW_TARGET_RATIO = 0.75;
/** Fire: the out-of-ammo click repeats every 0.2 s. */
const EMPTY_CLICK_DELAY = 0.2;
/** Fire: aim at the eye less this when the centre is hidden. */
const EYE_AIM_DROP = 5;
/** WRANGLER_DISABLE_TIME (tf_obj_sentrygun.cpp): the shield lingers, and the gun sleeps, this long. */
export const WRANGLER_DISABLE_TIME = 3;
/** SHIELD_NONE / SHIELD_NORMAL and SHIELD_NORMAL_VALUE (tf_obj.h): a wrangled gun takes 33 %. */
export const SHIELD_NONE = 0;
export const SHIELD_NORMAL = 1;
export const SHIELD_NORMAL_VALUE = 0.33;
/** FireRocket: a wrangled gun's rockets come every 2.25 s. */
const WRANGLED_ROCKET_INTERVAL = 2.25;
/** VECTOR_CONE_3DEGREES: a wrangled gun's spread. */
const WRANGLED_SPREAD = 0.02618;

/** The builder's active Wrangler with its laser dot (CTFLaserPointer::HasLaserDot / GetLaserDot). */
interface LaserPointerLike {
  laserDot(): Entity | null;
}
const laserPointerOf = (w: unknown): LaserPointerLike | null =>
  w && typeof (w as Partial<LaserPointerLike>).laserDot === 'function' ? (w as LaserPointerLike) : null;

const MODEL_PLACEMENT = 'models/buildables/sentry1_blueprint.mdl';
const MODEL_LEVEL: readonly string[] = [
  '',
  'models/buildables/sentry1.mdl',
  'models/buildables/sentry2.mdl',
  'models/buildables/sentry3.mdl',
];
const MODEL_UPGRADE: readonly string[] = [
  '',
  'models/buildables/sentry1_heavy.mdl',
  'models/buildables/sentry2_heavy.mdl',
  'models/buildables/sentry3_heavy.mdl',
];
const ROCKET_MODEL = 'models/buildables/sentry3_rockets.mdl';
const FIRE_SOUND: readonly string[] = [
  '',
  'Building_Sentrygun.Fire',
  'Building_Sentrygun.Fire2',
  'Building_Sentrygun.Fire3',
];
const IDLE_SOUND: readonly string[] = [
  '',
  'Building_Sentrygun.Idle',
  'Building_Sentrygun.Idle2',
  'Building_Sentrygun.Idle3',
];
const KILL_ICON: readonly string[] = [
  'obj_sentrygun',
  'obj_sentrygun',
  'obj_sentrygun2',
  'obj_sentrygun3',
];
/** Muzzle forward of the eye, standing in for the model's muzzle attachments. */
const MUZZLE_FORWARD: readonly number[] = [0, 24, 26, 26];

const SENTRY_MINS: Vec3 = { ...SENTRY.mins };
const SENTRY_MAXS: Vec3 = { ...SENTRY.maxs };

// Scratch.
const sEye = vec3();
const sTarget = vec3();
const sDir = vec3();
const sAng = vec3();
const sFwd = vec3();
const sSrc = vec3();
const sCenter = vec3();
const losTrace = emptyTrace();
const fireTrace = emptyTrace();
let tracerEndSet = false;
const tracerEnd = vec3();
/** One reusable FireBullets request (no allocation per shot). */
const bulletParams: FireBulletsParams = {
  attacker: null as unknown as Player,
  weapon: null,
  src: vec3(),
  angles: vec3(),
  spread: 0,
  bulletsPerShot: 1,
  damage: SENTRY.bulletDamage,
  damageType: DMG_BULLET | DMG_USEDISTANCEMOD | DMG_NOCLOSEDISTANCEMOD,
  customKill: 0,
  critType: 0,
  seed: 0,
  range: SENTRY.range,
  tracerFreq: 0,
  onHit: (victim, tr, info) => sentryBulletHit(victim, tr, info),
};
/** The sentry whose bullet is being fired (read by the shared onHit callback). */
let firingSentryId = NO_ENTITY;
let firingKillIcon = '';
/** FireBullets per-hit hook: the sentry is the inflictor (kill icon, push, distance rule). */
function sentryBulletHit(_victim: Entity, tr: TraceResult, info: DamageInfo): void {
  if (firingSentryId === NO_ENTITY) return;
  info.inflictor = firingSentryId;
  info.weaponId = TF_WEAPON.SENTRY_BULLET;
  info.killIcon = firingKillIcon;
  copy(tracerEnd, tr.endPos);
  tracerEndSet = true;
}

export class ObjectSentrygun extends TFBaseObject {
  readonly objectType = OBJ_SENTRYGUN;
  readonly baseHealth = SENTRY.baseHealth;
  readonly objMins = SENTRY_MINS;
  readonly objMaxs = SENTRY_MAXS;

  /** m_iState. */
  state = SENTRY_STATE_INACTIVE;
  ammoShells = 0;
  maxShells: number = SENTRY.maxShells[1];
  ammoRockets = 0;
  maxRockets: number = SENTRY.maxRockets;
  /** m_iOldAmmoShells / m_iOldAmmoRockets (kept while carried). */
  oldShells = 0;
  oldRockets = 0;
  /** m_hEnemy. */
  enemy: number = NO_ENTITY;
  /** m_vecCurAngles / m_vecGoalAngles (pitch, yaw). */
  readonly curAngles = vec3();
  readonly goalAngles = vec3();
  rightBound = 45;
  leftBound = 315;
  turningRight = true;
  /** m_flTurnRate (deg/s) and m_iBaseTurnRate. */
  turnRate = 0;
  readonly baseTurnRate = SENTRY.baseTurnRate;
  nextAttack = 0;
  nextRocketAttack = 0;
  lastAttackedTime = 0;
  heavyBulletResist: number = SENTRY.minigunResist[1];
  /** m_flSentryRange. */
  range: number = SENTRY.range;
  /** Water level of the eye (0 or 3). */
  waterLevel = 0;
  /** Barrel alternation (GetFireAttachment) and shot counters for the renderer. */
  muzzle = 0;
  fireSeq = 0;
  rocketSeq = 0;
  /** The Wrangler (CTFLaserPointer): m_bPlayerControlled, m_nShieldLevel, m_flShieldFadeTime. */
  playerControlled = false;
  shieldLevel = SHIELD_NONE;
  shieldFadeTime = 0;
  /** m_bFireNextFrame / m_bFireRocketNextFrame (the laser pointer's +attack / +attack2). */
  fireNextFrame = false;
  fireRocketNextFrame = false;
  /** m_hAutoAimTarget / m_flAutoAimStartTime: a player the laser touched, aimed at for 0.2 s. */
  autoAimTarget: number = NO_ENTITY;
  autoAimStartTime = 0;

  constructor(classname = 'obj_sentrygun') {
    super(classname);
  }

  override netSchema(): NetSchema | null {
    return NET_SENTRYGUN;
  }

  override get killIcon(): string {
    return KILL_ICON[this.level] ?? 'obj_sentrygun';
  }

  /** SENTRYGUN_EYE_OFFSET_LEVEL_*. */
  eyeHeight(): number {
    return SENTRY.eyeHeight[this.level] ?? SENTRY.eyeHeight[1];
  }

  override eyePosition(out: Vec3): Vec3 {
    return set(out, this.origin.x, this.origin.y, this.origin.z + this.eyeHeight());
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  /** SDK: CObjectSentrygun::Spawn. */
  protected override onRespawnObject(): void {
    this.model = MODEL_PLACEMENT;
    this.rightBound = 45;
    this.leftBound = 315;
    this.ammoShells = 0;
    this.ammoRockets = 0;
    this.maxShells = SENTRY.maxShells[1];
    this.maxRockets = SENTRY.maxRockets;
    this.enemy = NO_ENTITY;
    this.heavyBulletResist = SENTRY.minigunResist[1];
    this.state = SENTRY_STATE_INACTIVE;
    this.setContextThinkIn(SENTRY_THINK_DELAY);
  }

  /** SDK: CObjectSentrygun::StartBuilding / SetStartBuildingModel. */
  protected override onStartBuilding(): void {
    this.model = MODEL_UPGRADE[1];
    this.state = SENTRY_STATE_INACTIVE;
    this.curAngles.x = 0;
    this.curAngles.y = angleMod(this.angles.y);
  }

  /** SDK: CObjectSentrygun::OnGoActive. */
  protected override onGoActive(): void {
    this.model = MODEL_LEVEL[1];
    this.state = SENTRY_STATE_SEARCHING;
    const yaw = this.angles.y;
    this.curAngles.y = angleMod(yaw);
    this.rightBound = angleMod(Math.trunc(yaw) - SENTRY.idleSweep);
    this.leftBound = angleMod(Math.trunc(yaw) + SENTRY.idleSweep);
    if (this.rightBound > this.leftBound) {
      this.rightBound = this.leftBound;
      this.leftBound = angleMod(Math.trunc(yaw) - SENTRY.idleSweep);
    }
    this.goalAngles.y = this.rightBound;
    this.goalAngles.x = 0;
    this.curAngles.x = 0;
    this.turningRight = true;
    this.world.emitSound('Building_Sentrygun.Built', { entity: this.id });
    this.eyePosition(sEye);
    this.waterLevel = this.world.pointContents(sEye) & MASK_WATER ? WL_EYES : 0;
    if (this.carryDeploy) {
      this.ammoShells = this.oldShells;
      this.ammoRockets = this.oldRockets;
    } else {
      this.ammoShells = this.maxShells;
      this.ammoRockets = this.maxRockets;
    }
    this.muzzle = 0;
  }

  /** SDK: CObjectSentrygun::StartUpgrading. */
  protected override onStartUpgrading(): void {
    switch (this.level) {
      case 2:
        this.model = MODEL_UPGRADE[2];
        this.heavyBulletResist = SENTRY.minigunResist[2];
        this.maxShells = SENTRY.maxShells[2];
        break;
      case 3:
        this.model = MODEL_UPGRADE[3];
        if (!this.carryDeploy) this.ammoRockets = SENTRY.maxRockets;
        this.heavyBulletResist = SENTRY.minigunResist[3];
        this.maxShells = SENTRY.maxShells[3];
        break;
    }
    if (!this.carryDeploy) this.ammoShells = this.maxShells;
    this.state = SENTRY_STATE_UPGRADING;
  }

  /** SDK: CObjectSentrygun::FinishUpgrading. */
  protected override onFinishUpgrading(): void {
    this.state = SENTRY_STATE_SEARCHING;
    this.enemy = NO_ENTITY;
    this.model = MODEL_LEVEL[this.level] ?? MODEL_LEVEL[1];
  }

  /** SDK: CObjectSentrygun::MakeCarriedObject. */
  protected override onMakeCarried(): void {
    this.oldShells = this.ammoShells;
    this.oldRockets = this.ammoRockets;
    this.enemy = NO_ENTITY;
    this.state = SENTRY_STATE_INACTIVE;
  }

  /** SDK: CObjectSentrygun::OnStartDisabled — stay put. */
  protected override onStartDisabled(): void {
    this.goalAngles.x = this.curAngles.x;
    this.goalAngles.y = this.curAngles.y;
  }

  /** SDK: CObjectSentrygun::OnEndDisabled — resume the sweep. */
  protected override onEndDisabled(): void {
    if (this.turningRight) {
      this.turningRight = false;
      this.goalAngles.y = this.leftBound;
    } else {
      this.turningRight = true;
      this.goalAngles.y = this.rightBound;
    }
    this.goalAngles.x = 0;
  }

  // ─── Damage ───────────────────────────────────────────────────────────────

  /**
   * SDK: CObjectSentrygun::OnTakeDamage — minigun resistance by level; the spy
   * whose sapper is on it does 66 % damage.
   */
  protected override modifyDamage(info: DamageInfo): number {
    let dmg = info.damage;
    if (info.damageType & DMG_BULLET && info.customKill === TF_DMG_CUSTOM_MINIGUN)
      dmg *= 1 - this.heavyBulletResist;
    if (this.sapped) {
      const sapper = this.world.entity(this.sapperId);
      // The sapper's own drain is exempt (in the SDK its attacker is the sapper itself).
      if (
        sapper &&
        sapper.isBaseObject() &&
        info.inflictor !== sapper.id &&
        info.attacker === (sapper as TFBaseObject).builder
      ) {
        dmg *= 0.66;
      }
    }
    // The Wrangler's shield (bFullyShielded: not while sapped or plasma-disabled).
    if (this.shieldLevel > 0 && !this.sapped && !this.plasmaDisabled) dmg *= SHIELD_NORMAL_VALUE;
    return dmg;
  }

  override onTakeDamage(info: DamageInfo): number {
    const taken = super.onTakeDamage(info);
    if (taken > 0) this.lastAttackedTime = this.world.curtime;
    return taken;
  }

  // ─── Wrench ───────────────────────────────────────────────────────────────

  /**
   * SDK: CObjectSentrygun::OnWrenchHit — repair, else upgrade metal; then (unless
   * upgrading) up to 40 shells at 1 metal each and, at level 3, 8 rockets at 2.
   */
  protected override wrenchWork(
    player: Player,
    wrench: Parameters<TFBaseObject['onWrenchHit']>[1],
    hitLoc?: Vec3,
  ): boolean {
    let did = false;
    // The Wrangler's shield: repairs and ammo go in at SHIELD_NORMAL_VALUE.
    const shield = this.shieldLevel === SHIELD_NORMAL ? SHIELD_NORMAL_VALUE : 1;
    if (this.health < this.maxHealth) {
      if (this.commandRepair(player, wrenchRepair(wrench) * shield, 1) > 0) {
        this.doWrenchHitEffect(hitLoc, true, false);
        did = true;
      }
    }
    if (!did && this.checkUpgradeOnHit(player)) {
      this.doWrenchHitEffect(hitLoc, false, true);
      did = true;
    }
    if (!this.upgrading) {
      const METAL = 3;
      let metal = player.ammo[METAL];
      if (this.ammoShells < this.maxShells && metal > 0) {
        let add = Math.min(SENTRY.shellsPerHit, Math.trunc(metal / SENTRY.metalPerShell));
        add = Math.trunc(Math.min(this.maxShells - this.ammoShells, add) * shield);
        player.ammo[METAL] -= add * SENTRY.metalPerShell;
        this.ammoShells += add;
        if (add > 0) did = true;
      }
      metal = player.ammo[METAL];
      if (this.ammoRockets < this.maxRockets && this.level === 3 && metal > 0) {
        let add = Math.min(SENTRY.rocketsPerHit, Math.trunc(metal / SENTRY.metalPerRocket));
        add = Math.trunc(Math.min(this.maxRockets - this.ammoRockets, add) * shield);
        player.ammo[METAL] -= add * SENTRY.metalPerRocket;
        this.ammoRockets += add;
        if (add > 0) did = true;
      }
    }
    return did;
  }

  // ─── The sentry think ─────────────────────────────────────────────────────

  /** SDK: CObjectSentrygun::SentryThink. */
  protected override contextThink(): void {
    this.range = SENTRY.range;
    switch (this.state) {
      case SENTRY_STATE_SEARCHING:
        if (!this.carried && !this.placing) this.sentryRotate();
        break;
      case SENTRY_STATE_ATTACKING:
        if (!this.carried && !this.placing) this.attack();
        break;
      default:
        break;
    }
    this.setContextThinkIn(SENTRY_THINK_DELAY);
    if (this.shieldLevel > 0 && this.world.curtime > this.shieldFadeTime) {
      this.shieldLevel = SHIELD_NONE;
      this.goalAngles.x = 0;
    }
  }

  /** SDK: CObjectSentrygun::SentryRotate. */
  private sentryRotate(): void {
    if (this.findTarget()) return;
    if (!this.moveTurret()) {
      if (this.disabled) {
        this.world.emitSound('Building_Sentrygun.Disabled', { entity: this.id });
        this.goalAngles.x = 30;
      } else {
        this.world.emitSound(IDLE_SOUND[this.level] ?? IDLE_SOUND[1], { entity: this.id });
        if (this.turningRight) {
          this.turningRight = false;
          this.goalAngles.y = this.leftBound;
        } else {
          this.turningRight = true;
          this.goalAngles.y = this.rightBound;
        }
        const r = this.world.random;
        if (r.randomFloat(0, 1) < 0.3) this.goalAngles.x = Math.trunc(r.randomFloat(-10, 10));
      }
    }
  }

  /** SDK: CObjectSentrygun::ValidTargetPlayer. */
  private validTargetPlayer(p: Player, eye: Vec3, targetEye: Vec3): boolean {
    // Fully cloaked spies are invisible to it (GetPercentInvisible > 0.5) unless bumped.
    if (p.cond.has(TF_COND.STEALTHED) && !p.cond.has(TF_COND.STEALTHED_BLINK)) return false;
    // Spies disguised as our team are ignored unless already the target.
    if (p.cond.has(TF_COND.DISGUISED) && p.disguiseTeam === this.team && p.id !== this.enemy)
      return false;
    // Not across a water boundary.
    const wl = p.move.waterLevel;
    if ((this.waterLevel === 0 && wl >= WL_EYES) || (this.waterLevel === WL_EYES && wl <= 0))
      return false;
    return this.fVisible(p, eye, targetEye);
  }

  /** SDK: CObjectSentrygun::ValidTargetObject. */
  private validTargetObject(o: TFBaseObject, eye: Vec3, targetEye: Vec3): boolean {
    if (o.placing || o.carried) return false;
    if (o.objectType === OBJ_ATTACHMENT_SAPPER) return false;
    return this.fVisible(o, eye, targetEye);
  }

  /**
   * CBaseEntity::FVisible (MASK_SHOT | CONTENTS_GRATE): the line from our eye to the
   * target's eye reaches it. Our own team's players and buildings don't block.
   */
  private fVisible(target: Entity, eye: Vec3, targetEye: Vec3): boolean {
    const f = this.world.entityFilterObject(this, COLLISION_GROUP_NONE);
    f.ignoreTeam = this.team;
    this.world.traceLine(eye, targetEye, MASK_SHOT | CONTENTS_GRATE, f.fn, losTrace);
    return losTrace.fraction >= 1 || losTrace.entity === target.id;
  }

  /** SDK: CObjectSentrygun::FindTarget — players first, then buildings. */
  findTarget(): boolean {
    const world = this.world;
    if (this.playerControlled) this.shieldFadeTime = world.curtime + WRANGLER_DISABLE_TIME;
    this.playerControlled = false;
    if (this.disabled) return false;
    const eye = this.eyePosition(sEye);
    // If our builder has an active laser pointer we don't seek targets.
    const builder = this.builderPlayer();
    const pointer = builder ? laserPointerOf(builder.activeWeapon()) : null;
    const dot = pointer ? pointer.laserDot() : null;
    if (dot) {
      this.playerControlled = true;
      this.shieldLevel = SHIELD_NORMAL;
      this.shieldFadeTime = world.curtime + WRANGLER_DISABLE_TIME;
      let target: Entity = dot;
      // The brief auto-aim at a player the laser touched (only if the gun can reach him).
      const auto = world.entity(this.autoAimTarget);
      if (auto && world.curtime - this.autoAimStartTime < 0.2 && auto.isPlayer() && (auto as Player).alive) {
        auto.worldSpaceCenter(sTarget);
        if (this.fVisible(auto, eye, sTarget)) target = auto;
        else this.autoAimTarget = NO_ENTITY;
      } else this.autoAimTarget = NO_ENTITY;
      const dx = target.origin.x - eye.x;
      const dy = target.origin.y - eye.y;
      const dz = target.origin.z - eye.z;
      if (dx * dx + dy * dy + dz * dz > 30 * 30) {
        if (target.id !== this.enemy) this.foundTarget(target, eye, true);
        return true;
      }
    }
    // Don't auto track while the player shield is up (it fades 3 s after the Wrangler lets go).
    if (this.shieldLevel === SHIELD_NORMAL) return false;
    const enemyTeam = this.team === TF_TEAM_BLUE ? TF_TEAM_RED : TF_TEAM_BLUE;
    let minDist2 = this.range * this.range;
    let current: Entity | null = null;
    const old = world.entity(this.enemy);
    let oldDist2 = Number.MAX_VALUE;

    for (let i = 1; i <= 32; i++) {
      const e = world.entities[i];
      if (!e || e.removed) continue;
      const p = e as Player;
      if (p.team !== enemyTeam || p.lifeState !== LIFE_ALIVE) continue;
      if (p.flags & FL_NOTARGET) continue;
      p.eyePosition(sTarget);
      const dx = sTarget.x - eye.x;
      const dy = sTarget.y - eye.y;
      const dz = sTarget.z - eye.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > minDist2) continue;
      if (this.validTargetPlayer(p, eye, sTarget)) {
        minDist2 = d2;
        current = p;
        if (p === old) oldDist2 = d2;
      }
    }

    if (!current) {
      const list = objectsOf(world);
      for (let i = 0; i < list.length; i++) {
        const o = list[i];
        if (o.removed || o.team !== enemyTeam) continue;
        o.eyePosition(sTarget);
        const dx = sTarget.x - eye.x;
        const dy = sTarget.y - eye.y;
        const dz = sTarget.z - eye.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (o === old) oldDist2 = d2;
        if (d2 > minDist2) continue;
        if (this.validTargetObject(o, eye, sTarget)) {
          minDist2 = d2;
          current = o;
        }
      }
    }

    if (current) {
      if (current !== old && minDist2 < oldDist2 * NEW_TARGET_RATIO) this.foundTarget(current, eye);
      return true;
    }
    return false;
  }

  /** SDK: CObjectSentrygun::FoundTarget. */
  private foundTarget(target: Entity, _eye: Vec3, noSound = false): void {
    const world = this.world;
    this.enemy = target.id;
    if (!noSound && (this.ammoShells > 0 || (this.ammoRockets > 0 && this.level === 3))) {
      if (target.isPlayer()) {
        world.emitSound('Building_Sentrygun.AlertTarget', { entity: this.id, to: target.id });
        world.emitSound('Building_Sentrygun.Alert', { entity: this.id, predictedBy: target.id });
      } else world.emitSound('Building_Sentrygun.Alert', { entity: this.id });
    }
    this.state = SENTRY_STATE_ATTACKING;
    this.nextAttack = world.curtime + SENTRY_THINK_DELAY;
    if (this.nextRocketAttack < world.curtime) this.nextRocketAttack = world.curtime;
  }

  /** GetEnemyAimPosition: the target's centre. */
  private enemyAimPosition(e: Entity, out: Vec3): Vec3 {
    return e.worldSpaceCenter(out);
  }

  /** SDK: CObjectSentrygun::Attack. */
  private attack(): void {
    const world = this.world;
    if (!this.findTarget()) {
      this.state = SENTRY_STATE_SEARCHING;
      this.enemy = NO_ENTITY;
      return;
    }
    const enemy = world.entity(this.enemy);
    if (!enemy) {
      this.state = SENTRY_STATE_SEARCHING;
      this.enemy = NO_ENTITY;
      return;
    }
    const eye = this.eyePosition(sEye);
    this.enemyAimPosition(enemy, sTarget);
    set(sDir, sTarget.x - eye.x, sTarget.y - eye.y, sTarget.z - eye.z);
    vectorAngles(sDir, sAng);
    let pitch = sAng.x;
    if (pitch < -180) pitch += 360;
    if (pitch > 180) pitch -= 360;
    if (pitch > SENTRY.pitchLimit) pitch = SENTRY.pitchLimit;
    else if (pitch < -SENTRY.pitchLimit) pitch = -SENTRY.pitchLimit;
    this.goalAngles.y = angleMod(sAng.y);
    this.goalAngles.x = pitch;

    this.moveTurret();

    const gx = this.goalAngles.x - this.curAngles.x;
    const gy = this.goalAngles.y - this.curAngles.y;
    if (this.nextAttack <= world.curtime + 1e-9 && Math.sqrt(gx * gx + gy * gy) <= FIRE_TOLERANCE) {
      if (!this.playerControlled || this.fireNextFrame) {
        this.fireNextFrame = false;
        this.fire(enemy);
      }
      // A wrangled gun fires twice as fast (m_flFireRate × 0.5).
      const rate = this.playerControlled ? 0.5 : 1;
      this.nextAttack = world.curtime + (SENTRY.fireInterval[this.level] ?? SENTRY.fireInterval[1]) * rate;
    }
    if (this.playerControlled && this.fireRocketNextFrame) {
      this.fireRocketNextFrame = false;
      this.fireRocket(enemy);
    }
  }

  /** SDK: CObjectSentrygun::ClearTarget (the Wrangler put away). */
  clearTarget(): void {
    this.enemy = NO_ENTITY;
    this.fireNextFrame = false;
    this.fireRocketNextFrame = false;
  }

  /** SDK: CObjectSentrygun::SetAutoAimTarget. */
  setAutoAimTarget(p: Player): void {
    if (this.autoAimTarget !== p.id) this.autoAimStartTime = this.world.curtime;
    this.autoAimTarget = p.id;
  }

  /** SDK: CObjectSentrygun::MoveTurret. Returns whether the turret moved. */
  moveTurret(): boolean {
    let moved = false;
    // GetBaseTurnRate: a wrangled gun turns 100× as fast.
    const base = this.playerControlled ? this.baseTurnRate * 100 : this.baseTurnRate;
    const cur = this.curAngles;
    const goal = this.goalAngles;
    if (cur.x !== goal.x) {
      const dir = goal.x > cur.x ? 1 : -1;
      cur.x += SENTRY_THINK_DELAY * (base * 5) * dir;
      if (dir === 1) {
        if (cur.x > goal.x) cur.x = goal.x;
      } else if (cur.x < goal.x) cur.x = goal.x;
      moved = true;
    }
    if (cur.y !== goal.y) {
      let dir = goal.y > cur.y ? 1 : -1;
      let dist = Math.abs(goal.y - cur.y);
      let reversed = false;
      if (dist > 180) {
        dist = 360 - dist;
        dir = -dir;
        reversed = true;
      }
      if (this.enemy === NO_ENTITY) {
        if (dist > 30) {
          if (this.turnRate < base * 10) this.turnRate += base;
        } else if (this.turnRate > base * 5) this.turnRate -= base;
      } else if (dist > 30) {
        if (this.turnRate < base * 30) this.turnRate += base * 3;
      }
      cur.y += SENTRY_THINK_DELAY * this.turnRate * dir;
      if (dir === -1) {
        if ((!reversed && goal.y > cur.y) || (reversed && goal.y < cur.y)) cur.y = goal.y;
      } else if ((!reversed && goal.y < cur.y) || (reversed && goal.y > cur.y)) cur.y = goal.y;
      if (cur.y < 0) cur.y += 360;
      else if (cur.y >= 360) cur.y -= 360;
      if (dist < SENTRY_THINK_DELAY * 0.5 * base) cur.y = goal.y;
      moved = true;
    }
    if (!moved || this.turnRate <= 0) this.turnRate = base * 5;
    return moved;
  }

  /** The muzzle for this shot (GetFireAttachment: levels 2–3 alternate barrels). */
  private muzzlePosition(out: Vec3): Vec3 {
    if (this.level > 1) this.muzzle ^= 1;
    else this.muzzle = 0;
    set(sAng, this.curAngles.x, this.curAngles.y, 0);
    angleVectors(sAng, sFwd);
    this.eyePosition(out);
    const fwd = MUZZLE_FORWARD[this.level] ?? MUZZLE_FORWARD[1];
    out.x += sFwd.x * fwd;
    out.y += sFwd.y * fwd;
    out.z += sFwd.z * fwd;
    return out;
  }

  /** SDK: CObjectSentrygun::Fire. */
  private fire(enemy: Entity): boolean {
    const world = this.world;
    if (!this.playerControlled && this.level === 3 && this.ammoRockets > 0 && this.nextRocketAttack < world.curtime)
      this.fireRocket(enemy);

    if (this.ammoShells <= 0) {
      world.emitSound('Building_Sentrygun.Empty', { entity: this.id });
      this.nextAttack = world.curtime + EMPTY_CLICK_DELAY;
      return true;
    }
    const src = this.muzzlePosition(sSrc);
    // A muzzle through a wall can't fire.
    this.worldSpaceCenter(sCenter);
    world.traceLine(
      sCenter,
      src,
      MASK_SOLID,
      world.entityFilter(this, COLLISION_GROUP_NONE),
      fireTrace,
    );
    if (fireTrace.fraction < 1) {
      const blocker = fireTrace.entity === WORLD_ENTITY ? null : world.entity(fireTrace.entity);
      if (!blocker || blocker.takeDamage === 0) return false;
    }
    this.enemyAimPosition(enemy, sTarget);
    world.traceLine(
      src,
      sTarget,
      MASK_SOLID,
      world.entityFilter(this, COLLISION_GROUP_NONE),
      fireTrace,
    );
    if (
      fireTrace.entity === WORLD_ENTITY ||
      fireTrace.entity === NO_ENTITY ||
      fireTrace.fraction >= 1
    ) {
      if (enemy.isPlayer()) {
        (enemy as Player).eyePosition(sTarget);
        sTarget.z -= EYE_AIM_DROP;
      }
    }
    set(sDir, sTarget.x - src.x, sTarget.y - src.y, sTarget.z - src.z);
    const dist = normalize(sDir);
    vectorAngles(sDir, sAng);
    const builder = this.builderPlayer();
    if (builder && world.isServer) {
      tracerEndSet = false;
      firingSentryId = this.id;
      firingKillIcon = this.killIcon;
      const bp = bulletParams;
      bp.attacker = builder;
      copy(bp.src, src);
      copy(bp.angles, sAng);
      bp.seed = world.tickCount;
      bp.range = dist + 100;
      bp.spread = this.playerControlled ? WRANGLED_SPREAD : 0;
      bp.customKill = this.playerControlled ? TF_DMG_CUSTOM_PLAYER_SENTRY : 0;
      world.fireBullets(bp);
      firingSentryId = NO_ENTITY;
      if (!tracerEndSet)
        set(
          tracerEnd,
          src.x + sDir.x * (dist + 100),
          src.y + sDir.y * (dist + 100),
          src.z + sDir.z * (dist + 100),
        );
      world.emitEffect({
        kind: 'tracer',
        pos: { x: tracerEnd.x, y: tracerEnd.y, z: tracerEnd.z },
        start: { x: src.x, y: src.y, z: src.z },
        end: { x: tracerEnd.x, y: tracerEnd.y, z: tracerEnd.z },
        entity: this.id,
        attachment: this.muzzleName(),
      });
      world.emitEffect({
        kind: 'muzzleflash',
        pos: { x: src.x, y: src.y, z: src.z },
        entity: this.id,
        attachment: this.muzzleName(),
        value: this.level,
      });
      if (enemy.isPlayer() && (enemy as Player).lifeState !== LIFE_ALIVE) this.kills++;
    }
    world.emitSound(FIRE_SOUND[this.level] ?? FIRE_SOUND[1], { entity: this.id });
    this.fireSeq = (this.fireSeq + 1) & 255;
    this.ammoShells--;
    return true;
  }

  private muzzleName(): string {
    if (this.level === 1) return 'muzzle';
    return this.muzzle === 0 ? 'muzzle_l' : 'muzzle_r';
  }

  /** SDK: CObjectSentrygun::FireRocket. */
  private fireRocket(enemy: Entity): boolean {
    const world = this.world;
    if (this.nextRocketAttack >= world.curtime || this.ammoRockets <= 0) return false;
    // The rocket pod sits above the guns (attachment "rocket_l").
    this.eyePosition(sSrc);
    sSrc.z += 12;
    this.enemyAimPosition(enemy, sTarget);
    set(sDir, sTarget.x - sSrc.x, sTarget.y - sSrc.y, sTarget.z - sSrc.z);
    normalize(sDir);
    world.traceLine(
      sSrc,
      sTarget,
      MASK_SOLID,
      world.entityFilter(this, COLLISION_GROUP_NONE),
      fireTrace,
    );
    if (
      this.playerControlled ||
      (fireTrace.fraction < 1 && fireTrace.entity !== WORLD_ENTITY && fireTrace.entity !== NO_ENTITY)
    ) {
      vectorAngles(sDir, sAng);
      world.emitSound('Building_Sentrygun.FireRocket', { entity: this.id });
      const builder = this.builderPlayer();
      if (world.isServer) {
        const rocket = world.spawnProjectile('tf_projectile_sentryrocket', {
          origin: sSrc,
          angles: sAng,
          velocity: {
            x: sDir.x * SENTRY_ROCKET_SPEED,
            y: sDir.y * SENTRY_ROCKET_SPEED,
            z: sDir.z * SENTRY_ROCKET_SPEED,
          },
          owner: this,
          weapon: null,
          damage: SENTRY.rocketDamage,
          critType: 0,
        });
        if (rocket instanceof SentryRocket) rocket.scorer = builder ? builder.id : this.id;
      }
      this.rocketSeq = (this.rocketSeq + 1) & 255;
      this.nextRocketAttack = world.curtime + (this.playerControlled ? WRANGLED_ROCKET_INTERVAL : SENTRY.rocketInterval);
      this.ammoRockets--;
    }
    return true;
  }

  // ─── Network ──────────────────────────────────────────────────────────────

  override writeNet(out: NetRecord): void {
    super.writeNet(out);
    out.sentryState = this.state;
    out.shells = this.ammoShells;
    out.maxShells = this.maxShells;
    out.rockets = this.ammoRockets;
    out.maxRockets = this.maxRockets;
    let yaw = this.curAngles.y - this.angles.y;
    yaw %= 360;
    if (yaw > 180) yaw -= 360;
    if (yaw < -180) yaw += 360;
    out.aimYaw = -yaw;
    out.aimPitch = -this.curAngles.x;
    out.enemy = this.enemy;
    out.fireSeq = this.fireSeq;
    out.rocketSeq = this.rocketSeq;
    out.muzzle = this.muzzle;
    out.assists = this.assists;
    out.shieldLevel = this.shieldLevel;
    out.playerControlled = this.playerControlled;
  }
}

function wrenchRepair(wrench: unknown): number {
  const w = wrench as { repairAmount?: () => number } | null;
  return w && w.repairAmount ? w.repairAmount() : 100;
}

const rocketInfo = createDamageInfo();

/**
 * CTFProjectile_SentryRocket: a CTFProjectile_Rocket fired by the level 3 sentry. The
 * sentry owns it (no collision with it); the builder is the scorer. Explodes for
 * 100 damage in TF_ROCKET_RADIUS with the rocket launcher's damage rules
 * (DMG_BLAST | DMG_HALF_FALLOFF | DMG_USEDISTANCEMOD); the kill icon is obj_sentrygun3.
 */
export class SentryRocket extends BaseProjectile {
  /** IScorer::GetScorer — the engineer credited with its damage. */
  scorer: number = NO_ENTITY;

  constructor(classname = 'tf_projectile_sentryrocket') {
    super(classname);
  }

  override spawn(): void {
    super.spawn();
    this.model = ROCKET_MODEL;
    set(this.mins, 0, 0, 0);
    set(this.maxs, 0, 0, 0);
    this.killIcon = 'obj_sentrygun3';
    this.weaponId = TF_WEAPON.ROCKETLAUNCHER;
  }

  applyExtra(x: Readonly<Record<string, number | string | boolean>>): void {
    if (typeof x.scorer === 'number') this.scorer = x.scorer;
  }

  /** SDK: CTFBaseRocket::Explode. */
  override onImpact(other: Entity, tr: TraceResult): void {
    const world = this.world;
    if (this.removed) return;
    this.enemy = other.id;
    if (tr.fraction !== 1) {
      this.origin.x = tr.endPos.x + tr.plane.normal.x;
      this.origin.y = tr.endPos.y + tr.plane.normal.y;
      this.origin.z = tr.endPos.z + tr.plane.normal.z;
    }
    const pos = { x: this.origin.x, y: this.origin.y, z: this.origin.z };
    world.emitEffect({
      kind: 'explosion',
      pos,
      normal: { ...tr.plane.normal },
      entity: other.id,
      value: TF_WEAPON.SENTRY_ROCKET,
    });
    const attacker = this.scorer !== NO_ENTITY ? this.scorer : this.owner;
    if (world.entity(attacker)) {
      const info = rocketInfo;
      resetDamageInfo(info);
      info.attacker = attacker;
      info.inflictor = this.id;
      info.weaponId = TF_WEAPON.ROCKETLAUNCHER;
      info.killIcon = 'obj_sentrygun3';
      info.damage = this.damage;
      info.damageType = DMG_BLAST | DMG_HALF_FALLOFF | DMG_USEDISTANCEMOD;
      info.directHitEntity = other === world.worldEntity ? NO_ENTITY : other.id;
      copy(info.position, this.origin);
      const r = createRadiusDamageInfo(info, this.origin, SENTRY_ROCKET_RADIUS);
      r.rjRadius = SENTRY_ROCKET_RADIUS_FOR_RJS;
      world.radiusDamage(r);
    }
    world.remove(this);
  }
}
