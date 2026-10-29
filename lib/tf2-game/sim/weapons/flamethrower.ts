/**
 * CTFFlameThrower with the modern flame manager (tf_flame.cpp
 * CTFFlameManager over tf_point_manager.cpp CTFPointManager).
 *
 * Firing adds a flame point every tf_flamethrower_new_flame_fire_delay at the
 * muzzle (eye + tf_flamethrower_new_flame_offset), launched at flame_speed
 * along the aim with flame_spread_degree of CShotManipulator spread; each
 * point lives flame_lifetime ± flame_random_life_time_offset, rises at
 * flame_up_speed, slows by flame_drag and slides along walls
 * (UpdatePoint / OnPointHitWall). A burn target touched by a point
 * (oldest first) is burned at most every tf_flamethrower_burn_frequency for
 * tf_flamethrower_damage_per_tick × the age scale (1 → 0.5 over half the
 * point's life) × the heat scale (0.5 → 1 as the victim's heat index goes
 * 10 → 50; +1 per touch, +2 for a brand-new point, −1.25 per frame), which
 * ignites: afterburn starts at tf_flamethrower_initial_afterburn_duration and
 * grows tf_flamethrower_afterburn_rate per hit (CTFPlayerShared::Burn).
 *
 * Airblast (+attack2, FireAirBlast → DeflectProjectiles): 20 ammo, 0.75 s
 * refire, primary blocked 1 s; within the 128-unit sphere ahead: enemy
 * players inside the 35° cone are pushed (ComputeCrayAirBlastForce), burning
 * teammates extinguished (+20 HP), enemy rockets / pipes redirected at the
 * crosshair with the Pyro as owner (mini-crits), stickies shoved loose.
 */

import { MASK_SOLID, MASK_WATER, MASK_PLAYERSOLID, IN_ATTACK, IN_ATTACK2, IN_RELOAD, TF_CLASS_PYRO, TF_TEAM_BLUE, WL_EYES } from '../../core/constants';
import { UniformRandomStream } from '../../core/random';
import { emptyTrace, NO_ENTITY, type UserCmd } from '../../core/types';
import { angleVectors, copy, normalize, remapClamped, set, vec3, vectorAngles, type Vec3 } from '../../core/vec';
import { FLAMETHROWER } from '../../data/weapons';
import { TF_COND } from '../conditions';
import { createDamageInfo, DMG_CRITICAL, resetDamageInfo, TF_DMG_CUSTOM_BURNING } from '../damage';
import { COLLISION_GROUP_DEBRIS, COLLISION_GROUP_NONE, COLLISION_GROUP_PLAYER_MOVEMENT, Entity, SOLID_NONE } from '../entity';
import { registerEntityClass } from '../entity-registry';
import { PLAYERANIMEVENT_ATTACK_PRIMARY, PLAYERANIMEVENT_ATTACK_SECONDARY, type Player } from '../player';
import type { NetRecord } from '../net-schema';
import type { WeaponSpec } from '../weapon-api';
import { MOVE_COND_AIR_CURRENT, MOVE_COND_LOST_FOOTING } from '../movement-types';
import { isDeflectable } from '../projectiles/common';
import {
  ACT,
  AIRBLAST_EFFECT_RESET,
  AIRBLAST_REFLECT_COEFF,
  AIRBLAST_REFLECT_COST_COEFF,
  FLAME_HEALING_DEBUFF_TIME,
  FLAME_NEW_HEAT_TIME,
  FLAMETHROWER_AFTERBURN_RATE,
  FLAMETHROWER_AMMO_PER_SECOND,
  FLAMETHROWER_ATTACK_ANIM_INTERVAL,
  FLAMETHROWER_INITIAL_AFTERBURN,
  FLAMETHROWER_MIN_BURST_TIME,
  FLAMETHROWER_START_FIRING_TIME,
  FT_STATE_FIRING,
  FT_STATE_IDLE,
  FT_STATE_SECONDARY,
  FT_STATE_STARTFIRING,
  MAX_FLAME_POINTS,
  PLAYERANIMEVENT_ATTACK_POST,
  PLAYERANIMEVENT_ATTACK_PRE,
  TF_WEAPON_PRIMARY_MODE,
} from './constants';
import { TFWeaponGun } from './gun';
import { removeInvisibility } from './spy-state';
import { num } from './tf-weapon';
import { hookInt, hookWeapon } from '../items/attributes';

const DEG2RAD = Math.PI / 180;
/** MAX_TRACE_LENGTH. */
const MAX_TRACE_LENGTH = 1.732050807569 * 32768;

// ─── Flame points and the manager ──────────────────────────────────────────

/** flame_point_t over tf_point_t. */
interface FlamePoint {
  pos: Vec3;
  prev: Vec3;
  vel: Vec3;
  attackerVel: Vec3;
  initialPos: Vec3;
  spawnTime: number;
  lifeTime: number;
  hitWall: number;
  index: number;
}

/** m_mapEntitiesBurnt entry. */
interface BurnRecord {
  id: number;
  lastBurn: number;
  heat: number;
}

const ftTrace = emptyTrace();
const ftMins = vec3();
const ftMaxs = vec3();
const ftNewVel = vec3();
const ftNewPos = vec3();
const ftDir = vec3();
const ftFwd = vec3();
const ftRight = vec3();
const ftUp = vec3();
const ftEye = vec3();
const flameInfo = createDamageInfo();

