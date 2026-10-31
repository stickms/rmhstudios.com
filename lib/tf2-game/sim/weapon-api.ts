/**
 * The contract between the simulation core and weapons (the SDK's
 * CTFWeaponBase / CBaseCombatWeapon, shared code that runs on the server and
 * in client prediction).
 *
 * - `Weapon` is what the player and the net layer talk to.
 * - `BaseWeapon` implements the common frame logic — attack timers, clips,
 *   the reload state machine (CTFWeaponBase::ReloadSingly), deploy/holster
 *   draw times, net state — so a concrete weapon mostly overrides
 *   `primaryAttack()` / `secondaryAttack()` and supplies stats.
 * - `registerWeapon` / `createWeapon` is the factory: real weapons register
 *   by item definition index or by classname; anything unregistered becomes
 *   a `StubWeapon` so the core runs before the arsenal exists.
 *
 * A weapon touches the world only through its owner's `world` (the
 * `WeaponHost` surface below): fireBullets, spawnProjectile, radiusDamage,
 * applyDamage, emitSound, emitEffect, traces and the shared random stream.
 */

import type { UserCmd, TraceResult, TraceFilter } from '../core/types';
import type { Vec3 } from '../core/vec';
import type { UniformRandomStream } from '../core/random';
import { IN_ATTACK, IN_ATTACK2, IN_RELOAD } from '../core/constants';
import type { NetRecord, NetSchema } from './net-schema';
import type { DamageInfo, RadiusDamageInfo } from './damage';
import type { Entity } from './entity';
import type { EffectEvent } from './events';
import type { Player } from './player';
import type { CatalogAttribute } from '../../tf2-loadout/catalog-types';
import { AttributeSet, hookPlayer, hookWeapon } from './items/attributes';

// ─── Slots and ammo ────────────────────────────────────────────────────────
/** Loadout slots (TF_WPN_TYPE_* / loadout_positions_t order). */
export const SLOT_PRIMARY = 0;
export const SLOT_SECONDARY = 1;
export const SLOT_MELEE = 2;
export const SLOT_PDA = 3;
export const SLOT_PDA2 = 4;
export const SLOT_BUILDING = 5;
export const WEAPON_SLOTS = 6;

/** TF_AMMO_* (tf_shareddefs.h). */
export const TF_AMMO_DUMMY = 0;
export const TF_AMMO_PRIMARY = 1;
export const TF_AMMO_SECONDARY = 2;
export const TF_AMMO_METAL = 3;
export const TF_AMMO_GRENADES1 = 4;
export const TF_AMMO_GRENADES2 = 5;
export const TF_AMMO_GRENADES3 = 6;
export const TF_AMMO_COUNT = 7;

/** CTFWeaponBase reload states (m_iReloadMode). */
export const TF_RELOAD_START = 0;
export const TF_RELOADING = 1;
export const TF_RELOADING_CONTINUE = 2;
export const TF_RELOAD_FINISH = 3;

/** The weapon switch draw time before any attribute (CTFWeaponBase::Deploy flWeaponSwitchTime). */
export const TF_WEAPON_SWITCH_TIME = 0.5;

// ─── World services a weapon uses ──────────────────────────────────────────

/** FX_FireBullets parameters. */
export interface FireBulletsParams {
  attacker: Player;
  weapon: Weapon | null;
  /** Eye position. */
  src: Vec3;
  /** Eye angles. */
  angles: Vec3;
  /** Cone (the weapon's "Spread"). */
  spread: number;
  bulletsPerShot: number;
  /** Damage per bullet. */
  damage: number;
  damageType: number;
  customKill: number;
  critType: 0 | 1 | 2;
  /** The command's random seed (spread is shared with client prediction). */
  seed: number;
  /** Max range (weapon "Range"), default 8192. */
  range?: number;
  /** When the weapon last fired, for the perfect-first-shot rule (m_flLastFireTime). */
  lastFireTime?: number;
  /** mult_spread_scale_first_shot (0 stock = perfectly accurate first shot). */
  firstShotSpreadScale?: number;
  /** Tracer every N bullets (0 = none). */
  tracerFreq?: number;
  /** Command tick for lag compensation (cmd.tickCount). */
  cmdTick?: number;
  /**
   * Called for each bullet that hits something damageable, after the bullet's
   * damage was added to the victim's accumulated info — the place for
   * headshots (set critType/customKill from `tr.hitGroup`).
   */
  onHit?: (victim: Entity, tr: TraceResult, info: DamageInfo) => void;
}

