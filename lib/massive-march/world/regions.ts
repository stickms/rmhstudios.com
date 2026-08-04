/**
 * Massive March — the authored contents of the island.
 *
 * Regions, the built structures standing on them, the collision they imply, and
 * the deterministic scatter that fills in everything nobody placed by hand.
 *
 * Two rules govern what is in here:
 *
 * 1. **Anything you can navigate by is authored.** Every structure with a name
 *    or a colour was placed on purpose, because "walk toward the yellow thing"
 *    only works if the yellow thing is where it was last time. There is no
 *    procedural architecture.
 * 2. **Anything you walk past is scattered.** Trees, scrub, boulders and grass
 *    come out of a seeded generator, so a hundred thousand of them cost one
 *    number in a file rather than a megabyte of coordinates — and every client
 *    still grows the same forest, which matters the first time somebody says
 *    "the dead gum with the fork in it".
 *
 * Collision lives here too, and is shared: the browser resolves it to stop you
 * walking through a wall, and the socket hub resolves it to check that a
 * reported position is one a person could have reached. Two implementations
 * would be two answers, and the disagreement would surface as a player standing
 * inside the sealed booth on their own screen and outside it on everybody
 * else's — which, in a game about who can see what, is the worst bug available.
 */

import { LAND, TOY } from '../palette';
import { PUZZLE_SITES } from './sites';
import { groundY, isWater, pad, SHORE_RADIUS } from './terrain';

// ─── Regions ────────────────────────────────────────────────────────────────

export interface Region {
  id: string;
  /** English name; the UI translates through `mm.region.<id>`. */
  name: string;
  x: number;
  z: number;
  r: number;
  /** One line, shown on the map sheet once the region has been visited. */
  blurb: string;
}

export const REGIONS: readonly Region[] = [
  {
    id: 'tidal-landing',
    name: 'Tidal Landing',
    x: 0,
    z: 286,
    r: 150,
    blurb: 'Squeaking sand, a long shallow bay, and the yellow tower you can see from everywhere.',
  },
  {
    id: 'banksia-flats',
    name: 'Banksia Flats',
    x: 226,
    z: 62,
    r: 165,
    blurb: 'Low scrub to the horizon. Good sightlines, bad landmarks, one enormous blue box.',
  },
  {
    id: 'gumtree-gully',
    name: 'Gumtree Gully',
    x: -236,
    z: 26,
    r: 170,
    blurb: 'Pale trunks packed close enough that you lose people at thirty metres.',
  },
  {
    id: 'granite-spine',
    name: 'Granite Spine',
    x: -6,
    z: -216,
    r: 210,
    blurb: 'The ridge. Everything else on the island is visible from up here, eventually.',
  },
  {
    id: 'saltpan',
    name: 'The Saltpan',
    x: -246,
    z: 196,
    r: 105,
    blurb: 'Flat, bright and completely featureless. Sound carries strangely across it.',
  },
  {
    id: 'quiet-basin',
    name: 'The Quiet Basin',
    x: 8,
    z: 16,
    r: 150,
    blurb: 'A bowl in the middle of the island. From inside it you cannot see anything else.',
  },
];

export function regionAt(x: number, z: number): Region | null {
  let best: Region | null = null;
  let bestScore = Infinity;
  for (const region of REGIONS) {
    const d = Math.hypot(x - region.x, z - region.z);
    // Normalised so a small region wins over a large one you are merely inside.
    const score = d / region.r;
    if (score < 1 && score < bestScore) {
      best = region;
      bestScore = score;
    }
  }
  return best;
}

// ─── Structures ─────────────────────────────────────────────────────────────

export type StructureKind =
  | 'block' // a rectangular solid, the base vocabulary of the whole island
  | 'column' // a cylinder
  | 'tower' // a tapering stack with a lamp on top — the progression hubs
  | 'arch' // two legs and a lintel; you walk under it
  | 'ring' // a walled enclosure with one doorway (booths, the maze rooms)
  | 'ramp' // a wedge; decorative, since the terrain does the real climbing
  | 'disc' // a flat plate lying on the ground
  | 'mast'; // a thin pole, usually with something on the end