export class FlameManager extends Entity {
  /** The flamethrower that owns it (m_hWeapon) and the attacker (m_hAttacker). */
  weapon: Flamethrower | null = null;
  attacker: number = NO_ENTITY;
  /** UpdateDamage: m_iDmgType / m_flDamage / m_flBurnFrequency / m_bCritFromBehind. */
  dmgType = 0;
  flameDamage = 0;
  burnFrequency: number = FLAMETHROWER.burnFrequency;
  critFromBehind = false;
  isFiring = false;
  private readonly pool: FlamePoint[] = [];
  /** Live points, oldest first (m_vecPoints). */
  readonly points: FlamePoint[] = [];
  private readonly spawnTicks = new Int32Array(MAX_FLAME_POINTS);
  private nextPointIndex = 0;
  private lastUpdateTime = 0;
  private randomSeed = 0;
  private readonly stream = new UniformRandomStream(0);
  private readonly burnt: BurnRecord[] = [];
  private readonly burntPool: BurnRecord[] = [];
  private readonly boundsMin = vec3();
  private readonly boundsMax = vec3();

  constructor(classname: string) {
    super(classname);
    this.solid = SOLID_NONE;
    for (let i = 0; i < MAX_FLAME_POINTS; i++) {
      this.pool.push({ pos: vec3(), prev: vec3(), vel: vec3(), attackerVel: vec3(), initialPos: vec3(), spawnTime: 0, lifeTime: 0, hitWall: 0, index: i });
    }
  }

  override spawn(): void {
    super.spawn();
    this.lastUpdateTime = this.world.curtime;
    // CTFPointManager::Spawn: m_nRandomSeed = RandomInt(0, 9999) (the server's stream).
    this.randomSeed = this.world.random.randomInt(0, 9999);
    this.setThink(this.pointThink, this.world.curtime);
  }

  startFiring(): void {
    this.isFiring = true;
  }

  stopFiring(): void {
    this.isFiring = false;
  }

  /** SDK: CTFFlameManager::UpdateDamage. */
  updateDamage(dmgType: number, damage: number, burnFrequency: number, critFromBehind: boolean): void {
    this.dmgType = dmgType;
    this.flameDamage = damage;
    this.burnFrequency = burnFrequency;
    this.critFromBehind = critFromBehind;
  }

  /** SDK: CTFPointManager::AddPoint + InitializePoint (+ CTFFlameManager::InitializePoint). */
  addPoint(tick: number): boolean {
    if (this.points.length >= MAX_FLAME_POINTS) return false;
    const w = this.weapon;
    const attacker = this.world.player(this.attacker);
    if (!w || !attacker) return false;
    const index = this.nextPointIndex;
    let p: FlamePoint | null = null;
    for (let i = 0; i < this.pool.length; i++) {
      if (this.pool[i].index === index) {
        p = this.pool[i];
        break;
      }
    }
    if (!p || this.points.includes(p)) return false;
    this.spawnTicks[index] = tick;
    this.nextPointIndex = (index + 1) % MAX_FLAME_POINTS;
    this.stream.setSeed(tick + this.randomSeed + index);
    w.flameOriginPos(p.pos);
    copy(p.prev, p.pos);
    copy(p.initialPos, p.pos);
    this.initialVelocity(attacker, p.vel);
    p.spawnTime = this.world.curtime;
    p.lifeTime = FLAMETHROWER.flameLifetime + this.stream.randomFloat(-FLAMETHROWER.flameRandomLifetimeOffset, FLAMETHROWER.flameRandomLifetimeOffset);
    p.hitWall = 0;
    copy(p.attackerVel, attacker.velocity);
    this.points.push(p);
    return true;
  }

  /** SDK: CTFFlameManager::GetInitialVelocity — CShotManipulator::ApplySpread with bias 1. */
  private initialVelocity(attacker: Player, out: Vec3): void {
    angleVectors(attacker.eyeAngles, ftFwd, ftRight, ftUp);
    const spread = FLAMETHROWER.flameSpreadDegrees * DEG2RAD;
    let x = 0;
    let y = 0;
    if (spread > 0) {
      const flatness = 0.5;
      let z: number;
      do {
        x = this.stream.randomFloat(-1, 1) * flatness + this.stream.randomFloat(-1, 1) * (1 - flatness);
        y = this.stream.randomFloat(-1, 1) * flatness + this.stream.randomFloat(-1, 1) * (1 - flatness);
        z = x * x + y * y;
      } while (z > 1);
    }
    const speed = FLAMETHROWER.flameSpeed;
    out.x = (ftFwd.x + x * spread * ftRight.x + y * spread * ftUp.x) * speed;
    out.y = (ftFwd.y + x * spread * ftRight.y + y * spread * ftUp.y) * speed;
    out.z = (ftFwd.z + x * spread * ftRight.z + y * spread * ftUp.z) * speed;
  }

  /** tf_flamethrower_boxsize × the size multiplier (1 for stock). */
  radius(): number {
    return FLAMETHROWER.boxSize;
  }

  /** CTFPointManager::PointThink: Update, then the touches and PostEntityThink (same frame order). */
  private readonly pointThink = (): void => {
    const hadPoints = this.points.length > 0;
    this.update();
    if (this.removed) return;
    if (this.points.length > 0) this.touchTargets();
    this.postEntityThink();
    if (hadPoints && this.points.length === 0 && !this.isFiring) {
      if (this.weapon && this.weapon.flameManager === this) this.weapon.flameManager = null;
      this.world.remove(this);
      return;
    }
    this.nextThink = this.world.curtime;
  };

