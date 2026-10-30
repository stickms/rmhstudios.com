/**
 * Grenades: one pouch weapon carrying every kind with a count each (CS:GO's carry limits —
 * ammo_grenade_limit_total 4, flashbangs 2, every other kind 1, the molotov and incendiary sharing
 * one), the throw (full overhand with +attack, an underhand lob with +attack2, a medium toss with
 * both; the pin is pulled on press and the grenade leaves on release), the flying grenade (the shared
 * PhysicsToss with gravity and bounce), and what each kind does:
 *
 *   - HE: radius damage from the item's `damage` / `range` (99 over 350 units), through armor;
 *   - flashbang: blindness by view angle, distance and line of sight (smoke blocks it);
 *   - smoke: an 18 s cloud that blocks sight (the bots read it) and puts out fires;
 *   - molotov / incendiary: a burning area (inferno_flame_lifetime 7 s, inferno_damage 40/s,
 *     inferno_max_range 150), on landing or after molotov_throw_detonate_time in the air;
 *   - decoy: fake gunshots for ~15 s, then a small pop.
 *
 * Grenade physics (community trajectory measurements, the published "grenade prediction" analyses):
 * gravity × 0.4, elasticity 0.45, a full throw ~750 u/s (scaled 0.3 + 0.7 × strength), the throw
 * angle raised toward the horizon by 10° × (90 − |pitch|) / 90, and the thrower's velocity × 1.25 added.
 */

import {
  FL_ONGROUND,
  IN_ATTACK,
  IN_ATTACK2,
  MASK_SOLID,
  MOVETYPE_FLYGRAVITY,
} from '../../tf2-game/core/constants';
import { emptyTrace, type TraceResult, type UserCmd } from '../../tf2-game/core/types';
import { angleVectors, vec3, type Vec3 } from '../../tf2-game/core/vec';
import {
  COLLISION_GROUP_PROJECTILE,
  DAMAGE_NO,
  EF_NODRAW,
  Entity,
  FSOLID_NOT_SOLID,
  MOVECOLLIDE_FLY_CUSTOM,
  SOLID_BBOX,
  SOLID_NONE,
} from '../../tf2-game/sim/entity';
import { registerEntityClass } from '../../tf2-game/sim/entity-registry';
import { BaseProjectile, resolveFlyCollisionBounce } from '../../tf2-game/sim/physics';
import { createDamageInfo, DMG_BLAST, DMG_BURN, DMG_NEVERGIB } from '../../tf2-game/sim/damage';
import type { NetRecord, NetSchema } from '../../tf2-game/sim/net-schema';
import { PLAYERANIMEVENT_ATTACK_PRIMARY } from '../../tf2-game/sim/player';
import {
  DECOY_DURATION,
  GRENADE_FUSE,
  GRENADE_LIMIT_DEFAULT,
  GRENADE_LIMIT_FLASHBANG,
  GRENADE_LIMIT_TOTAL,
  INFERNO_DAMAGE,
  INFERNO_FLAME_LIFETIME,
  INFERNO_MAX_RANGE,
  MOLOTOV_DETONATE_TIME,
  SMOKE_DURATION,
  SMOKE_RADIUS,
} from '../constants';
import {
  CS_GRENADE_KINDS,
  csWeapon,
  type CsGrenadeKind,
  type CsWeaponInfo,
} from '../data/weapon-data';
import { NET_CS_AREA, NET_CS_GRENADE } from '../net-schema';
import type { CsPlayer } from '../player';
import type { CsWorld } from '../world';
import { CsWeapon, VM_DRAW, VM_PULLPIN, VM_THROW } from './base';

// ─── Physics (community measurements) ─────────────────────────────────────────────────────

export const GRENADE_GRAVITY = 0.4;
export const GRENADE_ELASTICITY = 0.45;
export const GRENADE_THROW_SPEED = 750;
export const GRENADE_THROWER_VELOCITY = 1.25;
/** Seconds after a throw before the next grenade is out. */
export const GRENADE_REDRAW_DELAY = 1.0;
/** A smoke or decoy goes off once it has come to rest (and at least this long after the throw). */
export const GRENADE_REST_FUSE = 1.5;

