/**
 * The Spy's tools.
 *
 * Invis Watch (CTFWeaponInvis): never drawn; +attack2 with any weapon toggles
 * it (CTFPlayer::DoClassSpecialSkill → ActivateInvisibilityWatch): cloaking
 * needs > 8 % meter, takes tf_spy_invis_time to fade in, drains the meter at
 * tf_spy_cloak_consume_rate; decloaking fades over tf_spy_invis_unstealth_time
 * and blocks attacks for tf_spy_cloak_no_attack_time; out of meter forces a
 * decloak; while visible the meter refills at tf_spy_cloak_regen_rate
 * (CTFPlayerShared::UpdateCloakMeter). Bumping an enemy or taking more than
 * 5 damage while cloaked flickers (TF_COND_STEALTHED_BLINK, 0.3 s).
 *
 * Disguise Kit (CTFWeaponPDA_Spy): `disguise(team, class)` starts
 * TF_COND_DISGUISING; TF_TIME_TO_DISGUISE later (quicker when already
 * disguised) CompleteDisguise sets TF_COND_DISGUISED with the class, team,
 * a target player of that class to imitate, the health enemies see and the
 * weapon they see (DetermineDisguiseWeapon). Attacking drops it
 * (CTFWeaponBaseGun::PrimaryAttack / CTFKnife).
 */

import { CLASS_NAMES, TF_CLASS_SPY, TF_TEAM_BLUE, TF_TEAM_RED, type ClassName } from '../../core/constants';
import type { UserCmd } from '../../core/types';
import { INVIS_WATCH } from '../../data/weapons';
import { STOCK_WEAPONS } from '../../data/weapons';
import { CLASS_DATA } from '../../data/classes';
import { TF_COND } from '../conditions';
import type { NetRecord } from '../net-schema';
import type { Player } from '../player';
import { MAX_PLAYERS } from '../world';
import { stockLoadout } from '../loadout';
import type { WeaponSpec } from '../weapon-api';
import {
  CLOAK_MIN_TO_START,
  SPY_STEALTH_BLINKTIME,
  STEALTH_BLINK_DAMAGE,
  STEALTH_TOGGLE_DELAY,
  STEALTH_TOGGLE_DELAY_SHORT,
} from './constants';
import { disguiseTime, exposeCloak, fadeInvis, invisibilityThink, removeDisguise, resetSpyState, spyState } from './spy-state';
import { num, TFWeapon, type ClassSkillWeapon } from './tf-weapon';
import { hookInt, hookPlayer, hookWeapon } from '../items/attributes';

/** The invis watch types (CTFWeaponInvis: set_weapon_mode). */
const INVIS_FEIGN_DEATH = 1;
const INVIS_MOTION_CLOAK = 2;

/** CTFWeaponInvis. */
export class InvisWatch extends TFWeapon implements ClassSkillWeapon {
  /** Health at the last frame (NoteLastDamageTime's "> 5 damage" check). */
  private prevHealth = 0;

  constructor(spec: WeaponSpec) {
    super(spec);
  }

  /** The watch is worn, not wielded. */
  override canDeploy(): boolean {
    return false;
  }

  override primaryAttack(_cmd: UserCmd): void {}

  /** DoClassSpecialSkill → ActivateInvisibilityWatch. */
  classSkill(): void {
    this.activateInvisibilityWatch();
  }

  /** CTFWeaponInvis::GetInvisType (set_weapon_mode): 1 the Dead Ringer (feign death), 2 the Cloak and Dagger (motion cloak). */
  invisType(): number {
    return hookInt(hookWeapon(this, this.owner, 'set_weapon_mode', 0));
  }

  /** SDK: CTFWeaponInvis::ActivateInvisibilityWatch. */
  activateInvisibilityWatch(): boolean {
    const o = this.owner;
    if (!o || o.playerClass !== TF_CLASS_SPY) return false;
    const s = spyState(o);
    const t = this.t;
    let did = false;
    if (o.cond.has(TF_COND.STEALTHED)) {
      fadeInvis(o, 1);
      o.world.emitSound('Player.Spy_UnCloak', { entity: o.id });
    } else if (this.invisType() === INVIS_FEIGN_DEATH) {
      // The Dead Ringer: armed (SetFeignDeathState) with a full meter, disarmed by pressing again.
      if (o.unlock.feignDeathReady) o.unlock.feignDeathReady = false;
      else if (o.cloakMeter >= INVIS_WATCH.meterMax) o.unlock.feignDeathReady = true;
    } else if (this.canGoInvisible(o) && o.cloakMeter > CLOAK_MIN_TO_START) {
      o.cond.add(TF_COND.STEALTHED, -1, o.id);
      // CTFPlayerShared::OnAddStealthed.
      s.invisChangeCompleteTime = t + INVIS_WATCH.fadeTime;
      o.world.emitSound('Player.Spy_Cloak', { entity: o.id });
      did = true;
    }
    s.stealthNextChangeTime = t + (did ? STEALTH_TOGGLE_DELAY : STEALTH_TOGGLE_DELAY_SHORT);
    return did;
  }

