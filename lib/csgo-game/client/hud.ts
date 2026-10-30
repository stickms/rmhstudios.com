/**
 * CS:GO's part of the HUD state (HudState.cs), from the newest snapshot: our money, armour and kit,
 * the buy window, the round's phase and clock, the bomb, flash blindness, deathmatch respawns, and our
 * weapons by slot. Pure over its inputs (no DOM); the HUD component (components/csgo-game) draws it.
 */

import type { HudDecorateContext } from '../../tf2-game/client/game-profile';
import type { HudCs, HudCsWeapon, HudState } from '../../tf2-game/client/hud-state';
import { LIFE_ALIVE } from '../../tf2-game/sim/entity';
import type { NetRecord } from '../../tf2-game/sim/net-schema';
import type { Player } from '../../tf2-game/sim/player';
import { csWeaponByDefindex, hasCsWeaponData } from '../data/weapon-data';

const n = (r: NetRecord | null | undefined, k: string): number => (r && typeof r[k] === 'number' ? (r[k] as number) : 0);
const b = (r: NetRecord | null | undefined, k: string): boolean => !!(r && r[k]);

/** Seconds a flashbang's white-out takes to fade at the end of its duration (it holds full before that). */
export const FLASH_FADE_SECONDS = 3;

/** How white the view is now: full until the last FLASH_FADE_SECONDS, then fading out. */
export function flashOpacity(now: number, at: number, duration: number, alpha: number): number {
  const left = at + duration - now;
  if (duration <= 0 || left <= 0) return 0;
  return Math.min(1, left / FLASH_FADE_SECONDS) * Math.min(1, alpha / 255);
}

export function buildCsHud(ctx: HudDecorateContext): HudCs | null {
  const rules = ctx.entities('cs_rules')[0] ?? null;
  const me = ctx.me;
  if (!rules) return null;
  const now = ctx.serverTime;
  const mode = rules.mode === 'dm' ? 'dm' : 'de';
  const c4 = ctx.entities('cs_planted_c4').find((r) => !b(r, 'exploded') && !b(r, 'defused')) ?? null;
  const freezeEnds = n(rules, 'freezeEndsAt');
  const roundEnds = n(rules, 'roundEndsAt');
  const winner = n(rules, 'roundWinner');
  const phase: HudCs['phase'] = b(rules, 'gameOver')
    ? 'gameover'
    : winner > 0
      ? 'over'
      : b(rules, 'bombPlanted')
        ? 'planted'
        : now < freezeEnds
          ? 'freeze'
          : 'live';
  // The clock: the freeze countdown, the round's, nothing while the bomb ticks (its own timer shows).
  const timeLeft =
    phase === 'freeze' ? Math.max(0, freezeEnds - now) : phase === 'live' ? Math.max(0, roundEnds - now) : phase === 'planted' ? null : null;
  const buyTimeLeft = mode === 'dm' ? Infinity : Math.max(0, n(rules, 'buyEndsAt') - now);
  const alive = n(me, 'lifeState') === LIFE_ALIVE;
  const defuseEnds = n(c4, 'defuseEndsAt');
  const weapons: HudCsWeapon[] = [];
  if (hasCsWeaponData()) {
    for (const { slot, record } of ctx.weapons) {
      const info = csWeaponByDefindex(n(record, 'defindex'));
      if (!info) continue;
      weapons.push({
        slot,
        name: info.name,
        short: info.short,
        clip: n(record, 'clip'),
        reserve: n(record, 'reserve'),
        active: n(me, 'activeSlot') === slot,
      });
    }
  }
  const respawnAt = n(me, 'respawnAt');
  return {
    mode,
    money: n(me, 'money'),
    armor: n(me, 'armor'),
    helmet: b(me, 'helmet'),
    defuser: b(me, 'defuser'),
    hasC4: b(me, 'hasC4'),
    canBuy: alive && b(me, 'inBuyZone') && buyTimeLeft > 0 && phase !== 'over' && phase !== 'gameover',
    buyTimeLeft: Number.isFinite(buyTimeLeft) ? buyTimeLeft : 0,
    phase,
    timeLeft,
    round: n(rules, 'roundNumber'),
    bomb: c4
      ? {
          timeLeft: Math.max(0, n(c4, 'explodesAt') - now),
          defusing: n(c4, 'defuser') > 0,
          defuseLeft: n(c4, 'defuser') > 0 && defuseEnds > 0 ? Math.max(0, defuseEnds - now) : null,
        }
      : null,
    roundWinner: winner,
    winReason: n(rules, 'roundWinReason'),
    flash: flashOpacity(now, n(me, 'flashAt'), n(me, 'flashDuration'), n(me, 'flashAlpha')),
    planting: b(me, 'planting'),
    defusing: b(me, 'defusing'),
    respawnIn: mode === 'dm' && !alive && respawnAt > 0 ? Math.max(0, respawnAt - now) : null,
    protected: n(me, 'immuneUntil') > now,
    weapons: weapons.sort((a, c) => a.slot - c.slot),
  };
}

/** ClientGameProfile.decorateHud: CS:GO's HUD part on the shared state. */
export function decorateCsHud(state: HudState, _p: Player | null, ctx: HudDecorateContext): void {
  state.cs = buildCsHud(ctx);
}
