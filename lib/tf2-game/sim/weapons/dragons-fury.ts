/**
 * The Dragon's Fury (CTFWeaponFlameBall over CTFFlameThrower, tf_weapon_dragons_fury.cpp).
 *
 * Its primary item meter (the pressure needle: item_meter_charge_rate seconds to fill, × the
 * recharge scale) must be full to fire: +attack fires a fireball (projectiles/fireball.ts) from the
 * shoot position + (3 forward, 7 right, 9 down) aimed at the point 500 ahead, and empties it. A
 * fireball that burns someone refills it 1.5× as fast (RefundAmmo); +attack2 (also only at full
 * pressure, and first) is the flamethrower's airblast at mult_airblast_cost, and refills it at half
 * speed. It does not fire under water.
 *
 * Environment-agnostic.
 */

import { IN_ATTACK, IN_ATTACK2, WL_EYES } from '../../core/constants';
import { type UserCmd } from '../../core/types';
import { FLAMETHROWER } from '../../data/weapons';
import { angleVectors, set, vec3 } from '../../core/vec';
import { hookInt, hookWeapon } from '../items/attributes';
import { onAttack } from '../items/effects';
import type { NetRecord } from '../net-schema';
import { PLAYERANIMEVENT_ATTACK_PRIMARY } from '../player';
import type { WeaponSpec } from '../weapon-api';
import { ACT } from './constants';
import { Flamethrower } from './flamethrower';
import { removeDisguise, removeInvisibility } from './spy-state';
import { num } from './tf-weapon';

/** tf_fireball_airblast_recharge_penalty / tf_fireball_hit_recharge_boost. */
export const FIREBALL_AIRBLAST_RECHARGE_PENALTY = 0.5;
export const FIREBALL_HIT_RECHARGE_BOOST = 1.5;
/** FireProjectile: the launch speed before the ball sets its own (3000). */
const FIREBALL_LAUNCH_SPEED = 600;
const FIREBALL_AIM_DISTANCE = 500;

const fbFwd = vec3();
const fbRight = vec3();
const fbUp = vec3();
const fbEye = vec3();
const fbSrc = vec3();
const fbVel = vec3();

/** CTFWeaponFlameBall. */
export class DragonsFury extends Flamethrower {
  /** The primary item charge meter (m_flItemChargeMeter[ LOADOUT_POSITION_PRIMARY ]), 0…100. */
  pressure = 100;
  /** m_flRechargeScale (GetMeterMultiplier). */
  rechargeScale = 1;

  constructor(spec: WeaponSpec) {
    super(spec);
  }

  /** SDK: CTFWeaponFlameBall::HasFullCharge. */
  hasFullCharge(): boolean {
    return this.pressure >= 100;
  }

  /** CTFPlayerShared::UpdateItemChargeMeters for the primary slot (item_meter_charge_type 1). */
  private updatePressure(): void {
    const o = this.owner;
    if (!o || this.pressure >= 100) return;
    const rate = hookWeapon(this, o, 'item_meter_charge_rate', 0);
    if (rate <= 0 || hookInt(hookWeapon(this, o, 'item_meter_charge_type', 0)) === 0) return;
    this.pressure = Math.min(
      100,
      this.pressure + (o.world.frametime * 100 * this.rechargeScale) / rate,
    );
    if (this.pressure >= 100) {
      // OnResourceMeterFilled.
      this.rechargeScale = 1;
      o.world.emitSound('Weapon_DragonsFury.PressureBuildStop', { entity: o.id });
    }
  }

  /** SDK: CTFWeaponFlameBall::RefundAmmo — a hit repressurises faster. */
  refundAmmo(): void {
    if (this.hasFullCharge()) return;
    this.rechargeScale = FIREBALL_HIT_RECHARGE_BOOST;
  }

  /** SDK: CTFWeaponFlameBall::ItemPostFrame — the airblast first, then the fireball. */
  override tfItemPostFrame(cmd: UserCmd): void {
    const o = this.owner;
    if (!o) return;
    let fired = false;
    if (cmd.buttons & IN_ATTACK2 && this.canAttack()) {
      this.secondaryAttack(cmd);
      fired = true;
    }
    if (!fired && cmd.buttons & IN_ATTACK && this.nextPrimaryAttack <= this.t) {
      if (o.move.waterLevel === WL_EYES) {
        this.weaponSound('empty');
        this.nextPrimaryAttack = this.t + 0.2;
        return;
      }
      this.primaryAttack(cmd);
      fired = true;
    }
    if (!fired) this.weaponIdle(cmd);
  }