/** HE falloff: a Gaussian of σ = radius / 3 fitted to the community's damage-by-distance measurements. */
export const HE_FALLOFF_SIGMA_FRACTION = 1 / 3;
/** Flashbang: full blindness up to ~4.9 s (CS:GO wiki), fading with distance to nothing at ~1500 units. */
export const FLASH_MAX_DURATION = 4.87;
export const FLASH_FULL_RANGE = 300;
export const FLASH_MAX_RANGE = 1500;
/** Fire: damage is dealt in steps of this long. */
export const INFERNO_TICK = 0.25;
/** Heights a fire or smoke reaches above its centre. */
export const AREA_HEIGHT = 96;

export const AREA_SMOKE = 0;
export const AREA_FIRE = 1;

const kindIndex = (k: CsGrenadeKind): number => CS_GRENADE_KINDS.indexOf(k);

/** The most of a kind a player may carry. */
export const grenadeLimit = (k: CsGrenadeKind): number =>
  k === 'flashbang' ? GRENADE_LIMIT_FLASHBANG : GRENADE_LIMIT_DEFAULT;

// ─── The pouch ──────────────────────────────────────────────────────────────────────────────

const THROW_IDLE = 0;
const THROW_PIN = 1;
const THROW_DONE = 2;

const throwAngles = vec3();
const throwFwd = vec3();
const throwSrc = vec3();
const throwTr = emptyTrace();

export class CsGrenadePouch extends CsWeapon {
  readonly counts = new Uint8Array(CS_GRENADE_KINDS.length);
  selected = 0;
  throwState = THROW_IDLE;
  throwStrength = 1;

  constructor(info: CsWeaponInfo) {
    super(info);
    this.clip = -1;
    this.reserve = 0;
    const k = info.grenade ? kindIndex(info.grenade) : 0;
    this.selected = k < 0 ? 0 : k;
  }

  /** The info of the kind out (its defindex, model and speed). */
  private kindInfo(i = this.selected): CsWeaponInfo {
    return csWeapon(`weapon_${CS_GRENADE_KINDS[i]}`) ?? this.info;
  }

  override get defindex(): number {
    return this.kindInfo().defindex;
  }
  override get classname(): string {
    return `weapon_${CS_GRENADE_KINDS[this.selected]}`;
  }
  override get killIcon(): string {
    return CS_GRENADE_KINDS[this.selected];
  }
  override get worldModel(): string {
    return this.kindInfo().worldModel;
  }
  override get viewModel(): string {
    return this.kindInfo().viewModel;
  }

  total(): number {
    let n = 0;
    for (const c of this.counts) n += c;
    return n;
  }

  /** May one more of `kind` be carried (the per-kind and total limits; molotov and incendiary share)? */
  canCarry(kind: CsGrenadeKind): boolean {
    if (this.total() >= GRENADE_LIMIT_TOTAL) return false;
    if (kind === 'molotov' || kind === 'incgrenade')
      return (
        this.counts[kindIndex('molotov')] + this.counts[kindIndex('incgrenade')] <
        GRENADE_LIMIT_DEFAULT
      );
    return this.counts[kindIndex(kind)] < grenadeLimit(kind);
  }

  add(kind: CsGrenadeKind): boolean {
    if (!this.canCarry(kind)) return false;
    const i = kindIndex(kind);
    this.counts[i]++;
    if (this.counts[this.selected] === 0) this.selected = i;
    return true;
  }

  /** `slot4` again: the next kind carried. */
  cycle(): void {
    for (let n = 1; n <= this.counts.length; n++) {
      const i = (this.selected + n) % this.counts.length;
      if (this.counts[i] > 0) {
        this.selected = i;
        this.deploy();
        return;
      }
    }
  }

  /** Selects a kind (the bots, the buy menu). */
  select(kind: CsGrenadeKind): boolean {
    const i = kindIndex(kind);
    if (this.counts[i] <= 0) return false;
    this.selected = i;
    return true;
  }

  override maxSpeed(): number {
    return this.kindInfo().maxSpeed;
  }

  override canDeploy(): boolean {
    return this.total() > 0;
  }

  override deploy(): boolean {
    this.throwState = THROW_IDLE;
    return super.deploy();
  }

  override canHolster(): boolean {
    return this.throwState !== THROW_PIN;
  }