  /** SDK: CTFPointManager::Update. */
  private update(): void {
    const t = this.world.curtime;
    const dt = t - this.lastUpdateTime;
    if (dt <= 0) return;
    this.lastUpdateTime = t;
    const r = this.radius();
    set(this.boundsMin, Infinity, Infinity, Infinity);
    set(this.boundsMax, -Infinity, -Infinity, -Infinity);
    for (let i = this.points.length - 1; i >= 0; i--) {
      const p = this.points[i];
      this.stream.setSeed(this.spawnTicks[p.index] + this.id);
      let remove = t > p.spawnTime + p.lifeTime;
      if (!remove && this.world.pointContents(p.pos) & MASK_WATER) remove = true;
      if (!remove && !this.updatePoint(p, dt)) remove = true;
      if (remove) {
        this.removePointAt(i);
        continue;
      }
      if (p.pos.x - r < this.boundsMin.x) this.boundsMin.x = p.pos.x - r;
      if (p.pos.y - r < this.boundsMin.y) this.boundsMin.y = p.pos.y - r;
      if (p.pos.z - r < this.boundsMin.z) this.boundsMin.z = p.pos.z - r;
      if (p.pos.x + r > this.boundsMax.x) this.boundsMax.x = p.pos.x + r;
      if (p.pos.y + r > this.boundsMax.y) this.boundsMax.y = p.pos.y + r;
      if (p.pos.z + r > this.boundsMax.z) this.boundsMax.z = p.pos.z + r;
    }
    if (this.points.length > 0) {
      set(this.origin, (this.boundsMin.x + this.boundsMax.x) * 0.5, (this.boundsMin.y + this.boundsMax.y) * 0.5, (this.boundsMin.z + this.boundsMax.z) * 0.5);
    }
  }

  private removePointAt(i: number): void {
    const p = this.points[i];
    this.spawnTicks[p.index] = 0;
    for (let k = i; k < this.points.length - 1; k++) this.points[k] = this.points[k + 1];
    this.points.length--;
  }

  /** SDK: CTFPointManager::UpdatePoint (+ CTFFlameManager::OnPointHitWall / GetAdditionalVelocity). */
  private updatePoint(p: FlamePoint, dt: number): boolean {
    const r = this.radius();
    set(ftMins, -r, -r, -r);
    set(ftMaxs, r, r, r);
    const gz = FLAMETHROWER.flameGravity * dt;
    // GetAdditionalVelocity: flame_up_speed + the attacker's velocity along the flame.
    set(ftDir, p.vel.x, p.vel.y, p.vel.z);
    normalize(ftDir);
    const along = p.attackerVel.x * ftDir.x + p.attackerVel.y * ftDir.y + p.attackerVel.z * ftDir.z;
    set(
      ftNewVel,
      p.vel.x + along * ftDir.x,
      p.vel.y + along * ftDir.y,
      p.vel.z + gz + FLAMETHROWER.flameUpSpeed + along * ftDir.z,
    );
    set(ftNewPos, p.pos.x + dt * ftNewVel.x, p.pos.y + dt * ftNewVel.y, p.pos.z + dt * ftNewVel.z);
    const w = this.world;
    w.traceHull(p.pos, ftNewPos, ftMins, ftMaxs, MASK_SOLID, w.entityFilter(this, COLLISION_GROUP_DEBRIS), ftTrace);
    if (ftTrace.startSolid) return false;
    if (ftTrace.fraction < 1) {
      p.hitWall++;
      // OnPointHitWall: slide along the wall, drop the attacker's velocity.
      const n = ftTrace.plane.normal;
      const d = n.x * ftNewVel.x + n.y * ftNewVel.y + n.z * ftNewVel.z;
      set(ftNewVel, ftNewVel.x - d * n.x, ftNewVel.y - d * n.y, ftNewVel.z - d * n.z);
      set(p.attackerVel, 0, 0, 0);
      const rem = (1 - ftTrace.fraction) * dt;
      set(
        ftNewPos,
        ftTrace.endPos.x + r * n.x + rem * ftNewVel.x,
        ftTrace.endPos.y + r * n.y + rem * ftNewVel.y,
        ftTrace.endPos.z + r * n.z + rem * ftNewVel.z,
      );
    } else copy(ftNewVel, p.vel);
    const speed = Math.hypot(ftNewVel.x, ftNewVel.y, ftNewVel.z);
    const slowed = Math.min(Math.max(speed - dt * FLAMETHROWER.flameDrag * speed, 0), speed);
    const k = speed > 0 ? slowed / speed : 0;
    set(p.vel, ftNewVel.x * k, ftNewVel.y * k, ftNewVel.z * k + gz);
    copy(p.prev, p.pos);
    copy(p.pos, ftNewPos);
    return true;
  }

  /** The engine's touch pass for the manager's box: every valid burn target overlapping it gets Touch. */
  private touchTargets(): void {
    const w = this.world;
    const list = w.entities;
    for (let i = 1; i < list.length; i++) {
      const e = list[i];
      if (!e || e.removed || !this.isValidBurnTarget(e)) continue;
      if (
        e.origin.x + e.maxs.x < this.boundsMin.x ||
        e.origin.x + e.mins.x > this.boundsMax.x ||
        e.origin.y + e.maxs.y < this.boundsMin.y ||
        e.origin.y + e.mins.y > this.boundsMax.y ||
        e.origin.z + e.maxs.z < this.boundsMin.z ||
        e.origin.z + e.mins.z > this.boundsMax.z
      ) {
        continue;
      }
      this.touch(e);
      if (this.removed) return;
    }
  }

  /** SDK: CTFFlameManager::IsValidBurnTarget. */
  isValidBurnTarget(e: Entity): boolean {
    if (e.id === this.attacker) return false;
    if (e.isPlayer()) return e.alive;
    const attacker = this.world.entity(this.attacker);
    return e.isBaseObject() && !!attacker && attacker.team !== e.team;
  }

  /** SDK: CTFPointManager::Touch — the first (oldest) point whose swept box hits the target collides. */
  override touch(other: Entity): void {
    const r = this.radius();
    for (let i = 0; i < this.points.length; i++) {
      const p = this.points[i];
      if (sweptBoxVsAabb(p.prev, p.pos, r, other)) {
        this.onCollide(other, p);
        break;
      }
    }
  }

