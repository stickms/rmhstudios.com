/**
 * Player conditions (ETFCond) — the SDK's CTFPlayerShared condition list:
 * a bitset with a per-condition remaining duration and provider, ticked by
 * CTFPlayerShared::ConditionGameRulesThink. Durations count down by the
 * frame time (a condition can be told to decay faster, as afterburn does
 * while healed); PERMANENT_CONDITION never expires on its own.
 */

import { NO_ENTITY } from '../core/types';

/** ETFCond (tf_shareddefs.h). Only the values the simulation uses are named; the numbering is the SDK's. */
export const TF_COND = {
  AIMING: 0,
  ZOOMED: 1,
  DISGUISING: 2,
  DISGUISED: 3,
  STEALTHED: 4,
  INVULNERABLE: 5,
  TELEPORTED: 6,
  TAUNTING: 7,
  INVULNERABLE_WEARINGOFF: 8,
  STEALTHED_BLINK: 9,
  SELECTED_TO_TELEPORT: 10,
  CRITBOOSTED: 11,
  TMPDAMAGEBONUS: 12,
  FEIGN_DEATH: 13,
  PHASE: 14,
  STUNNED: 15,
  OFFENSEBUFF: 16,
  SHIELD_CHARGE: 17,
  DEMO_BUFF: 18,
  ENERGY_BUFF: 19,
  RADIUSHEAL: 20,
  HEALTH_BUFF: 21,
  BURNING: 22,
  HEALTH_OVERHEALED: 23,
  URINE: 24,
  BLEEDING: 25,
  DEFENSEBUFF: 26,
  MAD_MILK: 27,
  MEGAHEAL: 28,
  REGENONDAMAGEBUFF: 29,
  MARKEDFORDEATH: 30,
  NOHEALINGDAMAGEBUFF: 31,
  SPEED_BOOST: 32,
  CRITBOOSTED_PUMPKIN: 33,
  CRITBOOSTED_USER_BUFF: 34,
  CRITBOOSTED_DEMO_CHARGE: 35,
  SODAPOPPER_HYPE: 36,
  CRITBOOSTED_FIRST_BLOOD: 37,
  CRITBOOSTED_BONUS_TIME: 38,
  CRITBOOSTED_CTF_CAPTURE: 39,
  CRITBOOSTED_ON_KILL: 40,
  CANNOT_SWITCH_FROM_MELEE: 41,
  DEFENSEBUFF_NO_CRIT_BLOCK: 42,
  CRITBOOSTED_RAGE_BUFF: 44,
  DEFENSEBUFF_HIGH: 45,
  DISGUISE_WEARINGOFF: 47,
  MARKEDFORDEATH_SILENT: 48,
  INVULNERABLE_HIDE_UNLESS_DAMAGED: 51,
  INVULNERABLE_USER_BUFF: 52,
  CRITBOOSTED_CARD_EFFECT: 56,
  INVULNERABLE_CARD_EFFECT: 57,
  BULLET_IMMUNE: 67,
  BLAST_IMMUNE: 68,
  FIRE_IMMUNE: 69,
  PREVENT_DEATH: 70,
  MINICRITBOOSTED_ON_KILL: 78,
  BLASTJUMPING: 81,
  CRITBOOSTED_RUNE_TEMP: 105,
  KNOCKED_INTO_AIR: 115,
  HEALING_DEBUFF: 118,
  BURNING_PYRO: 124,
  LAST: 131,
} as const;

export type TfCond = number;

/** Duration meaning "until removed" (PERMANENT_CONDITION). */
export const PERMANENT_CONDITION = -1;

/** Number of 32-bit words in the networked condition bitset. */
export const COND_WORDS = 5;
const COND_CAPACITY = COND_WORDS * 32;

/** Conditions that make the player crit-boosted (CTFPlayerShared::IsCritBoosted). */
export const CRIT_BOOST_CONDS: readonly number[] = [
  TF_COND.CRITBOOSTED,
  TF_COND.CRITBOOSTED_PUMPKIN,
  TF_COND.CRITBOOSTED_USER_BUFF,
  TF_COND.CRITBOOSTED_DEMO_CHARGE,
  TF_COND.CRITBOOSTED_FIRST_BLOOD,
  TF_COND.CRITBOOSTED_BONUS_TIME,
  TF_COND.CRITBOOSTED_CTF_CAPTURE,
  TF_COND.CRITBOOSTED_ON_KILL,
  TF_COND.CRITBOOSTED_RAGE_BUFF,
  TF_COND.CRITBOOSTED_CARD_EFFECT,
  TF_COND.CRITBOOSTED_RUNE_TEMP,
];

