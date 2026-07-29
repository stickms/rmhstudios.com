/**
 * Which tabs have something worth looking at.
 *
 * An idle game's tab bar is a to-do list: the player wants to know where the
 * next purchase is without opening five panels to find out. `computeAlerts`
 * answers "is there anything in here I can afford right now?" per tab.
 *
 * It runs on the tab rail's 600ms heartbeat, so it stays cheap: the source and
 * upgrade scans stop at the first hit rather than costing the whole catalog.
 */

import type { GameState } from '@/lib/temple-of-joy/types';
import { SOURCES } from '@/lib/temple-of-joy/data/sources';
import { UPGRADES } from '@/lib/temple-of-joy/data/upgrades';
import { RELICS } from '@/lib/temple-of-joy/data/relics';
import { WHEEL_UPGRADES } from '@/lib/temple-of-joy/data/wheel';
import { ASCENSION_UPGRADES } from '@/lib/temple-of-joy/data/ascension';
import {
  computeSourceCost,
  computeUpgradeCost,
  computeIsUpgradeVisible,
  computeCanAscend,
} from '@/lib/temple-of-joy/engine';

export function computeAlerts(s: GameState): string[] {
  const alerts: string[] = [];

  if (
    SOURCES.some((def) => {
      const owned = s.sources[def.id] ?? 0;
      // Only sources the player has actually met — an alert for something they
      // cannot see yet is a dot pointing at nothing.
      if (owned === 0 && s.peakHappiness < def.baseCost * 0.1) return false;
      return s.happiness >= computeSourceCost(def.id, owned, s);
    })
  ) {
    alerts.push('sources');
  }

  if (
    UPGRADES.some(
      (u) =>
        !s.upgrades.has(u.id) &&
        computeIsUpgradeVisible(u.id, s) &&
        s.happiness >= computeUpgradeCost(u.id, s),
    )
  ) {
    alerts.push('upgrades');
  }

  if (
    s.activeRelics.length < s.maxRelicSlots &&
    RELICS.some((r) => !s.activeRelics.includes(r.id) && s.karma >= r.karmaCost)
  ) {
    alerts.push('relics');
  }

  if (
    WHEEL_UPGRADES.some(
      (w) =>
        !s.wheelPurchased.has(w.id) &&
        (!w.requires?.length || w.requires.every((id) => s.wheelPurchased.has(id))) &&
        s.blissShards >= w.shardCost,
    )
  ) {
    alerts.push('wheel');
  }

  if (
    computeCanAscend(s) ||
    ASCENSION_UPGRADES.some(
      (u) =>
        !s.ascensionUpgrades.has(u.id) &&
        (!u.requires || u.requires.every((id) => s.ascensionUpgrades.has(id))) &&
        s.radiance >= u.cost,
    )
  ) {
    alerts.push('ascension');
  }

  return alerts;
}