  itemPostFrame(cmd: UserCmd): void {
    const owner = this.cs;
    if (!owner) return;
    const t = this.curtime;
    const held = cmd.buttons & (IN_ATTACK | IN_ATTACK2);
    if (this.throwState === THROW_DONE) {
      if (t < this.nextPrimaryAttack) return;
      if (this.counts[this.selected] === 0) {
        if (this.total() > 0) this.cycle();
        else {
          owner.switchAwayFromEmptySlot();
          return;
        }
      }
      this.throwState = THROW_IDLE;
      this.setActivity(VM_DRAW);
      return;
    }
    if (this.throwState === THROW_IDLE) {
      if (
        held &&
        t >= this.nextPrimaryAttack &&
        this.counts[this.selected] > 0 &&
        !owner.cannotAttack()
      ) {
        this.throwState = THROW_PIN;
        this.setActivity(VM_PULLPIN);
      }
      return;
    }
    // Pin pulled: the strength follows the buttons; letting go throws.
    if (held) {
      this.throwStrength =
        cmd.buttons & IN_ATTACK && cmd.buttons & IN_ATTACK2 ? 0.5 : cmd.buttons & IN_ATTACK ? 1 : 0;
      return;
    }
    this.throwGrenade(cmd, t);
  }

  private throwGrenade(cmd: UserCmd, t: number): void {
    const owner = this.cs;
    const kind = CS_GRENADE_KINDS[this.selected];
    const kinfo = this.kindInfo();
    this.counts[this.selected]--;
    this.throwState = THROW_DONE;
    this.nextPrimaryAttack = t + GRENADE_REDRAW_DELAY;
    this.lastFireTime = t;
    this.setActivity(VM_THROW);
    owner.doAnimationEvent(PLAYERANIMEVENT_ATTACK_PRIMARY);
    owner.onFiredWeapon();
    const world = this.world;
    if (!world.isServer) return;
    // The throw: raise the angle toward the horizon, speed by strength, plus the thrower's motion.
    const pitch = cmd.viewAngles.x;
    throwAngles.x = pitch - (10 * (90 - Math.abs(pitch))) / 90;
    throwAngles.y = cmd.viewAngles.y;
    throwAngles.z = 0;
    angleVectors(throwAngles, throwFwd);
    const speed =
      Math.min(GRENADE_THROW_SPEED, (90 - throwAngles.x) * 6.5) * (0.3 + 0.7 * this.throwStrength);
    owner.eyePosition(throwSrc);
    throwSrc.z += this.throwStrength * 12 - 12;
    const ahead = {
      x: throwSrc.x + throwFwd.x * 16,
      y: throwSrc.y + throwFwd.y * 16,
      z: throwSrc.z + throwFwd.z * 16,
    };
    world.traceHull(
      throwSrc,
      ahead,
      GRENADE_MINS,
      GRENADE_MAXS,
      MASK_SOLID,
      world.entityFilter(owner, 0),
      throwTr,
    );
    const v = owner.velocity;
    world.spawnEntity('cs_grenade_projectile', (e) => {
      const g = e as CsGrenadeProjectile;
      g.kind = kind;
      g.kindInfo = kinfo;
      g.origin.x = throwTr.endPos.x;
      g.origin.y = throwTr.endPos.y;
      g.origin.z = throwTr.endPos.z;
      g.velocity.x = throwFwd.x * speed + v.x * GRENADE_THROWER_VELOCITY;
      g.velocity.y = throwFwd.y * speed + v.y * GRENADE_THROWER_VELOCITY;
      g.velocity.z = throwFwd.z * speed + v.z * GRENADE_THROWER_VELOCITY;
      g.owner = owner.id;
      g.team = owner.team;
      g.model = THROWN_MODELS[kind];
    });
    world.emitSound('Grenade.Throw', { entity: owner.id });
  }

  protected override writeNetExtra(out: NetRecord): void {
    for (let i = 0; i < 6; i++) out[`cnt${i}`] = this.counts[i] ?? 0;
    out.selected = this.selected;
    out.throwState = this.throwState;
    out.throwStrength = this.throwStrength;
  }

  protected override readNetExtra(rec: NetRecord): void {
    for (let i = 0; i < 6; i++) this.counts[i] = rec[`cnt${i}`] as number;
    this.selected = rec.selected as number;
    this.throwState = rec.throwState as number;
    this.throwStrength = rec.throwStrength as number;
  }
}

