/**
 * CTFWeaponBaseGun: every stock gun's primary attack (PrimaryAttack →
 * CalcIsAttackCritical → FireProjectile → FireBullet / FireRocket /
 * FirePipeBomb / FireNail → RemoveProjectileAmmo → DoFireEffects →
 * UpdatePunchAngles), GetProjectileFireSetup, the shoot sounds and the
 * plain hitscan weapons built on it (Scattergun, Shotguns, Pistols, SMG,
 * Revolver).
 */

import { MASK_SOLID, MASK_SOLID_BRUSHONLY, FL_DUCKING } from '../../core/constants';
import { hashSeed } from '../../core/random';
import { emptyTrace, type TraceResult, type UserCmd } from '../../core/types';
import { angleVectors, copy, normalize, set, vec3, vectorAngles, type Vec3 } from '../../core/vec';
import { BULLETS, GRENADE_LAUNCHER, PROJECTILE_OFFSETS, ROCKET, SYRINGE } from '../../data/weapons';
import { DMG_CRITICAL, type DamageInfo } from '../damage';
import { COLLISION_GROUP_NONE, type Entity } from '../entity';
import { PLAYERANIMEVENT_ATTACK_PRIMARY, type Player } from '../player';
import { TF_RELOAD_START, type WeaponSpec } from '../weapon-api';
import { ACT, TF_WEAPON_PRIMARY_MODE } from './constants';
import { removeDisguise, removeInvisibility } from './spy-state';
import { TFWeapon } from './tf-weapon';
import { hookInt, hookWeapon } from '../items/attributes';
import { onAttack } from '../items/effects';
import { TF_COND } from '../conditions';
import { PROJECTILE_TYPES, type ProjectileType } from '../../data/weapons';
import { remapClamped } from '../../core/vec';

const scratchEye = vec3();
const scratchAngles = vec3();
const scratchFwd = vec3();
const scratchRight = vec3();
const scratchUp = vec3();
const scratchEnd = vec3();
const scratchDir = vec3();
const scratchSrc = vec3();
const scratchVel = vec3();
const setupTrace = emptyTrace();
const backTrace = emptyTrace();
const HULL8_MIN: Vec3 = { x: -PROJECTILE_OFFSETS.pipe.traceHalfExtent, y: -PROJECTILE_OFFSETS.pipe.traceHalfExtent, z: -PROJECTILE_OFFSETS.pipe.traceHalfExtent };
const HULL8_MAX: Vec3 = { x: PROJECTILE_OFFSETS.pipe.traceHalfExtent, y: PROJECTILE_OFFSETS.pipe.traceHalfExtent, z: PROJECTILE_OFFSETS.pipe.traceHalfExtent };
/** GetProjectileFireSetup's default aim distance. */
const FIRE_SETUP_END_DIST = 2000;

/**
 * SDK: CTFWeaponBase::GetProjectileFireSetup — the launch point (eye +
 * offset along the view axes) and the angles that send the projectile at
 * whatever the crosshair is on within 2000 units.
 */
export function projectileFireSetup(
  owner: Player,
  fwdOff: number,
  rightOff: number,
  upOff: number,
  outSrc: Vec3,
  outAngles: Vec3,
  hitTeammates = true,
): void {
  const w = owner.world;
  angleVectors(owner.eyeAngles, scratchFwd, scratchRight, scratchUp);
  owner.eyePosition(scratchEye);
  set(
    scratchEnd,
    scratchEye.x + scratchFwd.x * FIRE_SETUP_END_DIST,
    scratchEye.y + scratchFwd.y * FIRE_SETUP_END_DIST,
    scratchEye.z + scratchFwd.z * FIRE_SETUP_END_DIST,
  );
  const f = w.entityFilterObject(owner, COLLISION_GROUP_NONE);
  if (!hitTeammates) f.ignoreTeam = owner.team;
  w.traceLine(scratchEye, scratchEnd, MASK_SOLID, f.fn, setupTrace);
  set(
    outSrc,
    scratchEye.x + scratchFwd.x * fwdOff + scratchRight.x * rightOff + scratchUp.x * upOff,
    scratchEye.y + scratchFwd.y * fwdOff + scratchRight.y * rightOff + scratchUp.y * upOff,
    scratchEye.z + scratchFwd.z * fwdOff + scratchRight.z * rightOff + scratchUp.z * upOff,
  );
  const target = setupTrace.fraction > 0.1 ? setupTrace.endPos : scratchEnd;
  set(scratchDir, target.x - outSrc.x, target.y - outSrc.y, target.z - outSrc.z);
  vectorAngles(scratchDir, outAngles);
}

