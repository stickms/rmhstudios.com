/**
 * Massive March — the island itself.
 *
 * The land is a pure function of `(x, z)`. Not because procedural terrain was
 * wanted — the design is emphatic that this world is authored and fixed — but
 * because a closed-form height field is the only way the browser and the socket
 * hub can agree on where the ground is without shipping a mesh to both. The
 * server needs `groundY` to know who is standing on a pressure pad and whether a
 * reported position is somewhere a person could actually be; the client needs it
 * to build the mesh and walk on it. One function, one answer.
 *
 * The *shape* is hand-tuned rather than generated: a headland ridge across the
 * north, a bowl in the middle, a long beach in the south, dunes behind it, and a
 * coastline with enough lobes that no two stretches look alike. Every named
 * place in `regions.ts` sits somewhere chosen on this surface.
 *
 * Building sites are flattened by `PADS`. A puzzle installation on a 12° slope
 * is not a puzzle, it is a bug report, so each site names a pad and the terrain
 * blends to it.
 */

/** Sea level. Everything below this is water; the player cannot walk there. */
export const SEA_LEVEL = 0;

/** Nominal shore distance from the origin; the real coast wobbles around it. */
export const SHORE_RADIUS = 372;

/** Half-extent of the drawn world, including the sea and the far islands. */
export const WORLD_EXTENT = 620;

/** Past this the player is swimming, which this game does not do. */
export const WALKABLE_MARGIN = 0.4;

// ─── Levelled building sites ────────────────────────────────────────────────

export interface Pad {
  id: string;
  x: number;
  z: number;
  /** Full-strength radius; the blend feathers out over another 40%. */
  r: number;
  /** Height the pad is levelled to. */
  y: number;
}

/**
 * Every flattened site on the island, in one list so `regions.ts` and the scene
 * can both quote a position instead of guessing one that happens to look level.
 */
export const PADS: readonly Pad[] = [
  // ── Tidal Landing (south beach, where a campaign starts) ──
  { id: 'landing', x: 0, z: 292, r: 44, y: 2.4 },
  { id: 'yellow-tower', x: -58, z: 258, r: 26, y: 3.0 },
  { id: 'tide-bells', x: 74, z: 268, r: 24, y: 7.0 },
  { id: 'sealed-booth', x: -122, z: 226, r: 22, y: 4.0 },

  // ── Banksia Flats (east) ──
  { id: 'blue-vault', x: 232, z: 66, r: 30, y: 11.0 },
  { id: 'hoop-and-ball', x: 186, z: 158, r: 30, y: 13.0 },
  { id: 'three-totems', x: 268, z: -34, r: 34, y: 13.5 },
  { id: 'totem-lookout', x: 196, z: -96, r: 16, y: 29.0 },

  // ── Gumtree Gully (west) ──
  { id: 'bucket-walk', x: -238, z: 92, r: 30, y: 10.5 },
  { id: 'scatter-cairns', x: -196, z: -46, r: 40, y: 31.0 },
  { id: 'split-glass', x: -276, z: -136, r: 26, y: 36.5 },

  // ── Granite Spine (north ridge) ──
  { id: 'red-antenna', x: 26, z: -232, r: 28, y: 50.0 },
  { id: 'long-relay', x: -84, z: -196, r: 46, y: 49.5 },
  { id: 'high-window', x: 148, z: -218, r: 24, y: 44.0 },
  { id: 'night-lamps', x: -158, z: -262, r: 30, y: 38.5 },

  // ── The Quiet Basin (centre) ──
  { id: 'white-gate', x: 8, z: 16, r: 40, y: 15.0 },
  { id: 'deep-maze', x: -66, z: -58, r: 32, y: 31.0 },
  { id: 'final-march', x: 96, z: -22, r: 36, y: 19.0 },

  // ── Cart line stops ──
  { id: 'cart-south', x: 22, z: 246, r: 14, y: 6.0 },
  { id: 'cart-north', x: -8, z: -178, r: 14, y: 54.0 },
];