export interface SpawnProjectileParams {
  origin: Vec3;
  angles: Vec3;
  velocity: Vec3;
  owner: Player | Entity;
  weapon: Weapon | null;
  damage: number;
  critType: 0 | 1 | 2;
  /** Extra fields the projectile class reads (radius, fuse, etc.). */
  extra?: Readonly<Record<string, number | string | boolean>>;
}

export interface SoundOptions {
  entity?: number;
  pos?: Vec3;
  channel?: number;
  volume?: number;
  pitch?: number;
  /** Player who already played it in prediction (excluded from the broadcast). */
  predictedBy?: number;
  to?: number;
}

/** What weapons (and projectiles) may call on the world. GameWorld implements it. */
export interface WeaponHost {
  readonly curtime: number;
  readonly tickCount: number;
  /** False while a client re-simulates for prediction: no authoritative damage, no spawning. */
  readonly isServer: boolean;
  fireBullets(params: FireBulletsParams): void;
  spawnProjectile(classname: string, params: SpawnProjectileParams): Entity | null;
  radiusDamage(r: RadiusDamageInfo): void;
  applyDamage(victim: Entity, info: DamageInfo): number;
  emitSound(name: string, opts?: SoundOptions): void;
  emitEffect(effect: Omit<EffectEvent, 'type'>): void;
  traceLine(start: Vec3, end: Vec3, mask: number, filter: TraceFilter | null, out: TraceResult): TraceResult;
  traceHull(
    start: Vec3,
    end: Vec3,
    mins: Vec3,
    maxs: Vec3,
    mask: number,
    filter: TraceFilter | null,
    out: TraceResult,
  ): TraceResult;
  /** A hitscan trace that tests player hitboxes (lag-compensated when `cmdTick` is given). */
  traceAttack(attacker: Player, start: Vec3, end: Vec3, out: TraceResult, cmdTick?: number): TraceResult;
  /** A random stream seeded for this command (SharedRandomFloat). Reused: read it before the next call. */
  sharedRandom(seed: number): UniformRandomStream;
  entity(id: number): Entity | null;
}

// ─── The weapon contract ───────────────────────────────────────────────────

export interface Weapon {
  readonly classname: string;
  readonly defindex: number;
  /** SLOT_* */
  readonly slot: number;
  /** TF_WEAPON_* id (damage rules switch on it). */
  readonly weaponId: number;
  /** TF_AMMO_* the weapon draws from (TF_AMMO_DUMMY for none). */
  readonly ammoType: number;
  /** Kill-feed icon name. */
  readonly killIcon: string;
  readonly worldModel: string;
  readonly viewModel: string;
  owner: Player | null;
  /** Rounds loaded; -1 when the weapon has no clip. */
  clip: number;
  readonly maxClip: number;
  nextPrimaryAttack: number;
  nextSecondaryAttack: number;
  timeWeaponIdle: number;
  /** curtime of the last shot (m_flLastFireTime). */
  lastFireTime: number;