/** The thrown models the asset pipeline publishes (scripts/tf2-game/csgo_items.py FIXED_MODELS). */
const THROWN_MODELS: Readonly<Record<CsGrenadeKind, string>> = {
  hegrenade: 'models/weapons/w_eq_fraggrenade_thrown.mdl',
  flashbang: 'models/weapons/w_eq_flashbang_thrown.mdl',
  smokegrenade: 'models/weapons/w_eq_smokegrenade_thrown.mdl',
  molotov: 'models/weapons/w_eq_molotov_thrown.mdl',
  incgrenade: 'models/weapons/w_eq_incendiarygrenade_thrown.mdl',
  decoy: 'models/weapons/w_eq_decoy_thrown.mdl',
};

const GRENADE_MINS = { x: -2, y: -2, z: -2 };
const GRENADE_MAXS = { x: 2, y: 2, z: 2 };

// ─── The flying grenade ─────────────────────────────────────────────────────────────────────

export class CsGrenadeProjectile extends BaseProjectile {
  kind: CsGrenadeKind = 'hegrenade';
  kindInfo: CsWeaponInfo | null = null;
  detonated = false;

  constructor(classname = 'cs_grenade_projectile') {
    super(classname);
    this.moveType = MOVETYPE_FLYGRAVITY;
    this.moveCollide = MOVECOLLIDE_FLY_CUSTOM;
    this.collisionGroup = COLLISION_GROUP_PROJECTILE;
    this.gravity = GRENADE_GRAVITY;
    this.elasticity = GRENADE_ELASTICITY;
  }

  override spawn(): void {
    super.spawn();
    this.setSize(GRENADE_MINS, GRENADE_MAXS);
    this.solid = SOLID_BBOX;
    this.projectileKind = kindIndex(this.kind);
    const t = this.world.curtime;
    const fuse =
      this.kind === 'hegrenade' || this.kind === 'flashbang'
        ? GRENADE_FUSE
        : this.kind === 'molotov' || this.kind === 'incgrenade'
          ? MOLOTOV_DETONATE_TIME
          : GRENADE_REST_FUSE;
    this.setThink(this.fuseThink, t + fuse);
  }

  /** CS grenades bounce off the world and players alike. */
  override physicsSolidMask(): number {
    return MASK_SOLID;
  }

  override onImpact(_other: Entity, tr: TraceResult): void {
    if (this.detonated) return;
    // A molotov bursts where it lands on the ground (a floor, not a wall).
    if ((this.kind === 'molotov' || this.kind === 'incgrenade') && tr.plane.normal.z > 0.7) {
      this.detonate();
      return;
    }
    if (Math.hypot(this.velocity.x, this.velocity.y, this.velocity.z) > 60) {
      this.world.emitSound(`${this.kindInfo?.shotSound || 'HEGrenade.Bounce'}`, {
        pos: { ...this.origin },
      });
    }
  }

  override resolveFlyCollisionCustom(tr: TraceResult, dt: number): void {
    if (this.detonated || this.removed) return;
    resolveFlyCollisionBounce(this.world, this, tr, dt);
  }

  readonly fuseThink = (): void => {
    if (this.detonated || this.removed) return;
    if (this.kind === 'smokegrenade' || this.kind === 'decoy') {
      // Goes off at rest.
      if (
        !(this.flags & FL_ONGROUND) &&
        Math.hypot(this.velocity.x, this.velocity.y, this.velocity.z) > 10
      ) {
        this.setThink(this.fuseThink, this.world.curtime + 0.1);
        return;
      }
    }
    this.detonate();
  };