  private burnRecord(id: number): BurnRecord | null {
    for (let i = 0; i < this.burnt.length; i++) if (this.burnt[i].id === id) return this.burnt[i];
    return null;
  }

  /** SDK: CTFFlameManager::BCanBurnEntityThisFrame. */
  private canBurn(id: number): boolean {
    const b = this.burnRecord(id);
    return !b || this.world.curtime - b.lastBurn >= this.burnFrequency;
  }

  /** SDK: CTFFlameManager::GetFlameDamageScale. */
  damageScale(p: FlamePoint, victim: Entity | null): number {
    const alive = this.world.curtime - p.spawnTime;
    let scale = remapClamped(alive, 0, p.lifeTime * FLAMETHROWER.minDamageScaleTimeCap, 1, FLAMETHROWER.minDamageScale);
    if (victim && victim.isPlayer()) {
      const b = this.burnRecord(victim.id);
      if (b) scale *= remapClamped(b.heat, FLAMETHROWER.heatRemap[0], FLAMETHROWER.heatRemap[1], FLAMETHROWER.heatMinScale, 1);
    }
    return scale;
  }

  /** SDK: CTFFlameManager::OnCollide. */
  private onCollide(ent: Entity, p: FlamePoint): void {
    const w = this.world;
    const attacker = w.entity(this.attacker);
    if (!attacker) return;
    const t = w.curtime;
    const rec = this.burnRecord(ent.id);
    if (rec) {
      const amount = remapClamped(t - p.spawnTime, 0, FLAME_NEW_HEAT_TIME, FLAMETHROWER.heatPerCollide * 2, FLAMETHROWER.heatPerCollide);
      rec.heat += amount;
    }
    if (!this.canBurn(ent.id)) return;
    if (!(ent.isPlayer() && ent.team === attacker.team)) {
      let dmgType = this.dmgType;
      let victim: Player | null = null;
      if (ent.isPlayer()) {
        victim = ent as Player;
        if (attacker.isPlayer() && (attacker as Player).playerClass === TF_CLASS_PYRO) {
          victim.cond.add(TF_COND.HEALING_DEBUFF, FLAME_HEALING_DEBUFF_TIME, attacker.id);
        }
      }
      if (this.critFromBehind) dmgType |= DMG_CRITICAL;
      const damage = Math.max(this.damageScale(p, victim) * this.flameDamage, 1);
      const info = resetDamageInfo(flameInfo);
      info.attacker = attacker.id;
      info.inflictor = this.id;
      info.weaponId = this.weapon ? this.weapon.weaponId : 0;
      info.weaponDefIndex = this.weapon ? this.weapon.defindex : -1;
      info.killIcon = this.weapon ? this.weapon.killIcon : 'flamethrower';
      info.damage = damage;
      info.damageType = dmgType;
      info.customKill = TF_DMG_CUSTOM_BURNING;
      info.critType = dmgType & DMG_CRITICAL ? 2 : 0;
      copy(info.reportedPosition, attacker.origin);
      ent.worldSpaceCenter(info.position);
      // CTFPlayerShared::Burn: the first ignition gets the initial afterburn plus the per-hit rate.
      const burning = victim ? victim.cond.has(TF_COND.BURNING) : false;
      info.afterburn = burning ? FLAMETHROWER_AFTERBURN_RATE : FLAMETHROWER_INITIAL_AFTERBURN + FLAMETHROWER_AFTERBURN_RATE;
      w.applyDamage(ent, info);
      this.weapon?.setHitTarget();
    }
    if (rec) rec.lastBurn = t;
    else {
      const r = this.burntPool.pop() ?? { id: 0, lastBurn: 0, heat: 0 };
      r.id = ent.id;
      r.lastBurn = t;
      r.heat = FLAMETHROWER.heatPerCollide;
      this.burnt.push(r);
    }
  }

  /** SDK: CTFFlameManager::PostEntityThink — forget stale victims, drain heat (per frame). */
  private postEntityThink(): void {
    const t = this.world.curtime;
    for (let i = this.burnt.length - 1; i >= 0; i--) {
      if (t - this.burnt[i].lastBurn > this.burnFrequency) {
        this.burntPool.push(this.burnt[i]);
        this.burnt[i] = this.burnt[this.burnt.length - 1];
        this.burnt.length--;
      }
    }
    for (let i = 0; i < this.burnt.length; i++) this.burnt[i].heat = Math.max(this.burnt[i].heat - FLAMETHROWER.heatDrainRate, 0);
  }
}
registerEntityClass('tf_flame_manager', FlameManager);

