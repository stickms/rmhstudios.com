/**
 * CS:GO's money and buy menu: kill rewards (the weapon data's `kill award`), round rewards with the
 * loss bonus ladder (constants.ts — Liquipedia's economy tables), and the buy command's checks, all run
 * on the host (a client's `buy` is a request the host validates): alive, in a buy zone (or
 * mp_buy_anywhere), within the buy time, the team's items only, affordable, and within the carry rules
 * (one primary, one pistol, armor not already full, the grenade limits, one defuse kit).
 */

import {
  CASH_LOSS_PLANTED,
  CASH_WIN_BOMB,
  CASH_WIN_DEFUSE,
  CASH_WIN_ELIMINATION,
  CASH_WIN_TIME,
  CS_MAX_ARMOR,
  CS_TEAM_CT,
  CS_TEAM_T,
  CS_WIN_BOMB_DEFUSED,
  CS_WIN_CTS_WIN,
  CS_WIN_TARGET_BOMBED,
  CS_WIN_TARGET_SAVED,
  CS_WIN_TERRORISTS_WIN,
  DEFAULT_KILL_AWARD,
  LOSS_BONUS_BASE,
  LOSS_BONUS_MAX,
  LOSS_BONUS_STEP,
} from './constants';
import { csWeapon, csWeaponByDefindex, csWeaponTable, type CsWeaponInfo } from './data/weapon-data';

/** The helmet alone, for a player who already has full armor (CS:GO wiki "Kevlar + Helmet": $350). */
export const HELMET_ONLY_PRICE = 350;

/** The loss bonus after `streak` consecutive losses (1 → $1400 … 5+ → $3400). */
export function lossBonus(streak: number): number {
  if (streak <= 0) return 0;
  return Math.min(LOSS_BONUS_MAX, LOSS_BONUS_BASE + LOSS_BONUS_STEP * (streak - 1));
}

/** The highest loss streak that still pays more (5: $3400). */
export const LOSS_STREAK_MAX = 1 + Math.ceil((LOSS_BONUS_MAX - LOSS_BONUS_BASE) / LOSS_BONUS_STEP);

/** What the winning team gets for a round end reason. */
export function winReward(reason: number): number {
  switch (reason) {
    case CS_WIN_TARGET_BOMBED:
      return CASH_WIN_BOMB;
    case CS_WIN_BOMB_DEFUSED:
      return CASH_WIN_DEFUSE;
    case CS_WIN_TARGET_SAVED:
      return CASH_WIN_TIME;
    case CS_WIN_CTS_WIN:
    case CS_WIN_TERRORISTS_WIN:
    default:
      return CASH_WIN_ELIMINATION;
  }
}

/**
 * What a member of the losing team gets: the loss bonus for the team's new streak — except a
 * Terrorist still alive when time ran out (nothing: CS:GO denies survivors of a lost round on time);
 * Terrorists also get CASH_LOSS_PLANTED when the bomb was planted.
 */
export function lossReward(
  team: number,
  streak: number,
  reason: number,
  aliveAtEnd: boolean,
  bombPlanted: boolean,
): number {
  if (team === CS_TEAM_T && reason === CS_WIN_TARGET_SAVED && aliveAtEnd) return 0;
  return lossBonus(streak) + (team === CS_TEAM_T && bombPlanted ? CASH_LOSS_PLANTED : 0);
}

/** A kill's reward by the weapon (its data's `kill award`, $300 when it has none). */
export function killReward(weaponDefIndex: number): number {
  const w = weaponDefIndex >= 0 ? csWeaponByDefindex(weaponDefIndex) : null;
  return w ? w.killAward : DEFAULT_KILL_AWARD;
}

// ─── The buy menu ───────────────────────────────────────────────────────────────────────────

/** Buy-command names that are not a weapon's short name (CS:GO's console aliases). */
const BUY_ALIASES: Readonly<Record<string, string>> = {
  vest: 'item_kevlar',
  kevlar: 'item_kevlar',
  vesthelm: 'item_assaultsuit',
  assaultsuit: 'item_assaultsuit',
  defuser: 'item_defuser',
  defusekit: 'item_defuser',
  m4a4: 'weapon_m4a1',
  usp: 'weapon_usp_silencer',
  p2000: 'weapon_hkp2000',
  incendiary: 'weapon_incgrenade',
  smoke: 'weapon_smokegrenade',
  flash: 'weapon_flashbang',
  he: 'weapon_hegrenade',
};

export type BuyItem =
  | { kind: 'weapon'; info: CsWeaponInfo; price: number }
  | { kind: 'armor'; helmet: boolean; price: number }
  | { kind: 'defuser'; price: number };