/** CTFWeaponBaseGun and the plain hitscan guns. */
export class TFWeaponGun extends TFWeapon {
  /** Hitscan callback (headshots); null for plain guns. */
  protected onBulletHit: ((victim: Entity, tr: TraceResult, info: DamageInfo) => void) | null = null;

  constructor(spec: WeaponSpec) {
    super(spec);
  }

  /** SDK: CTFWeaponBaseGun::PrimaryAttack. */
  override primaryAttack(cmd: UserCmd): void {
    const o = this.owner;
    if (!o) return;
    const t = this.t;
    if (this.usesClip() && this.clip <= 0) return;
    if (this.nextPrimaryAttack > t) return;
    if (!this.canAttack()) return;
    const delay = this.fireDelay();
    this.calcIsAttackCritical(cmd);
    removeInvisibility(o);
    this.weaponMode = TF_WEAPON_PRIMARY_MODE;
    this.sendWeaponAnim(ACT.VM_PRIMARYATTACK);
    this.fireProjectile(cmd);
    this.nextPrimaryAttack = t + delay;
    this.timeWeaponIdle = t + Math.max(delay, this.idleTime());
    if (this.stats.reloadsSingly) this.reloadMode = TF_RELOAD_START;
    if (this.shouldRemoveDisguiseOnPrimaryAttack()) removeDisguise(o);
    onAttack(o);
  }

  /**
   * SDK: CTFWeaponBaseGun::PrimaryAttack's refire time — ApplyFireDelay (folded into the stats),
   * mult_postfiredelay_with_reduced_health, and rocketjump_attackrate_bonus while blast jumping
   * (the Air Strike) / mul_nonrocketjump_attackrate otherwise.
   */
  fireDelay(): number {
    const o = this.owner;
    let delay = this.stats.fireDelay;
    if (!o) return delay;
    const reduced = hookWeapon(this, o, 'mult_postfiredelay_with_reduced_health', 1);
    if (reduced !== 1) delay *= remapClamped(o.health / Math.max(1, o.maxHealth), 0.2, 0.9, reduced, 1);
    if (o.cond.has(TF_COND.BLASTJUMPING)) delay = hookWeapon(this, o, 'rocketjump_attackrate_bonus', delay);
    else delay = hookWeapon(this, o, 'mul_nonrocketjump_attackrate', delay);
    return delay;
  }

  /** SDK: CTFWeaponBaseGun::ShouldRemoveDisguiseOnPrimaryAttack (keep_disguise_on_attack). */
  shouldRemoveDisguiseOnPrimaryAttack(): boolean {
    return hookInt(hookWeapon(this, this.owner, 'keep_disguise_on_attack', 0)) === 0;
  }

  /** The projectile this weapon fires (override_projectile_type, else the script's). */
  projectileType(): ProjectileType {
    const over = hookInt(hookWeapon(this, this.owner, 'override_projectile_type', 0));
    if (over > 0 && over < PROJECTILE_TYPES.length) return PROJECTILE_TYPES[over];
    return this.script.primary.projectile;
  }

