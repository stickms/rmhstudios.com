/** How much ammo each class carries. Kept apart from the simulator so game-state can use it too. */

import type { TestState, Tf2Class } from '../fixtures';

/** Rounds in a full clip; 0 for weapons that draw straight from the reserve. */
export const CLIP_SIZE: Record<Tf2Class, number> = {
  scout: 6,
  soldier: 4,
  pyro: 0,
  demoman: 4,
  heavy: 0,
  engineer: 6,
  medic: 40,
  sniper: 25,
  spy: 6,
};

export const RESERVE_MAX: Record<Tf2Class, number> = {
  scout: 32,
  soldier: 20,
  pyro: 200,
  demoman: 16,
  heavy: 200,
  engineer: 32,
  medic: 150,
  sniper: 75,
  spy: 24,
};

/** Whether a class is running low on ammo (a quarter of a clip, or of the reserve for classes with no clip). */
export function lowAmmo(s: TestState): boolean {
  const clip = CLIP_SIZE[s.playerClass];
  return clip > 0
    ? s.ammoClip <= Math.max(1, Math.floor(clip / 4))
    : s.ammoReserve <= RESERVE_MAX[s.playerClass] / 5;
}
