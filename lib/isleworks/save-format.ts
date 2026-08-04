/**
 * What an Isleworks save *is*, with nothing that can import anything.
 *
 * A leaf module on purpose. `city.ts` writes saves through `cloud.ts`, and
 * `cloud.ts` needs the key, the version and the shape — so with these declared
 * in `city.ts` the two imported each other, and the cycle was not the benign
 * kind: `cloud.ts` reads `SAVE_KEY` at module scope to build the store, so
 * whichever of the two loaded first would evaluate the other against a `const`
 * still in its temporal dead zone. Every entry to the game would have thrown.
 *
 * The format itself is unchanged and deliberately minimal: only what cannot be
 * recomputed. Terrain comes back from the seed and every derived field from one
 * call to `recomputeDerived`.
 */

export const SAVE_VERSION = 1;
export const SAVE_KEY = 'isleworks:city';

export interface SavedBuilding {
  d: string;
  x: number;
  y: number;
  r: number;
  l: number;
  c: number;
  m: number;
}

export interface SavedCity {
  v: number;
  seed: number;
  money: number;
  taxRate: number;
  month: number;
  population: number;
  peak: number;
  parcels: number[];
  buildings: SavedBuilding[];
  claimed: string[];
  completed: string[];
}
