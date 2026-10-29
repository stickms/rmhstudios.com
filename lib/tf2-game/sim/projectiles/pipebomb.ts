/**
 * tf_projectile_pipe and tf_projectile_pipe_remote
 * (CTFGrenadePipebombProjectile over CTFWeaponBaseGrenadeProj).
 *
 * Pipes: launched with 60 % damage (TF_WEAPON_PIPEBOMB_TIMER_DMG_REDUCTION)
 * and a 2 s fuse; one that touches an enemy before it has touched the world
 * explodes at once with full damage (PipebombTouch: m_flDamage =
 * m_flFullDamage). After the first world contact it bounces and rolls until
 * the fuse runs out.
 *
 * Stickies: full damage, no fuse; they stick to the first world surface,
 * arm after tf_grenadelauncher_livetime and are detonated by the launcher.
 * An unstuck (air) detonation uses 85 % radius ramping to 100 % over 2 s
 * after arming; the distance modifier applies for the first 5 s of life.
 * Bullets, buckshot and melee break a stuck sticky (no damage); blast and
 * airblast push it loose (CTFGrenadePipebombProjectile::OnTakeDamage).
 *
 * The SDK flies grenades with VPhysics; here they use PhysicsToss with the
 * scripted gravity scale and a friction/elasticity bounce
 * (ResolveFlyCollisionCustom). The player touch the SDK gets from the trigger
 * flag (FSOLID_TRIGGER) is a swept box test against enemy players each tick.
 */

import {
  MASK_SHOT_HULL,
  MOVETYPE_FLYGRAVITY,
  MOVETYPE_NONE,
  FL_ONGROUND,
  SURF_SKY,
} from '../../core/constants';
import { emptyTrace, NO_ENTITY, WORLD_ENTITY, type TraceResult } from '../../core/types';
import { copy, remapClamped, set, vec3, type Vec3 } from '../../core/vec';
import { RADIUS_DAMAGE, TF_DMG_CUSTOM } from '../../data/damage';
import { GRENADE_LAUNCHER, STICKYBOMB } from '../../data/weapons';
import {
  DAMAGE_EVENTS_ONLY,
  MOVECOLLIDE_FLY_CUSTOM,
  TF_COLLISIONGROUP_GRENADES,
  type Entity,
} from '../entity';
import { registerEntityClass } from '../entity-registry';
import {
  createDamageInfo,
  damageForce,
  DMG_BLAST,
  DMG_BUCKSHOT,
  DMG_BULLET,
  DMG_IGNITE,
  DMG_MELEE,
  DMG_SONIC,
  DMG_USEDISTANCEMOD,
  type DamageInfo,
} from '../damage';
import { BaseProjectile } from '../physics';
import { MAX_PLAYERS } from '../world';
import type { Player } from '../player';
import {
  DEFLECT_FORCE_DAMAGE,
  DEFLECT_FORCE_SCALE,
  DMG_TYPE_PIPE,
  DMG_TYPE_STICKY,
  GRENADE_DESTROYABLE_TIMER,
  GRENADE_DETONATE_TRACE_DOWN,
  GRENADE_DETONATE_TRACE_UP,
  GRENADE_FORCE_SLEEPTIME,
  GRENADE_REST_SPEED,
  GRENADE_THINK_INTERVAL,
  GROUND_NORMAL_Z,
  PIPEBOMB_DEFLECT_RESET_TIME,
  STICKY_DISTANCE_MOD_TIME,
  STICKY_IMPULSE_TO_VELOCITY,
} from '../weapons/constants';
import { explodeProjectile, launcherScript, PIPE_MODEL, PROJECTILE_KIND, STICKY_MODEL, type Deflectable } from './common';

const HALF = GRENADE_LAUNCHER.halfExtent;
const GRENADE_MINS: Vec3 = { x: -HALF, y: -HALF, z: -HALF };
const GRENADE_MAXS: Vec3 = { x: HALF, y: HALF, z: HALF };
const detTrace = emptyTrace();
const detStart = vec3();
const detEnd = vec3();
const scratchForce = vec3();
const STICKY_SIZE: Vec3 = { x: HALF * 2, y: HALF * 2, z: HALF * 2 };