  /** SDK: CTFWeaponBaseGun::FireProjectile. */
  fireProjectile(cmd: UserCmd): Entity | null {
    const o = this.owner!;
    let proj: Entity | null = null;
    switch (this.projectileType()) {
      case 'projectile_bullet':
        this.fireBullet(cmd);
        break;
      case 'projectile_rocket':
        proj = this.fireRocket(cmd);
        break;
      case 'projectile_syringe':
        proj = this.fireNail(cmd);
        break;
      case 'projectile_pipe':
      case 'projectile_pipe_remote':
      case 'projectile_pipe_remote_practice':
      case 'projectile_cannonball':
        proj = this.firePipeBomb(cmd);
        break;
      case 'projectile_flare':
        proj = this.fireFlare(cmd);
        break;
      case 'projectile_jar':
      case 'projectile_jar_milk':
      case 'projectile_cleaver':
      case 'projectile_festive_urine':
      case 'projectfile_breadmonster_jarate':
      case 'projectfile_breadmonster_madmilk':
      case 'projectile_jar_gas':
        proj = this.fireJar(cmd);
        break;
      case 'projectile_arrow':
      case 'projectile_healing_bolt':
      case 'projectile_building_repair_bolt':
      case 'projectile_festive_arrow':
      case 'projectile_festive_healing_bolt':
        proj = this.fireArrow(cmd);
        break;
      case 'projectile_energy_ball':
        proj = this.fireEnergyBall(cmd, false);
        break;
      case 'projectile_energy_ring':
        proj = this.fireEnergyBall(cmd, true);
        break;
      default:
        break;
    }
    o.doAnimationEvent(PLAYERANIMEVENT_ATTACK_PRIMARY);
    this.removeProjectileAmmo();
    this.lastFireTime = this.t;
    this.doFireEffects();
    this.updatePunchAngles(cmd);
    return proj;
  }

  /** SDK: CTFWeaponBaseGun::RemoveProjectileAmmo (+ the delayed add_onhit_addammo). */
  removeProjectileAmmo(): void {
    this.consumeAmmo(this.stats.ammoPerShot);
    if (this.ammoToAdd > 0 && this.owner && !this.usesClip()) {
      this.owner.giveAmmo(this.ammoToAdd, this.stats.ammoType);
      this.ammoToAdd = 0;
    }
  }

  /** m_iAmmoToAdd (add_onhit_addammo, the Widowmaker): given back with the next shot. */
  ammoToAdd = 0;

  /** SDK: CTFWeaponBaseGun::FireJar — the jars toss from their own think (CTFJar::FireJar). */
  fireJar(_cmd: UserCmd): Entity | null {
    return null;
  }

  /** Arrow speed / gravity / type (CTFWeaponBaseGun::GetProjectileSpeed / GetProjectileGravity). */
  arrowSpeed(): number {
    return hookWeapon(this, this.owner, 'mult_projectile_speed', this.script.primary.projectileSpeed || 2400);
  }

  arrowGravity(): number {
    return 0.2;
  }

  arrowExtra(): Record<string, number | string | boolean> {
    return {};
  }

  /** SDK: CTFWeaponBaseGun::FireArrow — from (23.5, −8, −3) at the crosshair (teammates not traced). */
  fireArrow(_cmd: UserCmd): Entity | null {
    const o = this.owner!;
    this.playShootSound();
    projectileFireSetup(o, 23.5, -8, -3, scratchSrc, scratchAngles, false);
    this.adjustArrowAngles(scratchAngles);
    angleVectors(scratchAngles, scratchFwd);
    const speed = this.arrowSpeed();
    set(scratchVel, scratchFwd.x * speed, scratchFwd.y * speed, scratchFwd.z * speed);
    const type = PROJECTILE_TYPES.indexOf(this.projectileType());
    const healing = type === 11 || type === 23;
    return o.world.spawnProjectile(healing ? 'tf_projectile_healing_bolt' : 'tf_projectile_arrow', {
      origin: scratchSrc,
      angles: scratchAngles,
      velocity: scratchVel,
      owner: o,
      weapon: this,
      damage: this.projectileDamage(),
      critType: this.currentAttackIsCrit ? 2 : 0,
      extra: {
        arrowType: type,
        gravity: this.arrowGravity(),
        penetrate: hookInt(hookWeapon(this, o, 'projectile_penetration', 0)) === 1,
        ...this.arrowExtra(),
      },
    });
  }

  /** A hook for the Huntsman's wild over-held shot (CTFCompoundBow::GetProjectileFireSetup). */
  adjustArrowAngles(_angles: Vec3): void {}

  /** SDK: CTFWeaponBaseGun::FireFlare — from (23.5, 12, −3) (8 up while ducking). */
  fireFlare(_cmd: UserCmd): Entity | null {
    const o = this.owner!;
    this.playShootSound();
    const w = o.world;
    if (!w.isServer) return null;
    projectileFireSetup(o, 23.5, 12, o.move.flags & FL_DUCKING ? 8 : -3, scratchSrc, scratchAngles, false);
    angleVectors(scratchAngles, scratchFwd);
    const speed = this.flareSpeed();
    set(scratchVel, scratchFwd.x * speed, scratchFwd.y * speed, scratchFwd.z * speed);
    const proj = w.spawnProjectile('tf_projectile_flare', {
      origin: scratchSrc,
      angles: scratchAngles,
      velocity: scratchVel,
      owner: o,
      weapon: this,
      damage: this.projectileDamage(),
      critType: this.currentAttackIsCrit ? 2 : 0,
      extra: this.flareExtra(),
    });
    if (proj) this.onFlareFired(proj);
    return proj;
  }