  /** Given to a player (GiveNamedItem / Equip). */
  equip(owner: Player): void;
  /** May the owner switch to it (CanDeploy: needs ammo for some weapons)? */
  canDeploy(): boolean;
  /** Becoming active: sets the draw delay. Returns false to refuse. */
  deploy(): boolean;
  /** May the owner switch away (CanHolster: e.g. not mid-charge)? */
  canHolster(): boolean;
  /** Switching away to `next`. Returns false to refuse. */
  holster(next: Weapon | null): boolean;
  /** Runs for the active weapon once per user command (ItemPostFrame). */
  itemPostFrame(cmd: UserCmd): void;
  /** Runs for every non-active weapon once per user command (ItemHolsterFrame). */
  itemHolsterFrame(cmd: UserCmd): void;
  /** Resupply / respawn: full clip, reset state (GiveDefaultAmmo + WeaponReset). */
  refill(): void;
  /** The owner died (DropAmmo, stop sounds). */
  onOwnerDeath(): void;
  /** Movement speed multiplier while active (GetSpeedMod). */
  speedMod(): number;
  /**
   * The looping sound the weapon's state plays on its owner while it is active ('' for none):
   * the SDK's client-side envelope sounds (C_TFMinigun::WeaponSoundUpdate, the flamethrower's
   * fire and pilot loops). It is replicated on the player record (`weaponLoop`) and every client
   * plays it from there (audio/loops.ts) — never as start/stop events, which can be lost.
   */
  loopSound?(): string;
  /** The item's attributes (sim/items), read by the attribute hooks; empty for a stock weapon. */
  readonly attributes?: AttributeSet;
  /** `provide_on_active`: provides its attributes to the owner only while it is out. */
  readonly provideOnActive?: boolean;
  /**
   * The record type the weapon writes (default NET_WEAPON). Another game's weapons carry their own
   * prediction state (lib/csgo-game: recoil index, inaccuracy, zoom) in their own schema.
   */
  netSchema?(): NetSchema;
  /** Writes the prediction state into a NET_WEAPON record (or `netSchema()`'s). */
  writeNet(out: NetRecord): void;
  /** Restores prediction state from a NET_WEAPON record (client). */
  readNet(rec: NetRecord): void;
}

/** Static numbers a weapon is built from (tf_weapon_*.txt WeaponData + item attributes). */
export interface WeaponStats {
  classname: string;
  defindex: number;
  slot: number;
  weaponId: number;
  ammoType: number;
  /** -1 for clipless weapons (minigun, flamethrower, melee). */
  maxClip: number;
  /** Ammo used per shot. */
  ammoPerShot: number;
  damage: number;
  bulletsPerShot: number;
  spread: number;
  range: number;
  /** Seconds between shots (TimeFireDelay). */
  fireDelay: number;
  /** Seconds to idle after firing. */
  timeIdle: number;
  /** Per-shell / per-clip reload (TimeReload). */
  reloadTime: number;
  /** First-shell delay for single reloads (TimeReloadStart). */
  reloadStartTime: number;
  reloadsSingly: boolean;
  damageType: number;
  killIcon: string;
  worldModel: string;
  viewModel: string;
  /** mult_deploy_time etc. folded in. */
  deployTimeMult: number;
  speedMod: number;
}

export const defaultWeaponStats = (over: Partial<WeaponStats> = {}): WeaponStats => ({
  classname: 'tf_weapon_stub',
  defindex: -1,
  slot: SLOT_PRIMARY,
  weaponId: 0,
  ammoType: TF_AMMO_DUMMY,
  maxClip: -1,
  ammoPerShot: 1,
  damage: 0,
  bulletsPerShot: 1,
  spread: 0,
  range: 8192,
  fireDelay: 0.5,
  timeIdle: 1,
  reloadTime: 1,
  reloadStartTime: 0,
  reloadsSingly: false,
  damageType: 0,
  killIcon: '',
  worldModel: '',
  viewModel: '',
  deployTimeMult: 1,
  speedMod: 1,
  ...over,
});

/**
 * The shared frame logic of CTFWeaponBase over CBaseCombatWeapon. Subclasses
 * override `primaryAttack`, optionally `secondaryAttack`, `weaponIdle`,
 * `writeNetExtra/readNetExtra` (the aux0–3 net slots) and the hooks.
 */
