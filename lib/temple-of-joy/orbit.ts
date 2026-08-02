/**
 * Where the globes stand, and where the sources stand on them.
 *
 * Pure geometry, kept out of the renderer so the two questions the sanctum's
 * layout actually raises — "does an eight-globe field still fit inside the
 * stage?" and "does every source get a place to stand?" — can be answered by
 * arithmetic and a test rather than by squinting at a phone.
 *
 * All distances are **fractions of the stage's width**, which is square. So
 * 0.5 is the stage's edge, and a globe at `cx = 0` with `r = 0.4` reaches from
 * −0.4 to 0.4 with a tenth of the stage to spare on each side.
 */
import { SOURCES } from './data/sources';
import type { Quat } from '../device-attitude';
import type { SourceId } from './types';

const DEG = Math.PI / 180;

/**
 * Perspective, as a multiple of the stage width — the same constant the nav
 * globe uses (`components/radial/LiquidGlobe.tsx`), and for the same reason:
 * the CSS `perspective` on the stage and the projection in JS have to read one
 * number or the pins slide off the wireframe they are standing on.
 */
export const PERSP = 3.1;

/** Foreshortening at depth `z` on the unit sphere (z = 1 front, −1 back). */
export function kAt(z: number): number {
  return PERSP / (PERSP - z * 0.5);
}

/* ══════════════════════════════════════════════════════════════════════════
   The field
   ══════════════════════════════════════════════════════════════════════════ */

/** The globe you tap, when it is the only one. */
const SOLO_RADIUS = 0.4;
/** The globe you tap, once it has company and has to make room for it. */
const HUB_RADIUS = 0.285;
/** Where the satellites' centres sit. */
const RING_RADIUS = 0.392;
/** How big a satellite is. */
const SATELLITE_RADIUS = 0.104;

/**
 * A globe's place in the stage.
 *
 * `phase` is where it sits on the satellite ring, in degrees, and is what the
 * renderer advances to make the field turn. The hub has no phase and never
 * moves — it is the thing everything else is orbiting.
 */
export interface GlobePlace {
  /** 0 is the hub; 1… are the satellites, in purchase order. */
  index: number;
  /** Centre, as a fraction of the stage from its middle. */
  cx: number;
  cy: number;
  /** Radius, as a fraction of the stage. */
  r: number;
  /** Degrees around the ring. 0 for the hub. */
  phase: number;
  /** Whether this globe is big enough to be worth drawing in full detail. */
  detailed: boolean;
}

/**
 * Lay `count` globes out in the stage.
 *
 * The hub shrinks the moment it has company — from 0.40 of the stage to 0.285
 * — which is what makes buying the second globe *look* like something happened
 * rather than like a marble appearing in the corner. The renderer eases between
 * the two radii rather than cutting, so the purchase reads as the field making
 * room.
 *
 * Satellites are spread evenly and start at the top, so the second globe
 * arrives somewhere the eye is already looking.
 *
 * Two invariants, both held by a hair on purpose — the field should read as
 * packed rather than scattered — and both covered by a test, because they were
 * wrong the first time and it shows up on screen as satellites sunk into the
 * hub:
 *
 *   • `RING_RADIUS + SATELLITE_RADIUS` (0.496) ≤ the stage's half-width (0.5)
 *   • `RING_RADIUS − SATELLITE_RADIUS` (0.288) ≥ `HUB_RADIUS` (0.285)
 *
 * The second one is the tight one: at seven satellites the ring cannot grow
 * without leaving the stage, and the hub cannot shrink without the field
 * looking like eight marbles rather than a temple with a congregation.
 */
export function layoutGlobes(count: number, spin = 0): GlobePlace[] {
  const globes = Math.max(1, Math.floor(count));
  const out: GlobePlace[] = [
    {
      index: 0,
      cx: 0,
      cy: 0,
      r: globes > 1 ? HUB_RADIUS : SOLO_RADIUS,
      phase: 0,
      detailed: true,
    },
  ];

  const satellites = globes - 1;
  for (let i = 0; i < satellites; i++) {
    // −90° puts the first satellite straight up.
    const phase = (i * 360) / satellites - 90 + spin;
    out.push({
      index: i + 1,
      cx: Math.cos(phase * DEG) * RING_RADIUS,
      cy: Math.sin(phase * DEG) * RING_RADIUS,
      r: SATELLITE_RADIUS,
      phase,
      detailed: false,
    });
  }

  return out;
}

