/**
 * Massive March — what the interact key would do right now.
 *
 * One resolver, two consumers: the HUD prints the answer as a prompt, and the
 * controller performs it. Those cannot be allowed to disagree — a prompt that
 * says "pick up the radio" while the key deposits your red rounds is worse than
 * no prompt at all — so they share this function rather than each deciding for
 * themselves.
 *
 * The order below is the priority order, and it is chosen so the *rarer and more
 * deliberate* action wins. Standing at a tower holding red rounds means you
 * walked there to give them up; the radio at your feet can wait.
 *
 * Everything here is a client-side prediction of what the server will allow. The
 * server re-checks all of it (see `puzzles.ts` — occupancy is derived, never
 * reported), so a wrong guess here is a rejected action, not an exploit.
 */

import { ITEMS, type ItemKind } from './items';
import { live } from './live';
import { activeTotems, atSite, DIG_RADIUS } from './puzzles';
import type { PuzzleStatus } from './net/events';
import type { WorldVariant } from './constants';
import { PUZZLE_SITES, TOWERS, type PuzzleSite } from './world/sites';
import { pad } from './world/terrain';

/** Reach for picking things up. Generous — precise pickup in first person is misery. */
export const REACH = 2.6;

export type Interaction =
  | { kind: 'take'; itemId: number; item: ItemKind; label: string }
  | { kind: 'deposit'; tower: string; count: number; label: string }
  | { kind: 'cart'; label: string }
  | { kind: 'turn'; site: string; totem: string; label: string }
  | { kind: 'dig'; site: string; label: string }
  | { kind: 'pack'; target: number; label: string }
  | { kind: 'console'; site: string; label: string }
  | { kind: 'none'; label: null };

const NONE: Interaction = { kind: 'none', label: null };

export interface InteractionContext {
  variant: WorldVariant;
  /** Item ids this player is carrying anywhere. */
  carrying: { id: number; kind: ItemKind }[];
  puzzles: Map<string, PuzzleStatus>;
  unlocks: string[];
  /** Slot → whether that player is wearing a backpack. */
  packWearers: number[];
}

function near(x: number, z: number, radius: number): boolean {
  return Math.hypot(live.self.x - x, live.self.z - z) <= radius;
}

export function resolveInteraction(ctx: InteractionContext): Interaction {
  // ── A tower, with something to give it ───────────────────────────────────
  const orbs = ctx.carrying.filter((item) => item.kind === 'orb').length;
  for (const tower of TOWERS) {
    if (!near(tower.x, tower.z, tower.radius)) continue;
    if (orbs > 0) {
      return {
        kind: 'deposit',
        tower: tower.id,
        count: orbs,
        label: orbs === 1 ? 'Give it the red round' : `Give it ${orbs} red rounds`,
      };
    }
  }

  // ── A cart halt, with a cart that runs ───────────────────────────────────
  if (ctx.unlocks.includes('cart')) {
    const south = pad('cart-south');
    const north = pad('cart-north');
    if (near(south.x, south.z, 9)) return { kind: 'cart', label: 'Ride the cart north' };
    if (near(north.x, north.z, 9)) return { kind: 'cart', label: 'Ride the cart south' };
  }

  // ── Something within arm's reach ─────────────────────────────────────────
  let nearestItem: { id: number; kind: ItemKind; distance: number } | null = null;
  for (const item of live.items.values()) {
    if (item.holder >= 0) continue;
    const distance = Math.hypot(item.x - live.self.x, item.z - live.self.z);
    if (distance > REACH) continue;
    if (!nearestItem || distance < nearestItem.distance) {
      nearestItem = { id: item.id, kind: item.kind, distance };
    }
  }
  if (nearestItem) {
    return {
      kind: 'take',
      itemId: nearestItem.id,
      item: nearestItem.kind,
      label: `Pick up the ${ITEMS[nearestItem.kind].name.toLowerCase()}`,
    };
  }

  // ── A machine at this site ───────────────────────────────────────────────
  for (const site of PUZZLE_SITES) {
    if (!atSite(site, live.self)) continue;
    const status = ctx.puzzles.get(site.id);
    if (status?.state === 'solved' || status?.state === 'skipped') continue;

    const totem = nearestTotem(site, ctx.variant);
    if (totem) {
      return { kind: 'turn', site: site.id, totem: totem.id, label: 'Turn the totem' };
    }

    if (site.hunt && ctx.carrying.some((item) => item.kind === 'detector')) {
      // Digging is allowed anywhere in the search area; whether there is
      // anything there is the server's answer to give.
      if (near(site.hunt.x, site.hunt.z, site.hunt.r + DIG_RADIUS)) {
        return { kind: 'dig', site: site.id, label: 'Dig here' };
      }
    }

    if (site.console && near(site.console.x, site.console.z, site.console.r + 1.5)) {
      return { kind: 'console', site: site.id, label: 'Use the console' };
    }
  }

  // ── Somebody else's backpack ─────────────────────────────────────────────
  for (const slot of ctx.packWearers) {
    if (slot === live.selfSlot) continue;
    const player = live.players.get(slot);
    if (!player) continue;
    if (Math.hypot(player.x - live.self.x, player.z - live.self.z) > REACH + 1) continue;
    return { kind: 'pack', target: slot, label: 'Open their backpack' };
  }

  return NONE;
}

function nearestTotem(site: PuzzleSite, variant: WorldVariant) {
  const totems = activeTotems(site, variant);
  for (const totem of totems) {
    if (near(totem.x, totem.z, totem.r + 1.5)) return totem;
  }
  return null;
}

/** The site the player is standing in, if any — drives the HUD's site panel. */
export function siteHere(): PuzzleSite | null {
  for (const site of PUZZLE_SITES) {
    if (atSite(site, live.self)) return site;
  }
  return null;
}

/** The tower the player is standing at, if any. */
export function towerHere(): string | null {
  for (const tower of TOWERS) {
    if (near(tower.x, tower.z, tower.radius)) return tower.id;
  }
  return null;
}