  detonate(): void {
    if (this.detonated) return;
    this.detonated = true;
    const world = this.world as CsWorld;
    const at = { x: this.origin.x, y: this.origin.y, z: this.origin.z };
    const attacker = this.owner;
    switch (this.kind) {
      case 'hegrenade': {
        const info = this.kindInfo;
        csRadiusDamage(
          world,
          at,
          info?.damage || 99,
          info?.range && info.range < 4000 ? info.range : 350,
          attacker,
          info?.defindex ?? -1,
          'hegrenade',
          DMG_BLAST,
        );
        world.emitEffect({ kind: 'explosion', pos: at, system: 'explosion_hegrenade_basic' });
        world.emitSound('BaseGrenade.Explode', { pos: at });
        break;
      }
      case 'flashbang':
        flashPlayers(world, at);
        world.emitEffect({ kind: 'particle', pos: at, system: 'explosion_flashbang' });
        world.emitSound('Flashbang.Explode', { pos: at });
        break;
      case 'smokegrenade':
        spawnArea(world, AREA_SMOKE, at, SMOKE_RADIUS, SMOKE_DURATION, attacker, this.team);
        world.emitSound('BaseSmokeEffect.Sound', { pos: at });
        break;
      case 'molotov':
      case 'incgrenade': {
        // The fire lies on the ground under the burst.
        const down = { x: at.x, y: at.y, z: at.z - 256 };
        world.traceLineWorldOnly(at, down, MASK_SOLID, areaTr);
        const ground = { x: areaTr.endPos.x, y: areaTr.endPos.y, z: areaTr.endPos.z + 1 };
        if (!smokeCovers(world, ground, INFERNO_MAX_RANGE)) {
          spawnArea(
            world,
            AREA_FIRE,
            ground,
            INFERNO_MAX_RANGE,
            INFERNO_FLAME_LIFETIME,
            attacker,
            this.team,
          );
          world.emitSound('Inferno.Start', { pos: ground });
        } else world.emitSound('Molotov.Extinguish', { pos: ground });
        break;
      }
      case 'decoy':
        spawnArea(world, -1, at, 0, DECOY_DURATION, attacker, this.team);
        break;
    }
    world.remove(this);
  }

  override netSchema(): NetSchema {
    return NET_CS_GRENADE;
  }

  override writeNet(out: NetRecord): void {
    super.writeNet(out);
    out.kind = kindIndex(this.kind);
  }
}

registerEntityClass('cs_grenade_projectile', CsGrenadeProjectile);

// ─── Areas: smoke clouds, fires, the decoy ──────────────────────────────────────────────────

const areaTr = emptyTrace();
const fireInfo = createDamageInfo();

export class CsArea extends Entity {
  /** AREA_SMOKE, AREA_FIRE, or −1 (a decoy's fake gunfire). */
  kind = AREA_SMOKE;
  radius = 0;
  startedAt = 0;
  endsAt = 0;
  private nextDamageAt = 0;

  constructor(classname = 'cs_area') {
    super(classname);
    this.solid = SOLID_NONE;
    this.solidFlags |= FSOLID_NOT_SOLID;
    this.takeDamage = DAMAGE_NO;
  }

  override spawn(): void {
    super.spawn();
    this.setThink(this.areaThink, this.world.curtime);
    if (this.kind < 0) this.effects |= EF_NODRAW;
  }

  readonly areaThink = (): void => {
    const world = this.world as CsWorld;
    const t = world.curtime;
    if (t >= this.endsAt) {
      if (this.kind < 0) {
        // The decoy pops.
        csRadiusDamage(
          world,
          this.origin,
          5,
          40,
          this.owner,
          csWeapon('weapon_decoy')?.defindex ?? -1,
          'decoy',
          DMG_BLAST,
        );
        world.emitSound('Decoy.Explode', { pos: { ...this.origin } });
      }
      world.remove(this);
      return;
    }
    if (this.kind === AREA_FIRE) {
      // Smoke puts fire out.
      if (smokeCovers(world, this.origin, this.radius * 0.5)) {
        world.emitSound('Molotov.Extinguish', { pos: { ...this.origin } });
        world.remove(this);
        return;
      }
      if (t >= this.nextDamageAt) {
        this.nextDamageAt = t + INFERNO_TICK;
        world.forEachPlayer((p) => {
          if (!p.alive || !this.containsPoint(p.origin)) return;
          fireInfo.attacker = this.owner;
          fireInfo.inflictor = this.id;
          fireInfo.weaponDefIndex = csWeapon('weapon_molotov')?.defindex ?? -1;
          fireInfo.weaponId = fireInfo.weaponDefIndex;
          fireInfo.killIcon = 'inferno';
          fireInfo.damage = INFERNO_DAMAGE * INFERNO_TICK;
          fireInfo.damageType = DMG_BURN | DMG_NEVERGIB;
          fireInfo.hitGroup = 0;
          fireInfo.customKill = 0;
          fireInfo.position.x = p.origin.x;
          fireInfo.position.y = p.origin.y;
          fireInfo.position.z = p.origin.z;
          world.applyDamage(p, fireInfo);
        });
      }
    } else if (this.kind < 0 && world.isServer && world.random.randomInt(0, 9) === 0) {
      world.emitSound('Decoy.Shot', { pos: { ...this.origin } });
    }
    this.setThink(this.areaThink, t + (this.kind === AREA_SMOKE ? 0.5 : 0.05));
  };