  /** SDK: CTFPlayer::CanGoInvisible — not with the flag, not as the humiliated team. */
  canGoInvisible(o: Player): boolean {
    if (o.carriedFlag !== -1) return false;
    return !o.world.rules.isHumiliated(o);
  }

  override itemHolsterFrame(cmd: UserCmd): void {
    super.itemHolsterFrame(cmd);
    this.cloakThink();
  }

  override itemPostFrame(cmd: UserCmd): void {
    super.itemPostFrame(cmd);
    this.cloakThink();
  }

  /** UpdateCloakMeter + the blink rules + InvisibilityThink, once per command. */
  cloakThink(): void {
    const o = this.owner;
    if (!o || !o.alive) return;
    const s = spyState(o);
    const w = o.world;
    const t = w.curtime;
    const dt = w.frametime;
    if (o.playerClass !== TF_CLASS_SPY) {
      if (o.cond.has(TF_COND.STEALTHED)) o.cond.remove(TF_COND.STEALTHED);
      return;
    }
    if (o.cond.has(TF_COND.STEALTHED) && this.invisType() === INVIS_MOTION_CLOAK) {
      // The Cloak and Dagger: drains by movement (× 1.5 at full speed), refills standing still a second after exposure.
      const v2 = o.velocity.x * o.velocity.x + o.velocity.y * o.velocity.y + o.velocity.z * o.velocity.z;
      if (v2 === 0) {
        if (t - s.lastStealthExposeTime > 1) {
          o.cloakMeter = Math.min(INVIS_WATCH.meterMax, o.cloakMeter + dt * hookWeapon(this, o, 'mult_cloak_meter_regen_rate', INVIS_WATCH.regenRate));
        }
      } else {
        const max = o.computeMaxSpeed();
        const factor = Math.min(1, max > 0 ? v2 / (max * max) : 1);
        o.cloakMeter = Math.max(0, o.cloakMeter - dt * cloakConsumeRate(o) * factor * 1.5);
      }
      if (this.touchingEnemy(o) || this.prevHealth - o.health > STEALTH_BLINK_DAMAGE) exposeCloak(o);
    } else if (o.cond.has(TF_COND.STEALTHED)) {
      o.cloakMeter -= dt * cloakConsumeRate(o);
      if (o.cloakMeter <= 0) {
        o.cloakMeter = 0;
        fadeInvis(o, 1);
        w.emitSound('Player.Spy_UnCloak', { entity: o.id });
      }
      // Bumping into an enemy (OnSpyTouchedByEnemy) or getting hurt flickers the cloak.
      if (this.touchingEnemy(o) || this.prevHealth - o.health > STEALTH_BLINK_DAMAGE) exposeCloak(o);
    } else o.cloakMeter = Math.min(INVIS_WATCH.meterMax, o.cloakMeter + dt * hookWeapon(this, o, 'mult_cloak_meter_regen_rate', INVIS_WATCH.regenRate));
    if (o.cond.has(TF_COND.STEALTHED_BLINK) && SPY_STEALTH_BLINKTIME < t - s.lastStealthExposeTime) o.cond.remove(TF_COND.STEALTHED_BLINK);
    this.prevHealth = o.health;
    invisibilityThink(o);
  }

  private touchingEnemy(o: Player): boolean {
    const w = o.world;
    for (let i = 1; i <= MAX_PLAYERS; i++) {
      const p = w.player(i);
      if (!p || p === o || !p.alive || p.team === o.team || p.team <= 1) continue;
      if (
        o.origin.x + o.mins.x <= p.origin.x + p.maxs.x + 1 &&
        o.origin.x + o.maxs.x >= p.origin.x + p.mins.x - 1 &&
        o.origin.y + o.mins.y <= p.origin.y + p.maxs.y + 1 &&
        o.origin.y + o.maxs.y >= p.origin.y + p.mins.y - 1 &&
        o.origin.z + o.mins.z <= p.origin.z + p.maxs.z &&
        o.origin.z + o.maxs.z >= p.origin.z + p.mins.z
      ) {
        return true;
      }
    }
    return false;
  }

  override refill(): void {
    super.refill();
    const o = this.owner;
    this.prevHealth = o ? o.health : 0;
  }

  override onOwnerDeath(): void {
    super.onOwnerDeath();
    if (this.owner) resetSpyState(this.owner);
  }

