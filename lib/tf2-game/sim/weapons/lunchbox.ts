/**
 * Lunch boxes (tf_weapon_lunchbox.cpp): the Heavy's food (CTFLunchBox — the Sandvich, the
 * Dalokohs Bar / Fishcake, the Buffalo Steak Sandvich, the Second Banana) and the Scout's drinks
 * (CTFLunchBox_Drink — Bonk! Atomic Punch, Crit-a-Cola).
 *
 * +attack taunts (CTFPlayer::Taunt): the eater stands still for the eating / drinking scene and
 * OnAddTaunting drains one (DrainAmmo — a Heavy at full health keeps a plain Sandvich). The taunt
 * attack (DoTauntAttack) fires 1 s in for the Heavy and then every second while the taunt lasts
 * (TAUNTATK_HEAVY_EAT → ApplyBiteEffects: 75 health a bite, the bar 25 above max for 30 s with
 * +50 max health, the steak's 16 s of TF_COND_ENERGY_BUFF locked to melee; × lunchbox_healing_scale),
 * and 0.9 s in for the Scout (TAUNTATK_SCOUT_DRINK: TF_COND_PHASE, or TF_COND_ENERGY_BUFF for
 * Crit-a-Cola, for 100 / tf_scout_energydrink_consume_rate + 1 s; the drink meter drains them).
 * +attack2 (the Heavy's food only) throws it as a medium health kit (the bar, the banana and the
 * fishcake a small one) that its owner may pick back up after 0.3 s to get it back.
 *
 * The Heavy's food recharges by the item charge meter (item_meter_charge_rate, effects.ts); the
 * Scout's drinks by the effect bar (30 s).
 *
 * The taunt lengths are the scenes' (scenes.image: player/heavy/low/taunt04.vcd 4.033 s,
 * player/scout/low/taunt04_v1.vcd 0.968 s), with their sounds (Heavy.SandwichEat, and the drink
 * sequence's Scout.DodgeCanDrinkFast).
 *
 * Environment-agnostic.
 */

import {
  MOVETYPE_FLYGRAVITY,
  TF_CLASS_HEAVYWEAPONS,
  TF_CLASS_SCOUT,
  TF_TEAM_RED,
} from '../../core/constants';
import { NO_ENTITY, type UserCmd } from '../../core/types';
import { angleVectors, set, vec3 } from '../../core/vec';
import { TF_COND } from '../conditions';
import { DMG_IGNORE_MAXHEALTH } from '../damage';
import { hookInt, hookWeapon } from '../items/attributes';
import {
  ENERGY_DRINK_CONSUME_RATE,
  isControlStunned,
  setTemporaryMaxHealthBonus,
} from '../items/effects';
import type { NetRecord } from '../net-schema';
import { HealthKit, SF_NORESPAWN } from '../pickups';
import { registerEntityClass } from '../entity-registry';
import { MOVECOLLIDE_FLY_BOUNCE } from '../entity';
import type { Player } from '../player';
import { TF_AMMO_PRIMARY, type WeaponSpec } from '../weapon-api';
import { switchToNextBest } from './bow';
import { ACT } from './constants';
import { num, TFWeapon } from './tf-weapon';

/** ELunchboxType (tf_weapon_lunchbox.h), the item's set_weapon_mode. */
export const LUNCHBOX = {
  STANDARD: 0,
  CHOCOLATE_BAR: 1,
  ADDS_MINICRITS: 2,
  STANDARD_ROBO: 3,
  STANDARD_FESTIVE: 4,
  ADDS_AMMO: 5,
  BANANA: 6,
  FISHCAKE: 7,
} as const;

/** TF_SANDWICH_REGENTIME: the drinks' effect bar. */
export const TF_SANDWICH_REGENTIME = 30;
/** The eating and drinking taunt scenes' lengths (taunt04 .vcd durations). */
export const HEAVY_EAT_TAUNT_TIME = 4.033;
export const SCOUT_DRINK_TAUNT_TIME = 0.968;
/** DoTauntAttack timing: the first bite / the sip. */
export const HEAVY_BITE_INTERVAL = 1;
export const SCOUT_DRINK_DELAY = 0.9;
/** ApplyBiteEffects. */
export const LUNCHBOX_BITE_HEAL = 75;
export const CHOCOLATE_BITE_HEAL = 25;
export const DALOKOHS_MAXHEALTH_BUFF = 50;
export const DALOKOHS_BUFF_TIME = 30;
export const STEAK_DURATION = 16;
/** SecondaryAttack: thrown at 500 u/s, 10° above the aim, from 8 below the eye; its owner waits 0.3 s. */
export const LUNCHBOX_THROW_SPEED = 500;
export const LUNCHBOX_OWNER_PICKUP_DELAY = 0.3;
/** CItem::DropSingleInstance's lifetime of a dropped item. */
export const LUNCHBOX_DROP_LIFETIME = 30;

