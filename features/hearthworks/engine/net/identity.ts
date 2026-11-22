import type { World } from '../world';

/** The id the offline player has in a world; an account takes over the seat when it hosts. */
export const LOCAL_PLAYER_ID = 'local';

/**
 * Re-key a player in place (`from` → `to`): the `players` entry and everything in the world that names the
 * player as an owner (`ownerId`, `playerId` fields — hired workers today). Hosting turns the offline player
 * into the account's player so its money, pantry and workers carry into the shared world, and the id every
 * peer sees for the host is the one the hub vouches for.
 *
 * If `to` already has a seat (the world was hosted by this account before), that seat wins and the
 * placeholder is dropped; anything the placeholder owned is handed to `to` either way.
 */
export function rekeyPlayer(world: World, from: string, to: string): void {
  if (from === to) return;
  const seat = world.players[from];
  if (seat) {
    delete world.players[from];
    if (!world.players[to]) {
      seat.id = to;
      world.players[to] = seat;
    }
  }
  retarget(world, from, to);
}

const OWNER_KEYS = new Set(['ownerId', 'playerId']);

/** Rewrite owner references in plain data (skipping the big primitive arrays: terrain, height). */
function retarget(node: unknown, from: string, to: string): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    if (node.length === 0 || typeof node[0] !== 'object' || node[0] === null) return;
    for (const item of node) retarget(item, from, to);
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    if (OWNER_KEYS.has(key) && value === from) (node as Record<string, unknown>)[key] = to;
    else if (value && typeof value === 'object') retarget(value, from, to);
  }
}
