/**
 * The CS:GO weapon base: one data-driven class family (not a class per gun) behind the shared
 * engine's `Weapon` contract (lib/tf2-game/sim/weapon-api.ts), so the shared player, world, snapshot
 * capture and prediction carry it unchanged. A weapon's numbers are its `CsWeaponInfo` (the
 * items_game data); its state is what a predicting client needs (NET_CS_WEAPON).
 *
 * CS weapons keep their own reserve ammo (CS:GO's per-weapon `primary reserve ammo max`), so the
 * shared player's TF ammo pools are never touched (ammoType TF_AMMO_DUMMY).
 */

import type { UserCmd } from '../../tf2-game/core/types';
import { TF_AMMO_DUMMY, type Weapon } from '../../tf2-game/sim/weapon-api';
import type { NetRecord, NetSchema } from '../../tf2-game/sim/net-schema';
import type { Player } from '../../tf2-game/sim/player';
import { CHAN_WEAPON } from '../../tf2-game/sim/events';
import type { CsWeaponInfo } from '../data/weapon-data';
import { NET_CS_WEAPON } from '../net-schema';
import type { CsPlayer } from '../player';
import type { CsWorld } from '../world';

/** View-model activities the renderer plays (names in VM_ACTIVITIES). */
export const VM_IDLE = 0;
export const VM_DRAW = 1;
export const VM_FIRE = 2;
export const VM_RELOAD = 3;
export const VM_SECONDARY = 4;
export const VM_PULLPIN = 5;
export const VM_THROW = 6;
export const VM_ACTIVITIES = [
  'ACT_VM_IDLE',
  'ACT_VM_DRAW',
  'ACT_VM_PRIMARYATTACK',
  'ACT_VM_RELOAD',
  'ACT_VM_SECONDARYATTACK',
  'ACT_VM_PULLPIN',
  'ACT_VM_THROW',
] as const;

/** Reload states (shell-by-shell shotguns). */
export const RELOAD_IDLE = 0;
export const RELOAD_START = 1;
export const RELOAD_SHELLS = 2;

export abstract class CsWeapon implements Weapon {
  info: CsWeaponInfo;
  owner: Player | null = null;
  clip: number;
  reserve: number;
  nextPrimaryAttack = 0;
  nextSecondaryAttack = 0;
  timeWeaponIdle = 0;
  lastFireTime = -1000;
  deployedAt = 0;
  inReload = false;
  reloadMode = RELOAD_IDLE;
  /** Shots fired in the current spray (indexes the recoil pattern). */
  recoilIndex = 0;
  /** Accumulated fire / landing inaccuracy (thousandths of a radian). */
  accuracyPenalty = 0;
  /** 0 = unscoped, 1…zoomLevels. */
  zoomLevel = 0;
  zoomChangedAt = -1000;
  /** A bolt-action sniper rescopes to this level after its cycle (0 = none). */
  resumeZoom = 0;
  /** Knife: the next slash is the follow-up. Burst/semi-auto: the trigger is held from the last shot. */
  swing = 0;
  fired = false;
  vmActivity = VM_IDLE;
  vmActivitySeq = 0;

  constructor(info: CsWeaponInfo) {
    this.info = info;
    this.clip = info.clipSize;
    this.reserve = info.reserveMax;
  }

  get classname(): string {
    return this.info.name;
  }
  get defindex(): number {
    return this.info.defindex;
  }
  get slot(): number {
    return this.info.slot;
  }
  get weaponId(): number {
    return this.info.defindex;
  }
  get ammoType(): number {
    return TF_AMMO_DUMMY;
  }
  get killIcon(): string {
    return this.info.short;
  }
  get worldModel(): string {
    return this.info.worldModel;
  }
  get viewModel(): string {
    return this.info.viewModel;
  }
  get maxClip(): number {
    return this.info.clipSize;
  }

  protected get cs(): CsPlayer {
    return this.owner as CsPlayer;
  }

  protected get world(): CsWorld {
    return this.owner!.world as CsWorld;
  }

  protected get curtime(): number {
    return this.owner ? this.owner.world.curtime : 0;
  }

  /** The player's max speed with this weapon out (`max player speed`, `… alt` scoped). */
  maxSpeed(): number {
    return this.zoomLevel > 0 ? this.info.maxSpeedAlt : this.info.maxSpeed;
  }

  equip(owner: Player): void {
    this.owner = owner;
  }

  /** A fresh weapon: full clip and reserve (a purchase, the default pistol). */
  fill(): void {
    this.clip = this.info.clipSize;
    this.reserve = this.info.reserveMax;
  }

