/**
 * The Soldier's banners and the B.A.S.E. Jumper (tf_weapon_buff_item.cpp, tf_weapon_parachute.cpp):
 * CTFBuffItem — the Buff Banner, the Battalion's Backup, the Concheror (set_buff_type 1 / 2 / 3) —
 * and CTFParachute, a buff item that is never drawn (the parachute is movement's, through
 * parachute_attribute).
 *
 * Rage (meters[1]) fills from damage (HandleRageGain, effects.ts). With a full meter +attack plays the
 * horn (ACT_VM_SECONDARYATTACK, the sound 0.22 s in) and, when the horn sequence ends (bb_fire_blue,
 * 2.67 s), raises the flag (RaiseFlag → ActivateRageBuff: ten 1-second pulses of the buff condition
 * on teammates within 450 units as the meter drains) and switches back to the last weapon. It
 * cannot be put away mid-horn.
 *
 * Environment-agnostic.
 */

import { TF_TEAM_BLUE } from '../../core/constants';
import type { UserCmd } from '../../core/types';
import { hookInt, hookWeapon } from '../items/attributes';
import { activateRageBuff } from '../items/effects';
import type { NetRecord } from '../net-schema';
import { PLAYERANIMEVENT_ATTACK_SECONDARY } from '../player';
import type { WeaponSpec } from '../weapon-api';
import { ACT } from './constants';
import { TFWeaponMelee } from './melee';
import { num } from './tf-weapon';

/** EBuffType (tf_weapon_buff_item.h). */
export const BUFF = { BUFF_BANNER: 1, BATTALION: 2, CONCHEROR: 3, PARACHUTE: 4 } as const;
/** CTFBuffItem::PrimaryAttack: BlowHorn's delay. */
export const BUFF_HORN_DELAY = 0.22;
/** The horn sequence (c_soldier_animations.mdl bb_fire_blue, 80 frames at 30 fps): RaiseFlag at its end. */
export const BUFF_HORN_SEQUENCE = 80 / 30;

/** CTFBuffItem. */
export class BuffItem extends TFWeaponMelee {
  /** m_bPlayingHorn. */
  playingHorn = false;
  /** The BlowHorn think and the end of the horn sequence (RaiseFlag). */
  hornTime = 0;
  raiseTime = 0;

  constructor(spec: WeaponSpec) {
    super(spec);
  }

  /** CTFBuffItem::GetBuffType (set_buff_type). */
  buffType(): number {
    return hookInt(hookWeapon(this, this.owner, 'set_buff_type', 0));
  }

  /** SDK: CTFBuffItem::PrimaryAttack. */
  override primaryAttack(_cmd: UserCmd): void {
    const o = this.owner;
    if (!o || !this.canAttack()) return;
    if (o.meters[1] < 100 || this.playingHorn) return;
    o.doAnimationEvent(PLAYERANIMEVENT_ATTACK_SECONDARY);
    this.sendWeaponAnim(ACT.VM_SECONDARYATTACK);
    this.playingHorn = true;
    this.hornTime = this.t + BUFF_HORN_DELAY;
    this.raiseTime = this.t + BUFF_HORN_SEQUENCE;
  }

  /** The class skill on +attack2, as any melee weapon. */
  override secondaryAttack(cmd: UserCmd): void {
    super.secondaryAttack(cmd);
  }

  /** SDK: CTFBuffItem::BlowHorn. */
  blowHorn(): void {
    this.hornTime = 0;
    const o = this.owner;
    if (!o || !o.alive) return;
    const blue = o.team === TF_TEAM_BLUE;
    const type = this.buffType();
    const sound =
      type === BUFF.CONCHEROR
        ? 'Samurai.Conch'
        : type === BUFF.BUFF_BANNER
          ? blue
            ? 'Weapon_BuffBanner.HornBlue'
            : 'Weapon_BuffBanner.HornRed'
          : type === BUFF.BATTALION
            ? blue
              ? 'Weapon_BattalionsBackup.HornBlue'
              : 'Weapon_BattalionsBackup.HornRed'
            : '';
    if (sound) o.world.emitSound(sound, { entity: o.id, predictedBy: o.isBot ? undefined : o.id });
  }

  /** SDK: CTFBuffItem::RaiseFlag. */
  raiseFlag(): void {
    this.raiseTime = 0;
    const o = this.owner;
    if (!o || !o.alive) return;
    this.playingHorn = false;
    o.world.emitSound('Weapon_BuffBanner.Flag', { entity: o.id });
    activateRageBuff(o, this.buffType());
    // SelectLastItem.
    if (o.lastSlot >= 0 && o.weapons[o.lastSlot]) o.switchToSlot(o.lastSlot);
  }

  override itemPostFrame(cmd: UserCmd): void {
    if (this.hornTime > 0 && this.t >= this.hornTime) this.blowHorn();
    if (this.raiseTime > 0 && this.t >= this.raiseTime) {
      this.raiseFlag();
      return;
    }
    super.itemPostFrame(cmd);
  }

  /** SDK: CTFBuffItem::Holster — not while the horn plays. */
  override canHolster(): boolean {
    return !this.playingHorn && super.canHolster();
  }

  /** CTFBuffItem::CanReload. */
  override reload(): boolean {
    return false;
  }

  /** SDK: CTFBuffItem::WeaponReset. */
  override refill(): void {
    super.refill();
    this.playingHorn = false;
    this.hornTime = 0;
    this.raiseTime = 0;
  }

  protected override writeWeaponNet(out: NetRecord): void {
    super.writeWeaponNet(out);
    out.aux2 = this.hornTime;
    out.aux3 = this.raiseTime;
  }

  protected override readWeaponNet(rec: NetRecord): void {
    super.readWeaponNet(rec);
    this.hornTime = num(rec.aux2);
    this.raiseTime = num(rec.aux3);
    this.playingHorn = this.raiseTime > 0;
  }
}

/** CTFParachute: never drawn; its attributes (parachute_attribute) are the movement's. */
export class Parachute extends BuffItem {
  override canDeploy(): boolean {
    return false;
  }
}