  /** CTFProjectile_Flare::Create: 2000 × mult_projectile_speed. */
  flareSpeed(): number {
    return hookWeapon(this, this.owner, 'mult_projectile_speed', 2000);
  }

  onFlareFired(_flare: Entity): void {}

  /** Extra flare spawn fields (the flare gun's gravity, type and afterburn). */
  flareExtra(): Record<string, number | string | boolean> {
    return {};
  }

  /** SDK: CTFWeaponBaseGun::FireEnergyBall — from (23.5, −8, −3) (8 up while ducking), traced back to the eye. */
  fireEnergyBall(_cmd: UserCmd, ring: boolean): Entity | null {
    const o = this.owner!;
    this.playShootSound();
    const w = o.world;
    projectileFireSetup(o, 23.5, -8, o.move.flags & FL_DUCKING ? 8 : -3, scratchSrc, scratchAngles, false);
    this.adjustEnergySource(scratchSrc);
    o.eyePosition(scratchEye);
    w.traceLine(scratchEye, scratchSrc, MASK_SOLID_BRUSHONLY, w.entityFilter(o, COLLISION_GROUP_NONE), backTrace);
    angleVectors(scratchAngles, scratchFwd);
    const speed = this.energySpeed();
    set(scratchVel, scratchFwd.x * speed, scratchFwd.y * speed, scratchFwd.z * speed);
    return w.spawnProjectile(ring ? 'tf_projectile_energy_ring' : 'tf_projectile_energy_ball', {
      origin: backTrace.endPos,
      angles: scratchAngles,
      velocity: scratchVel,
      owner: o,
      weapon: this,
      damage: this.projectileDamage(),
      critType: this.currentAttackIsCrit ? 2 : 0,
      extra: this.energyExtra(),
    });
  }

  /** The Pomson's GetProjectileFireSetup lowers the launch point to its muzzle. */
  adjustEnergySource(_src: Vec3): void {}

  energySpeed(): number {
    return hookWeapon(this, this.owner, 'mult_projectile_speed', 1100);
  }

  energyExtra(): Record<string, number | string | boolean> {
    return {};
  }

  /** SDK: CTFWeaponBaseGun::PlayWeaponShootSound. */
  playShootSound(): void {
    this.weaponSound(this.currentAttackIsCrit ? 'burst' : 'single_shot');
  }

  /** SDK: CTFWeaponBaseGun::GetWeaponSpread. */
  weaponSpread(): number {
    return this.stats.spread;
  }

  /** SDK: CTFWeaponBaseGun::GetProjectileDamage. */
  projectileDamage(): number {
    return this.stats.damage;
  }

  /** The bullets' damage bits (g_aWeaponDamageTypes + DMG_CRITICAL on a crit, as CTFPlayer::FireBullet adds). */
  bulletDamageType(): number {
    return this.stats.damageType | (this.currentAttackIsCrit ? DMG_CRITICAL : 0);
  }

  /** Tracer every N bullets: the script names a tracer (minigun every bullet, others every 2nd). */
  tracerFrequency(): number {
    return this.script.tracerEffect ? BULLETS.tracerFrequency : 0;
  }

  /** SDK: CTFWeaponBaseGun::FireBullet → FX_FireBullets (spread from the command seed & 255). */
  fireBullet(cmd: UserCmd): void {
    const o = this.owner!;
    this.playShootSound();
    o.eyePosition(scratchEye);
    const p = o.move.punchAngle;
    set(scratchAngles, o.eyeAngles.x + p.x, o.eyeAngles.y + p.y, o.eyeAngles.z + p.z);
    o.world.fireBullets({
      attacker: o,
      weapon: this,
      src: scratchEye,
      angles: scratchAngles,
      spread: this.weaponSpread(),
      bulletsPerShot: Math.max(1, this.stats.bulletsPerShot),
      damage: this.projectileDamage(),
      damageType: this.bulletDamageType(),
      customKill: this.bulletCustomKill(),
      critType: this.currentAttackIsCrit ? 2 : 0,
      seed: cmd.randomSeed & BULLETS.seedMask,
      range: this.stats.range,
      lastFireTime: this.lastFireTime,
      firstShotSpreadScale: 0,
      tracerFreq: this.tracerFrequency(),
      cmdTick: cmd.tickCount,
      onHit: this.onBulletHit ?? undefined,
    });
  }

