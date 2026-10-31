/**
 * The nearest place a box fits, for an entity that ended up inside something
 * solid (a portal exit against a wall, a mover or animated prop that moved into
 * the player, a passage that closed while the player stood in its hole). The
 * idea of Portal's FindClosestPassableSpace (public SDK behaviour, clean-room):
 * try short nudges before long ones, the preferred direction first at every
 * distance (out of the exit portal, along the mover's motion), then up, the
 * horizontal axes, down and the diagonals. `fits` answers for one position
 * (a zero-length hull trace in practice).
 *
 * Pure and environment-agnostic.
 */

import type { Vec3 } from '../../tf2-game/core/vec';

/** Nudge lengths tried, shortest first (Source units). */
export const FREE_SPACE_STEPS: readonly number[] = [0.25, 0.5, 1, 2, 3, 4, 6, 8, 10, 12, 16, 20, 24, 28, 32, 40, 48, 56, 64, 80, 96];

const S = Math.SQRT1_2;
const T = 1 / Math.sqrt(3);
/** Up first (out of floors, the common case), the horizontal axes, down, then the 20 diagonals. */
const DIRECTIONS: readonly Vec3[] = (() => {
  const out: Vec3[] = [
    { x: 0, y: 0, z: 1 },
    { x: 1, y: 0, z: 0 },
    { x: -1, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 },
    { x: 0, y: -1, z: 0 },
    { x: 0, y: 0, z: -1 },
  ];
  for (const z of [1, 0, -1])
    for (const x of [-1, 0, 1])
      for (const y of [-1, 0, 1]) {
        const n = Math.abs(x) + Math.abs(y) + Math.abs(z);
        if (n < 2) continue;
        const k = n === 2 ? S : T;
        out.push({ x: x * k, y: y * k, z: z * k });
      }
  return out;
})();

export interface FreeSpaceOptions {
  /** A direction to try first at every distance (normalised here; zero or null: none). */
  prefer?: Vec3 | null;
  /** The longest nudge (default 64). */
  maxDist?: number;
}

/**
 * `origin` when the box fits there, else the closest nudged position that fits, else null.
 * Never mutates `origin`.
 */
export function findFreeSpace(origin: Vec3, fits: (p: Vec3) => boolean, opts: FreeSpaceOptions = {}): Vec3 | null {
  const at = { x: origin.x, y: origin.y, z: origin.z };
  if (fits(at)) return at;
  const maxDist = opts.maxDist ?? 64;
  const dirs: Vec3[] = [];
  const p = opts.prefer;
  const pl = p ? Math.hypot(p.x, p.y, p.z) : 0;
  if (p && pl > 1e-6) dirs.push({ x: p.x / pl, y: p.y / pl, z: p.z / pl });
  dirs.push(...DIRECTIONS);
  for (const d of FREE_SPACE_STEPS) {
    if (d > maxDist) break;
    for (const u of dirs) {
      at.x = origin.x + u.x * d;
      at.y = origin.y + u.y * d;
      at.z = origin.z + u.z * d;
      if (fits(at)) return at;
    }
  }
  return null;
}