/** A launcher that tracks its stickies (CTFPipebombLauncher::DeathNotice). */
export interface PipebombOwnerWeapon {
  onPipebombRemoved(p: TFGrenadePipebomb): void;
}

export class TFGrenadePipebomb extends BaseProjectile implements Deflectable {
  /** TF_GL_MODE_REMOTE_DETONATE. */
  readonly sticky: boolean;
  /** m_flFullDamage (the direct-hit damage). */
  fullDamage = 0;
  /** m_bTouched: has touched the world (pipes stop exploding on contact; stickies are stuck). */
  touched = false;
  /** m_flCreationTime. */
  creationTime = 0;
  /** m_flDetonateTime (pipes: the fuse). */
  detonateTime = Infinity;
  /** m_DmgRadius (the launcher script's DamageRadius). */
  damageRadius: number = RADIUS_DAMAGE.grenadeSelfRadius;
  /** m_bFizzle: removed without exploding (owner died, broken by bullets). */
  fizzle = false;
  /** m_flMinSleepTime: a pushed sticky can't re-stick before this. */
  minSleepTime = 0;
  /** The player that last airblasted it (stickies return to the owner's credit later). */
  deflectedTime = 0;
  /** Spin (AngularImpulse) for the renderer, degrees per second. */
  readonly spin = vec3();
  readonly impactNormal = vec3();
  private nextDetonateCheck = 0;
  private readonly lastOrigin = vec3();
  protected exploded = false;

  constructor(classname: string) {
    super(classname);
    this.sticky = classname === 'tf_projectile_pipe_remote';
    this.model = this.sticky ? STICKY_MODEL : PIPE_MODEL;
    this.projectileKind = this.sticky ? PROJECTILE_KIND.STICKY : PROJECTILE_KIND.PIPE;
    this.moveType = MOVETYPE_FLYGRAVITY;
    this.moveCollide = MOVECOLLIDE_FLY_CUSTOM;
    this.collisionGroup = TF_COLLISIONGROUP_GRENADES;
    this.setSize(GRENADE_MINS, GRENADE_MAXS);
    const phys = this.sticky ? STICKYBOMB : GRENADE_LAUNCHER;
    this.gravity = phys.gravity;
    this.friction = phys.friction;
    this.elasticity = phys.elasticity;
    // Solid (no trigger flag) so bullets and melee traces reach it; players pass (group rules).
    this.solidFlags = 0;
    this.takeDamage = DAMAGE_EVENTS_ONLY;
  }

  /** Extra spawn fields from FirePipeBomb: radius and spin. */
  applyExtra(x: Readonly<Record<string, number | string | boolean>>): void {
    if (typeof x.radius === 'number' && x.radius > 0) this.damageRadius = x.radius;
    if (typeof x.spinX === 'number') this.spin.x = x.spinX;
    if (typeof x.spinY === 'number') this.spin.y = x.spinY;
  }

  /** SDK: CTFGrenadePipebombProjectile::Create / Spawn. */
  override spawn(): void {
    super.spawn();
    const t = this.world.curtime;
    this.creationTime = t;
    this.fullDamage = this.damage;
    if (!this.sticky) {
      this.damage *= GRENADE_LAUNCHER.fuseDamageScale;
      this.detonateTime = t + GRENADE_LAUNCHER.fuse;
    }
    this.skin = this.team === 3 ? 1 : 0;
    copy(this.lastOrigin, this.origin);
    this.nextDetonateCheck = t + GRENADE_THINK_INTERVAL;
    this.setThink(this.tickThink, t);
  }

  /** tf_grenadelauncher_livetime (GetLiveTime). */
  liveTime(): number {
    return STICKYBOMB.armTime;
  }

  /** SDK: CTFWeaponBaseGrenadeProj::SetTimer — explode at the next DetonateThink after `time`. */
  setTimer(time: number): void {
    this.detonateTime = time;
    this.nextDetonateCheck = time;
  }

  isArmed(): boolean {
    return this.world.curtime - this.creationTime >= this.liveTime();
  }

  isDeflectable(): boolean {
    return !this.exploded;
  }

  isDestroyable(): boolean {
    return this.world.curtime > this.creationTime + GRENADE_DESTROYABLE_TIMER;
  }

