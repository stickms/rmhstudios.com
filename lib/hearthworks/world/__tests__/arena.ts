import {
  createWorld,
  stepWorld,
  TICK_MS,
  type Command,
  type Officer,
  type World,
  type WorldEvent,
} from '..';

/** Test helpers for the crime route: a flat arena, a player, and a way to advance whole ticks. */

/** A flat `size`×`size` arena (grass at level 3) with a water rim. */
export function arena(size = 24, seed = 1): World {
  const w = createWorld(seed, size);
  w.terrain = w.terrain.map((_, i) => {
    const x = i % size;
    const z = Math.floor(i / size);
    return x === 0 || z === 0 || x === size - 1 || z === size - 1 ? 'water' : 'grass';
  });
  w.height = w.height.map((_, i) => {
    const x = i % size;
    const z = Math.floor(i / size);
    return x === 0 || z === 0 || x === size - 1 || z === size - 1 ? 0 : 3;
  });
  return w;
}

export function setTile(
  w: World,
  x: number,
  z: number,
  level: number,
  terrain: World['terrain'][number] = 'grass',
) {
  w.height[z * w.size + x] = level;
  w.terrain[z * w.size + x] = terrain;
}

export const P = 'p1';

/** An arena with one player standing at (x, z). */
export function withPlayer(w: World, x: number, z: number, id = P) {
  stepWorld(w, 0, [{ type: 'join', playerId: id }]);
  w.players[id].x = x;
  w.players[id].z = z;
  return w.players[id];
}

/** Advance `n` whole ticks (applying `cmds` on the first), returning every event. */
export function ticks(w: World, n: number, cmds: readonly Command[] = []): WorldEvent[] {
  const out: WorldEvent[] = [];
  out.push(...stepWorld(w, n * TICK_MS, cmds));
  return out;
}

export const give = (
  w: World,
  id: string,
  gun: 'pistol' | 'revolver' | 'smg' | 'shotgun' | 'rifle' | 'marksman',
  equip = true,
) => {
  stepWorld(w, 0, [
    { type: 'buyWeapon', playerId: id, weapon: gun },
    ...(equip ? ([{ type: 'equip', playerId: id, weapon: gun }] as Command[]) : []),
  ]);
};

export const officersOf = (w: World): Officer[] => w.officers;
