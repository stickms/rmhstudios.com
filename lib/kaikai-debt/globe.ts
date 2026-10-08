/**
 * The debt globe's **map** — which quantity becomes latitude, longitude and
 * altitude when the ledger is plotted on the site's sphere.
 *
 * The sphere itself — axes, perspective, the cage, picking, the pitch limit —
 * is `lib/globe.ts`, shared with the navigation globe and the Rebar & Rutabaga
 * menu. This file is only the reading:
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
 * The bands are capped short of the poles by `LAT_SPAN_DEG` for the same reason
 * the navigation globe caps its pins: a point at a pole can only be brought to
 * the front by tilting past the pitch limit, i.e. it could never be inspected.
 */

import { LAT_SPAN_DEG } from '@/lib/globe';

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