  /**
   * Per tick: the trigger touch against enemy players (pipes), the 0.2 s
   * DetonateThink, the sticky deflect-credit reset, and the spin.
   */
  private readonly tickThink = (): void => {
    const w = this.world;
    const t = w.curtime;
    if (!this.sticky && !this.touched && !this.exploded) {
      const hit = this.sweepEnemyPlayers();
      if (hit) {
        this.pipebombTouch(hit);
        if (this.removed) return;
      }
    }
    copy(this.lastOrigin, this.origin);
    if (this.moveType !== MOVETYPE_NONE && !(this.flags & FL_ONGROUND)) {
      const dt = w.frametime;
      this.angles.x = (this.angles.x + this.spin.x * dt) % 360;
      this.angles.y = (this.angles.y + this.spin.y * dt) % 360;
    }
    if (t >= this.nextDetonateCheck - 1e-9) {
      this.nextDetonateCheck = t + GRENADE_THINK_INTERVAL;
      // CTFWeaponBaseGrenadeProj::DetonateThink.
      if (t > this.detonateTime) {
        this.detonate();
        return;
      }
      if (this.sticky && this.deflected && this.deflectedTime <= t) {
        this.deflected = 0;
        this.deflectedBy = NO_ENTITY;
      }
    }
    this.nextThink = t;
  };

  /** The pipe's box swept over its last move against living enemy players. */
  private sweepEnemyPlayers(): Player | null {
    const w = this.world;
    const ax = this.lastOrigin.x;
    const ay = this.lastOrigin.y;
    const az = this.lastOrigin.z;
    const dx = this.origin.x - ax;
    const dy = this.origin.y - ay;
    const dz = this.origin.z - az;
    let best: Player | null = null;
    let bestT = 2;
    for (let i = 1; i <= MAX_PLAYERS; i++) {
      const p = w.player(i);
      if (!p || !p.alive || p.team === this.team || p.team <= 1) continue;
      const tHit = sweptBoxHit(ax, ay, az, dx, dy, dz, p.origin, p.mins, p.maxs);
      if (tHit >= 0 && tHit < bestT) {
        bestT = tHit;
        best = p;
      }
    }
    return best;
  }

  /** SDK: CTFGrenadePipebombProjectile::PipebombTouch — an enemy before the world: full damage, now. */
  protected pipebombTouch(other: Entity): void {
    if (this.touched || this.exploded) return;
    if (other.id === this.owner) return;
    if (!other.team || other.team === this.team || other.takeDamage === 0) return;
    this.enemy = other.id;
    this.damage = this.fullDamage;
    this.explode(null, other);
  }

  /** Physics hit something (world or a solid entity). */
  override onImpact(other: Entity, tr: TraceResult): void {
    if (this.exploded) return;
    if (tr.surfaceFlags & SURF_SKY) {
      this.world.remove(this);
      return;
    }
    const isWorld = other === this.world.worldEntity || other.id === WORLD_ENTITY || other.bspModel > 0;
    if (!this.sticky) {
      // VPhysicsCollision / PipebombTouch: enemy buildings set it off with full damage.
      if (!isWorld && other.team && other.team !== this.team && other.takeDamage !== 0) {
        if (!this.touched) this.pipebombTouch(other);
        else this.detonate();
        return;
      }
      if (!this.touched) this.world.emitSound('Weapon_Grenade_Pipebomb.Bounce', { entity: this.id });
      this.touched = true;
      return;
    }
    // Stickies stick to the world (and brush entities) once they may sleep.
    if (isWorld && this.world.curtime > this.minSleepTime) {
      this.touched = true;
      copy(this.impactNormal, tr.plane.normal);
      set(this.velocity, 0, 0, 0);
      this.moveType = MOVETYPE_NONE;
      this.flags |= FL_ONGROUND;
      this.groundEntity = tr.entity === NO_ENTITY ? WORLD_ENTITY : tr.entity;
    }
  }