  override itemPostFrame(cmd: UserCmd): void {
    super.itemPostFrame(cmd);
    this.updatePressure();
  }

  override itemHolsterFrame(cmd: UserCmd): void {
    super.itemHolsterFrame(cmd);
    this.updatePressure();
  }

  /** SDK: CTFWeaponFlameBall::PrimaryAttack. */
  override primaryAttack(cmd: UserCmd): void {
    const o = this.owner;
    if (!o || !this.hasFullCharge()) return;
    if (this.reserve() <= 0 || !this.canAttack()) return;
    removeInvisibility(o);
    this.calcIsAttackCritical(cmd);
    this.sendWeaponAnim(ACT.VM_PRIMARYATTACK);
    o.doAnimationEvent(PLAYERANIMEVENT_ATTACK_PRIMARY);
    this.fireFireball();
    if (this.shouldRemoveDisguiseOnPrimaryAttack()) removeDisguise(o);
    onAttack(o);
    // The needle is the refire (no m_flNextPrimaryAttack).
    this.pressure = 0;
    o.world.emitSound('Weapon_DragonsFury.PressureBuild', { entity: o.id });
  }

  /** SDK: CTFWeaponFlameBall::FireProjectile. */
  fireFireball(): void {
    const o = this.owner!;
    o.move.punchAngle.x -= this.script.primary.punchAngle;
    this.lastFireTime = this.t;
    this.consumeAmmo(this.stats.ammoPerShot);
    const w = o.world;
    const crit = o.cond.critBoosted;
    w.emitSound(crit ? 'Weapon_DragonsFury.SingleCrit' : 'Weapon_DragonsFury.Single', {
      entity: o.id,
      predictedBy: o.isBot ? undefined : o.id,
    });
    if (!w.isServer) return;
    angleVectors(o.eyeAngles, fbFwd, fbRight, fbUp);
    o.eyePosition(fbEye);
    set(
      fbSrc,
      fbEye.x - fbUp.x * 9 + fbRight.x * 7 + fbFwd.x * 3,
      fbEye.y - fbUp.y * 9 + fbRight.y * 7 + fbFwd.y * 3,
      fbEye.z - fbUp.z * 9 + fbRight.z * 7 + fbFwd.z * 3,
    );
    set(
      fbVel,
      fbEye.x + fbFwd.x * FIREBALL_AIM_DISTANCE - fbSrc.x,
      fbEye.y + fbFwd.y * FIREBALL_AIM_DISTANCE - fbSrc.y,
      fbEye.z + fbFwd.z * FIREBALL_AIM_DISTANCE - fbSrc.z,
    );
    const len = Math.hypot(fbVel.x, fbVel.y, fbVel.z) || 1;
    set(
      fbVel,
      (fbVel.x / len) * FIREBALL_LAUNCH_SPEED,
      (fbVel.y / len) * FIREBALL_LAUNCH_SPEED,
      (fbVel.z / len) * FIREBALL_LAUNCH_SPEED,
    );
    this.doFireEffects();
    w.spawnProjectile('tf_projectile_balloffire', {
      origin: fbSrc,
      angles: o.eyeAngles,
      velocity: fbVel,
      owner: o,
      weapon: this,
      damage: 20,
      critType: crit ? 2 : 0,
    });
  }

  /** SDK: CTFWeaponFlameBall::SecondaryAttack — the airblast, from full pressure only. */
  override secondaryAttack(cmd: UserCmd): void {
    const o = this.owner;
    if (!o || !this.hasFullCharge()) return;
    const cost = Math.trunc(
      FLAMETHROWER.airblastCost * hookWeapon(this, o, 'mult_airblast_cost', 1),
    );
    if (this.reserve() < cost) return;
    const before = this.nextSecondaryAttack;
    super.secondaryAttack(cmd);
    if (this.nextSecondaryAttack === before) return;
    this.rechargeScale = FIREBALL_AIRBLAST_RECHARGE_PENALTY;
    this.pressure = 0;
    o.world.emitSound('Weapon_DragonsFury.PressureBuild', { entity: o.id });
  }

  override refill(): void {
    super.refill();
    this.pressure = 100;
    this.rechargeScale = 1;
  }

  protected override writeWeaponNet(out: NetRecord): void {
    super.writeWeaponNet(out);
    out.aux1 = this.pressure;
    out.aux2 = this.rechargeScale;
  }

  protected override readWeaponNet(rec: NetRecord): void {
    super.readWeaponNet(rec);
    this.pressure = num(rec.aux1);
    this.rechargeScale = num(rec.aux2);
  }
}