  canDeploy(): boolean {
    return true;
  }

  deploy(): boolean {
    const t = this.curtime;
    this.nextPrimaryAttack = Math.max(this.nextPrimaryAttack, t + this.info.deployTime);
    this.nextSecondaryAttack = Math.max(this.nextSecondaryAttack, t + this.info.deployTime);
    this.timeWeaponIdle = t + this.info.deployTime;
    this.deployedAt = t;
    this.inReload = false;
    this.reloadMode = RELOAD_IDLE;
    this.zoomLevel = 0;
    this.resumeZoom = 0;
    this.fired = false;
    this.setActivity(VM_DRAW);
    return true;
  }

  canHolster(): boolean {
    return true;
  }

  holster(_next: Weapon | null): boolean {
    this.inReload = false;
    this.reloadMode = RELOAD_IDLE;
    this.zoomLevel = 0;
    this.resumeZoom = 0;
    return true;
  }

  abstract itemPostFrame(cmd: UserCmd): void;

  itemHolsterFrame(_cmd: UserCmd): void {}

  /** Respawning keeps a CS weapon as it was (survivors keep their guns and ammo). */
  refill(): void {}

  onOwnerDeath(): void {
    this.inReload = false;
    this.reloadMode = RELOAD_IDLE;
    this.zoomLevel = 0;
    this.resumeZoom = 0;
  }

  speedMod(): number {
    return 1;
  }

  protected setActivity(act: number): void {
    this.vmActivity = act;
    this.vmActivitySeq = (this.vmActivitySeq + 1) & 255;
  }

  /** A weapon sound, already played by the owner's prediction (so not sent back to them). */
  protected sound(name: string): void {
    const o = this.owner;
    if (!o || !name || !o.world.isServer) return;
    o.world.emitSound(name, {
      entity: o.id,
      channel: CHAN_WEAPON,
      predictedBy: o.isBot ? undefined : o.id,
    });
  }

  netSchema(): NetSchema {
    return NET_CS_WEAPON;
  }

  writeNet(out: NetRecord): void {
    out.defindex = this.defindex;
    out.slot = this.slot;
    out.owner = this.owner ? this.owner.id : -1;
    out.clip = this.clip;
    out.reserve = this.reserve;
    out.nextPrimaryAttack = this.nextPrimaryAttack;
    out.nextSecondaryAttack = this.nextSecondaryAttack;
    out.timeWeaponIdle = this.timeWeaponIdle;
    out.inReload = this.inReload;
    out.reloadMode = this.reloadMode;
    out.deployedAt = this.deployedAt;
    out.lastFireTime = this.lastFireTime;
    out.recoilIndex = this.recoilIndex;
    out.accuracyPenalty = this.accuracyPenalty;
    out.zoomLevel = this.zoomLevel;
    out.zoomChangedAt = this.zoomChangedAt;
    out.resumeZoom = this.resumeZoom;
    out.swing = this.swing;
    out.fired = this.fired;
    out.vmActivity = this.vmActivity;
    out.vmActivitySeq = this.vmActivitySeq;
    this.writeNetExtra(out);
  }

  readNet(rec: NetRecord): void {
    this.clip = rec.clip as number;
    this.reserve = rec.reserve as number;
    this.nextPrimaryAttack = rec.nextPrimaryAttack as number;
    this.nextSecondaryAttack = rec.nextSecondaryAttack as number;
    this.timeWeaponIdle = rec.timeWeaponIdle as number;
    this.inReload = rec.inReload as boolean;
    this.reloadMode = rec.reloadMode as number;
    this.deployedAt = rec.deployedAt as number;
    this.lastFireTime = rec.lastFireTime as number;
    this.recoilIndex = rec.recoilIndex as number;
    this.accuracyPenalty = rec.accuracyPenalty as number;
    this.zoomLevel = rec.zoomLevel as number;
    this.zoomChangedAt = rec.zoomChangedAt as number;
    this.resumeZoom = rec.resumeZoom as number;
    this.swing = rec.swing as number;
    this.fired = rec.fired as boolean;
    this.vmActivity = rec.vmActivity as number;
    this.vmActivitySeq = rec.vmActivitySeq as number;
    this.readNetExtra(rec);
  }

  /** Subclass state beyond the common block (the grenade pouch's counts). */
  protected writeNetExtra(_out: NetRecord): void {}
  protected readNetExtra(_rec: NetRecord): void {}
}