/** The item a buy name means (null: nothing buyable by that name). */
export function resolveBuyItem(name: string): BuyItem | null {
  const n = name.toLowerCase().trim();
  const full = BUY_ALIASES[n] ?? n;
  const gear = csWeaponTable().gear;
  if (full === 'item_kevlar' || full === 'item_assaultsuit') {
    const g = gear.get(full);
    return {
      kind: 'armor',
      helmet: full === 'item_assaultsuit',
      price: g ? g.price : full === 'item_assaultsuit' ? 1000 : 650,
    };
  }
  if (full === 'item_defuser')
    return { kind: 'defuser', price: gear.get('item_defuser')?.price ?? 400 };
  const info = csWeapon(full);
  if (
    !info ||
    info.category === 'knife' ||
    info.category === 'c4' ||
    info.category === 'taser' ||
    info.category === 'equipment'
  )
    return null;
  return { kind: 'weapon', info, price: info.price };
}

/** What the buy checks read from the player and the round. */
export interface BuyContext {
  alive: boolean;
  team: number;
  money: number;
  inBuyZone: boolean;
  /** Still within the buy time (or deathmatch). */
  buyTime: boolean;
  /** Deathmatch: everything is free. */
  free: boolean;
  armor: number;
  helmet: boolean;
  defuser: boolean;
  /** The weapon in the item's slot now (its name), or ''. */
  slotWeapon(slot: number): string;
  /** May one more grenade of this kind be carried? */
  canCarryGrenade(kind: string): boolean;
}

export type BuyResult = { ok: true; item: BuyItem; price: number } | { ok: false; reason: string };

/** Validates a buy; the price is what the player pays (0 in deathmatch, $350 for a helmet alone). */
export function checkBuy(name: string, ctx: BuyContext): BuyResult {
  const item = resolveBuyItem(name);
  if (!item) return { ok: false, reason: `unknown item "${name}"` };
  if (!ctx.alive) return { ok: false, reason: 'dead players cannot buy' };
  if (!ctx.inBuyZone) return { ok: false, reason: 'not in a buy zone' };
  if (!ctx.buyTime) return { ok: false, reason: 'the buy time has expired' };
  let price = item.price;
  switch (item.kind) {
    case 'weapon': {
      const info = item.info;
      if (info.team !== 0 && info.team !== ctx.team)
        return { ok: false, reason: `${info.short} is not available to your team` };
      if (info.category === 'grenade') {
        if (!ctx.canCarryGrenade(info.short))
          return { ok: false, reason: `you cannot carry any more ${info.short}` };
      } else if (ctx.slotWeapon(info.slot) === info.name) {
        return { ok: false, reason: `you already have a ${info.short}` };
      }
      break;
    }
    case 'armor':
      if (ctx.armor >= CS_MAX_ARMOR && (!item.helmet || ctx.helmet))
        return { ok: false, reason: 'you already have armor' };
      if (item.helmet && ctx.armor >= CS_MAX_ARMOR && !ctx.helmet) price = HELMET_ONLY_PRICE;
      break;
    case 'defuser':
      if (ctx.team !== CS_TEAM_CT)
        return { ok: false, reason: 'only Counter-Terrorists can buy a defuse kit' };
      if (ctx.defuser) return { ok: false, reason: 'you already have a defuse kit' };
      break;
  }
  if (ctx.free) price = 0;
  if (price > ctx.money) return { ok: false, reason: 'you have insufficient funds' };
  return { ok: true, item, price };
}

/** The team a buy menu shows by default: Terrorists' and Counter-Terrorists' names (for bots and the HUD). */
export const TEAM_RIFLE: Readonly<Record<number, string>> = {
  [CS_TEAM_T]: 'weapon_ak47',
  [CS_TEAM_CT]: 'weapon_m4a1',
};
export const TEAM_SMG: Readonly<Record<number, string>> = {
  [CS_TEAM_T]: 'weapon_mac10',
  [CS_TEAM_CT]: 'weapon_mp9',
};
export const TEAM_PISTOL: Readonly<Record<number, readonly string[]>> = {
  [CS_TEAM_T]: ['weapon_glock'],
  [CS_TEAM_CT]: ['weapon_hkp2000', 'weapon_usp_silencer'],
};
export const TEAM_KNIFE: Readonly<Record<number, readonly string[]>> = {
  [CS_TEAM_T]: ['weapon_knife_t', 'weapon_knife'],
  [CS_TEAM_CT]: ['weapon_knife', 'weapon_knife_t'],
};