const DROP_MODELS: Readonly<Record<number, string>> = {
  [LUNCHBOX.ADDS_MINICRITS]:
    'models/workshop/weapons/c_models/c_buffalo_steak/plate_buffalo_steak.mdl',
  [LUNCHBOX.STANDARD_ROBO]: 'models/items/plate_robo_sandwich.mdl',
  [LUNCHBOX.STANDARD_FESTIVE]: 'models/items/plate_sandwich_xmas.mdl',
  [LUNCHBOX.CHOCOLATE_BAR]: 'models/workshop/weapons/c_models/c_chocolate/plate_chocolate.mdl',
  [LUNCHBOX.BANANA]: 'models/items/banana/plate_banana.mdl',
  [LUNCHBOX.FISHCAKE]: 'models/workshop/weapons/c_models/c_fishcake/plate_fishcake.mdl',
};
const LUNCHBOX_DROP_MODEL = 'models/items/plate.mdl';

const throwFwd = vec3();
const throwAngles = vec3();
const throwSrc = vec3();

/** CTFLunchBox. */
export class Lunchbox extends TFWeapon {
  /** m_bBroken: bitten (the view model's bodygroup). */
  broken = false;
  /** The taunt this lunchbox started: its end (m_flTauntRemoveTime) and next taunt attack. */
  tauntRemoveTime = 0;
  tauntAttackTime = 0;
  /** m_hThrownPowerup. */
  thrownKit = NO_ENTITY;

  constructor(spec: WeaponSpec) {
    super(spec);
  }

  /** SDK: CTFLunchBox::GetLunchboxType (set_weapon_mode). */
  lunchboxType(): number {
    return hookInt(hookWeapon(this, this.owner, 'set_weapon_mode', 0));
  }

  get isDrink(): boolean {
    return false;
  }

  /** CBaseCombatWeapon::CanBeSelected → HasAmmo. */
  override canDeploy(): boolean {
    return this.reserveAmmo() > 0;
  }

  /** SDK: CTFLunchBox::DropAllowed. */
  dropAllowed(): boolean {
    const o = this.owner;
    return !this.isDrink && !(o && o.cond.has(TF_COND.TAUNTING));
  }

  /** SDK: CTFPlayer::Taunt's lunchbox checks (CTFPlayer::IsAllowedToTaunt). */
  canTaunt(o: Player): boolean {
    if (o.cond.has(TF_COND.TAUNTING) || o.cond.has(TF_COND.STUNNED)) return false;
    if (o.playerClass === TF_CLASS_SCOUT) {
      if (o.cond.has(TF_COND.ENERGY_BUFF) || o.cond.has(TF_COND.PHASE)) return false;
      if (o.meters[2] < 100) return false;
      // The phase drink cannot be drunk carrying the flag.
      const type = this.lunchboxType();
      if (
        (type === LUNCHBOX.STANDARD || type === LUNCHBOX.STANDARD_ROBO) &&
        o.carriedFlag !== NO_ENTITY
      )
        return false;
    }
    return true;
  }

  /** SDK: CTFLunchBox::PrimaryAttack → CTFPlayer::Taunt. */
  override primaryAttack(_cmd: UserCmd): void {
    const o = this.owner;
    if (!o || this.reserveAmmo() <= 0) return;
    if (this.nextPrimaryAttack > this.t) return;
    if (!this.canTaunt(o)) return;
    const t = this.t;
    const scout = o.playerClass === TF_CLASS_SCOUT;
    const duration = scout ? SCOUT_DRINK_TAUNT_TIME : HEAVY_EAT_TAUNT_TIME;
    o.cond.add(TF_COND.TAUNTING, duration);
    set(o.velocity, 0, 0, 0);
    set(o.move.velocity, 0, 0, 0);
    this.tauntRemoveTime = t + duration;
    this.tauntAttackTime = t + (scout ? SCOUT_DRINK_DELAY : HEAVY_BITE_INTERVAL);
    this.nextPrimaryAttack = this.tauntRemoveTime + 0.1;
    this.sendWeaponAnim(ACT.VM_PRIMARYATTACK);
    o.world.emitSound(scout ? 'Scout.DodgeCanDrinkFast' : 'Heavy.SandwichEat', { entity: o.id });
    // OnAddTaunting → DrainAmmo.
    this.drainAmmo(false);
  }