export interface Structure {
  id: string;
  kind: StructureKind;
  x: number;
  z: number;
  /** Metres above local ground. */
  y?: number;
  /** Width (x), height (y), depth (z) before rotation. Columns use `w` as diameter. */
  w: number;
  h: number;
  d: number;
  /** Y rotation, radians. */
  rot?: number;
  color: string;
  /** Ring doorway centre bearing (radians) and width (radians). */
  door?: [number, number];
  /** Blocks movement. Set false for arches, discs and anything under knee height. */
  solid?: boolean;
  /** Named on the map sheet and worth describing out loud. */
  landmark?: string;
}

/**
 * The built world.
 *
 * Read this as a site plan. Everything is placed relative to a levelled pad from
 * `terrain.ts`, so a structure and the ground under it cannot drift apart.
 */
export const STRUCTURES: readonly Structure[] = (() => {
  const out: Structure[] = [];
  const add = (s: Structure) => out.push(s);

  // ── Tidal Landing ────────────────────────────────────────────────────────
  const landing = pad('landing');
  add({
    id: 'landing-arch',
    kind: 'arch',
    x: landing.x,
    z: landing.z + 26,
    w: 22,
    h: 15,
    d: 4,
    color: TOY.red,
    landmark: 'The Red Arch',
  });
  add({
    id: 'landing-shed-a',
    kind: 'block',
    x: landing.x - 20,
    z: landing.z - 6,
    w: 9,
    h: 4.4,
    d: 7,
    rot: 0.24,
    color: TOY.white,
    solid: true,
  });
  add({
    id: 'landing-shed-b',
    kind: 'block',
    x: landing.x + 17,
    z: landing.z - 12,
    w: 6,
    h: 3.2,
    d: 6,
    rot: -0.5,
    color: TOY.blue,
    solid: true,
  });
  add({
    id: 'landing-steps',
    kind: 'block',
    x: landing.x + 2,
    z: landing.z + 12,
    w: 16,
    h: 0.7,
    d: 5,
    color: TOY.concrete,
  });

  const yellowTower = pad('yellow-tower');
  add({
    id: 'tower-yellow',
    kind: 'tower',
    x: yellowTower.x,
    z: yellowTower.z,
    w: 12,
    h: 46,
    d: 12,
    color: TOY.yellow,
    solid: true,
    landmark: 'The Yellow Tower',
  });

  // ── Banksia Flats ────────────────────────────────────────────────────────
  const blueVault = pad('blue-vault');
  add({
    id: 'tower-blue',
    kind: 'tower',
    x: blueVault.x,
    z: blueVault.z,
    w: 16,
    h: 34,
    d: 16,
    color: TOY.blue,
    solid: true,
    landmark: 'The Blue Vault',
  });
  add({
    id: 'flats-block-a',
    kind: 'block',
    x: blueVault.x - 44,
    z: blueVault.z + 38,
    w: 14,
    h: 14,
    d: 14,
    rot: 0.6,
    color: TOY.red,
    solid: true,
    landmark: 'The Tipped Cube',
  });
  add({
    id: 'flats-block-b',
    kind: 'block',
    x: blueVault.x - 28,
    z: blueVault.z - 52,
    w: 9,
    h: 22,
    d: 9,
    color: TOY.white,
    solid: true,
  });
  add({
    id: 'flats-mast',
    kind: 'mast',
    x: blueVault.x + 60,
    z: blueVault.z + 8,
    w: 1.2,
    h: 28,
    d: 1.2,
    color: TOY.yellow,
    solid: true,
  });

  // ── Gumtree Gully ────────────────────────────────────────────────────────
  add({
    id: 'gully-arch',
    kind: 'arch',
    x: -196,
    z: 150,
    w: 18,
    h: 13,
    d: 3.5,
    rot: 0.9,
    color: TOY.green,
    landmark: 'The Green Arch',
  });
  add({
    id: 'gully-column-a',
    kind: 'column',
    x: -268,
    z: 34,
    w: 7,
    h: 26,
    d: 7,
    color: TOY.red,
    solid: true,
  });
  add({
    id: 'gully-column-b',
    kind: 'column',
    x: -254,
    z: 12,
    w: 7,
    h: 19,
    d: 7,
    color: TOY.yellow,
    solid: true,
  });
  add({
    id: 'gully-column-c',
    kind: 'column',
    x: -282,
    z: 8,
    w: 7,
    h: 33,
    d: 7,
    color: TOY.blue,
    solid: true,
    landmark: 'The Three Posts',
  });

  // ── Granite Spine ────────────────────────────────────────────────────────
  const antenna = pad('red-antenna');
  add({
    id: 'tower-red',
    kind: 'tower',
    x: antenna.x,
    z: antenna.z,
    w: 11,
    h: 52,
    d: 11,
    color: TOY.red,
    solid: true,
    landmark: 'The Red Antenna',
  });
  add({
    id: 'spine-slab-a',
    kind: 'block',
    x: antenna.x - 120,
    z: antenna.z + 30,
    w: 26,
    h: 3,
    d: 26,
    rot: 0.3,
    color: TOY.white,
    solid: true,
  });
  add({
    id: 'spine-marker-a',
    kind: 'mast',
    x: antenna.x + 96,
    z: antenna.z - 26,
    w: 1,
    h: 18,
    d: 1,
    color: TOY.pink,
    solid: true,
  });

  // ── The Quiet Basin ──────────────────────────────────────────────────────
  const gate = pad('white-gate');
  add({
    id: 'white-gate',
    kind: 'arch',
    x: gate.x,
    z: gate.z,
    w: 34,
    h: 26,
    d: 6,
    color: TOY.white,
    landmark: 'The White Gate',
  });
  add({
    id: 'gate-plinth',
    kind: 'disc',
    x: gate.x,
    z: gate.z,
    w: 26,
    h: 0.5,
    d: 26,
    color: TOY.concrete,
  });
  add({
    id: 'basin-block-a',
    kind: 'block',
    x: gate.x + 52,
    z: gate.z + 44,
    w: 11,
    h: 11,
    d: 11,
    rot: 0.2,
    color: TOY.yellow,
    solid: true,
  });
  add({
    id: 'basin-block-b',
    kind: 'block',
    x: gate.x - 60,
    z: gate.z + 26,
    w: 8,
    h: 17,
    d: 8,
    rot: -0.4,
    color: TOY.blue,
    solid: true,
  });

  // ── The cart line — two stops and the rails between them ─────────────────
  const cartSouth = pad('cart-south');
  const cartNorth = pad('cart-north');
  add({
    id: 'cart-stop-south',
    kind: 'block',
    x: cartSouth.x,
    z: cartSouth.z,
    w: 10,
    h: 4.6,
    d: 6,
    color: TOY.green,
    solid: true,
    landmark: 'South Halt',
  });
  add({
    id: 'cart-stop-north',
    kind: 'block',
    x: cartNorth.x,
    z: cartNorth.z,
    w: 10,
    h: 4.6,
    d: 6,
    color: TOY.green,
    solid: true,
    landmark: 'North Halt',
  });

  // ── Puzzle furniture ─────────────────────────────────────────────────────
  //
  // Derived from `sites.ts` rather than typed out again, because a booth wall
  // that stands somewhere other than where the audibility rule thinks it does is
  // a puzzle that cannot be solved and cannot be seen to be broken. The booth
  // ring is the thing that blocks sound; the mesh IS the rule.
  for (const site of PUZZLE_SITES) {
    for (const booth of site.booths ?? []) {
      add({
        id: `${site.id}-booth-${booth.id}`,
        kind: 'ring',
        x: booth.x,
        z: booth.z,
        w: booth.r * 2,
        h: 4.2,
        d: booth.r * 2,
        color: TOY.white,
        door: booth.door,
        solid: true,
      });
    }
    if (site.console) {
      add({
        id: `${site.id}-console`,
        kind: 'block',
        x: site.console.x,
        z: site.console.z,
        w: 3.4,
        h: 1.5,
        d: 1.4,
        color: TOY.black,
        solid: true,
      });
    }
    for (const totem of site.totems ?? []) {
      add({
        id: `${site.id}-${totem.id}`,
        kind: 'column',
        x: totem.x,
        z: totem.z,
        w: 1.7,
        h: 5.6,
        d: 1.7,
        color: TOY.concrete,
        solid: true,
      });
    }
  }

  return out;
})();