  /** The VPhysics bounce stand-in: normal × elasticity, tangent × (1 − friction); settles when slow. */
  override resolveFlyCollisionCustom(tr: TraceResult, _dt: number): void {
    if (this.moveType === MOVETYPE_NONE) return;
    const n = tr.plane.normal;
    const v = this.velocity;
    const vn = v.x * n.x + v.y * n.y + v.z * n.z;
    if (vn < 0) {
      const tx = v.x - vn * n.x;
      const ty = v.y - vn * n.y;
      const tz = v.z - vn * n.z;
      const keep = 1 - this.friction;
      const e = this.elasticity;
      v.x = tx * keep - vn * e * n.x;
      v.y = ty * keep - vn * e * n.y;
      v.z = tz * keep - vn * e * n.z;
    }
    if (n.z > GROUND_NORMAL_Z && v.x * v.x + v.y * v.y + v.z * v.z < GRENADE_REST_SPEED * GRENADE_REST_SPEED) {
      this.flags |= FL_ONGROUND;
      this.groundEntity = tr.entity === NO_ENTITY ? WORLD_ENTITY : tr.entity;
      set(v, 0, 0, 0);
    }
  }

  /** SDK: CTFGrenadePipebombProjectile::Detonate → CTFWeaponBaseGrenadeProj::Detonate. */
  detonate(): void {
    if (this.exploded || this.removed) return;
    if (this.fizzle) {
      this.exploded = true;
      this.world.emitEffect({ kind: 'gibs', pos: { x: this.origin.x, y: this.origin.y, z: this.origin.z }, entity: this.id, system: this.model });
      this.world.remove(this);
      return;
    }
    set(detStart, this.origin.x, this.origin.y, this.origin.z + GRENADE_DETONATE_TRACE_UP);
    set(detEnd, detStart.x, detStart.y, detStart.z - GRENADE_DETONATE_TRACE_DOWN);
    this.world.traceLine(detStart, detEnd, MASK_SHOT_HULL, this.world.entityFilter(this, 0), detTrace);
    const hit = detTrace.fraction < 1 ? (this.world.entity(detTrace.entity) ?? this.world.worldEntity) : null;
    this.explode(detTrace, hit);
  }

  /** SDK: CTFGrenadePipebombProjectile::GetDamageRadius (air-detonated stickies are smaller at first). */
  damageRadiusNow(): number {
    let r = this.damageRadius;
    if (this.sticky && !this.touched) {
      const arm = this.liveTime();
      r *= remapClamped(this.world.curtime - this.creationTime, arm, arm + STICKYBOMB.radiusRampTime, STICKYBOMB.airDetRadiusScale, 1);
    }
    return r;
  }

  /** SDK: GetDamageType / GetDamageCustom by mode and age. */
  private damageTypeNow(): number {
    if (!this.sticky) return DMG_TYPE_PIPE;
    let t = DMG_TYPE_STICKY;
    if (this.world.curtime - this.creationTime < STICKY_DISTANCE_MOD_TIME) t |= DMG_USEDISTANCEMOD;
    return t;
  }

  /** SDK: CTFWeaponBaseGrenadeProj::Explode. */
  explode(tr: TraceResult | null, other: Entity | null): void {
    if (this.exploded) return;
    this.exploded = true;
    const script = launcherScript(this, this.sticky ? 'tf_weapon_pipebomblauncher' : 'tf_weapon_grenadelauncher');
    const thrower = this.world.entity(this.owner);
    explodeProjectile(this, tr, other, {
      attacker: this.owner,
      damage: this.damage,
      damageType: this.damageTypeNow(),
      customKill: this.sticky ? (this.touched ? TF_DMG_CUSTOM.TF_DMG_CUSTOM_STANDARD_STICKY : TF_DMG_CUSTOM.TF_DMG_CUSTOM_AIR_STICKY_BURST) : 0,
      radius: this.damageRadiusNow(),
      selfRadius: RADIUS_DAMAGE.grenadeSelfRadius,
      selfBaseDamage: script.primary.damage,
      script,
      reported: thrower ? thrower.origin : null,
    });
    this.world.remove(this);
  }