export abstract class BaseWeapon implements Weapon {
  readonly stats: WeaponStats;
  owner: Player | null = null;
  clip: number;
  nextPrimaryAttack = 0;
  nextSecondaryAttack = 0;
  timeWeaponIdle = 0;
  lastFireTime = 0;
  /** curtime of the last deploy (m_flLastDeployTime). */
  deployedAt = 0;
  reloadMode = TF_RELOAD_START;
  /** A full-clip reload is in progress (CBaseCombatWeapon::m_bInReload). */
  inReload = false;
  /** Shots left this volley that are crits (weapon crit buckets live in the weapons module). */
  critShots = 0;
  protected inAttack = false;
  protected inAttack2 = false;
  /** The item's attributes (set by `createWeapon` from the spec). */
  attributes: AttributeSet = AttributeSet.EMPTY;
  provideOnActive = false;

  constructor(stats: WeaponStats) {
    this.stats = stats;
    this.clip = stats.maxClip;
  }

  get classname(): string {
    return this.stats.classname;
  }
  get defindex(): number {
    return this.stats.defindex;
  }
  get slot(): number {
    return this.stats.slot;
  }
  get weaponId(): number {
    return this.stats.weaponId;
  }
  get ammoType(): number {
    return this.stats.ammoType;
  }
  get maxClip(): number {
    return this.stats.maxClip;
  }
  get killIcon(): string {
    return this.stats.killIcon;
  }
  get worldModel(): string {
    return this.stats.worldModel;
  }
  get viewModel(): string {
    return this.stats.viewModel;
  }

  protected get curtime(): number {
    return this.owner ? this.owner.world.curtime : 0;
  }

  usesClip(): boolean {
    return this.stats.maxClip >= 0;
  }

  /** Reserve ammo the owner carries for this weapon. */
  reserveAmmo(): number {
    return this.owner && this.stats.ammoType !== TF_AMMO_DUMMY ? this.owner.ammo[this.stats.ammoType] : 0;
  }

  hasAmmo(): boolean {
    if (this.stats.ammoType === TF_AMMO_DUMMY) return true;
    return (this.usesClip() && this.clip > 0) || this.reserveAmmo() > 0;
  }

  equip(owner: Player): void {
    this.owner = owner;
    this.refill();
  }

  canDeploy(): boolean {
    return true;
  }

  /**
   * SDK: CTFWeaponBase::Deploy's flDeployTimeMultiplier — this weapon's own (folded into
   * `stats.deployTimeMult`: mult_single_wep_deploy_time, a sword's 1.75), the wearer's
   * mult_deploy_time, and the weapon switched from: its mult_switch_from_wep_deploy_time once it
   * has been out longer than the switch time, and a sword's slower holster.
   */
  deployTimeMultiplier(): number {
    const o = this.owner;
    let mult = this.stats.deployTimeMult;
    if (!o) return mult;
    mult = hookPlayer(o, 'mult_deploy_time', mult);
    const last = o.lastSlot >= 0 ? o.weapons[o.lastSlot] : null;
    if (last && last !== this) {
      const lw = last as Weapon & { deployedAt?: number };
      if (this.curtime - (lw.deployedAt ?? 0) > TF_WEAPON_SWITCH_TIME) {
        mult = hookWeapon(last, null, 'mult_switch_from_wep_deploy_time', mult);
      }
      if (hookWeapon(last, null, 'is_a_sword', 0) !== 0 && this.attributes.apply('is_a_sword', 0) === 0) mult *= 1.75;
    }
    return Math.max(mult, 0.00001);
  }

  /** SDK: CTFWeaponBase::Deploy — the next attack waits for the draw. */
  deploy(): boolean {
    const t = this.curtime;
    const delay = TF_WEAPON_SWITCH_TIME * this.deployTimeMultiplier();
    this.nextPrimaryAttack = Math.max(this.nextPrimaryAttack, t + delay);
    this.nextSecondaryAttack = Math.max(this.nextSecondaryAttack, t + delay);
    this.timeWeaponIdle = t + delay;
    this.deployedAt = t;
    this.reloadMode = TF_RELOAD_START;
    this.inReload = false;
    return true;
  }

  canHolster(): boolean {
    return true;
  }