const PAD_BY_ID = new Map(PADS.map((p) => [p.id, p]));

export function pad(id: string): Pad {
  const found = PAD_BY_ID.get(id);
  if (!found) throw new Error(`[massive-march] unknown pad "${id}"`);
  return found;
}

// ─── Height field ───────────────────────────────────────────────────────────

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Distance from the origin at which the coast sits, for a given bearing. Three
 * harmonics is enough to make headlands, bays and a long southern beach without
 * anything repeating recognisably.
 */
export function shoreAt(theta: number): number {
  return (
    SHORE_RADIUS +
    52 * Math.sin(theta * 2 + 0.7) +
    30 * Math.sin(theta * 3 - 1.9) +
    17 * Math.sin(theta * 5 + 2.4) -
    11 * Math.sin(theta * 7 - 0.4)
  );
}

/** The land before pads and structures level it. */
function baseHeight(x: number, z: number): number {
  const dist = Math.hypot(x, z);
  const theta = Math.atan2(z, x);
  const shore = shoreAt(theta);
  /** 1 at the centre, 0 at the waterline, negative out to sea. */
  const inland = 1 - dist / shore;

  // The dome. Raised to a power > 1 so the coast is gentle and the interior
  // climbs — a beach you can land on, a middle you have to walk up into.
  let h = 54 * Math.pow(Math.max(0, inland), 1.45);

  // Granite Spine — the ridge across the north, and the reason the north half
  // of the island is a climb and a viewpoint rather than more of the same.
  h += 44 * Math.exp(-((z + 205) ** 2) / (2 * 82 ** 2)) * Math.exp(-(x ** 2) / (2 * 250 ** 2));
  // A second, lower shoulder west of it, so the ridge is not one smooth loaf.
  h += 17 * Math.exp(-(((x + 210) ** 2 + (z + 150) ** 2) / (2 * 108 ** 2)));

  // The Quiet Basin — a bowl in the middle. Being inside it means the horizon
  // is close and you cannot see where anyone else is, which is most of the
  // point of putting the last gate down there.
  h -= 27 * Math.exp(-(((x - 8) ** 2 + (z - 16) ** 2) / (2 * 104 ** 2)));

  // Rolling ground. Three octaves, all cheap.
  h +=
    3.4 * Math.sin(x * 0.0207) * Math.cos(z * 0.0191) +
    2.0 * Math.sin(x * 0.0413 + 1.3) * Math.cos(z * 0.0377 - 0.6) +
    0.9 * Math.sin(x * 0.0829 - 2.0) * Math.cos(z * 0.0761 + 1.0);

  // A dune line just behind the beach, wherever the beach is.
  const shoreBand = smoothstep(0.02, 0.09, inland) * (1 - smoothstep(0.11, 0.2, inland));
  h += 5.2 * shoreBand;

  // Saltpan — a genuinely flat, featureless stretch in the southwest, so the
  // island has one place where "walk toward the yellow thing" is the only
  // navigation available.
  const panT = Math.exp(-(((x + 246) ** 2 + (z - 196) ** 2) / (2 * 86 ** 2)));
  h = h * (1 - panT) + 5.6 * panT;

  // Below the waterline the floor keeps dropping, so the sea reads as deep
  // rather than as a puddle over a plateau.
  if (inland < 0) h -= 34 * Math.min(1, -inland * 3.4);

  return h;
}

/**
 * Ground height at a point, pads included.
 *
 * Hot: called per player per frame on the client and per player per tick on the
 * server, plus once per vertex when the mesh is built. Kept to arithmetic and a
 * short loop — no allocation, no lookups beyond the pad array.
 */
export function groundY(x: number, z: number): number {
  let h = baseHeight(x, z);

  for (let i = 0; i < PADS.length; i++) {
    const p = PADS[i];
    const dx = x - p.x;
    const dz = z - p.z;
    const d = Math.hypot(dx, dz);
    const outer = p.r * 1.4;
    if (d >= outer) continue;
    // 1 inside the pad, feathering to 0 at the outer edge.
    const t = d <= p.r ? 1 : 1 - smoothstep(p.r, outer, d);
    h = h * (1 - t) + p.y * t;
  }

  return h;
}