  /** Is `p` inside the area (a vertical cylinder)? */
  containsPoint(p: Vec3): boolean {
    const dz = p.z - this.origin.z;
    if (dz < -AREA_HEIGHT * 0.5 || dz > AREA_HEIGHT) return false;
    return Math.hypot(p.x - this.origin.x, p.y - this.origin.y) <= this.radius;
  }

  override netSchema(): NetSchema {
    return NET_CS_AREA;
  }

  override writeNet(out: NetRecord): void {
    super.writeNet(out);
    out.kind = this.kind < 0 ? 255 : this.kind;
    out.radius = this.radius;
    out.startedAt = this.startedAt;
    out.endsAt = this.endsAt;
  }
}

registerEntityClass('cs_area', CsArea);

function spawnArea(
  world: CsWorld,
  kind: number,
  at: Vec3,
  radius: number,
  duration: number,
  owner: number,
  team: number,
): CsArea {
  const e = world.spawnEntity('cs_area', (ent) => {
    const a = ent as CsArea;
    a.kind = kind;
    a.radius = radius;
    a.startedAt = world.curtime;
    a.endsAt = world.curtime + duration;
    a.owner = owner;
    a.team = team;
    a.origin.x = at.x;
    a.origin.y = at.y;
    a.origin.z = at.z;
  }) as CsArea;
  if (kind === AREA_SMOKE) {
    // A smoke landing on a fire puts it out.
    world.forEachEntity((o) => {
      if (
        o instanceof CsArea &&
        o.kind === AREA_FIRE &&
        Math.hypot(o.origin.x - at.x, o.origin.y - at.y) < radius + o.radius * 0.5
      )
        world.remove(o);
    });
  }
  return e;
}

/** Is a point within `margin` of an active smoke cloud? */
export function smokeCovers(world: CsWorld, p: Vec3, margin = 0): boolean {
  let hit = false;
  world.forEachEntity((e) => {
    if (hit || !(e instanceof CsArea) || e.kind !== AREA_SMOKE) return;
    if (
      Math.hypot(p.x - e.origin.x, p.y - e.origin.y) <= e.radius + margin &&
      Math.abs(p.z - e.origin.z) < AREA_HEIGHT * 1.5
    )
      hit = true;
  });
  return hit;
}

/**
 * Does a smoke cloud block the segment a→b? Each cloud is a sphere of its radius (the bots' and
 * the flashbang's line-of-sight test).
 */
export function smokeBlocksLine(world: CsWorld, a: Vec3, b: Vec3): boolean {
  let blocked = false;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const len2 = dx * dx + dy * dy + dz * dz;
  world.forEachEntity((e) => {
    if (blocked || !(e instanceof CsArea) || e.kind !== AREA_SMOKE) return;
    const c = e.origin;
    const cz = c.z + 32;
    let tt = len2 > 0 ? ((c.x - a.x) * dx + (c.y - a.y) * dy + (cz - a.z) * dz) / len2 : 0;
    tt = tt < 0 ? 0 : tt > 1 ? 1 : tt;
    const px = a.x + dx * tt - c.x;
    const py = a.y + dy * tt - c.y;
    const pz = a.z + dz * tt - cz;
    if (px * px + py * py + pz * pz < e.radius * e.radius) blocked = true;
  });
  return blocked;
}

// ─── Explosions and flashes ─────────────────────────────────────────────────────────────────

const rdList: Entity[] = [];
const rdTr = emptyTrace();
const rdSpot = vec3();
const rdInfo = createDamageInfo();

/**
 * CS:GO radius damage (HE grenades, the bomb): everything within `radius` the blast can see takes
 * damage × exp(−d² / 2σ²), σ = radius / 3 (the published HE / C4 damage-by-distance measurements
 * fit this curve); the victim's armor applies (CsPlayer.onTakeDamage, by the weapon's armor ratio).
 */
