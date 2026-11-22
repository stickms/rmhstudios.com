/**
 * Which tabs deserve a dot.
 *
 * An idle game's tab rail exists to answer one question — "where should I be
 * looking?" — so a dot has to mean *something is worth your attention now* and
 * nothing else. A dot that is always on is a dot nobody sees.
 *
 * Sampled on a slow beat by `TempleTabs`, so this can afford to be thorough.
 */
import type { GameState, TabId } from '@/lib/temple-of-joy/types';
import {
  computeAvailableBlessings,
  computeCanAscend,
  computeGlobeAffordable,
  computeGlobeVisible,
  computeLegacyAffordable,
  computeSourceCost,
  computeSourceVisible,
} from '@/lib/temple-of-joy/engine';
import { SOURCES } from '@/lib/temple-of-joy/data/sources';
import { LEGACY } from '@/lib/temple-of-joy/data/legacy';
import { swapCooldown } from '@/lib/temple-of-joy/minigames/choir';

export function computeAlerts(state: GameState): TabId[] {
  const out: TabId[] = [];

  // Sources: anything you can afford right now.
  for (const source of SOURCES) {
    if (!computeSourceVisible(state, source.id)) continue;
    if (state.joy >= computeSourceCost(source.id, state.sources[source.id] ?? 0)) {
      out.push('sources');
      break;
    }
  }

  // A globe you can afford. It shares the Sources tab, and it is the biggest
  // single purchase on that list, so it deserves the dot on its own.
  if (computeGlobeVisible(state) && computeGlobeAffordable(state) && !out.includes('sources')) {
    out.push('sources');
  }

  // Blessings: same, but these are usually the better buy, so they matter more.
  for (const blessing of computeAvailableBlessings(state)) {
    if (state.joy >= blessing.cost) {
      out.push('blessings');
      break;
    }
  }

  // Garden: something is ripe, or a bed is free and you have a seed selected.
  if (state.garden.unlocked) {
    const ripe = state.garden.plots.some((p) => p.seed && p.growth >= 100);
    if (ripe) out.push('garden');
  }

  // Choir: the cooldown has run out and a stall is empty.
  if (state.choir.unlocked) {
    const free = state.choir.stalls.some((s) => s === null);
    if (free && state.choir.cooldown <= 0) out.push('choir');
  }

  // Exchange: something is unusually cheap, or you are holding a big winner.
  if (state.exchange.unlocked) {
    for (const line of Object.values(state.exchange.goods)) {
      const opened = line.history[0] ?? line.price;
      const move = opened > 0 ? (line.price - opened) / opened : 0;
      if (move < -0.35 || (line.held > 0 && move > 0.5)) {
        out.push('exchange');
        break;
      }
    }
  }

  // Hours: mana is full and going to waste.
  if (state.hours.unlocked && state.hours.mana >= state.hours.maxMana * 0.98) {
    out.push('hours');
  }

  // The Ladder: a rung you can buy, or an ascension worth taking.
  if (computeCanAscend(state)) out.push('temple');
  for (const rung of LEGACY) {
    if (computeLegacyAffordable(state, rung.id)) {
      out.push('legacy');
      break;
    }
  }

  return out;
}

/** Exported so the choir panel can show the same number the rail reasons about. */
export { swapCooldown };
