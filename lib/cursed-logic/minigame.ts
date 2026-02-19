import type { PlayerAction, ProtocolAction, LastRound, RoundModifier, MinigameKind } from './types';

export interface MinigameTrigger {
  kind: MinigameKind;
  chaosDistort: boolean;
}

/**
 * Determine if a minigame should trigger for this round.
 * Only on: Strike vs Strike, Strike vs Block (player attacker), Block vs Strike (player defender),
 * Prepare fails (Protocol Struck), or Chaos (same rules + distort).
 * Never on: Probe, Prepare success, or rounds with no damage.
 */
export function getMinigameForRound(
  playerAction: PlayerAction,
  protocolAction: ProtocolAction,
  modifier: RoundModifier | null,
  playerDamage: number,
  protocolDamage: number
): MinigameTrigger | null {
  if (playerAction === 'Probe') return null;
  const hasDamage = playerDamage > 0 || protocolDamage > 0;
  if (!hasDamage) return null;

  const chaos = modifier === 'Chaos';

  if (playerAction === 'Prepare' && protocolAction === 'Strike') {
    return { kind: 'rapid_choice', chaosDistort: chaos };
  }
  if (playerAction === 'Strike' && protocolAction === 'Strike') {
    return { kind: 'timed_press', chaosDistort: chaos };
  }
  if (playerAction === 'Strike' && protocolAction === 'Block') {
    return { kind: 'hold_zone', chaosDistort: chaos };
  }
  if (playerAction === 'Block' && protocolAction === 'Strike') {
    return { kind: 'timed_press', chaosDistort: chaos };
  }

  return null;
}

export interface MinigameAdjustmentResult {
  lastRound: LastRound;
  skipExposed: boolean;
}

/**
 * Apply minigame success/failure to the round result. Never flips win/loss; caps at 0.
 * Chaos: success = +1 player favor, failure = -1 player favor (1 damage in the appropriate direction).
 */
export function applyMinigameAdjustment(
  lastRound: LastRound,
  success: boolean,
  kind: MinigameKind,
  chaosDistort: boolean
): MinigameAdjustmentResult {
  let playerDamage = lastRound.playerDamage;
  let protocolDamage = lastRound.protocolDamage;
  let skipExposed = false;

  if (chaosDistort) {
    if (success) {
      if (playerDamage > 0) playerDamage = Math.max(0, playerDamage - 1);
      else protocolDamage += 1;
    } else {
      if (protocolDamage > 0) protocolDamage = Math.max(0, protocolDamage - 1);
      else playerDamage += 1;
    }
    return {
      lastRound: { ...lastRound, playerDamage, protocolDamage },
      skipExposed: false,
    };
  }

  switch (kind) {
    case 'timed_press': {
      const strikeVsStrike =
        lastRound.playerAction === 'Strike' && lastRound.protocolAction === 'Strike';
      if (strikeVsStrike) {
        if (success) protocolDamage += 1;
        else playerDamage += 1;
      } else {
        // Block vs Strike (defender)
        if (success) playerDamage = Math.max(0, playerDamage - 1);
        else playerDamage += 1;
      }
      break;
    }
    case 'hold_zone': {
      // Strike vs Block (attacker): success = chip +1 to Protocol, failure = chip -1 (min 0)
      if (success) protocolDamage += 1;
      else protocolDamage = Math.max(0, protocolDamage - 1);
      break;
    }
    case 'rapid_choice': {
      // Prepare fail: success = damage -1 and no Exposed
      if (success) {
        playerDamage = Math.max(0, playerDamage - 1);
        skipExposed = true;
      }
      break;
    }
  }

  return {
    lastRound: { ...lastRound, playerDamage, protocolDamage },
    skipExposed,
  };
}