  bulletCustomKill(): number {
    return 0;
  }

  /** SDK: CTFWeaponBaseGun::FireRocket — launched from the offset point traced back to the eye. */
  fireRocket(_cmd: UserCmd): Entity | null {
    const o = this.owner!;
    this.playShootSound();
    const off = PROJECTILE_OFFSETS.rocket;
    projectileFireSetup(o, off.forward, off.right, o.move.flags & FL_DUCKING ? off.duckUp : off.up, scratchSrc, scratchAngles, false);
    o.eyePosition(scratchEye);
    o.world.traceLine(scratchEye, scratchSrc, MASK_SOLID_BRUSHONLY, o.world.entityFilter(o, COLLISION_GROUP_NONE), backTrace);
    angleVectors(scratchAngles, scratchFwd);
    // SDK: CTFBaseRocket::Create — 1100 × mult_projectile_speed (the Direct Hit, the Liberty Launcher).
    const speed = hookWeapon(this, o, 'mult_projectile_speed', ROCKET.speed);
    set(scratchVel, scratchFwd.x * speed, scratchFwd.y * speed, scratchFwd.z * speed);
    return o.world.spawnProjectile('tf_projectile_rocket', {
      origin: backTrace.endPos,
      angles: scratchAngles,
      velocity: scratchVel,
      owner: o,
      weapon: this,
      damage: this.projectileDamage(),
      critType: this.currentAttackIsCrit ? 2 : 0,
    });
  }

  /** SDK: CTFWeaponBaseGun::FireNail (syringes: ±1.5° random pitch/yaw). */
  fireNail(cmd: UserCmd): Entity | null {
    const o = this.owner!;
    this.playShootSound();
    const off = PROJECTILE_OFFSETS.syringe;
    projectileFireSetup(o, off.forward, off.right, off.up, scratchSrc, scratchAngles, true);
    const rng = o.world.sharedRandom(hashSeed(cmd.randomSeed ^ 0x4e41494c));
    const spread = SYRINGE.spreadDegrees;
    scratchAngles.x += rng.randomFloat(-spread, spread);
    scratchAngles.y += rng.randomFloat(-spread, spread);
    angleVectors(scratchAngles, scratchFwd);
    set(scratchVel, scratchFwd.x * SYRINGE.speed, scratchFwd.y * SYRINGE.speed, scratchFwd.z * SYRINGE.speed);
    return o.world.spawnProjectile('tf_projectile_syringe', {
      origin: scratchSrc,
      angles: scratchAngles,
      velocity: scratchVel,
      owner: o,
      weapon: this,
      damage: this.projectileDamage(),
      critType: this.currentAttackIsCrit ? 2 : 0,
    });
  }

  /** Launch speed for pipes (CTFGrenadeLauncher::GetProjectileSpeed: × mult_projectile_speed); stickies override with their charge. */
  projectileSpeed(): number {
    return hookWeapon(this, this.owner, 'mult_projectile_speed', GRENADE_LAUNCHER.speed);
  }

  /** The projectile classname FirePipeBomb creates. */
  pipeClassname(): string {
    const t = this.projectileType();
    return t === 'projectile_pipe_remote' || t === 'projectile_pipe_remote_practice' ? 'tf_projectile_pipe_remote' : 'tf_projectile_pipe';
  }

