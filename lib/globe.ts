/**
 * The site's sphere instrument — where a thing sits on a globe, and where that
 * lands on screen. Client-safe, pure, testable.
 *
 * ## Why this is one module and not three
 *
 * The site navigates by a **liquid globe** (`components/radial/`): a wireframe
 * sphere you turn with a finger, with things pinned to its surface and a wave
 * that travels over the glass when you poke it. That object is this site's idiom
 * for "a set of things laid out on a surface you explore", and it is now read by
 * more than one page — the navigation hub, the Kaikai debt ledger
 * (`components/kaikai-debt/`), and the Rebar & Rutabaga menu
 * (`components/rebar-rutabaga/`), whose courses are spheres because the kitchen's
 * technique is spherification.
 *
 * Each of those is the same instrument reading different data, so the arithmetic
 * that makes it *that* instrument lives here, once: the same screen-handed axes
 * (x right, y **down**, z toward the viewer), the same perspective constant, the
 * same `globeK` foreshortening, the same thirteen-ring cage. Spheres on one site
 * that curved differently would be worse than one sphere.
 *
 * What does NOT live here is any particular globe's *map* — which quantity
 * becomes latitude, what a pin stands for, how far it is lifted off the surface.
 * That is the reading, and it belongs to the page doing the reading
 * (`lib/kaikai-debt/globe.ts`, `lib/rebar-rutabaga/menu.ts`).
 *
 * Ripples, springs and throw physics are not here either — they are
 * `lib/fluid.ts`, shared by every gesture surface on the site
 * (design-language §0.5). Do not re-derive either set locally.
 */

const DEG = Math.PI / 180;

/**
 * Perspective, as a multiple of the sphere's radius.
 *
 * This is the number that decides how much the sphere bulges, and it is the
 * reason this module exists: every globe on the site reads it from here, and the
 * CSS 3D stage of the navigation globe is handed the same value inline, so the
 * wireframe's transform and the pins' projection can never disagree.
 */
export const GLOBE_PERSP = 3.1;

/** Foreshortening at depth `z` on the unit sphere (z = 1 front, −1 back). */
export function globeK(z: number): number {
  return GLOBE_PERSP / (GLOBE_PERSP - z * 0.5);
}

/**
 * Usable latitude band, in degrees — how far from the equator a pin may be
 * placed. ±54° leaves the poles clear so nothing is unreachable (a point at a
 * pole could only be brought to the front by tilting past {@link PITCH_LIMIT}),
 * and leaves the cage's polar caps room to still read as a sphere rather than as
 * a barrel.
 */
export const LAT_SPAN_DEG = 54;

/** How far the sphere may be tilted, so the poles never come to the front. */
export const PITCH_LIMIT = 62;

/** A point fixed to the sphere, with its direction cosines precomputed. */
export interface GlobeAnchor {
  latDeg: number;
  lonDeg: number;
  /** Unit direction in body space — screen-handed: x right, y DOWN, z to viewer. */
  bx: number;
  by: number;
  bz: number;
}

/**
 * Direction cosines for a latitude/longitude, in the same handedness the
 * navigation globe projects in.
 *
 * `y` is negated because screen coordinates grow downward: north on the globe
 * has to be up on the screen, and the alternative — flipping it at every draw
 * site — is how a globe ends up with its data upside down in one view only.
 */
export function anchorAt(latDeg: number, lonDeg: number): GlobeAnchor {
  const cl = Math.cos(latDeg * DEG);
  return {
    latDeg,
    lonDeg,
    bx: cl * Math.sin(lonDeg * DEG),
    by: -Math.sin(latDeg * DEG),
    bz: cl * Math.cos(lonDeg * DEG),
  };
}

/** A body-space direction after the globe's yaw/pitch have been applied. */
export interface GlobeView {
  x: number;
  y: number;
  /** Depth: +1 dead centre facing you, −1 directly behind the sphere. */
  z: number;
}

/**
 * Rotate a body-space direction into view space.
 *
 * Yaw about Y, then pitch about X — the same order (and therefore the same
 * result) as the CSS `rotateX(pitch) rotateY(yaw)` the wireframe uses. Getting the
 * order wrong does not look wrong until the sphere is tilted, at which point
 * the data slides off the wireframe it is supposed to be stuck to.
 */
export function viewOf(
  anchor: { bx: number; by: number; bz: number },
  yawDeg: number,
  pitchDeg: number,
  swell = 1,
  out?: GlobeView,
): GlobeView {
  const cy = Math.cos(yawDeg * DEG);
  const sy = Math.sin(yawDeg * DEG);
  const cp = Math.cos(pitchDeg * DEG);
  const sp = Math.sin(pitchDeg * DEG);
  const bx = anchor.bx * swell;
  const by = anchor.by * swell;
  const bz = anchor.bz * swell;
  const x1 = bx * cy + bz * sy;
  const z1 = -bx * sy + bz * cy;
  const result = out ?? { x: 0, y: 0, z: 0 };
  result.x = x1;
  result.y = by * cp - z1 * sp;
  result.z = by * sp + z1 * cp;
  return result;
}