  /**
   * SDK: CTFPlayer::SpyDeadRingerDeath's watch half: the meter drops to 50 and OnAddFeignDeath cloaks
   * at once (no fade, no sound). Returns false when the Spy cannot feign (already cloaked, not full).
   */
  canFeignDeath(): boolean {
    const o = this.owner;
    if (!o || !o.alive || o.playerClass !== TF_CLASS_SPY) return false;
    if (o.cond.has(TF_COND.STEALTHED)) return false;
    return this.canGoInvisible(o) && o.cloakMeter >= INVIS_WATCH.meterMax;
  }

  onFeignDeath(): void {
    const o = this.owner;
    if (!o) return;
    o.cloakMeter = 50;
    if (!o.cond.has(TF_COND.STEALTHED)) {
      o.cond.add(TF_COND.STEALTHED, -1, o.id);
      spyState(o).invisChangeCompleteTime = this.t;
    }
  }

  protected override writeWeaponNet(out: NetRecord): void {
    const o = this.owner;
    if (!o) return;
    const s = spyState(o);
    out.aux0 = s.invisChangeCompleteTime;
    out.aux1 = s.stealthNoAttackExpire;
    out.aux2 = s.stealthNextChangeTime;
    out.aux3 = s.lastStealthExposeTime;
    out.aux4 = this.prevHealth;
  }

  protected override readWeaponNet(rec: NetRecord): void {
    const o = this.owner;
    if (!o) return;
    const s = spyState(o);
    s.invisChangeCompleteTime = num(rec.aux0);
    s.stealthNoAttackExpire = num(rec.aux1);
    s.stealthNextChangeTime = num(rec.aux2);
    s.lastStealthExposeTime = num(rec.aux3);
    this.prevHealth = num(rec.aux4);
  }
}

/** CTFWeaponPDA_Spy (the Disguise Kit). */
export class DisguiseKit extends TFWeapon {
  constructor(spec: WeaponSpec) {
    super(spec);
  }

  override primaryAttack(_cmd: UserCmd): void {}

  /** SDK: CTFPlayerShared::Disguise. Returns whether a disguise started. */
  disguise(team: number, cls: number, targetId = 0): boolean {
    const o = this.owner;
    if (!o || !o.alive || o.playerClass !== TF_CLASS_SPY) return false;
    if (o.cond.has(TF_COND.TAUNTING)) return false;
    if (team === o.team && cls === o.playerClass) {
      removeDisguise(o);
      return false;
    }
    const s = spyState(o);
    if (team === o.disguiseTeam && cls === o.disguiseClass && o.cond.has(TF_COND.DISGUISED)) {
      s.disguiseWeapon = this.determineDisguiseWeapon(o, cls, false);
      return false;
    }
    if (team !== TF_TEAM_RED && team !== TF_TEAM_BLUE) return false;
    if (cls <= 0 || cls >= CLASS_NAMES.length) return false;
    if (o.cond.has(TF_COND.DISGUISING) && team === s.desiredDisguiseTeam && cls === s.desiredDisguiseClass) return false;
    s.desiredDisguiseTarget = targetId;
    s.desiredDisguiseClass = cls;
    s.desiredDisguiseTeam = team;
    const time = targetId ? 0 : disguiseTime(o);
    o.cond.add(TF_COND.DISGUISING);
    s.disguiseCompleteTime = this.t + time;
    return true;
  }

  /** The "lastdisguise" command. */
  lastDisguise(): boolean {
    const o = this.owner;
    if (!o) return false;
    const s = spyState(o);
    if (!s.lastDisguiseClass) return false;
    return this.disguise(s.lastDisguiseTeam, s.lastDisguiseClass);
  }

  override itemHolsterFrame(cmd: UserCmd): void {
    super.itemHolsterFrame(cmd);
    this.disguiseThink();
  }

  override itemPostFrame(cmd: UserCmd): void {
    super.itemPostFrame(cmd);
    this.disguiseThink();
  }

  /** ConditionThink's DISGUISING branch: complete when the time has come. */
  disguiseThink(): void {
    const o = this.owner;
    if (!o || !o.alive) return;
    const s = spyState(o);
    if (o.cond.has(TF_COND.DISGUISING) && s.disguiseCompleteTime > 0 && this.t >= s.disguiseCompleteTime) this.completeDisguise(o);
  }

  /** SDK: CTFPlayerShared::CompleteDisguise. */
  completeDisguise(o: Player): void {
    const s = spyState(o);
    o.cond.add(TF_COND.DISGUISED);
    o.disguiseClass = s.desiredDisguiseClass;
    o.disguiseTeam = s.desiredDisguiseTeam;
    o.cond.remove(TF_COND.DISGUISING);
    const target = this.findDisguiseTarget(o, s.desiredDisguiseTarget, o.disguiseTeam, o.disguiseClass);
    o.disguiseTarget = target ? target.id : 0;
    s.desiredDisguiseTarget = 0;
    if (target && target.alive && target.health > 0) s.disguiseHealth = target.health;
    else if (target) s.disguiseHealth = CLASS_DATA[o.disguiseClass]?.maxHealth ?? o.maxHealth;
    else s.disguiseHealth = o.world.random.randomInt(Math.floor(o.maxHealth / 2), o.maxHealth);
    s.disguiseWeapon = this.determineDisguiseWeapon(o, o.disguiseClass, true);
    s.disguiseCompleteTime = 0;
    s.lastDisguiseTeam = o.disguiseTeam;
    s.lastDisguiseClass = o.disguiseClass;
    o.world.emitSound('Player.Spy_Disguise', { entity: o.id, to: o.id });
  }

