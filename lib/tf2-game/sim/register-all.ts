/**
 * The ONE seam where the simulation's optional modules are wired into a
 * match: the stock arsenal, map entities, game modes and buildings. Every
 * host (the hub's match worker, the browser listen server, tests) calls
 * `registerAllSimModules()` before building a world and `gameModeForMap()`
 * after, so turning a module on is a change to this file only.
 *
 * Modules land independently; until one exists its import stays commented
 * out (a static import of a missing file breaks every bundle). To enable one,
 * uncomment its import and the matching line in `registerAllSimModules` /
 * `gameModeForMap`.
 */

import type { GameMode } from './rules';
import type { GameWorld } from './world';
import type { Tf2Mode } from '../data/maps';

// import { registerStockWeapons } from './weapons';
// import { registerMapEntities } from './entities';
// import { createGameModeForMap } from './modes';
import { registerBuildings } from './buildings';

let registered = false;

/** Registers every available module's classes and factories. Idempotent. */
export function registerAllSimModules(): void {
  if (registered) return;
  registered = true;
  // registerStockWeapons();
  // registerMapEntities();
  registerBuildings();
}

/**
 * The game mode for a map (CTF flags, control points, payload, KOTH, arena),
 * or null to run with the core rules only. Install it with `world.setMode`.
 */
export function gameModeForMap(world: GameWorld, map: string, mode: Tf2Mode): GameMode | null {
  void world;
  void map;
  void mode;
  // return createGameModeForMap(world, map, mode);
  return null;
}