export const LANDMARKS = STRUCTURES.filter((s) => s.landmark);

// ─── Collision ──────────────────────────────────────────────────────────────

export type Collider =
  | { kind: 'circle'; x: number; z: number; r: number }
  | { kind: 'box'; x: number; z: number; hx: number; hz: number; rot: number }
  /** A walled enclosure: solid everywhere on the wall except the door arc. */
  | { kind: 'ring'; x: number; z: number; r: number; half: number; door: number; arc: number };

function structureColliders(s: Structure): Collider[] {
  if (s.solid === false || (!s.solid && s.kind !== 'ring')) return [];
  switch (s.kind) {
    case 'column':
    case 'mast':
      return [{ kind: 'circle', x: s.x, z: s.z, r: s.w / 2 }];
    case 'tower':
      return [{ kind: 'circle', x: s.x, z: s.z, r: s.w / 2 }];
    case 'ring': {
      const [door, arc] = s.door ?? [0, 0.9];
      return [{ kind: 'ring', x: s.x, z: s.z, r: s.w / 2, half: 0.65, door, arc }];
    }
    default:
      return [
        { kind: 'box', x: s.x, z: s.z, hx: s.w / 2, hz: s.d / 2, rot: s.rot ?? 0 },
      ];
  }
}

/** Every solid on the island, flattened once at module load. */
export const COLLIDERS: readonly Collider[] = STRUCTURES.flatMap(structureColliders);