/** Conditions that block all damage (CTFPlayerShared::IsInvulnerable). */
export const INVULN_CONDS: readonly number[] = [
  TF_COND.INVULNERABLE,
  TF_COND.INVULNERABLE_HIDE_UNLESS_DAMAGED,
  TF_COND.INVULNERABLE_USER_BUFF,
  TF_COND.INVULNERABLE_CARD_EFFECT,
];

export type ConditionHook = (cond: number, provider: number) => void;

export class Conditions {
  /** The networked bitset. */
  readonly bits = new Uint32Array(COND_WORDS);
  /** Remaining seconds per condition; PERMANENT_CONDITION for none. */
  readonly remaining = new Float64Array(COND_CAPACITY);
  /** Entity id that applied it (GetConditionProvider), NO_ENTITY when none. */
  readonly provider = new Int32Array(COND_CAPACITY).fill(NO_ENTITY);
  onAdded: ConditionHook | null = null;
  onRemoved: ConditionHook | null = null;

  has(cond: number): boolean {
    return (this.bits[cond >>> 5] & (1 << (cond & 31))) !== 0;
  }

  /** SDK: CTFPlayerShared::AddCond. Re-adding refreshes the duration (longest wins, as InCond + SetCondDuration). */
  add(cond: number, duration: number = PERMANENT_CONDITION, provider: number = NO_ENTITY): void {
    if (cond < 0 || cond >= COND_CAPACITY) return;
    const had = this.has(cond);
    if (had) {
      const cur = this.remaining[cond];
      if (duration === PERMANENT_CONDITION || (cur !== PERMANENT_CONDITION && duration > cur)) {
        this.remaining[cond] = duration;
      }
      if (provider !== NO_ENTITY) this.provider[cond] = provider;
      return;
    }
    this.bits[cond >>> 5] |= 1 << (cond & 31);
    this.remaining[cond] = duration;
    this.provider[cond] = provider;
    this.onAdded?.(cond, provider);
  }

  /** SDK: CTFPlayerShared::RemoveCond. */
  remove(cond: number): void {
    if (!this.has(cond)) return;
    this.bits[cond >>> 5] &= ~(1 << (cond & 31));
    const provider = this.provider[cond];
    this.remaining[cond] = PERMANENT_CONDITION;
    this.provider[cond] = NO_ENTITY;
    this.onRemoved?.(cond, provider);
  }

  /** Remaining seconds, PERMANENT_CONDITION, or 0 when not set. */
  duration(cond: number): number {
    return this.has(cond) ? this.remaining[cond] : 0;
  }

  setDuration(cond: number, seconds: number): void {
    if (this.has(cond)) this.remaining[cond] = seconds;
  }

  getProvider(cond: number): number {
    return this.has(cond) ? this.provider[cond] : NO_ENTITY;
  }

  hasAny(conds: readonly number[]): boolean {
    for (let i = 0; i < conds.length; i++) if (this.has(conds[i])) return true;
    return false;
  }

  get critBoosted(): boolean {
    return this.hasAny(CRIT_BOOST_CONDS);
  }

  get invulnerable(): boolean {
    return this.hasAny(INVULN_CONDS);
  }

  /**
   * Counts every timed condition down by `dt` and removes the ones that run
   * out (SDK: CTFPlayerShared::ConditionGameRulesThink's expiry loop).
   */
  think(dt: number): void {
    for (let w = 0; w < COND_WORDS; w++) {
      let word = this.bits[w];
      while (word !== 0) {
        const bit = 31 - Math.clz32(word);
        word &= ~(1 << bit);
        const cond = (w << 5) | bit;
        const rem = this.remaining[cond];
        if (rem === PERMANENT_CONDITION) continue;
        const next = rem - dt;
        if (next <= 0) this.remove(cond);
        else this.remaining[cond] = next;
      }
    }
  }

  /** Removes every condition (death, respawn). Hooks fire for each. */
  clear(): void {
    for (let w = 0; w < COND_WORDS; w++) {
      let word = this.bits[w];
      while (word !== 0) {
        const bit = 31 - Math.clz32(word);
        word &= ~(1 << bit);
        this.remove((w << 5) | bit);
      }
    }
  }

  /** Copies another set's state without firing hooks (prediction restore). */
  copyFrom(other: Conditions): void {
    this.bits.set(other.bits);
    this.remaining.set(other.remaining);
    this.provider.set(other.provider);
  }
}
