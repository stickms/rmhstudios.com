// ============================================================
// BREAKPOINT — "Foundry" map: collision geometry, spawns, sites
// A compact, symmetric two-site map authored as axis-aligned boxes.
// Both the physics/collision code and the 3D renderer read this.
// ============================================================
import type { Vec3 } from './types';
import { PALETTE } from './constants';

export interface Box {
  // centre + half-extents
  cx: number; cy: number; cz: number;
  hx: number; hy: number; hz: number;
  color: string;
  solid: boolean; // false = decorative only
}

function box(cx: number, cz: number, hx: number, hz: number, h: number, color: string, cy = h): Box {
  return { cx, cy: cy / 2, cz, hx, hy: cy / 2, hz, color, solid: true };
}

const W = PALETTE.wall;
const WD = PALETTE.wallDark;
const C = PALETTE.cover;

// Outer arena is 52 x 52 (-26..26). Walls ring the play space.
export const ARENA = { minX: -26, maxX: 26, minZ: -26, maxZ: 26, wallH: 6 };

export const MAP_BOXES: Box[] = [
  // ── Perimeter walls ──
  { cx: 0, cy: 3, cz: -26, hx: 26, hy: 3, hz: 0.6, color: W, solid: true },
  { cx: 0, cy: 3, cz: 26, hx: 26, hy: 3, hz: 0.6, color: W, solid: true },
  { cx: -26, cy: 3, cz: 0, hx: 0.6, hy: 3, hz: 26, color: W, solid: true },
  { cx: 26, cy: 3, cz: 0, hx: 0.6, hy: 3, hz: 26, color: W, solid: true },

  // ── Mid divider with a window/door gap (controls lanes) ──
  { cx: -14, cy: 2, cz: 0, hx: 8, hy: 2, hz: 0.6, color: WD, solid: true },
  { cx: 14, cy: 2, cz: 0, hx: 8, hy: 2, hz: 0.6, color: WD, solid: true },
  { cx: 0, cy: 4.2, cz: 0, hx: 2.2, hy: 0.8, hz: 0.6, color: WD, solid: true }, // header over mid gap

  // ── A site (top-right) — boxes for cover ──
  box(15, -15, 1.6, 1.6, 1.4, C),
  box(11, -18, 1.2, 1.2, 1.8, C),
  box(19, -11, 1.4, 1.0, 1.0, C),
  { cx: 22, cy: 1.5, cz: -20, hx: 3, hy: 1.5, hz: 0.5, color: WD, solid: true }, // A back wall

  // ── B site (bottom-left) ──
  box(-15, 15, 1.6, 1.6, 1.4, C),
  box(-11, 18, 1.2, 1.2, 1.8, C),
  box(-19, 11, 1.0, 1.4, 1.0, C),
  { cx: -22, cy: 1.5, cz: 20, hx: 3, hy: 1.5, hz: 0.5, color: WD, solid: true },

  // ── Mid cover scattered ──
  box(0, -8, 1.3, 1.3, 1.2, C),
  box(0, 8, 1.3, 1.3, 1.2, C),
  box(-6, -4, 1.0, 1.0, 1.0, C),
  box(6, 4, 1.0, 1.0, 1.0, C),

  // ── Connectors near spawns ──
  box(-20, -8, 1.2, 1.2, 1.6, C),
  box(20, 8, 1.2, 1.2, 1.6, C),
];

export const SOLID_BOXES = MAP_BOXES.filter((b) => b.solid);

// Spawn clusters (5 each). Attackers bottom-right, defenders top-left.
function spawnLine(baseX: number, baseZ: number, dx: number, dz: number): Vec3[] {
  return Array.from({ length: 5 }, (_, i) => ({
    x: baseX + dx * i, y: 0, z: baseZ + dz * i,
  }));
}

export const ATTACKER_SPAWNS = spawnLine(22, 22, -1.6, -0.4);
export const DEFENDER_SPAWNS = spawnLine(-22, -22, 1.6, 0.4);

// Bombsites (centres + radius for plant detection)
export const SITES = {
  A: { x: 15, z: -15, r: 6, label: 'A' },
  B: { x: -15, z: 15, r: 6, label: 'B' },
};

export const SITE_LIST = [SITES.A, SITES.B];

/** Ground tile size for the checkerboard. */
export const GROUND_TILE = 4;
