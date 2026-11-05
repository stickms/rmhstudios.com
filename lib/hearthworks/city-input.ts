import { ROAD_RUN_MAX, ZONE_BRUSH_MAX, type ZoneId } from './content';
import type { LocalCommand } from './store';

/**
 * Turning a drag into commands. A road drag from tile A to tile B lays an L: along the longer axis first, then the
 * shorter, so a gentle wobble of the pointer still gives a clean street. A zone drag paints the rectangle between
 * its corners (clamped to the brush limit). Both are pure so the preview ghost and the commands cannot disagree.
 */

export interface Tile {
  x: number;
  z: number;
}

/** The straight runs that make up the L from `a` to `b` (one run if they share a row or column). */
export function roadRuns(a: Tile, b: Tile): { x: number; z: number; x2: number; z2: number }[] {
  const dx = Math.abs(b.x - a.x);
  const dz = Math.abs(b.z - a.z);
  if (dx === 0 || dz === 0) return [{ x: a.x, z: a.z, x2: b.x, z2: b.z }];
  // The longer leg first.
  const corner = dx >= dz ? { x: b.x, z: a.z } : { x: a.x, z: b.z };
  return [
    { x: a.x, z: a.z, x2: corner.x, z2: corner.z },
    { x: corner.x, z: corner.z, x2: b.x, z2: b.z },
  ];
}

/** Every tile the L passes through, in order, without repeating the corner. */
export function roadTiles(a: Tile, b: Tile): Tile[] {
  const out: Tile[] = [];
  for (const r of roadRuns(a, b)) {
    const len = Math.max(Math.abs(r.x2 - r.x), Math.abs(r.z2 - r.z)) + 1;
    const sx = Math.sign(r.x2 - r.x);
    const sz = Math.sign(r.z2 - r.z);
    for (let k = 0; k < len; k++) {
      const t = { x: r.x + sx * k, z: r.z + sz * k };
      const last = out[out.length - 1];
      if (!last || last.x !== t.x || last.z !== t.z) out.push(t);
    }
  }
  return out;
}

/** The commands for a finished road drag. A leg longer than one command may lay is split. */
export function roadCommands(a: Tile, b: Tile, remove = false): LocalCommand[] {
  const type = remove ? 'removeRoad' : 'placeRoad';
  const cmds: LocalCommand[] = [];
  for (const r of roadRuns(a, b)) {
    const len = Math.max(Math.abs(r.x2 - r.x), Math.abs(r.z2 - r.z)) + 1;
    const sx = Math.sign(r.x2 - r.x);
    const sz = Math.sign(r.z2 - r.z);
    for (let from = 0; from < len; from += ROAD_RUN_MAX) {
      const to = Math.min(len - 1, from + ROAD_RUN_MAX - 1);
      cmds.push({
        type,
        x: r.x + sx * from,
        z: r.z + sz * from,
        x2: r.x + sx * to,
        z2: r.z + sz * to,
      });
    }
  }
  return cmds;
}

/** The rectangle between two corners, shortened from the far corner so it never exceeds the brush limit. */
export function brushRect(a: Tile, b: Tile): { x: number; z: number; x2: number; z2: number } {
  const sx = b.x >= a.x ? 1 : -1;
  const sz = b.z >= a.z ? 1 : -1;
  let w = Math.abs(b.x - a.x) + 1;
  let h = Math.abs(b.z - a.z) + 1;
  if (w * h > ZONE_BRUSH_MAX) {
    // Keep the longer side as dragged (up to the cap) and trim the other to fit.
    if (w >= h) {
      w = Math.min(w, ZONE_BRUSH_MAX);
      h = Math.max(1, Math.min(h, Math.floor(ZONE_BRUSH_MAX / w)));
    } else {
      h = Math.min(h, ZONE_BRUSH_MAX);
      w = Math.max(1, Math.min(w, Math.floor(ZONE_BRUSH_MAX / h)));
    }
  }
  return { x: a.x, z: a.z, x2: a.x + sx * (w - 1), z2: a.z + sz * (h - 1) };
}

export function zoneCommand(zone: ZoneId, a: Tile, b: Tile): LocalCommand {
  return { type: 'zone', zone, ...brushRect(a, b) };
}