  /** SDK: CTFWeaponBase::Holster — aborts a reload. */
  holster(_next: Weapon | null): boolean {
    this.abortReload();
    return true;
  }

  abortReload(): void {
    this.inReload = false;
    this.reloadMode = TF_RELOAD_START;
  }

  refill(): void {
    this.clip = this.stats.maxClip;
    this.abortReload();
    this.nextPrimaryAttack = 0;
    this.nextSecondaryAttack = 0;
  }

  onOwnerDeath(): void {
    this.abortReload();
  }

  speedMod(): number {
    return this.stats.speedMod;
  }

  /** Fires. Implementations consume ammo (`consumeAmmo`) and set the next attack time. */
  abstract primaryAttack(cmd: UserCmd): void;

  secondaryAttack(_cmd: UserCmd): void {
    this.nextSecondaryAttack = this.curtime + 0.5;
  }

  weaponIdle(_cmd: UserCmd): void {}

  /** Uses one shot's ammo from the clip or reserve. */
  consumeAmmo(amount = this.stats.ammoPerShot): void {
    if (!this.owner || this.stats.ammoType === TF_AMMO_DUMMY) return;
    if (this.usesClip()) this.clip = Math.max(0, this.clip - amount);
    else {
      const a = this.owner.ammo;
      a[this.stats.ammoType] = Math.max(0, a[this.stats.ammoType] - amount);
    }
  }

  /** True when the weapon could shoot right now (ammo-wise). */
  canPrimaryAttack(): boolean {
    if (this.stats.ammoType === TF_AMMO_DUMMY) return true;
    return this.usesClip() ? this.clip >= this.stats.ammoPerShot : this.reserveAmmo() >= this.stats.ammoPerShot;
  }

  /**
   * SDK: CTFWeaponBase::ItemPostFrame over CBaseCombatWeapon::ItemPostFrame,
   * reduced to the stock flow: auto-reload, attack2, attack (or reload on an
   * empty clip), manual reload, idle; then the single-reload state machine.
   */
  itemPostFrame(cmd: UserCmd): void {
    const owner = this.owner;
    if (!owner) return;
    const t = this.curtime;
    let buttons = cmd.buttons;
    const needsReload = this.usesClip() && this.clip < this.stats.maxClip && this.reserveAmmo() > 0;
    if (owner.autoReload && !(buttons & (IN_ATTACK | IN_ATTACK2)) && needsReload) buttons |= IN_RELOAD;
    if (this.inAttack && !(buttons & IN_ATTACK)) this.inAttack = false;
    if (this.inAttack2 && !(buttons & IN_ATTACK2)) this.inAttack2 = false;

    // A full-clip reload finishing (CBaseCombatWeapon::ItemPostFrame m_bInReload branch).
    if (this.inReload && !this.stats.reloadsSingly && this.nextPrimaryAttack <= t) {
      this.finishReload();
      this.inReload = false;
    }

    if (buttons & IN_ATTACK2 && this.nextSecondaryAttack <= t) {
      this.secondaryAttack(cmd);
      this.inAttack2 = true;
    } else if (buttons & IN_ATTACK && this.nextPrimaryAttack <= t && !owner.cannotAttack()) {
      if (this.usesClip() && this.clip < this.stats.ammoPerShot && this.stats.ammoType !== TF_AMMO_DUMMY) {
        if (this.reserveAmmo() > 0) this.reload();
      } else if (this.canPrimaryAttack()) {
        if (this.stats.reloadsSingly) this.abortReload();
        this.primaryAttack(cmd);
        this.inAttack = true;
      }
    }

    if (buttons & IN_RELOAD && this.usesClip() && !this.inReload && !(buttons & IN_ATTACK && this.clip > 0)) {
      this.reload();
    }

    if (!(buttons & (IN_ATTACK | IN_ATTACK2 | IN_RELOAD)) && !this.inReload && this.timeWeaponIdle <= t) {
      this.weaponIdle(cmd);
    }

    if (this.stats.reloadsSingly && this.reloadMode !== TF_RELOAD_START) this.reloadSinglyFrame();
  }