  /** SDK: CTFGrenadePipebombProjectile::OnTakeDamage — break or push a stuck sticky. */
  override onTakeDamage(info: DamageInfo): number {
    const attacker = this.world.entity(info.attacker);
    if (!attacker || attacker.team === this.team || !this.sticky || !this.touched) return 0;
    const dt = info.damageType;
    if (!(dt & (DMG_BULLET | DMG_BUCKSHOT | DMG_BLAST | DMG_SONIC | DMG_MELEE))) return 0;
    let scale = 1;
    let breakPipes = false;
    if (dt & (DMG_BULLET | DMG_MELEE)) {
      scale = STICKYBOMB.forceFromBullet;
      breakPipes = true;
    }
    if (dt & DMG_SONIC) scale = STICKYBOMB.forceFromBullet;
    else if (dt & DMG_BUCKSHOT) {
      scale = STICKYBOMB.forceFromBuckshot;
      breakPipes = true;
    } else if (dt & DMG_BLAST) {
      if (dt & DMG_IGNITE) breakPipes = true;
      scale = STICKYBOMB.forceFromBlast;
    }
    if (breakPipes) {
      this.fizzle = true;
      this.detonate();
      return 1;
    }
    set(scratchForce, info.force.x * scale, info.force.y * scale, info.force.z * scale);
    const f2 = scratchForce.x * scratchForce.x + scratchForce.y * scratchForce.y + scratchForce.z * scratchForce.z;
    if (f2 > STICKYBOMB.forceToMove * STICKYBOMB.forceToMove) {
      this.unstick();
      this.velocity.x += scratchForce.x * STICKY_IMPULSE_TO_VELOCITY;
      this.velocity.y += scratchForce.y * STICKY_IMPULSE_TO_VELOCITY;
      this.velocity.z += scratchForce.z * STICKY_IMPULSE_TO_VELOCITY;
      return 1;
    }
    return 0;
  }

  /** Knocked loose: flies again, and may only re-stick after tf_grenade_force_sleeptime. */
  unstick(): void {
    this.moveType = MOVETYPE_FLYGRAVITY;
    this.flags &= ~FL_ONGROUND;
    this.groundEntity = NO_ENTITY;
    this.minSleepTime = this.world.curtime + GRENADE_FORCE_SLEEPTIME;
    this.touched = false;
  }

  /** SDK: CTFGrenadePipebombProjectile::Deflected — pipes change hands; stickies get shoved. */
  onDeflected(by: Player, dir: Vec3): void {
    if (this.sticky) {
      const force = Math.min(1000, damageForce(STICKY_SIZE, DEFLECT_FORCE_DAMAGE, DEFLECT_FORCE_SCALE));
      const info = sonicInfo;
      info.attacker = by.id;
      info.damageType = DMG_SONIC;
      set(info.force, dir.x * force, dir.y * force, dir.z * force);
      this.onTakeDamage(info);
      this.deflectedTime = this.world.curtime + PIPEBOMB_DEFLECT_RESET_TIME;
    } else {
      this.changeTeam(by.team);
      const w = by.activeWeapon();
      if (w) this.launcher = w;
      this.owner = by.id;
      if (by.cond.critBoosted) this.critType = 2;
      this.skin = this.team === 3 ? 1 : 0;
    }
    this.deflectedBy = by.id;
    this.deflected++;
  }

  override onRemove(): void {
    const l = this.launcher as unknown as Partial<PipebombOwnerWeapon> | null;
    l?.onPipebombRemoved?.(this);
  }
}

const sonicInfo: DamageInfo = createDamageInfo();

/** Segment start + t·d (t ∈ [0, 1]) of a ±HALF box against an AABB; the entry t or −1. */
function sweptBoxHit(ax: number, ay: number, az: number, dx: number, dy: number, dz: number, o: Vec3, mins: Vec3, maxs: Vec3): number {
  let t0 = 0;
  let t1 = 1;
  for (let a = 0; a < 3; a++) {
    const s = a === 0 ? ax : a === 1 ? ay : az;
    const d = a === 0 ? dx : a === 1 ? dy : dz;
    const lo = (a === 0 ? o.x + mins.x : a === 1 ? o.y + mins.y : o.z + mins.z) - HALF;
    const hi = (a === 0 ? o.x + maxs.x : a === 1 ? o.y + maxs.y : o.z + maxs.z) + HALF;
    if (Math.abs(d) < 1e-9) {
      if (s < lo || s > hi) return -1;
      continue;
    }
    let ta = (lo - s) / d;
    let tb = (hi - s) / d;
    if (ta > tb) {
      const tmp = ta;
      ta = tb;
      tb = tmp;
    }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return -1;
  }
  return t0;
}

registerEntityClass('tf_projectile_pipe', TFGrenadePipebomb);
registerEntityClass('tf_projectile_pipe_remote', TFGrenadePipebomb);