  /**
   * SDK: CTFWeaponBaseGun::FirePipeBomb — from the shoot position + (16, 8, −6),
   * hull-traced back to the eye (no launch from inside a wall), velocity along
   * the aim + 200 up + ±10 random right/up, spin AngularImpulse(600, ±1200, 0).
   */
  firePipeBomb(_cmd: UserCmd): Entity | null {
    const o = this.owner!;
    this.playShootSound();
    const w = o.world;
    if (!w.isServer) return null;
    angleVectors(o.eyeAngles, scratchFwd, scratchRight, scratchUp);
    o.eyePosition(scratchEye);
    const off = PROJECTILE_OFFSETS.pipe;
    set(
      scratchSrc,
      scratchEye.x + scratchFwd.x * off.forward + scratchRight.x * off.right + scratchUp.x * off.up,
      scratchEye.y + scratchFwd.y * off.forward + scratchRight.y * off.right + scratchUp.y * off.up,
      scratchEye.z + scratchFwd.z * off.forward + scratchRight.z * off.right + scratchUp.z * off.up,
    );
    w.traceHull(scratchEye, scratchSrc, HULL8_MIN, HULL8_MAX, MASK_SOLID_BRUSHONLY, w.entityFilter(o, COLLISION_GROUP_NONE), backTrace);
    if (backTrace.startSolid) return null;
    const speed = this.projectileSpeed();
    const rnd = w.random;
    const rr = rnd.randomFloat(-GRENADE_LAUNCHER.randomSpeed, GRENADE_LAUNCHER.randomSpeed);
    const ru = rnd.randomFloat(-GRENADE_LAUNCHER.randomSpeed, GRENADE_LAUNCHER.randomSpeed);
    const up = GRENADE_LAUNCHER.upSpeed;
    set(
      scratchVel,
      scratchFwd.x * speed + scratchUp.x * up + scratchRight.x * rr + scratchUp.x * ru,
      scratchFwd.y * speed + scratchUp.y * up + scratchRight.y * rr + scratchUp.y * ru,
      scratchFwd.z * speed + scratchUp.z * up + scratchRight.z * rr + scratchUp.z * ru,
    );
    const spinY = rnd.randomInt(-GRENADE_LAUNCHER.spinYRange, GRENADE_LAUNCHER.spinYRange);
    copy(scratchAngles, o.eyeAngles);
    return w.spawnProjectile(this.pipeClassname(), {
      origin: backTrace.endPos,
      angles: scratchAngles,
      velocity: scratchVel,
      owner: o,
      weapon: this,
      damage: this.projectileDamage(),
      critType: this.currentAttackIsCrit ? 2 : 0,
      // CTFWeaponBaseGrenadeProj::GetDamageRadius: the script radius × mult_explosion_radius.
      extra: {
        radius: hookWeapon(this, o, 'mult_explosion_radius', this.script.damageRadius),
        spinX: GRENADE_LAUNCHER.spinX,
        spinY,
        ...this.pipeExtra(),
      },
    });
  }

  /** Extra pipe spawn fields (the Loose Cannon's fuse, the Iron Bomber's bounce). */
  pipeExtra(): Record<string, number | string | boolean> {
    return {};
  }

  /** SDK: CTFWeaponBaseGun::DoFireEffects → CTFPlayer::DoMuzzleFlash. */
  doFireEffects(): void {
    const o = this.owner!;
    if (!this.script.muzzleFlashParticle) return;
    o.eyePosition(scratchEye);
    o.world.emitEffect({
      kind: 'muzzleflash',
      pos: { x: scratchEye.x, y: scratchEye.y, z: scratchEye.z },
      entity: o.id,
      attachment: 'muzzle',
      system: this.script.muzzleFlashParticle,
      notTo: o.isBot ? undefined : o.id,
    });
  }

  /** SDK: CTFWeaponBaseGun::UpdatePunchAngles — pitch kicks by RandomInt(p − 1, p + 1). */
  updatePunchAngles(cmd: UserCmd): void {
    const p = this.script.primary.punchAngle;
    if (p <= 0) return;
    const o = this.owner!;
    const rng = o.world.sharedRandom(hashSeed(cmd.randomSeed ^ 0x50554e43));
    o.move.punchAngle.x -= rng.randomInt(p - 1, p + 1);
  }
}

/** Scattergun, Shotguns, Pistols, SMG, Revolver: CTFWeaponBaseGun as scripted. */
export class HitscanGun extends TFWeaponGun {}

/** Shared scratch for subclasses that need a forward vector. */
export function eyeForward(p: Player, out: Vec3): Vec3 {
  angleVectors(p.eyeAngles, out);
  normalize(out);
  return out;
}