/** The hub's radius for a field of `count` globes — what the renderer eases to. */
export function hubRadius(count: number): number {
  return count > 1 ? HUB_RADIUS : SOLO_RADIUS;
}

/* ══════════════════════════════════════════════════════════════════════════
   The cage
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The wireframe every liquid globe on this site is drawn from: six great
 * circles through the poles and seven latitude rings.
 *
 * Here rather than in a renderer because there are now two of them — the
 * sanctum's 2D canvas and the ball on the lane, which is the same object seen
 * in three dimensions — and a globe that is recognisably the same globe in both
 * places is the entire point of putting it on a lane. Two hand-kept copies of
 * "six and seven" would have drifted the first time either was tuned.
 */
export const MERIDIANS = [0, 30, 60, 90, 120, 150];
export const PARALLELS = [-60, -40, -20, 0, 20, 40, 60];

/**
 * A ring of the cage, as points on the unit sphere.
 *
 * `kind` picks which family: a **meridian** at longitude `angle` is a circle
 * through both poles; a **parallel** at latitude `angle` is the latitude circle,
 * scaled by `cos(lat)` and lifted to its height. Both are `u·cosθ + v·sinθ`
 * about a centre offset along the polar axis, which is why one function serves
 * both and why the 2D renderer can stroke them from the same description it
 * builds a `BufferGeometry` from here.
 *
 * Y points DOWN, matching the screen-handed axes the 2D projection uses.
 */