/** A ±r box swept from a to b against an entity's AABB (enginetrace->ClipRayToEntity on its box). */
function sweptBoxVsAabb(a: Vec3, b: Vec3, r: number, e: Entity): boolean {
  let t0 = 0;
  let t1 = 1;
  for (let axis = 0; axis < 3; axis++) {
    const s = axis === 0 ? a.x : axis === 1 ? a.y : a.z;
    const d = (axis === 0 ? b.x : axis === 1 ? b.y : b.z) - s;
    const o = axis === 0 ? e.origin.x : axis === 1 ? e.origin.y : e.origin.z;
    const lo = o + (axis === 0 ? e.mins.x : axis === 1 ? e.mins.y : e.mins.z) - r;
    const hi = o + (axis === 0 ? e.maxs.x : axis === 1 ? e.maxs.y : e.maxs.z) + r;
    if (Math.abs(d) < 1e-9) {
      if (s < lo || s > hi) return false;
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
    if (t0 > t1) return false;
  }
  return true;
}

// ─── The weapon ────────────────────────────────────────────────────────────

const abTrace = emptyTrace();
const abFwd = vec3();
const abEye = vec3();
const abCenter = vec3();
const abNearest = vec3();
const abTarget = vec3();
const abToTarget = vec3();
const abPush = vec3();
const abAngles = vec3();
const abAngTo = vec3();
const abForce = vec3();
const abEnd = vec3();
const abDown = vec3();
const muzzleTrace = emptyTrace();
const muzzlePos = vec3();

export class Flamethrower extends TFWeaponGun {
  /** m_iWeaponState (FT_STATE_*). */
  weaponState = FT_STATE_IDLE;
  startFiringTime = 0;
  /** m_flMinPrimaryAttackBurstTime (a tap still fires 0.2 s). */
  minBurstTime = 0;
  nextPrimaryAttackAnim = 0;
  /** m_flAmmoUseRemainder. */
  ammoUseRemainder = 0;
  critFire = false;
  firedBothAttacks = false;
  firedSecondary = false;
  secondaryAnimTime = 0;
  resetBurstEffect = 0;
  /** m_hFlameManager (server). */
  flameManager: FlameManager | null = null;
  /** Last time a flame hit someone (hit sound / HUD). */
  hitTargetTime = 0;
  private readonly deflectFn = (): void => this.deflectProjectilesNow();
  private pilotOn = false;

  constructor(spec: WeaponSpec) {
    super(spec);
  }

  /** CTFFlameThrower::GetFlameOriginPos / GetVisualMuzzlePos (both the offset point here). */
  flameOriginPos(out: Vec3): Vec3 {
    const o = this.owner!;
    angleVectors(o.eyeAngles, ftFwd, ftRight, ftUp);
    o.eyePosition(ftEye);
    const off = FLAMETHROWER.newFlameOffset;
    return set(
      out,
      ftEye.x + off.forward * ftFwd.x + off.right * ftRight.x + off.up * ftUp.x,
      ftEye.y + off.forward * ftFwd.y + off.right * ftRight.y + off.up * ftUp.y,
      ftEye.z + off.forward * ftFwd.z + off.right * ftRight.z + off.up * ftUp.z,
    );
  }

  setHitTarget(): void {
    this.hitTargetTime = this.t;
  }

  /** The new-flame particle (GetNewFlameEffectInternal): new_flame, crits new_flame_crit_<team>. */
  flameEffectName(): string {
    const o = this.owner;
    if (o && o.move.waterLevel === WL_EYES) return 'flamethrower_underwater';
    if (!this.critFire) return 'new_flame';
    return o && o.team === TF_TEAM_BLUE ? 'new_flame_crit_blue' : 'new_flame_crit_red';
  }

  /** SDK: CTFFlameThrower::SetWeaponState — with the start/stop sounds and particle events. */
  setWeaponState(state: number): void {
    if (this.weaponState === state) return;
    const o = this.owner;
    const wasFlaming = this.weaponState === FT_STATE_STARTFIRING || this.weaponState === FT_STATE_FIRING;
    const flaming = state === FT_STATE_STARTFIRING || state === FT_STATE_FIRING;
    this.weaponState = state;
    if (!o) return;
    if (flaming && !wasFlaming) {
      this.weaponSound('single_shot');
      this.weaponSound(this.critFire ? 'burst' : 'special1');
      o.world.emitEffect({ kind: 'particle', system: this.flameEffectName(), pos: { ...o.origin }, entity: o.id, attachment: 'muzzle', value: 1 });
    } else if (!flaming && wasFlaming) {
      this.stopSound(this.sounds.special1);
      this.stopSound(this.sounds.burst);
      this.weaponSound('special3');
      o.world.emitEffect({ kind: 'particle', system: this.flameEffectName(), pos: { ...o.origin }, entity: o.id, attachment: 'muzzle', value: 0 });
    }
  }

  override deploy(): boolean {
    const ok = super.deploy();
    this.startPilotLight();
    return ok;
  }

  private startPilotLight(): void {
    if (this.pilotOn) return;
    this.pilotOn = true;
    this.weaponSound('special2');
  }

  private stopPilotLight(): void {
    if (!this.pilotOn) return;
    this.pilotOn = false;
    this.stopSound(this.sounds.special2);
  }

  override holster(next: Parameters<TFWeaponGun['holster']>[0]): boolean {
    this.setWeaponState(FT_STATE_IDLE);
    this.stopPilotLight();
    this.flameManager?.stopFiring();
    this.minBurstTime = 0;
    return super.holster(next);
  }

  override onOwnerDeath(): void {
    super.onOwnerDeath();
    this.setWeaponState(FT_STATE_IDLE);
    this.stopPilotLight();
    this.flameManager?.stopFiring();
  }

  override refill(): void {
    super.refill();
    this.ammoUseRemainder = 0;
    this.minBurstTime = 0;
  }

  /** SDK: CTFFlameThrower::ItemPostFrame. */
  override tfItemPostFrame(cmd: UserCmd): void {
    const o = this.owner;
    if (!o) return;
    const t = this.t;
    let buttons = cmd.buttons;
    const ammo = this.reserve();
    this.firedSecondary = false;
    if (o.alive && buttons & IN_ATTACK2) this.secondaryAttack(cmd);
    if (this.firedBothAttacks) {
      if (buttons & IN_ATTACK && !(buttons & IN_ATTACK2)) buttons &= ~IN_ATTACK;
      this.firedBothAttacks = false;
    }
    if (!(buttons & IN_ATTACK)) {
      if (this.minBurstTime > 0 && t > this.minBurstTime) {
        this.minBurstTime = 0;
        this.flameManager?.stopFiring();
      }
    }
    if (buttons & IN_ATTACK && buttons & IN_ATTACK2) this.firedBothAttacks = true;
    const forceFire = this.minBurstTime > 0 && t < this.minBurstTime;
    if (!this.firedSecondary) {
      if (o.alive && (buttons & IN_ATTACK || forceFire) && ammo > 0) this.primaryAttack(cmd);
      else if (this.weaponState > FT_STATE_IDLE && this.weaponState !== FT_STATE_SECONDARY) {
        this.sendWeaponAnim(ACT.MP_ATTACK_STAND_POSTFIRE);
        o.doAnimationEvent(PLAYERANIMEVENT_ATTACK_POST);
        this.setWeaponState(FT_STATE_IDLE);
        this.critFire = false;
      }
    }
    if (!(buttons & (IN_ATTACK | IN_RELOAD | IN_ATTACK2) || this.firedSecondary) && !forceFire) {
      if (!this.inReload && this.secondaryAnimTime < t) this.weaponIdle(cmd);
    }
  }

  /** SDK: CTFFlameThrower::PrimaryAttack. */
  override primaryAttack(cmd: UserCmd): void {
    const o = this.owner;
    if (!o) return;
    const t = this.t;
    if (this.nextPrimaryAttack > t) return;
    if (!this.canAttack()) {
      this.setWeaponState(FT_STATE_IDLE);
      return;
    }
    this.weaponMode = TF_WEAPON_PRIMARY_MODE;
    this.calcIsAttackCritical(cmd);
    const w = o.world;
    // No flames through a wall the muzzle is inside.
    o.eyePosition(ftEye);
    this.flameOriginPos(muzzlePos);
    const f = w.entityFilterObject(o, COLLISION_GROUP_NONE);
    w.traceLine(ftEye, muzzlePos, MASK_SOLID, f.fn, muzzleTrace);
    if (muzzleTrace.fraction < 1) {
      const hit = w.entity(muzzleTrace.entity);
      if (!hit || hit === w.worldEntity || hit.takeDamage === 0) {
        if (this.weaponState > FT_STATE_IDLE) this.setWeaponState(FT_STATE_IDLE);
        return;
      }
    }
    switch (this.weaponState) {
      case FT_STATE_IDLE:
        o.doAnimationEvent(PLAYERANIMEVENT_ATTACK_PRE);
        this.sendWeaponAnim(ACT.VM_PRIMARYATTACK);
        this.startFiringTime = t + FLAMETHROWER_START_FIRING_TIME;
        if (this.minBurstTime === 0) this.minBurstTime = t + FLAMETHROWER_MIN_BURST_TIME;
        this.critFire = this.currentAttackIsCrit;
        this.setWeaponState(FT_STATE_STARTFIRING);
        break;
      case FT_STATE_STARTFIRING:
        if (t > this.startFiringTime) {
          this.setWeaponState(FT_STATE_FIRING);
          this.nextPrimaryAttackAnim = t;
        }
        break;
      case FT_STATE_FIRING:
        if (t >= this.nextPrimaryAttackAnim) {
          o.doAnimationEvent(PLAYERANIMEVENT_ATTACK_PRIMARY);
          this.nextPrimaryAttackAnim = t + FLAMETHROWER_ATTACK_ANIM_INTERVAL;
        }
        break;
      default:
        break;
    }
    const interval = FLAMETHROWER.newFlameDelay;
    if (o.move.waterLevel !== WL_EYES) {
      let dmgType = this.stats.damageType;
      this.critFire = this.currentAttackIsCrit;
      if (this.critFire) dmgType |= DMG_CRITICAL;
      if (w.isServer) {
        if (!this.flameManager || this.flameManager.removed) {
          const m = w.spawnEntity('tf_flame_manager', (e) => {
            const fm = e as FlameManager;
            fm.weapon = this;
            fm.attacker = o.id;
            fm.owner = o.id;
            fm.team = o.team;
          }) as FlameManager;
          m.startFiring();
          this.flameManager = m;
        }
        this.flameManager.startFiring();
        this.flameManager.updateDamage(dmgType, FLAMETHROWER.damagePerTick, FLAMETHROWER.burnFrequency, false);
        this.flameManager.addPoint(w.tickCount);
      }
      removeInvisibility(o);
    }
    // Ammo: TF_FLAMETHROWER_AMMO_PER_SECOND_PRIMARY_ATTACK, kept to 1/100ths.
    this.ammoUseRemainder += FLAMETHROWER_AMMO_PER_SECOND * interval;
    const take = Math.trunc(this.ammoUseRemainder);
    if (take > 0) {
      const a = o.ammo;
      a[this.stats.ammoType] = Math.max(0, a[this.stats.ammoType] - take);
      this.ammoUseRemainder -= take;
      this.ammoUseRemainder = Math.trunc(this.ammoUseRemainder * 100) / 100;
    }
    this.nextPrimaryAttack = t + interval;
    this.timeWeaponIdle = t + interval;
    this.lastFireTime = t;
  }

  /** SDK: CTFFlameThrower::SecondaryAttack. */
  override secondaryAttack(cmd: UserCmd): void {
    const o = this.owner;
    if (!o) return;
    const t = this.t;
    if (this.nextSecondaryAttack > t) {
      if (this.resetBurstEffect <= t && this.weaponState === FT_STATE_SECONDARY) this.setWeaponState(FT_STATE_IDLE);
      return;
    }
    if (o.move.waterLevel === WL_EYES) return;
    if (!this.canAttack()) {
      this.setWeaponState(FT_STATE_IDLE);
      return;
    }
    // CTFFlameThrower::CanAirBlast (airblast_disabled) and the burst ammo × mult_airblast_cost.
    if (hookInt(hookWeapon(this, o, 'airblast_disabled', 0)) !== 0) return;
    const cost = Math.trunc(FLAMETHROWER.airblastCost * hookWeapon(this, o, 'mult_airblast_cost', 1));
    if (this.reserve() < cost) return;
    this.fireAirBlast(cmd, cost);
  }

  /** SDK: CTFFlameThrower::FireAirBlast. */
  fireAirBlast(cmd: UserCmd, ammo: number): void {
    const o = this.owner!;
    const t = this.t;
    this.firedSecondary = true;
    this.setWeaponState(FT_STATE_SECONDARY);
    this.sendWeaponAnim(ACT.VM_SECONDARYATTACK);
    o.doAnimationEvent(PLAYERANIMEVENT_ATTACK_SECONDARY);
    this.secondaryAnimTime = t + FLAMETHROWER.airblastRefire;
    this.weaponSound('double_shot');
    o.world.emitEffect({ kind: 'particle', system: 'pyro_blast', pos: { ...o.origin }, entity: o.id, attachment: 'muzzle' });
    this.deflectProjectiles(cmd);
    this.nextSecondaryAttack = t + FLAMETHROWER.airblastRefire;
    this.nextPrimaryAttack = t + FLAMETHROWER.airblastPrimaryDelay;
    this.resetBurstEffect = t + AIRBLAST_EFFECT_RESET;
    const a = o.ammo;
    a[this.stats.ammoType] = Math.max(0, a[this.stats.ammoType] - ammo);
  }

  /** SDK: CTFWeaponBase::DeflectProjectiles — under lag compensation. */
  deflectProjectiles(cmd: UserCmd): void {
    const o = this.owner!;
    if (o.move.waterLevel === WL_EYES) return;
    o.world.lagcomp.withRewind(o, cmd.tickCount, this.deflectFn);
  }

  private deflectProjectilesNow(): void {
    const o = this.owner!;
    const w = o.world;
    angleVectors(o.eyeAngles, abFwd);
    o.eyePosition(abEye);
    const radius = FLAMETHROWER.airblastRadius;
    set(abCenter, abEye.x + abFwd.x * radius, abEye.y + abFwd.y * radius, abEye.z + abFwd.z * radius);
    let deflected = false;
    let deflectedPlayer = false;
    const list = w.entities;
    for (let i = 1; i < list.length; i++) {
      const e = list[i];
      if (!e || e.removed || e === o) continue;
      const isPlayer = e.isPlayer();
      if (isPlayer && (!e.alive || e.team <= 1)) continue;
      if (!isPlayer && !isDeflectable(e)) continue;
      // UTIL_EntitiesInSphere: the box's nearest point within the sphere.
      e.nearestPoint(abCenter, abNearest);
      const dx = abNearest.x - abCenter.x;
      const dy = abNearest.y - abCenter.y;
      const dz = abNearest.z - abCenter.z;
      if (dx * dx + dy * dy + dz * dz > radius * radius) continue;
      // FVisible (MASK_SOLID): the world doesn't hide it.
      e.worldSpaceCenter(abTarget);
      w.traceLineWorldOnly(abEye, abTarget, MASK_SOLID, abTrace);
      if (abTrace.fraction < 1 && abTrace.entity !== e.id) continue;
      if (isPlayer) {
        const r = this.deflectPlayer(e as Player);
        deflectedPlayer = deflectedPlayer || r;
        deflected = deflected || r;
      } else deflected = this.deflectEntity(e) || deflected;
    }
    if (deflected && deflectedPlayer) w.emitSound('TFPlayer.AirBlastImpact', { entity: o.id });
  }

  /** SDK: CTFFlameThrower::DeflectPlayer — extinguish teammates, push enemies in the cone. */
  deflectPlayer(target: Player): boolean {
    const o = this.owner!;
    const w = o.world;
    if (target.team === o.team) {
      if (target.cond.has(TF_COND.BURNING)) {
        target.extinguish();
        w.emitSound('TFPlayer.FlameOut', { entity: target.id });
        o.takeHealth(FLAMETHROWER.extinguishHeal);
      }
      return false;
    }
    target.worldSpaceCenter(abTarget);
    o.worldSpaceCenter(abCenter);
    set(abToTarget, abTarget.x - abCenter.x, abTarget.y - abCenter.y, abTarget.z - abCenter.z);
    normalize(abToTarget);
    if (!this.boxInCone(target, abEye, abFwd)) return false;
    // tf_airblast_cray_pitch_control 0: the Pyro's pitch, the yaw toward the target.
    vectorAngles(abFwd, abAngles);
    vectorAngles(abToTarget, abAngTo);
    abAngles.y = abAngTo.y;
    angleVectors(abAngles, abPush);
    this.computeCrayAirBlastForce(target, abPush, abForce);
    w.clearGround(target);
    // TF_COND_LOST_FOOTING (movement drops it once the slide slows below the restick
    // speed) and TF_COND_AIR_CURRENT (cleared on ground contact, TFWeapon.airborneCondThink).
    target.move.conds |= MOVE_COND_LOST_FOOTING | MOVE_COND_AIR_CURRENT;
    target.cond.add(TF_COND.KNOCKED_INTO_AIR);
    target.applyAbsVelocityImpulse(abForce);
    target.move.gameMoved = true;
    return true;
  }

  /**
   * physcollision->IsBoxIntersectingCone for the truncated cone (apex at the
   * eye, axis `fwd`, height 2 × deflection radius, half-angle
   * tf_flamethrower_airblast_cone_angle): the box's point nearest the axis.
   */
  private boxInCone(target: Entity, apex: Vec3, fwd: Vec3): boolean {
    const h = 2 * FLAMETHROWER.airblastRadius;
    const cosA = Math.cos(FLAMETHROWER.airblastConeDegrees * DEG2RAD);
    // Sample the axis: the nearest box point to a few points along it.
    for (let k = 0; k <= 8; k++) {
      const d = (h * k) / 8;
      set(abEnd, apex.x + fwd.x * d, apex.y + fwd.y * d, apex.z + fwd.z * d);
      target.nearestPoint(abEnd, abNearest);
      const vx = abNearest.x - apex.x;
      const vy = abNearest.y - apex.y;
      const vz = abNearest.z - apex.z;
      const len = Math.hypot(vx, vy, vz);
      if (len < 1e-6) return true;
      const along = vx * fwd.x + vy * fwd.y + vz * fwd.z;
      if (along < 0 || along > h) continue;
      if (along / len >= cosA) return true;
    }
    return false;
  }

  /** SDK: CTFFlameThrower::ComputeCrayAirBlastForce (convars at their defaults). */
  computeCrayAirBlastForce(target: Player, aim: Vec3, out: Vec3): void {
    const v = target.velocity;
    set(out, 0, 0, 0);
    const mom = v.x * aim.x + v.y * aim.y + v.z * aim.z;
    if (mom < 0) {
      const reflect = -AIRBLAST_REFLECT_COEFF * mom;
      set(out, aim.x * reflect, aim.y * reflect, aim.z * reflect);
    }
    const preamp = Math.hypot(out.x, out.y, out.z);
    const remaining = FLAMETHROWER.airblastPushPower - preamp * AIRBLAST_REFLECT_COST_COEFF;
    if (remaining > 0) {
      out.x += aim.x * remaining;
      out.y += aim.y * remaining;
      out.z += aim.z * remaining;
    }
    const onGround = target.groundEntity !== NO_ENTITY || (target.move.flags & 1) !== 0;
    const w = target.world;
    if (onGround) {
      // tf_airblast_cray_ground_reflect: bounce off the floor the target stands on.
      set(abDown, target.origin.x, target.origin.y, target.origin.z - 5);
      w.traceHull(target.origin, abDown, target.mins, target.maxs, MASK_PLAYERSOLID, w.entityFilter(target, COLLISION_GROUP_PLAYER_MOVEMENT), abTrace);
      if (abTrace.fraction < 1) {
        const n = abTrace.plane.normal;
        const from = (v.x + out.x) * n.x + (v.y + out.y) * n.y + (v.z + out.z) * n.z;
        if (from < 0) {
          out.x += n.x * -2 * from;
          out.y += n.y * -2 * from;
          out.z += n.z * -2 * from;
        }
      }
      // tf_airblast_cray_ground_minz: at least 100 u/s up, taken out of the horizontal push.
      const minZ = FLAMETHROWER.airblastGroundMinZ;
      if (minZ > 0) {
        let addZ = minZ - (v.z + out.z);
        if (addZ > 0) {
          const initialXY = Math.hypot(out.x, out.y);
          addZ = Math.min(addZ, initialXY);
          const magSqr = out.x * out.x + out.y * out.y + out.z * out.z;
          if (magSqr < addZ * addZ) set(out, 0, 0, Math.sqrt(magSqr));
          else {
            const xySqr = out.x * out.x + out.y * out.y;
            const base = -(addZ * addZ) - 2 * addZ * out.z + xySqr;
            const s = xySqr > 0 ? Math.sqrt(Math.max(base, 0)) / Math.sqrt(xySqr) : 0;
            set(out, out.x * s, out.y * s, out.z + addZ);
          }
        }
      }
    }
  }

  /** SDK: CTFFlameThrower::DeflectEntity → CTFWeaponBase::DeflectEntity. */
  deflectEntity(target: Entity): boolean {
    const o = this.owner!;
    const w = o.world;
    if (!isDeflectable(target)) return false;
    if (target.team === o.team) return false;
    // Aim the projectile at whatever the Pyro's crosshair is on (players and buildings ignored).
    set(abEnd, abEye.x + abFwd.x * MAX_TRACE_LENGTH, abEye.y + abFwd.y * MAX_TRACE_LENGTH, abEye.z + abFwd.z * MAX_TRACE_LENGTH);
    const f = w.entityFilterObject(o, COLLISION_GROUP_NONE);
    f.ignorePlayers = true;
    w.traceLine(abEye, abEnd, MASK_SOLID, f.fn, abTrace);
    target.worldSpaceCenter(abTarget);
    set(abToTarget, abTrace.endPos.x - abTarget.x, abTrace.endPos.y - abTarget.y, abTrace.endPos.z - abTarget.z);
    normalize(abToTarget);
    const speed = Math.hypot(target.velocity.x, target.velocity.y, target.velocity.z);
    set(target.velocity, abToTarget.x * speed, abToTarget.y * speed, abToTarget.z * speed);
    target.onDeflected(o, abToTarget);
    vectorAngles(abToTarget, target.angles);
    w.emitEffect({ kind: 'particle', system: 'deflect_fx', pos: { x: target.origin.x, y: target.origin.y, z: target.origin.z }, entity: target.id });
    w.emitSound('Weapon_FlameThrower.AirBurstAttackDeflect', { entity: target.id });
    return true;
  }

  protected override writeWeaponNet(out: NetRecord): void {
    out.aux0 = this.weaponState;
    out.aux1 = this.startFiringTime;
    out.aux2 = this.minBurstTime;
    out.aux3 = this.ammoUseRemainder;
    out.aux4 = this.nextPrimaryAttackAnim;
    out.aux5 = (this.critFire ? 1 : 0) | (this.firedBothAttacks ? 2 : 0);
    out.aux6 = this.secondaryAnimTime;
    out.aux7 = this.resetBurstEffect;
  }

  protected override readWeaponNet(rec: NetRecord): void {
    this.weaponState = num(rec.aux0);
    this.startFiringTime = num(rec.aux1);
    this.minBurstTime = num(rec.aux2);
    this.ammoUseRemainder = num(rec.aux3);
    this.nextPrimaryAttackAnim = num(rec.aux4);
    const f = num(rec.aux5);
    this.critFire = (f & 1) !== 0;
    this.firedBothAttacks = (f & 2) !== 0;
    this.secondaryAnimTime = num(rec.aux6);
    this.resetBurstEffect = num(rec.aux7);
  }
}