  /** SDK: CTFLunchBox::DrainAmmo. */
  drainAmmo(forceCooldown: boolean): void {
    const o = this.owner;
    if (!o) return;
    const type = this.lunchboxType();
    if (o.playerClass === TF_CLASS_HEAVYWEAPONS) {
      if (
        o.health < o.maxHealth ||
        type === LUNCHBOX.ADDS_MINICRITS ||
        type === LUNCHBOX.CHOCOLATE_BAR ||
        type === LUNCHBOX.FISHCAKE ||
        forceCooldown
      ) {
        o.meters[3] = 0;
      } else return; // A full-health Heavy can eat a plain Sandvich forever.
    } else if (o.playerClass === TF_CLASS_SCOUT) this.startEffectBarRegen();
    const a = this.stats.ammoType;
    o.ammo[a] = Math.max(0, o.ammo[a] - 1);
  }

  /** SDK: CTFLunchBox::ApplyBiteEffects. */
  applyBiteEffects(o: Player): void {
    this.broken = true;
    const type = this.lunchboxType();
    const bar = type === LUNCHBOX.CHOCOLATE_BAR || type === LUNCHBOX.FISHCAKE;
    if (bar) setTemporaryMaxHealthBonus(o, DALOKOHS_MAXHEALTH_BUFF, DALOKOHS_BUFF_TIME);
    else if (type === LUNCHBOX.ADDS_MINICRITS) {
      o.cond.add(TF_COND.ENERGY_BUFF, STEAK_DURATION);
      o.cond.add(TF_COND.CANNOT_SWITCH_FROM_MELEE, STEAK_DURATION);
      return;
    }
    let heal = bar ? CHOCOLATE_BITE_HEAL : LUNCHBOX_BITE_HEAL;
    let healType = 0;
    if (bar && o.health < 300 + DALOKOHS_MAXHEALTH_BUFF) {
      healType = DMG_IGNORE_MAXHEALTH;
      heal = Math.min(CHOCOLATE_BITE_HEAL, 350 - o.health);
    }
    heal = Math.trunc(heal * hookWeapon(this, o, 'lunchbox_healing_scale', 1));
    const healed = o.takeHealth(heal, healType);
    if (healed > 0)
      o.world.events.push({ type: 'healed', patient: o.id, healer: o.id, amount: healed });
    if (type === LUNCHBOX.ADDS_AMMO)
      o.giveAmmo(Math.trunc(o.maxAmmo[TF_AMMO_PRIMARY] * 0.25), TF_AMMO_PRIMARY);
  }

  /** SDK: CTFPlayer::DoTauntAttack (TAUNTATK_HEAVY_EAT / TAUNTATK_SCOUT_DRINK). */
  tauntAttack(o: Player): void {
    if (o.playerClass === TF_CLASS_SCOUT) {
      this.tauntAttackTime = 0;
      if (isControlStunned(o)) return;
      const dropDead = 100 / ENERGY_DRINK_CONSUME_RATE + 1;
      if (this.lunchboxType() === LUNCHBOX.ADDS_MINICRITS)
        o.cond.add(TF_COND.ENERGY_BUFF, dropDead);
      else o.cond.add(TF_COND.PHASE, dropDead);
      return;
    }
    this.applyBiteEffects(o);
    // Keep eating until the taunt is over.
    this.tauntAttackTime = this.t + HEAVY_BITE_INTERVAL;
  }

  private tauntThink(): void {
    const o = this.owner;
    if (!o || this.tauntAttackTime <= 0) return;
    if (!o.alive || !o.cond.has(TF_COND.TAUNTING) || o.activeWeapon() !== this) {
      this.tauntAttackTime = 0;
      return;
    }
    if (this.t >= this.tauntAttackTime) this.tauntAttack(o);
  }