export function ringPoints(
  kind: 'meridian' | 'parallel',
  angle: number,
  samples: number,
): Float32Array {
  const out = new Float32Array((samples + 1) * 3);
  const c = Math.cos(angle * DEG);
  const s = Math.sin(angle * DEG);

  // u, v: the plane the circle lies in. oy: how far it is lifted up the axis.
  const [ux, uy, uz] = kind === 'meridian' ? [c, 0, -s] : [c, 0, 0];
  const [vx, vy, vz] = kind === 'meridian' ? [0, 1, 0] : [0, 0, c];
  const oy = kind === 'meridian' ? 0 : -s;

  for (let i = 0; i <= samples; i++) {
    const theta = (i / samples) * Math.PI * 2;
    const ct = Math.cos(theta);
    const st = Math.sin(theta);
    out[i * 3] = ux * ct + vx * st;
    out[i * 3 + 1] = uy * ct + vy * st + oy;
    out[i * 3 + 2] = uz * ct + vz * st;
  }
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════
   Tilt
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The two angles a globe is drawn at, taken back out of the quaternion
 * `useDeviceAttitude` emits.
 *
 * That hook speaks quaternions because it drives things rendered in 3D, where a
 * rotation is a rotation. This globe is projected by hand from a yaw and a
 * pitch, so the two have to be recovered — and the recovery is exact rather
 * than approximate, because `orbitRotation` builds exactly `Rx(a)·Ry(b)` and
 * nothing else.
 *
 * For that product the components come out as
 *
 *   x = sin(a/2)·cos(b/2)   y = cos(a/2)·sin(b/2)
 *   z = sin(a/2)·sin(b/2)   w = cos(a/2)·cos(b/2)
 *
 * so `x/w` is `tan(a/2)` and `y/w` is `tan(b/2)`, and each angle is one
 * `atan2` away with no ambiguity and no gimbal case to guard. Pulling a general
 * Euler decomposition out instead would flip by 180° exactly at the tilt where
 * somebody is holding the phone up to look at the thing.
 *
 * @returns degrees, in the globe renderer's own sense: `yaw` about the vertical
 * (right is positive), `pitch` about the horizontal (down is positive).
 */
export function tiltAngles(q: Quat): { yaw: number; pitch: number } {
  const [x, y, , w] = q;
  const pitch = (2 * Math.atan2(x, w)) / DEG;
  const yaw = (2 * Math.atan2(y, w)) / DEG;
  return { yaw, pitch };
}

/* ══════════════════════════════════════════════════════════════════════════
   The congregation
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * How many sources may stand on the field at once.
 *
 * A cap, not a budget: every pin is a DOM node the frame loop writes a
 * transform to, and past this the field is an unreadable cloud of icons long
 * before it is a performance problem. The sources that make the cut are the
 * DEEPEST ones owned — the top of your ladder is what you want to look at, and
 * the Acolytes are never the interesting part of a mature temple.
 */
export const MAX_PINS = 16;

/** How many pins one globe will carry, however many it is assigned. */
export const MAX_PINS_PER_GLOBE = 8;

export interface Pin {
  id: SourceId;
  /** Which globe it orbits. */
  globe: number;
  /** Its place on that globe's surface, and the direction cosines for it. */
  lat: number;
  lon: number;
  bx: number;
  by: number;
  bz: number;
}

/**
 * Latitude band the pins are spread over, as `sin(lat)`. Capping it well short
 * of the poles keeps every icon somewhere the sphere is actually facing you at
 * some point in its turn, instead of spinning on the spot at the top.
 */
const LAT_SPAN = 0.7;
/** Golden angle — the classic even-ish spherical distribution. */
const GOLDEN_DEG = 180 * (3 - Math.sqrt(5));

/**
 * Place one globe's assigned sources on its surface.
 *
 * Fibonacci, seeded by the position in the list, so a source's spot is a pure
 * function of what else is on that globe: buy a deeper source and the field
 * rearranges once, deterministically, instead of every icon jumping to a new
 * random home on every render.
 */
function placeOnSphere(ids: SourceId[], globe: number): Pin[] {
  const n = ids.length;
  return ids.map((id, i) => {
    const sinLat = n <= 1 ? 0 : (1 - (2 * (i + 0.5)) / n) * LAT_SPAN;
    const lat = Math.asin(sinLat) / DEG;
    const lon = ((i * GOLDEN_DEG) % 360) - 180;
    const cl = Math.cos(lat * DEG);
    return {
      id,
      globe,
      lat,
      lon,
      // Screen-handed: x right, y DOWN, z toward the viewer — the same axes CSS
      // 3D uses, so the projection and the drawn wireframe agree.
      bx: cl * Math.sin(lon * DEG),
      by: -Math.sin(lat * DEG),
      bz: cl * Math.cos(lon * DEG),
    };
  });
}

/**
 * Every source you own, given a globe and a place on it.
 *
 * Assignment is `ladderIndex % globes`, which is the one property that makes
 * buying a globe feel like it did something: the congregation *redistributes*.
 * With one globe everything is on it; with four, every fourth rung of the
 * ladder moves onto each new sphere, so all four are populated immediately
 * rather than the newest one sitting empty until you buy more sources.
 */
export function placePins(
  owned: Partial<Record<SourceId, number>>,
  globes: number,
  /**
   * How many pins the field can carry. Defaults to the ceiling; the renderer
   * passes a smaller number on a small screen, where sixteen icons on a
   * 170px sphere is not a congregation but a pile.
   */
  limit = MAX_PINS,
): Pin[] {
  const count = Math.max(1, Math.floor(globes));
  const cap = Math.max(1, Math.min(MAX_PINS, Math.floor(limit)));

  // Deepest first — see MAX_PINS.
  const held: { id: SourceId; ladder: number }[] = [];
  for (let i = SOURCES.length - 1; i >= 0; i--) {
    const source = SOURCES[i]!;
    if ((owned[source.id] ?? 0) > 0) held.push({ id: source.id, ladder: i });
  }

  const byGlobe: SourceId[][] = Array.from({ length: count }, () => []);
  let placed = 0;
  for (const { id, ladder } of held) {
    if (placed >= cap) break;
    const globe = ladder % count;
    const bucket = byGlobe[globe]!;
    if (bucket.length >= MAX_PINS_PER_GLOBE) continue;
    bucket.push(id);
    placed++;
  }

  return byGlobe.flatMap((ids, globe) => placeOnSphere(ids, globe));
}
