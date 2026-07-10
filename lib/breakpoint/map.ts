// ============================================================
// BREAKPOINT — "Dust II" map: collision geometry, spawns, sites
// A stylised, recognisable de_dust2 tribute authored as axis-aligned boxes.
// Landmarks: T / CT spawns, Mid + mid doors, Long A (+ long doors), A site,
// B site (+ B platform), and the lower tunnels. Both the physics/collision
// code and the 3D renderer read this same geometry.
//
// Orientation (radar-style, CT at the top):
//   -Z = north / top  → CT spawn, A site (right), B site (left)
//   +Z = south / bottom → T spawn
//   -X = west / left  → B / tunnels        +X = east / right → A / long
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

/** Ground-resting cover box of full height `h` (sits on the floor: 0..h). */
function box(cx: number, cz: number, hx: number, hz: number, h: number, color: string): Box {
  return { cx, cy: h / 2, cz, hx, hy: h / 2, hz, color, solid: true };
}

/** Ground-resting wall/structure of full height `h`. */
function wall(cx: number, cz: number, hx: number, hz: number, h: number, color: string): Box {
  return { cx, cy: h / 2, cz, hx, hy: h / 2, hz, color, solid: true };
}

const W = PALETTE.wall;
const WD = PALETTE.wallDark;
const C = PALETTE.cover;
const CD = PALETTE.coverDark;

// Outer arena is 64 x 64 (-32..32). Walls ring the play space.
export const ARENA = { minX: -32, maxX: 32, minZ: -32, maxZ: 32, wallH: 6 };

export const MAP_BOXES: Box[] = [
  // ── Perimeter walls ──
  { cx: 0, cy: 3, cz: -32, hx: 32, hy: 3, hz: 0.6, color: W, solid: true },
  { cx: 0, cy: 3, cz: 32, hx: 32, hy: 3, hz: 0.6, color: W, solid: true },
  { cx: -32, cy: 3, cz: 0, hx: 0.6, hy: 3, hz: 32, color: W, solid: true },
  { cx: 32, cy: 3, cz: 0, hx: 0.6, hy: 3, hz: 32, color: W, solid: true },

  // ── Lane dividers (split the arena into B / Mid / A, open at both ends) ──
  wall(-11, -5, 0.6, 11, 4, W), // mid ↔ B (tunnels) divider, x=-11, z=-16..+6
  wall(11, -5, 0.6, 11, 4, W),  // mid ↔ A (long)   divider, x=+11, z=-16..+6

  // ── Mid + mid doors (two slabs with a centre gap) ──
  wall(-3.2, 0, 2, 0.6, 3, WD),
  wall(3.2, 0, 2, 0.6, 3, WD),
  { cx: 0, cy: 4, cz: 0, hx: 2.2, hy: 0.8, hz: 0.6, color: WD, solid: true }, // header above the door gap
  box(0, 9, 1.3, 1.3, 1.1, C),   // mid cover (T side)
  box(0, -9, 1.3, 1.3, 1.1, C),  // mid cover (CT / xbox side)

  // ── A site (top-right) — default / goose / car cover cluster ──
  box(18, -14, 1.9, 1.2, 1.2, C),  // default plant box
  box(14, -19, 1.1, 1.1, 1.6, CD), // goose
  box(23, -20, 2.0, 1.4, 1.4, C),  // car / triple stack
  box(25, -11, 1.2, 1.2, 1.0, CD), // A ramp cover
  wall(18, -27, 6, 0.6, 4, WD),    // A back wall (CT entry rounds the left end)

  // ── Long A (far-right corridor) + long doors near T ──
  wall(22, 6, 0.6, 10, 4, W),      // long outer wall, x=22, z=-4..+16
  box(15, 9, 1.4, 1.0, 1.6, CD),   // long doors (left leaf)
  box(20, 9, 1.4, 1.0, 1.6, CD),   // long doors (right leaf) — gap between = doorway

  // ── B site (top-left) — plant boxes + back platform ──
  box(-18, -14, 1.9, 1.2, 1.2, C),  // default plant box
  box(-14, -19, 1.1, 1.1, 1.6, CD), // box by door
  box(-23, -20, 2.0, 1.4, 1.4, C),  // B platform stack
  wall(-18, -27, 6, 0.6, 4, WD),    // B back wall

  // ── Lower tunnels (left, leading from T up to B) ──
  wall(-22, 6, 0.6, 10, 4, W),     // tunnel outer wall, x=-22, z=-4..+16
  box(-16, 9, 1.4, 1.4, 1.6, CD),  // tunnel mouth cover

  // ── CT spawn area (top centre, between the sites) ──
  box(-6, -24, 1.3, 1.3, 1.1, C),
  box(6, -24, 1.3, 1.3, 1.1, C),
  box(0, -21, 1.4, 1.0, 1.0, CD),
];

export const SOLID_BOXES = MAP_BOXES.filter((b) => b.solid);

// Spawn clusters (5 each). Attackers (T) bottom-centre, defenders (CT) top-centre.
function spawnLine(baseX: number, baseZ: number, dx: number, dz: number): Vec3[] {
  return Array.from({ length: 5 }, (_, i) => ({
    x: baseX + dx * i, y: 0, z: baseZ + dz * i,
  }));
}

export const ATTACKER_SPAWNS = spawnLine(-4, 28, 2, 0);  // T spawn, south
export const DEFENDER_SPAWNS = spawnLine(-4, -29, 2, 0); // CT spawn, north

// Bombsites (centres + radius for plant detection)
export const SITES = {
  A: { x: 18, z: -17, r: 6, label: 'A' },
  B: { x: -18, z: -17, r: 6, label: 'B' },
};

export const SITE_LIST = [SITES.A, SITES.B];

/** Ground tile size for the checkerboard. */
export const GROUND_TILE = 4;