  /** SDK: CTFLunchBox::SecondaryAttack — throw it as a health kit. */
  override secondaryAttack(_cmd: UserCmd): void {
    const o = this.owner;
    if (!o || !this.dropAllowed() || this.reserveAmmo() <= 0) return;
    const w = o.world;
    if (w.isServer) {
      const old = w.entity(this.thrownKit);
      if (old) w.remove(old);
      const type = this.lunchboxType();
      const small =
        type === LUNCHBOX.CHOCOLATE_BAR || type === LUNCHBOX.BANANA || type === LUNCHBOX.FISHCAKE;
      o.eyePosition(throwSrc);
      throwSrc.z -= 8;
      set(throwAngles, o.eyeAngles.x - 10, o.eyeAngles.y, 0);
      angleVectors(throwAngles, throwFwd);
      const kit = w.spawnEntity(
        small ? 'tf_dropped_lunchbox_small' : 'tf_dropped_lunchbox_medium',
        (e) => {
          set(e.origin, throwSrc.x, throwSrc.y, throwSrc.z);
          set(
            e.velocity,
            throwFwd.x * LUNCHBOX_THROW_SPEED,
            throwFwd.y * LUNCHBOX_THROW_SPEED,
            throwFwd.z * LUNCHBOX_THROW_SPEED,
          );
          e.owner = o.id;
          e.model = DROP_MODELS[type] ?? LUNCHBOX_DROP_MODEL;
          e.skin = o.team === TF_TEAM_RED ? 0 : 1;
        },
      );
      this.thrownKit = kit ? kit.id : NO_ENTITY;
    }
    const a = this.stats.ammoType;
    o.ammo[a] = Math.max(0, o.ammo[a] - this.stats.ammoPerShot);
    o.meters[3] = 0;
    switchToNextBest(o, this);
  }

  override itemPostFrame(cmd: UserCmd): void {
    this.tauntThink();
    super.itemPostFrame(cmd);
  }

  /** SDK: CTFLunchBox::WeaponReset — whole again after death or a resupply. */
  override refill(): void {
    super.refill();
    this.broken = false;
    this.tauntAttackTime = 0;
    this.tauntRemoveTime = 0;
  }

  protected override writeWeaponNet(out: NetRecord): void {
    out.aux0 = this.tauntAttackTime;
    out.aux1 = this.tauntRemoveTime;
    out.aux2 = this.broken ? 1 : 0;
  }

  protected override readWeaponNet(rec: NetRecord): void {
    this.tauntAttackTime = num(rec.aux0);
    this.tauntRemoveTime = num(rec.aux1);
    this.broken = num(rec.aux2) !== 0;
  }
}

/** CTFLunchBox_Drink: no throwing, a 30 s effect bar. */
export class LunchboxDrink extends Lunchbox {
  override get isDrink(): boolean {
    return true;
  }

  override internalEffectBarRechargeTime(): number {
    return TF_SANDWICH_REGENTIME;
  }
}

/**
 * The thrown lunch box (CTFLunchBox::SecondaryAttack's item_healthkit_medium / _small with
 * DropSingleInstance): it falls and bounces, never respawns, and its owner — a Heavy who still
 * carries a lunch box — picks it back up as one more sandvich and a full meter (CHealthKit::MyTouch).
 */
export class DroppedLunchbox extends HealthKit {
  allowOwnerPickup = false;

  constructor(classname: string) {
    super(classname);
  }

  override spawn(): void {
    const model = this.model;
    super.spawn();
    if (model) this.model = model;
    this.spawnflags |= SF_NORESPAWN;
    this.moveType = MOVETYPE_FLYGRAVITY;
    this.moveCollide = MOVECOLLIDE_FLY_BOUNCE;
    this.elasticity = 0.3;
    this.spawnTime = this.world.curtime;
    this.setThink(this.allowOwner, this.world.curtime + LUNCHBOX_OWNER_PICKUP_DELAY);
  }

  private readonly allowOwner = (): void => {
    this.allowOwnerPickup = true;
    this.setThink(this.subRemove, this.spawnTime + LUNCHBOX_DROP_LIFETIME);
  };

  override validTouch(p: Player): boolean {
    if (p.id === this.owner && !this.allowOwnerPickup) return false;
    return super.validTouch(p);
  }

  override myTouch(p: Player): boolean {
    if (
      p.id === this.owner &&
      p.playerClass === TF_CLASS_HEAVYWEAPONS &&
      p.weapons.some((w) => w instanceof Lunchbox)
    ) {
      // "In the case of sandvich's owner, only restore ammo."
      const box = p.weapons.find((w) => w instanceof Lunchbox) as Lunchbox;
      if (p.giveAmmo(1, box.stats.ammoType) > 0) {
        p.meters[3] = 100;
        this.world.emitSound('HealthKit.Touch', { entity: p.id, to: p.id });
        return true;
      }
      return false;
    }
    const given = super.myTouch(p);
    // The owner earns 10 bonus points healing a teammate.
    if (given && this.owner !== p.id) {
      const owner = this.world.entity(this.owner);
      if (owner && owner.isPlayer() && owner.team === p.team)
        (owner as Player).stats.bonusPoints += 10;
    }
    return given;
  }
}

registerEntityClass('tf_dropped_lunchbox_medium', DroppedLunchbox);
registerEntityClass('tf_dropped_lunchbox_small', DroppedLunchbox);