  /** SDK: CTFPlayer::TeamFortress_GetDisguiseTarget — someone of that class on that team, else anyone there. */
  private findDisguiseTarget(o: Player, desired: number, team: number, cls: number): Player | null {
    const w = o.world;
    const d = w.player(desired);
    if (d && d.team === team) return d;
    let fallback: Player | null = null;
    for (let i = 1; i <= MAX_PLAYERS; i++) {
      const p = w.player(i);
      if (!p || p === o || p.team !== team) continue;
      if (p.playerClass === cls) return p;
      if (!fallback) fallback = p;
    }
    return fallback;
  }

  /** SDK: CTFPlayerShared::DetermineDisguiseWeapon — the disguise class's stock item in the Spy's current slot (primary when forced). */
  determineDisguiseWeapon(o: Player, cls: number, forcePrimary: boolean): number {
    const loadout = stockLoadout(cls);
    if (loadout.length === 0) return -1;
    let slot = 0;
    if (!forcePrimary) {
      const active = o.activeWeapon();
      slot = active ? active.slot : 0;
      if (slot === 3 && o.lastSlot >= 0) slot = o.lastSlot;
    }
    for (const spec of loadout) if (spec.slot === slot) return spec.defindex;
    return loadout[0].defindex;
  }

  override onOwnerDeath(): void {
    super.onOwnerDeath();
    const o = this.owner;
    if (!o) return;
    o.disguiseTeam = 0;
    o.disguiseClass = 0;
    o.disguiseTarget = 0;
    resetSpyState(o);
  }

  protected override writeWeaponNet(out: NetRecord): void {
    const o = this.owner;
    if (!o) return;
    const s = spyState(o);
    out.aux0 = s.desiredDisguiseTeam * 16 + s.desiredDisguiseClass;
    out.aux1 = s.disguiseCompleteTime;
    out.aux2 = s.disguiseHealth;
    out.aux3 = s.disguiseWeapon;
    out.aux4 = s.desiredDisguiseTarget;
    out.aux5 = s.lastDisguiseTeam * 16 + s.lastDisguiseClass;
  }

  protected override readWeaponNet(rec: NetRecord): void {
    const o = this.owner;
    if (!o) return;
    const s = spyState(o);
    const d = num(rec.aux0);
    s.desiredDisguiseTeam = Math.floor(d / 16);
    s.desiredDisguiseClass = d % 16;
    s.disguiseCompleteTime = num(rec.aux1);
    s.disguiseHealth = num(rec.aux2);
    s.disguiseWeapon = num(rec.aux3);
    s.desiredDisguiseTarget = num(rec.aux4);
    const l = num(rec.aux5);
    s.lastDisguiseTeam = Math.floor(l / 16);
    s.lastDisguiseClass = l % 16;
  }
}

/** The host's "disguise <class> <team>" command: finds the Spy's kit and starts the disguise. */
export function requestDisguise(p: Player, cls: number | ClassName, team: number): boolean {
  const c = typeof cls === 'number' ? cls : CLASS_NAMES.indexOf(cls);
  for (let i = 0; i < p.weapons.length; i++) {
    const w = p.weapons[i];
    if (w instanceof DisguiseKit) return w.disguise(team, c);
  }
  return false;
}

/** The item enemies see a disguised Spy holding (-1 = none). */
export const disguiseWeaponOf = (p: Player): number => (p.cond.has(TF_COND.DISGUISED) ? spyState(p).disguiseWeapon : -1);

/** The world model for a disguise weapon (renderer helper). */
export const disguiseWeaponModel = (defindex: number): string => STOCK_WEAPONS[defindex]?.worldModel ?? '';

/**
 * SDK: CTFWeaponInvis::SetCloakRates — tf_spy_cloak_consume_rate × the owner's
 * mult_cloak_meter_consume_rate, where a factor below 1 is read inverted (0.75 → 1 / 1.25).
 */
export function cloakConsumeRate(o: Player): number {
  let factor = hookPlayer(o, 'mult_cloak_meter_consume_rate', 1);
  if (factor < 1) factor = 1 / (2 - factor);
  return INVIS_WATCH.consumeRate * factor;
}