export function csRadiusDamage(
  world: CsWorld,
  src: Vec3,
  damage: number,
  radius: number,
  attacker: number,
  weaponDefIndex: number,
  killIcon: string,
  damageType: number,
): void {
  if (!world.isServer || radius <= 0) return;
  rdList.length = 0;
  world.entitiesInSphere(src, radius, rdList);
  const sigma = radius * HE_FALLOFF_SIGMA_FRACTION;
  for (const e of rdList) {
    if (e.takeDamage === DAMAGE_NO || e.removed) continue;
    // Line of sight from the blast to the body's centre, else its eyes.
    e.worldSpaceCenter(rdSpot);
    world.traceLineWorldOnly(src, rdSpot, MASK_SOLID, rdTr);
    if (rdTr.fraction < 1 && rdTr.entity !== e.id) {
      if (!e.isPlayer()) continue;
      (e as CsPlayer).eyePosition(rdSpot);
      world.traceLineWorldOnly(src, rdSpot, MASK_SOLID, rdTr);
      if (rdTr.fraction < 1 && rdTr.entity !== e.id) continue;
    }
    e.worldSpaceCenter(rdSpot);
    const d = Math.hypot(rdSpot.x - src.x, rdSpot.y - src.y, rdSpot.z - src.z);
    if (d > radius) continue;
    const dmg = damage * Math.exp(-(d * d) / (2 * sigma * sigma));
    if (dmg < 1) continue;
    rdInfo.attacker = attacker;
    rdInfo.inflictor = attacker;
    rdInfo.weaponDefIndex = weaponDefIndex;
    rdInfo.weaponId = weaponDefIndex;
    rdInfo.killIcon = killIcon;
    rdInfo.damage = dmg;
    rdInfo.baseDamage = damage;
    rdInfo.damageType = damageType;
    rdInfo.customKill = 0;
    rdInfo.critType = 0;
    rdInfo.hitGroup = 0;
    rdInfo.position.x = src.x;
    rdInfo.position.y = src.y;
    rdInfo.position.z = src.z;
    const s = (Math.min(dmg, 100) * 4) / Math.max(1, d);
    rdInfo.force.x = (rdSpot.x - src.x) * s;
    rdInfo.force.y = (rdSpot.y - src.y) * s;
    rdInfo.force.z = (rdSpot.z - src.z) * s;
    world.applyDamage(e, rdInfo);
  }
}

const flEye = vec3();
const flFwd = vec3();
const flTr = emptyTrace();

/**
 * How much a flash at `at` blinds a viewer at `eye` looking along `forward` (0…1): full within
 * FLASH_FULL_RANGE, fading to nothing at FLASH_MAX_RANGE; full when looking at it (within ~53°),
 * less to the side, a quarter from behind (the CS:GO wiki's description; a clean-room curve).
 */
export function flashAmount(eye: Vec3, forward: Vec3, at: Vec3): number {
  const dx = at.x - eye.x;
  const dy = at.y - eye.y;
  const dz = at.z - eye.z;
  const d = Math.hypot(dx, dy, dz);
  if (d >= FLASH_MAX_RANGE) return 0;
  const distance =
    d <= FLASH_FULL_RANGE ? 1 : 1 - (d - FLASH_FULL_RANGE) / (FLASH_MAX_RANGE - FLASH_FULL_RANGE);
  const dot = d > 1e-3 ? (forward.x * dx + forward.y * dy + forward.z * dz) / d : 1;
  const angle = dot >= 0.6 ? 1 : dot >= -0.3 ? 0.4 + ((dot + 0.3) / 0.9) * 0.6 : 0.25;
  return distance * angle;
}

/** Blinds everyone who can see the flash (smoke blocks it), teammates and the thrower included. */
export function flashPlayers(world: CsWorld, at: Vec3): void {
  const t = world.curtime;
  world.forEachPlayer((pl) => {
    const p = pl as CsPlayer;
    if (!p.alive) return;
    p.eyePosition(flEye);
    world.traceLineWorldOnly(at, flEye, MASK_SOLID, flTr);
    if (flTr.fraction < 1) return;
    if (smokeBlocksLine(world, at, flEye)) return;
    angleVectors(p.eyeAngles, flFwd);
    const amount = flashAmount(flEye, flFwd, at);
    if (amount <= 0) return;
    const duration = FLASH_MAX_DURATION * amount;
    const remaining = p.flashAt + p.flashDuration - t;
    if (duration > remaining) {
      p.flashAt = t;
      p.flashDuration = duration;
      p.flashAlpha = Math.min(255, 255 * Math.min(1, amount * 1.5));
    }
  });
}
