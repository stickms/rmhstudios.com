/**
 * Loads a map for the simulation: parses the BSP, builds its collision world
 * (brushes, displacements, brush entities, and static props when their
 * collision models are available) and exposes the entity lump. The world
 * spawns the entities (GameWorld's constructor) — this module only reads.
 */

import { parseBsp, type BspFile, type StaticProp } from '../formats/bsp';
import type { BspEntity } from '../formats/keyvalues';
import { MapCollision } from '../world/map-collision';
import { addBspStaticProps, type PropCollisionModel } from '../world/prop-collision';

export interface LoadedMap {
  /** Map name without extension, from worldspawn or the caller. */
  name: string;
  bsp: BspFile;
  collision: MapCollision;
  entities: readonly BspEntity[];
  staticProps: readonly StaticProp[];
  /** How many static props got collision. */
  staticPropsWithCollision: number;
}

export interface LoadMapOptions {
  name?: string;
  /**
   * Resolves a static prop model to its collision model (world/prop-collision
   * `propResolver(fs)`); without it static props don't collide.
   */
  propCollision?: (model: string) => PropCollisionModel | null;
}

/** Parses `bspBytes` and builds everything the simulation needs. */
export function loadMap(bspBytes: Uint8Array, opts: LoadMapOptions | ((model: string) => PropCollisionModel | null) = {}): LoadedMap {
  const options: LoadMapOptions = typeof opts === 'function' ? { propCollision: opts } : opts;
  const bsp = parseBsp(bspBytes);
  return loadParsedMap(bsp, options);
}

/** Same as loadMap for an already parsed BSP (shared with the renderer). */
export function loadParsedMap(bsp: BspFile, options: LoadMapOptions = {}): LoadedMap {
  const collision = new MapCollision(bsp);
  let added = 0;
  if (options.propCollision) added = addBspStaticProps(collision, bsp, options.propCollision);
  const world = bsp.entities.find((e) => e.classname === 'worldspawn');
  const name = options.name ?? world?.get('mapname') ?? '';
  return {
    name,
    bsp,
    collision,
    entities: bsp.entities,
    staticProps: bsp.staticProps?.props ?? [],
    staticPropsWithCollision: added,
  };
}