function normalizeAngle(a: number): number {
  let out = a;
  while (out > Math.PI) out -= Math.PI * 2;
  while (out < -Math.PI) out += Math.PI * 2;
  return out;
}

/**
 * Push a point out of anything solid.
 *
 * Two passes, because a corner between two solids needs the second one to see
 * where the first one left you. More than two buys nothing at these shapes and
 * this speed; the third pass never moved anything in testing.
 */
export function resolveCollisions(
  x: number,
  z: number,
  radius: number,
  colliders: readonly Collider[] = COLLIDERS,
): { x: number; z: number } {
  let px = x;
  let pz = z;

  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];

      if (c.kind === 'circle') {
        const dx = px - c.x;
        const dz = pz - c.z;
        const min = c.r + radius;
        const distSq = dx * dx + dz * dz;
        if (distSq >= min * min) continue;
        const dist = Math.sqrt(distSq);
        if (dist < 1e-4) {
          // Dead centre: there is no direction to push along, so pick one. A
          // player can land here through a teleport or a spawn, and "stuck
          // inside the yellow tower forever" is the failure this avoids.
          px = c.x + min;
          pz = c.z;
          continue;
        }
        px = c.x + (dx / dist) * min;
        pz = c.z + (dz / dist) * min;
        continue;
      }

      if (c.kind === 'ring') {
        const dx = px - c.x;
        const dz = pz - c.z;
        const dist = Math.hypot(dx, dz) || 0.0001;
        const wall = Math.abs(dist - c.r);
        if (wall >= c.half + radius) continue;
        // Standing in the doorway is not standing in the wall.
        const bearing = Math.atan2(dz, dx);
        if (Math.abs(normalizeAngle(bearing - c.door)) < c.arc / 2) continue;
        // Push to whichever face is nearer, so you neither pop through the wall
        // on the way in nor get sucked inside on the way past.
        const target = dist > c.r ? c.r + c.half + radius : c.r - c.half - radius;
        px = c.x + (dx / dist) * target;
        pz = c.z + (dz / dist) * target;
        continue;
      }

      // Rotated box: work in the box's own frame, resolve on the shallower axis.
      const cos = Math.cos(-c.rot);
      const sin = Math.sin(-c.rot);
      const dx = px - c.x;
      const dz = pz - c.z;
      const lx = dx * cos - dz * sin;
      const lz = dx * sin + dz * cos;
      const ox = c.hx + radius - Math.abs(lx);
      const oz = c.hz + radius - Math.abs(lz);
      if (ox <= 0 || oz <= 0) continue;
      let nlx = lx;
      let nlz = lz;
      if (ox < oz) nlx = Math.sign(lx || 1) * (c.hx + radius);
      else nlz = Math.sign(lz || 1) * (c.hz + radius);
      const bcos = Math.cos(c.rot);
      const bsin = Math.sin(c.rot);
      px = c.x + (nlx * bcos - nlz * bsin);
      pz = c.z + (nlx * bsin + nlz * bcos);
    }
  }

  return { x: px, z: pz };
}

// ─── Scatter ────────────────────────────────────────────────────────────────

/** mulberry32 — small, fast, and identical in every JS engine. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type ScatterKind = 'gum' | 'banksia' | 'boulder' | 'tussock';

export interface ScatterItem {
  kind: ScatterKind;
  x: number;
  z: number;
  y: number;
  scale: number;
  rot: number;
  /** Per-instance tint, so a hillside of gums is not one flat green. */
  tint: string;
}

