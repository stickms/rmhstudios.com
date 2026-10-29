/**
 * The Spy's shared state (the CTFPlayerShared members behind cloak and
 * disguise: m_flInvisChangeCompleteTime, m_flStealthNoAttackExpire,
 * m_flStealthNextChangeTime, m_flLastStealthExposeTime, the desired
 * disguise and its completion time) and the shared routines every weapon
 * needs: RemoveDisguise, RemoveInvisibility / FadeInvis, IsStealthed and the
 * cloak half of CTFPlayer::CanAttack.
 *
 * The core Player has no fields for these, so they live here per player;
 * the Invis Watch and the Disguise Kit network them in their weapon records.
 */

import { TF_COND } from '../conditions';
import { DISGUISE, INVIS_WATCH } from '../../data/weapons';
import type { Player } from '../player';
import { DISGUISE_WEAROFF_TIME, REMOVE_INVIS_FADE_SCALE, SPY_STEALTH_BLINKSCALE } from './constants';

export interface SpyState {
  /** m_flInvisChangeCompleteTime: when the current fade in/out ends. */
  invisChangeCompleteTime: number;
  /** m_flStealthNoAttackExpire: no attacking before this after decloaking. */
  stealthNoAttackExpire: number;
  /** m_flStealthNextChangeTime: the watch can't toggle again before this. */
  stealthNextChangeTime: number;
  /** m_flLastStealthExposeTime: last bump / hit while cloaked (STEALTHED_BLINK). */
  lastStealthExposeTime: number;
  /** m_flInvisibility (0 visible … 1 invisible), for the renderer. */
  invisibility: number;
  /** m_nDesiredDisguiseTeam / Class / target while TF_COND_DISGUISING. */
  desiredDisguiseTeam: number;
  desiredDisguiseClass: number;
  desiredDisguiseTarget: number;
  /** m_flDisguiseCompleteTime (0 = none pending). */
  disguiseCompleteTime: number;
  /** m_iDisguiseHealth: the health enemies see. */
  disguiseHealth: number;
  /** The item enemies see the disguised Spy holding (DetermineDisguiseWeapon), -1 = none. */
  disguiseWeapon: number;
  /** The last disguise (the "lastdisguise" command). */
  lastDisguiseTeam: number;
  lastDisguiseClass: number;
}

const states = new WeakMap<Player, SpyState>();

const newState = (): SpyState => ({
  invisChangeCompleteTime: 0,
  stealthNoAttackExpire: 0,
  stealthNextChangeTime: 0,
  lastStealthExposeTime: -1000,
  invisibility: 0,
  desiredDisguiseTeam: 0,
  desiredDisguiseClass: 0,
  desiredDisguiseTarget: 0,
  disguiseCompleteTime: 0,
  disguiseHealth: 0,
  disguiseWeapon: -1,
  lastDisguiseTeam: 0,
  lastDisguiseClass: 0,
});

/** The state table, for a checkpoint (sim/checkpoint): read without creating, and put back. */
export const spyStateTable = {
  peek: (p: Player): SpyState | undefined => states.get(p),
  set: (p: Player, s: SpyState): void => void states.set(p, s),
};

export function spyState(p: Player): SpyState {
  let s = states.get(p);
  if (!s) {
    s = newState();
    states.set(p, s);
  }
  return s;
}

/** Back to defaults (respawn / resupply). */
export function resetSpyState(p: Player): void {
  Object.assign(spyState(p), newState());
}

/** SDK: CTFPlayerShared::IsStealthed (stock: TF_COND_STEALTHED). */
export const isStealthed = (p: Player): boolean => p.cond.has(TF_COND.STEALTHED);

/**
 * The cloak half of CTFPlayer::CanAttack: not while cloaked, nor for
 * tf_spy_cloak_no_attack_time after decloaking.
 */
export function cloakBlocksAttack(p: Player): boolean {
  if (p.cond.has(TF_COND.STEALTHED)) return true;
  const s = states.get(p);
  return !!s && s.stealthNoAttackExpire > p.world.curtime;
}

/**
 * SDK: CTFPlayerShared::FadeInvis — leave cloak; the fade takes
 * scale × tf_spy_invis_unstealth_time and attacking is blocked meanwhile.
 */
export function fadeInvis(p: Player, scale = 1): void {
  const s = spyState(p);
  p.cond.remove(TF_COND.STEALTHED);
  const fade = scale * INVIS_WATCH.unstealthTime;
  const t = p.world.curtime;
  // FadeInvis: very short fades (< 0.15 s) don't block attacking.
  if (fade >= 0.15) s.stealthNoAttackExpire = t + INVIS_WATCH.noAttackAfterUncloak * scale;
  s.invisChangeCompleteTime = t + fade;
}

/** SDK: CTFPlayer::RemoveInvisibility — an attack drops the cloak quickly. */
export function removeInvisibility(p: Player): void {
  if (!isStealthed(p)) return;
  fadeInvis(p, REMOVE_INVIS_FADE_SCALE);
}

/** SDK: CTFPlayerShared::RemoveDisguise. */
export function removeDisguise(p: Player): void {
  if (!p.cond.has(TF_COND.DISGUISED) && !p.cond.has(TF_COND.DISGUISING)) return;
  if (p.disguiseTeam !== p.team) p.cond.remove(TF_COND.TELEPORTED);
  p.cond.remove(TF_COND.DISGUISED);
  p.cond.remove(TF_COND.DISGUISING);
  p.cond.add(TF_COND.DISGUISE_WEARINGOFF, DISGUISE_WEAROFF_TIME);
  p.disguiseTeam = 0;
  p.disguiseClass = 0;
  p.disguiseTarget = 0;
  const s = spyState(p);
  s.disguiseCompleteTime = 0;
  s.disguiseWeapon = -1;
}

/** SDK: CTFPlayerShared::OnSpyTouchedByEnemy / NoteLastDamageTime — flicker while cloaked. */
export function exposeCloak(p: Player): void {
  if (!p.cond.has(TF_COND.STEALTHED)) return;
  spyState(p).lastStealthExposeTime = p.world.curtime;
  p.cond.add(TF_COND.STEALTHED_BLINK);
}

/** SDK: CTFPlayerShared::InvisibilityThink — the 0…1 fade the renderer draws. */
export function invisibilityThink(p: Player): number {
  const s = spyState(p);
  const t = p.world.curtime;
  let target: number;
  const scale = p.cond.has(TF_COND.STEALTHED_BLINK) || p.cond.has(TF_COND.URINE) ? SPY_STEALTH_BLINKSCALE : 1;
  if (s.invisChangeCompleteTime > t) {
    target = isStealthed(p) ? 1 - (s.invisChangeCompleteTime - t) / INVIS_WATCH.fadeTime : (s.invisChangeCompleteTime - t) * 0.5;
  } else target = isStealthed(p) ? 1 : 0;
  s.invisibility = Math.min(1, Math.max(0, target * scale));
  return s.invisibility;
}

/** TF_TIME_TO_DISGUISE / TF_TIME_TO_QUICK_DISGUISE for the next disguise. */
export const disguiseTime = (p: Player): number => (p.cond.has(TF_COND.DISGUISED) ? DISGUISE.quickTime : DISGUISE.time);