  itemHolsterFrame(_cmd: UserCmd): void {}

  /** SDK: CTFWeaponBase::Reload. */
  reload(): boolean {
    if (!this.usesClip() || this.clip >= this.stats.maxClip || this.reserveAmmo() <= 0) return false;
    if (this.stats.reloadsSingly) {
      if (this.reloadMode === TF_RELOAD_START) this.reloadSinglyFrame();
      return true;
    }
    if (this.inReload) return false;
    const t = this.curtime;
    this.inReload = true;
    this.nextPrimaryAttack = t + this.stats.reloadTime;
    this.nextSecondaryAttack = t + this.stats.reloadTime;
    this.timeWeaponIdle = t + this.stats.reloadTime;
    this.onReloadStart();
    return true;
  }

  /** Moves reserve ammo into the clip (CBaseCombatWeapon::FinishReload). */
  finishReload(): void {
    if (!this.owner) return;
    const a = this.owner.ammo;
    const want = this.stats.maxClip - this.clip;
    const take = Math.min(want, a[this.stats.ammoType]);
    this.clip += take;
    a[this.stats.ammoType] -= take;
  }

  /** SDK: CTFWeaponBase::ReloadSingly — start, shell after shell, finish. */
  protected reloadSinglyFrame(): void {
    const owner = this.owner;
    if (!owner) return;
    const t = this.curtime;
    if (this.nextPrimaryAttack > t && this.reloadMode === TF_RELOAD_START) return;
    switch (this.reloadMode) {
      case TF_RELOAD_START:
        this.timeWeaponIdle = t + this.stats.reloadStartTime;
        this.reloadMode = TF_RELOADING;
        this.onReloadStart();
        return;
      case TF_RELOADING:
        if (this.timeWeaponIdle > t) return;
        this.timeWeaponIdle = t + this.stats.reloadTime;
        this.reloadMode = TF_RELOADING_CONTINUE;
        return;
      case TF_RELOADING_CONTINUE: {
        if (this.timeWeaponIdle > t) return;
        const a = owner.ammo;
        if (a[this.stats.ammoType] > 0 && this.clip < this.stats.maxClip) {
          this.clip++;
          a[this.stats.ammoType]--;
        }
        this.reloadMode =
          this.clip === this.stats.maxClip || a[this.stats.ammoType] <= 0 ? TF_RELOAD_FINISH : TF_RELOADING;
        return;
      }
      default:
        this.reloadMode = TF_RELOAD_START;
        return;
    }
  }

  /** Hook: a reload began (sounds, anim events). */
  protected onReloadStart(): void {}

  writeNet(out: NetRecord): void {
    out.defindex = this.defindex;
    out.slot = this.slot;
    out.owner = this.owner ? this.owner.id : -1;
    out.clip = this.clip;
    out.nextPrimaryAttack = this.nextPrimaryAttack;
    out.nextSecondaryAttack = this.nextSecondaryAttack;
    out.timeWeaponIdle = this.timeWeaponIdle;
    out.reloadState = this.reloadMode;
    out.inReload = this.inReload;
    out.deployedAt = this.deployedAt;
    out.critShots = this.critShots;
    out.lastFireTime = this.lastFireTime;
    out.aux0 = 0;
    out.aux1 = 0;
    out.aux2 = 0;
    out.aux3 = 0;
    this.writeNetExtra(out);
  }

  readNet(rec: NetRecord): void {
    this.clip = rec.clip as number;
    this.nextPrimaryAttack = rec.nextPrimaryAttack as number;
    this.nextSecondaryAttack = rec.nextSecondaryAttack as number;
    this.timeWeaponIdle = rec.timeWeaponIdle as number;
    this.reloadMode = rec.reloadState as number;
    this.inReload = rec.inReload as boolean;
    this.deployedAt = rec.deployedAt as number;
    this.critShots = rec.critShots as number;
    this.lastFireTime = rec.lastFireTime as number;
    this.readNetExtra(rec);
  }

