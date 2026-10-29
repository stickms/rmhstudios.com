/**
 * Static prop collision inputs: a model's convex hulls (from its .phy) and
 * hull box (from its .mdl), loaded through any GameFileSystem, and the glue
 * that adds every static prop of a BSP to a MapCollision.
 * SDK: CStaticProp::Init / CreateVPhysics (engine/staticpropmgr.cpp is not in
 * the SDK; the rules are SOLID_NONE skipped, SOLID_BBOX → the model's hull
 * box, SOLID_VPHYSICS → the model's collision model).
 */

import type { BspFile } from '../formats/bsp';
import { parseMdlHeader } from '../formats/mdl-header';
import { parsePhy } from '../formats/phy';
import type { GameFileSystem } from '../formats/vpk';
import type { Vec3 } from '../core/vec';
import { SOLID_NONE, type MapCollision } from './map-collision';

export interface PropCollisionModel {
  /** Convex vertex sets in model space (Source units). Empty when the model has no .phy. */
  hulls: Float32Array[];
  /** studiohdr_t hull_min / hull_max. */
  mins: Vec3;
  maxs: Vec3;
  surfaceProp: string;
  contents: number;
}

/** Loads a prop's collision data, or null if the .mdl is missing/unreadable. */
export function loadPropCollisionModel(
  fs: GameFileSystem,
  modelPath: string,
): PropCollisionModel | null {
  const mdlBytes = fs.read(modelPath);
  if (!mdlBytes) return null;
  let header: ReturnType<typeof parseMdlHeader>;
  try {
    header = parseMdlHeader(mdlBytes);
  } catch {
    return null;
  }
  const { hullMin: mins, hullMax: maxs, surfaceProp, contents } = header;
  const hulls: Float32Array[] = [];
  const phyBytes = fs.read(modelPath.replace(/\.mdl$/i, '.phy'));
  if (phyBytes) {
    try {
      const phy = parsePhy(phyBytes);
      // Static props collide with the first solid (SDK: the static prop's vcollide solid 0).
      const solid = phy.solids[0];
      if (solid) for (const c of solid.convexes) hulls.push(c.vertices);
    } catch {
      // fall back to the hull box
    }
  }
  return { hulls, mins, maxs, surfaceProp, contents };
}

/**
 * Adds every solid static prop of `bsp` to `collision`. `resolve` returns the
 * collision model for a model path (cache it — props repeat). Returns how many
 * props were added.
 */
export function addBspStaticProps(
  collision: MapCollision,
  bsp: BspFile,
  resolve: (model: string) => PropCollisionModel | null,
): number {
  const sp = bsp.staticProps;
  if (!sp) return 0;
  let added = 0;
  for (const p of sp.props) {
    if (p.solid === SOLID_NONE) continue;
    const m = resolve(p.model);
    if (!m) continue;
    const idx = collision.addStaticProp(m.hulls, p.origin, p.angles, p.solid, {
      mins: m.mins,
      maxs: m.maxs,
      surfaceName: m.surfaceProp,
      // MDL contents of 0 means the default (CONTENTS_SOLID).
      contents: m.contents || undefined,
    });
    if (idx >= 0) added++;
  }
  return added;
}

/** A memoizing resolver over a GameFileSystem. */
export function propResolver(fs: GameFileSystem): (model: string) => PropCollisionModel | null {
  const cache = new Map<string, PropCollisionModel | null>();
  return (model) => {
    const key = model.toLowerCase();
    let v = cache.get(key);
    if (v === undefined) {
      v = loadPropCollisionModel(fs, key);
      cache.set(key, v);
    }
    return v;
  };
}