/** What grows where. Anything outside every zone stays bare. */
const SCATTER_ZONES: {
  kind: ScatterKind;
  x: number;
  z: number;
  r: number;
  count: number;
  scale: [number, number];
  tints: readonly string[];
}[] = [
  // Gumtree Gully — the dense one. Losing people in here is the intended effect.
  { kind: 'gum', x: -236, z: 30, r: 172, count: 620, scale: [0.85, 1.65], tints: [LAND.gumLeaf, '#8fa377', '#6d8257'] },
  { kind: 'gum', x: -110, z: 190, r: 120, count: 210, scale: [0.8, 1.4], tints: [LAND.gumLeaf, '#93a67c'] },
  { kind: 'gum', x: 120, z: 210, r: 130, count: 190, scale: [0.75, 1.35], tints: [LAND.gumLeaf, '#7d9163'] },
  { kind: 'gum', x: 60, z: -60, r: 150, count: 240, scale: [0.8, 1.5], tints: ['#7a8f61', LAND.gumLeaf] },
  // Banksia Flats — waist-high scrub, no cover, all sightline.
  { kind: 'banksia', x: 228, z: 66, r: 190, count: 900, scale: [0.7, 1.5], tints: [LAND.banksia, '#5b6f3c', '#455a2f'] },
  { kind: 'banksia', x: -180, z: -60, r: 150, count: 460, scale: [0.6, 1.3], tints: [LAND.banksia, '#54683a'] },
  // Granite Spine — boulders, the size of rooms.
  { kind: 'boulder', x: -10, z: -218, r: 215, count: 420, scale: [0.9, 3.1], tints: [LAND.granite, LAND.graniteShade, LAND.graniteWarm] },
  { kind: 'boulder', x: 250, z: -140, r: 120, count: 130, scale: [0.9, 2.4], tints: [LAND.granite, LAND.graniteWarm] },
  { kind: 'boulder', x: -300, z: 120, r: 110, count: 110, scale: [0.8, 2.0], tints: [LAND.granite, LAND.graniteShade] },
  // Tussock grass, everywhere the ground is not sand or pan.
  { kind: 'tussock', x: 0, z: 0, r: 340, count: 2400, scale: [0.6, 1.4], tints: [LAND.grassDry, LAND.grassLush, LAND.scrub] },
];

/**
 * Grow the island's vegetation.
 *
 * Runs once on the client at load (the server has no opinion about trees).
 * Rejection-sampled against water, pads and the built structures, so nothing
 * sprouts through a wall or out of the sea — and because the RNG is seeded, it
 * is the *same* forest in everybody's session.
 */
export function growScatter(seed = 0x4d41524b): ScatterItem[] {
  const rng = makeRng(seed);
  const out: ScatterItem[] = [];

  for (const zone of SCATTER_ZONES) {
    for (let i = 0; i < zone.count; i++) {
      // sqrt keeps the disc uniform instead of clumping at the centre.
      const a = rng() * Math.PI * 2;
      const rad = Math.sqrt(rng()) * zone.r;
      const x = zone.x + Math.cos(a) * rad;
      const z = zone.z + Math.sin(a) * rad;

      if (Math.hypot(x, z) > SHORE_RADIUS + 30) continue;
      const y = groundY(x, z);
      if (y < 1.6) continue; // beach, surf and anything below it stays bare
      if (isWater(x, z)) continue;

      // A puzzle you cannot see across is not a puzzle. Every installation keeps
      // a clearing — except the two sites whose whole difficulty IS the cover,
      // which keep theirs only at the very centre.
      const nearSite = PUZZLE_SITES.some((s) => {
        const clearing = s.kind === 'hunt' || s.id === 'long-relay' ? 14 : s.radius * 0.8;
        return Math.hypot(x - s.x, z - s.z) < clearing;
      });
      if (nearSite) continue;

      // Nothing grows on a levelled site or inside a structure.
      const blocked = COLLIDERS.some((c) => {
        if (c.kind === 'circle') return Math.hypot(x - c.x, z - c.z) < c.r + 3;
        if (c.kind === 'ring') return Math.hypot(x - c.x, z - c.z) < c.r + 3;
        return Math.abs(x - c.x) < c.hx + 3 && Math.abs(z - c.z) < c.hz + 3;
      });
      if (blocked) continue;

      out.push({
        kind: zone.kind,
        x,
        z,
        y,
        scale: zone.scale[0] + rng() * (zone.scale[1] - zone.scale[0]),
        rot: rng() * Math.PI * 2,
        tint: zone.tints[Math.floor(rng() * zone.tints.length)],
      });
    }
  }

  return out;
}
