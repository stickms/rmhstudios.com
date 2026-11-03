// The meta-upgrade levels that change how a solo run PLAYS or PAYS, in one shape that the browser
// (to start a run) and the server (to issue one and to verify it) both derive from the saved upgrades.
//
// NOTE (found while building this): the ids looked up here ('reroll', 'greed', ...) are the ones the
// game has always read, but META_UPGRADES defines them as 'meta_reroll', 'meta_greed', ... so against
// real saves every level below is 0 today, and the five upgrades do nothing in single-player. That is
// existing behaviour and this module preserves it exactly (changing it would change the economy);
// fixing it is a one-line change to the keys below, on the browser and the server at once.

import type { SoloLoadout } from './solo-log';

export function loadoutFromUpgrades(upgrades: Record<string, number> | null | undefined): SoloLoadout {
  const lvl = (id: string) => {
    const v = upgrades?.[id];
    return typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : 0;
  };
  return {
    rerolls: lvl('reroll'),
    banishes: lvl('banish'),
    revival: lvl('revival'),
    extraChoice: lvl('extra_choice') > 0,
    catalystAffinity: lvl('catalyst_affinity'),
    greed: lvl('greed'),
  };
}
