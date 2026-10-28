/**
 * A tiny stand-in for a match: keys and time change the numbers the HUD shows, so a HUD can be played with
 * instead of only looked at. Pure functions over `TestState`: they return what changed (or `null`), and the
 * caller applies it through the same `setTest` the Test panel uses.
 */

import { currentWeapon, weaponsFor } from '../game-state';
import { CLIP_SIZE, RESERVE_MAX } from './ammo';
import type { TestState, Tf2Class } from '../fixtures';

/** A full clip and reserve for a class, as after spawning. */
export const freshAmmo = (cls: Tf2Class): Pick<TestState, 'ammoClip' | 'ammoReserve'> => ({
  ammoClip: CLIP_SIZE[cls],
  ammoReserve: RESERVE_MAX[cls],
});

export interface SimResult {
  patch: Partial<TestState>;
  /** An on-screen event to switch on for a moment (a damage number, a killstreak notice). */
  pulse?: { event: string; ms: number };
}

/** The keys Play mode listens for, for the on-screen hint. */
export const PLAY_KEYS: readonly { key: string; label: string }[] = [
  { key: '1 2 3', label: 'Switch weapon' },
  { key: 'F / click', label: 'Fire' },
  { key: 'R', label: 'Reload' },
  { key: 'H', label: 'Take damage' },
  { key: 'J', label: 'Heal' },
  { key: 'K', label: 'Die / respawn' },
  { key: 'N', label: 'Kill (streak)' },
  { key: 'T', label: 'Target ID' },
  { key: 'A', label: 'Alert' },
];

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** A key or click. Returns `null` when it does nothing in this state. */
export function press(s: TestState, rawKey: string): SimResult | null {
  const key = rawKey.toLowerCase();
  const dead = s.health <= 0;

  if (key === 'k') {
    if (dead) {
      return {
        patch: {
          health: s.maxHealth,
          ammoClip: CLIP_SIZE[s.playerClass],
          ammoReserve: RESERVE_MAX[s.playerClass],
        },
      };
    }
    return { patch: { health: 0 } };
  }
  if (dead) return null;

  if (key === '1' || key === '2' || key === '3') {
    const weapon = weaponsFor(s.playerClass)[Number(key) - 1];
    return weapon && weapon.id !== s.weapon ? { patch: { weapon: weapon.id } } : null;
  }
  if (key === 'f' || key === 'fire') {
    const clip = CLIP_SIZE[s.playerClass];
    const patch: Partial<TestState> = {};
    if (clip > 0) {
      if (s.ammoClip <= 0) return null;
      patch.ammoClip = s.ammoClip - 1;
    } else {
      if (s.ammoReserve <= 0) return null;
      patch.ammoReserve = s.ammoReserve - 1;
    }
    if (currentWeapon(s)?.meter) patch.meter = clamp(s.meter - 10, 0, 100);
    return { patch };
  }
  if (key === 'r') {
    const clip = CLIP_SIZE[s.playerClass];
    const take = Math.min(clip - s.ammoClip, s.ammoReserve);
    if (clip <= 0 || take <= 0) return null;
    return { patch: { ammoClip: s.ammoClip + take, ammoReserve: s.ammoReserve - take } };
  }
  if (key === 'h') {
    return {
      patch: { health: Math.max(0, s.health - 25) },
      pulse: { event: 'damage', ms: 1500 },
    };
  }
  if (key === 'j') {
    const health = Math.min(s.maxHealth, s.health + 25);
    return health === s.health ? null : { patch: { health } };
  }
  if (key === 'n') return { patch: {}, pulse: { event: 'killstreak', ms: 3000 } };
  if (key === 't') return { patch: {}, pulse: { event: 'targetid', ms: 3000 } };
  if (key === 'a') return { patch: {}, pulse: { event: 'alert', ms: 3000 } };
  return null;
}

/**
 * Time passing, called about once a second (the round clock shows whole seconds, so a faster tick would
 * only redraw the same picture): the clock runs down, a Medic's Über charge builds and a weapon's meter
 * fills. Returns `null` when nothing changes, so a stopped clock costs no redraws.
 */
export function tick(s: TestState, dtSeconds: number): Partial<TestState> | null {
  const patch: Partial<TestState> = {};
  if (s.roundSeconds > 0) patch.roundSeconds = Math.max(0, s.roundSeconds - dtSeconds);
  if (s.health > 0) {
    if (s.playerClass === 'medic' && s.charge < 100) {
      patch.charge = Math.min(100, s.charge + dtSeconds * 2.5);
    }
    if (currentWeapon(s)?.meter && s.meter < 100) {
      patch.meter = Math.min(100, s.meter + dtSeconds * 5);
    }
  }
  return Object.keys(patch).length ? patch : null;
}