/** Cheap central-difference gradient. `eps` is a metre — the scale that matters. */
export function slopeAt(x: number, z: number): { gx: number; gz: number; grade: number } {
  const e = 0.9;
  const gx = (groundY(x + e, z) - groundY(x - e, z)) / (2 * e);
  const gz = (groundY(x, z + e) - groundY(x, z - e)) / (2 * e);
  return { gx, gz, grade: Math.hypot(gx, gz) };
}

export function isWater(x: number, z: number): boolean {
  return groundY(x, z) < SEA_LEVEL + WALKABLE_MARGIN;
}

/**
 * Where a straight line from `origin` in `direction` meets the ground.
 *
 * A marched approximation rather than a real intersection: step along the ray
 * until the ground is above it, then bisect a few times. Good to a few
 * centimetres at laser-pointer ranges, and it works against a height *function*
 * rather than a mesh — which matters, because the mesh is a tier-dependent
 * approximation of this and the dot should land where the rule says, not where
 * that particular device happened to tessellate.
 *
 * Returns null when the ray never comes down (aimed at the sky).
 */
export function raycastGround(
  origin: { x: number; y: number; z: number },
  direction: { x: number; y: number; z: number },
  maxDistance = 260,
): { x: number; y: number; z: number; distance: number } | null {
  const step = maxDistance / 64;
  let previous = 0;
  for (let travelled = step; travelled <= maxDistance; travelled += step) {
    const x = origin.x + direction.x * travelled;
    const y = origin.y + direction.y * travelled;
    const z = origin.z + direction.z * travelled;
    if (y > groundY(x, z)) {
      previous = travelled;
      continue;
    }
    // Bisect the segment that crossed the surface.
    let lo = previous;
    let hi = travelled;
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2;
      const mx = origin.x + direction.x * mid;
      const my = origin.y + direction.y * mid;
      const mz = origin.z + direction.z * mid;
      if (my > groundY(mx, mz)) lo = mid;
      else hi = mid;
    }
    return {
      x: origin.x + direction.x * hi,
      y: origin.y + direction.y * hi,
      z: origin.z + direction.z * hi,
      distance: hi,
    };
  }
  return null;
}

/**
 * Push a position back onto walkable land.
 *
 * Used by the player controller (so you wade to a stop at the waterline instead
 * of walking into the sea) and by the server's position check (so a client that
 * believes it is standing in the ocean is corrected rather than trusted). Walks
 * back toward the island centre because on an island that is always uphill.
 */
export function clampToLand(x: number, z: number): { x: number; z: number } {
  if (!isWater(x, z)) return { x, z };

  const dist = Math.hypot(x, z);
  if (dist < 1) return { x, z };
  const ux = x / dist;
  const uz = z / dist;

  // Search inland along the bearing for the first dry radius. Coarse first,
  // because a position dropped a hundred metres offshore (a bad throw, a
  // reconnect, a clock stall) is as legitimate an input as a wading player and a
  // fixed number of small steps would simply give up on it.
  let land = -1;
  for (let r = Math.min(dist, SHORE_RADIUS + 60) - 4; r > 8; r -= 6) {
    if (!isWater(ux * r, uz * r)) {
      land = r;
      break;
    }
  }
  // Nothing dry on this bearing at all should be impossible on an island, but
  // returning the centre beats returning a position in the sea.
  if (land < 0) return { x: 0, z: 0 };

  // Then walk back out to the waterline, so you stop AT the water's edge rather
  // than being yanked six metres up the beach every time you touch the surf.
  let dry = land;
  let wet = Math.min(dist, land + 6);
  for (let i = 0; i < 10; i++) {
    const mid = (dry + wet) / 2;
    if (isWater(ux * mid, uz * mid)) wet = mid;
    else dry = mid;
  }

  return { x: ux * dry, z: uz * dry };
}