/**
 * View-space direction → pixel offsets from the sphere's centre.
 *
 * Separate from {@link viewOf} because the depth is needed *before* the
 * projection — the renderer sorts by it, and the hit test reads it to reject
 * anything on the far face.
 */
export function toScreen(view: GlobeView, radius: number): { x: number; y: number; k: number } {
  const k = globeK(view.z);
  return { x: view.x * radius * k, y: view.y * radius * k, k };
}

/* -------------------------------------------------------------------------- */
/* The cage                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The wireframe's rings. Meridians in degrees of longitude, parallels in degrees
 * of latitude — the same thirteen circles the navigation globe is drawn from, so
 * the two spheres are recognisably the same object.
 */
export const MERIDIANS: readonly number[] = [0, 30, 60, 90, 120, 150];
export const PARALLELS: readonly number[] = [-60, -40, -20, 0, 20, 40, 60];

/** Samples per ring — a projected circle is a conic section, so it is polylined. */
export const RING_SAMPLES = 64;

/**
 * cos/sin of every ring sample angle, built once at module load.
 *
 * All rings are cut at the same angles, so these are constant for the lifetime
 * of the page. Recomputing them inside the sample loop costs ~1,700 trig calls
 * per frame to arrive at the same numbers — the exact waste the navigation
 * globe's cage records having measured.
 */
export const RING_COS = new Float64Array(RING_SAMPLES + 1);
export const RING_SIN = new Float64Array(RING_SAMPLES + 1);
for (let s = 0; s <= RING_SAMPLES; s++) {
  const theta = (s / RING_SAMPLES) * Math.PI * 2;
  RING_COS[s] = Math.cos(theta);
  RING_SIN[s] = Math.sin(theta);
}

/**
 * Device-pixel ceiling for the globe canvas.
 *
 * The site's convention for canvases (design-language §12.1 rule 4): fill rate
 * scales with the *square* of the ratio, and a hairline wireframe gains nothing
 * visible from a 3× buffer that costs 2.25× the pixels of a 2× one.
 */
export const GLOBE_MAX_DPR = 2;

/* -------------------------------------------------------------------------- */
/* Picking                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The index of the front-facing point nearest `(px, py)`, or −1.
 *
 *
 * Front-facing only: a point on the far side of the sphere projects to the same
 * region of the screen as one on the near side, and picking the one behind the
 * globe is how a hover tooltip ends up describing something the viewer cannot
 * see. `maxDistance` is in the same pixel units as the points, so the hit target
 * can be made generously larger than the mark — the data-viz interaction rule
 * that a hit area is not the mark.
 */
export function pickNearest(
  points: readonly { sx: number; sy: number; depth: number }[],
  px: number,
  py: number,
  maxDistance: number,
): number {
  let best = -1;
  let bestD = maxDistance * maxDistance;
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    if (p.depth <= 0.02) continue;
    const dx = p.sx - px;
    const dy = p.sy - py;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/**
 * Clamp a tilt to the usable band, hard.
 *
 * The navigation globe rubber-bands past this limit (`rubberBandClamp` in
 * `lib/fluid.ts`) because it is a control with a gesture grammar. A globe that
 * is being *read* — a chart, a menu — wants the hard stop instead: a surface that
 * keeps sliding after you stop dragging it is one you cannot hold a value still
 * on. Pick per globe; both limits are this same number.
 */
export function clampPitch(pitchDeg: number): number {
  return pitchDeg < -PITCH_LIMIT ? -PITCH_LIMIT : pitchDeg > PITCH_LIMIT ? PITCH_LIMIT : pitchDeg;
}

/* -------------------------------------------------------------------------- */
/* Placement                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The golden angle, in degrees (~137.5°).
 *
 * Successive multiples of it never repeat a longitude, which is what keeps a
 * spiral of pins from stacking into visible columns the way any rational
 * fraction of a turn does.
 */
export const GOLDEN_DEG = 180 * (3 - Math.sqrt(5));

/**
 * Place item `i` of `count` evenly over the sphere — the layout the navigation
 * globe pins its destinations with.
 *
 * Latitude is spread by equal *sine* rather than equal angle, because equal
 * angle bunches points at the poles: on a sphere, equal steps in sin(lat) are
 * equal steps in surface area. The band is capped at {@link LAT_SPAN_DEG} so
 * every pin can be brought to the front within the pitch limit.
 *
 * Deterministic, so a given set of items is always in the same place — for the
 * navigation globe that is muscle memory, and for a menu it is being able to say
 * "the one at the top" and have it still be there next time.
 */
export function spiralAnchor(index: number, count: number): GlobeAnchor {
  const sinLat = count <= 1 ? 0 : (1 - (2 * (index + 0.5)) / count) * Math.sin(LAT_SPAN_DEG * DEG);
  const latDeg = Math.asin(sinLat) / DEG;
  const lonDeg = ((index * GOLDEN_DEG) % 360) - 180;
  return anchorAt(latDeg, lonDeg);
}
