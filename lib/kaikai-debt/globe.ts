/**
 * The debt globe — where a ledger cell sits on a sphere, and where that lands on
 * screen. Client-safe, pure, testable.
 *
 * ## Why the ledger goes on a globe at all
 *
 * The site already navigates by a **liquid globe** (`components/radial/`): a
 * wireframe sphere you turn with a finger, with destinations pinned to its
 * surface and a wave that travels over the glass when you poke it. That object
 * is the site's own idiom for "a set of things laid out on a surface you
 * explore", so plotting the ledger on one is not a second globe bolted onto the
 * page — it is the same instrument reading different data.
 *
 * The projection here is deliberately the *same arithmetic* the navigation globe
 * uses: the same screen-handed axes (x right, y **down**, z toward the viewer),
 * the same perspective constant, the same `kAt` foreshortening. Two globes on
 * one site that curved differently would be worse than one.
 *
 * ## The map projection
 *
 * A cell of the (month × category) grid becomes a point on the sphere:
 *
 *  - **Latitude is the category.** Each of the eight categories owns a band, so
 *    the globe reads as a set of climate zones — food along one parallel,
 *    gambling along another. Bands are what make the sphere legible while it
 *    turns: you learn where a kind of debt lives.
 *  - **Longitude is time.** One full turn of the globe is the whole span of the
 *    archive, oldest at the back, newest at the prime meridian. Spinning it is
 *    literally scrubbing through his history.
 *  - **Altitude is money.** A cell is lifted off the surface in proportion to
 *    what it is worth *now* — so the globe grows spikes where the debt is, and
 *    the spikes keep growing while you watch, because the lift is computed from
 *    the basis and the clock like everything else on this page.
 *
 * The bands are capped short of the poles for the same reason the navigation
 * globe caps its pins: a point at a pole can only be brought to the front by
 * tilting past the pitch limit, i.e. it could never be inspected.
 */

const DEG = Math.PI / 180;

/**
 * Perspective, as a multiple of the sphere's radius — the navigation globe's
 * `PERSP`, repeated here so the two spheres bulge identically.
 */
export const GLOBE_PERSP = 3.1;

/** Foreshortening at depth `z` on the unit sphere (z = 1 front, −1 back). */
export function globeK(z: number): number {
  return GLOBE_PERSP / (GLOBE_PERSP - z * 0.5);
}

/**
 * Latitude band the category rings are spread over, in degrees. ±54° leaves the
 * poles clear so no cell is unreachable, and leaves room for the polar cap rings
 * of the cage to still read as a sphere rather than as a barrel.
 */
export const LAT_SPAN_DEG = 54;

/** How far the sphere may be tilted, so the poles never come to the front. */
export const PITCH_LIMIT = 62;

/**
 * The latitude a category band sits at.
 *
 * Evenly spaced across the usable band, in the palette's own category order, so
 * the ring a colour lives on is the same on every visit — the globe is a map,
 * and a map whose features move is not one.
 */
export function categoryLatitude(index: number, count: number): number {
  if (count <= 1) return 0;
  return LAT_SPAN_DEG - (2 * LAT_SPAN_DEG * index) / (count - 1);
}

/**
 * The longitude a time bucket sits at, −180 … 180.
 *
 * Newest at 0° (the prime meridian, which is what faces you at rest) and oldest
 * approaching ±180° round the back. `count` is the number of buckets, so the
 * mapping rescales as the archive grows rather than compressing everything into
 * a wedge.
 */
export function timeLongitude(index: number, count: number): number {
  if (count <= 1) return 0;
  // index 0 is the OLDEST bucket, so it is pushed round the back; the newest
  // ends up at 0°.
  return -180 + (360 * index) / count;
}

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
 * result) as the navigation globe's `rotateX(pitch) rotateY(yaw)`. Getting the
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
 * Clamp a tilt to the usable band.
 *
 * Hard rather than rubber-banded: this globe is a chart, not a control with a
 * gesture grammar, and a chart that keeps sliding after you stop dragging it is
 * a chart you cannot read a value off.
 */
export function clampPitch(pitchDeg: number): number {
  return pitchDeg < -PITCH_LIMIT ? -PITCH_LIMIT : pitchDeg > PITCH_LIMIT ? PITCH_LIMIT : pitchDeg;
}

/**
 * How far a cell is lifted off the surface, as a multiple of the radius.
 *
 * A square root rather than a linear map: the values span orders of magnitude
 * (the same reason the histogram is log-spaced), and a linear lift gives one
 * spike through the ceiling and 900 flat cells. The floor is not zero, so a
 * bucket with a single small debt in it is still visibly a pin standing on the
 * surface rather than a mark painted on it.
 */
export function liftFor(value: number, maxValue: number, max = 0.42): number {
  if (!(maxValue > 0) || !(value > 0)) return 0.02;
  return 0.02 + Math.sqrt(value / maxValue) * max;
}