  /** Weapon-specific prediction state into aux0–aux3. */
  protected writeNetExtra(_out: NetRecord): void {}
  protected readNetExtra(_rec: NetRecord): void {}
}

/**
 * A placeholder weapon: keeps the item's identity (defindex, slot, model) and
 * fires a plain hitscan bullet using its stats (0 damage unless given), so the
 * core, bots and the net layer run before the real weapon module registers.
 */
export class StubWeapon extends BaseWeapon {
  primaryAttack(cmd: UserCmd): void {
    const owner = this.owner;
    if (!owner) return;
    const t = this.curtime;
    this.consumeAmmo();
    if (this.stats.damage > 0) {
      const src = owner.eyePosition({ x: 0, y: 0, z: 0 });
      owner.world.fireBullets({
        attacker: owner,
        weapon: this,
        src,
        angles: owner.eyeAngles,
        spread: this.stats.spread,
        bulletsPerShot: this.stats.bulletsPerShot,
        damage: this.stats.damage,
        damageType: this.stats.damageType,
        customKill: 0,
        critType: 0,
        seed: cmd.randomSeed,
        range: this.stats.range,
        lastFireTime: this.lastFireTime,
        tracerFreq: 2,
        cmdTick: cmd.tickCount,
      });
    }
    this.lastFireTime = t;
    this.nextPrimaryAttack = t + this.stats.fireDelay;
    this.timeWeaponIdle = t + this.stats.timeIdle;
  }
}

// ─── Factory registry ──────────────────────────────────────────────────────

/** What the factory knows about an item when building a weapon. */
export interface WeaponSpec {
  defindex: number;
  classname: string;
  slot: number;
  /** Stats overrides: a StubWeapon's numbers, or an item's attributes folded into the script's. */
  stats?: Partial<WeaponStats>;
  /** The item's attributes (`[class, value, op]`), for every hook not folded into `stats`. */
  attributes?: readonly CatalogAttribute[];
}

export type WeaponFactory = (spec: WeaponSpec) => Weapon;

const byDefindex = new Map<number, WeaponFactory>();
const byClassname = new Map<string, WeaponFactory>();
/** Optional resolver from a defindex to its spec (installed by the data/items layer). */
let specResolver: ((key: number | string) => WeaponSpec | null) | null = null;

/** Registers a factory for an item definition index or a weapon classname. */
export function registerWeapon(key: number | string, factory: WeaponFactory): void {
  if (typeof key === 'number') byDefindex.set(key, factory);
  else byClassname.set(key.toLowerCase(), factory);
}

/** Installs the lookup used when `createWeapon` is given a bare defindex/classname. */
export function setWeaponSpecResolver(fn: ((key: number | string) => WeaponSpec | null) | null): void {
  specResolver = fn;
}

/**
 * Builds a weapon for an item: the defindex factory wins, then the
 * classname factory, then a StubWeapon carrying the item's identity.
 */
export function createWeapon(key: number | string | WeaponSpec): Weapon | null {
  let spec: WeaponSpec | null;
  if (typeof key === 'object') spec = key;
  else spec = specResolver ? specResolver(key) : null;
  if (!spec) {
    if (typeof key === 'number') return null;
    spec = { defindex: -1, classname: String(key).toLowerCase(), slot: SLOT_PRIMARY };
  }
  const f = byDefindex.get(spec.defindex) ?? byClassname.get(spec.classname.toLowerCase());
  const w =
    f?.(spec) ??
    new StubWeapon(
      defaultWeaponStats({ classname: spec.classname, defindex: spec.defindex, slot: spec.slot, ...spec.stats }),
    );
  if (spec.attributes?.length && w instanceof BaseWeapon) {
    w.attributes = new AttributeSet(spec.attributes);
    w.provideOnActive = w.attributes.apply('provide_on_active', 0) === 1;
  }
  return w;
}

/** Test helper: forget every registration. */
export function clearWeaponRegistry(): void {
  byDefindex.clear();
  byClassname.clear();
  specResolver = null;
}
