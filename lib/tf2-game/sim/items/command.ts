/**
 * The `loadout` match command: a player equips a loadout for a class (the pause
 * menu's Loadout view). It is checked exactly like a saved loadout plus the
 * game's own rules (loadout.ts `checkGameLoadout`), stored for that class, and
 * put on the way TF2 does: at the next respawn or resupply cabinet touch, or at
 * once when the player stands in their own team's respawn room
 * (CTFPlayer::CheckInstantLoadoutRespawn → ForceRegenerateAndRespawn).
 *
 * The answer goes to the player alone as a `loadout` event.
 *
 * Environment-agnostic.
 */

import { LIFE_ALIVE } from '../entity';
import type { LoadoutEvent } from '../events';
import type { Player } from '../player';
import { GR_STATE_TEAM_WIN } from '../rules';
import type { GameWorld } from '../world';
import type { LoadoutSlots, TfClass } from '../../../tf2-loadout/catalog-types';
import { checkGameLoadout, classIndexOf } from './loadout';
import { itemCatalog } from './registry';

/** SDK: CTFPlayer::CheckInstantLoadoutRespawn — may the new loadout go on right now? */
export function canApplyLoadoutNow(world: GameWorld, p: Player): boolean {
  if (p.lifeState !== LIFE_ALIVE) return false;
  if (!p.inRespawnRoom()) return false;
  const rules = world.rules;
  if (rules.inStalemate()) return false;
  if (rules.state === GR_STATE_TEAM_WIN && rules.winningTeam !== p.team) return false;
  return true;
}

export function applyLoadoutCommand(
  world: GameWorld,
  p: Player,
  cls: TfClass,
  slots: LoadoutSlots,
): LoadoutEvent['status'] {
  const clsIndex = classIndexOf(cls);
  const check = checkGameLoadout(itemCatalog(), cls, slots);
  const answer = (status: LoadoutEvent['status'], reason?: string): LoadoutEvent['status'] => {
    world.events.push({
      type: 'loadout',
      to: p.id,
      player: p.id,
      cls: clsIndex,
      status,
      ...(reason ? { reason } : {}),
    });
    return status;
  };
  if (!check.ok) return answer('refused', check.reason);
  p.setClassLoadout(clsIndex, check.slots);
  if (clsIndex !== p.playerClass) return answer('pending');
  if (canApplyLoadoutNow(world, p)) {
    // ForceRegenerateAndRespawn: back to a spawn point with the new items.
    world.rules.respawnNow(p, true);
    return answer('applied');
  }
  return answer('pending');
}
