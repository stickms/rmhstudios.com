import { CROPS } from '../content';
import { TICK_MS, type Building, type Crop, type World } from './types';

export const tileIndex = (w: World, x: number, z: number) => z * w.size + x;
export const inBounds = (w: World, x: number, z: number) =>
  Number.isInteger(x) && Number.isInteger(z) && x >= 0 && z >= 0 && x < w.size && z < w.size;

export const buildingAt = (w: World, x: number, z: number): Building | undefined =>
  w.buildings.find((b) => b.x === x && b.z === z);

export const cropStage = (w: World, c: Pick<Crop, 'kind' | 'plantedTick'>): number => {
  const def = CROPS[c.kind];
  return Math.min(def.stages, Math.floor(((w.tick - c.plantedTick) * TICK_MS) / def.stageMs));
};

export const cropRipe = (w: World, c: Crop): boolean => cropStage(w, c) >= CROPS[c.kind].stages;

/** Chebyshev (king-move) tile distance. */
export const tileDistance = (ax: number, az: number, bx: number, bz: number): number =>
  Math.max(Math.abs(Math.round(ax) - Math.round(bx)), Math.abs(Math.round(az) - Math.round(bz)));
