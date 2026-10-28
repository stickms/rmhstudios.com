/**
 * Which HUD animation events the game would start as the player's numbers change: the overheal pulse, the
 * dying pulse, the low-ammo pulse, the Über-ready pulse, the flash when hit. Each "pulse" event loops until its
 * `…Stop` event runs, so entering a state fires the pulse and leaving it fires the stop.
 */

import type { TestState } from '../fixtures';
import { lowAmmo } from './ammo';

interface Flags {
  overheal: boolean;
  dying: boolean;
  lowAmmo: boolean;
  charged: boolean;
}

function flags(s: TestState): Flags {
  const alive = s.health > 0;
  return {
    overheal: alive && s.health > s.maxHealth,
    dying: alive && s.health <= s.maxHealth * 0.25,
    lowAmmo: alive && lowAmmo(s),
    charged: alive && s.playerClass === 'medic' && s.charge >= 100,
  };
}

const PAIRS: readonly [keyof Flags, string, string][] = [
  ['overheal', 'HudHealthBonusPulse', 'HudHealthBonusPulseStop'],
  ['dying', 'HudHealthDyingPulse', 'HudHealthDyingPulseStop'],
  ['lowAmmo', 'HudLowAmmoPulse', 'HudLowAmmoPulseStop'],
  ['charged', 'HudMedicCharged', 'HudMedicChargedStop'],
];

/** Events to run now that the state went from `prev` (null = just started) to `next`. */
export function animationEvents(prev: TestState | null, next: TestState): string[] {
  const before = prev
    ? flags(prev)
    : { overheal: false, dying: false, lowAmmo: false, charged: false };
  const after = flags(next);
  const out: string[] = [];
  for (const [flag, start, stop] of PAIRS) {
    if (!before[flag] && after[flag]) out.push(start);
    else if (before[flag] && !after[flag]) out.push(stop);
  }
  if (prev && next.health < prev.health && next.health > 0) out.push('DamagedPlayer');
  return out;
}
