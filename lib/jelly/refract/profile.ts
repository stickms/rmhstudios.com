/**
 * The shape of the refracting rim, as pure maths (no DOM, no direction).
 *
 * A glass surface bends what is behind it where its rim curves: a band along the edge, strongest at the edge and gone at
 * the band's inner side, so the interior stays clear gel. The band is drawn by a plain `filter: url(#svg)` on a layer that
 * shows the page snapshot (`./layer.ts`): an `feImage` displacement map stretched over the layer, three
 * `feDisplacementMap`s at slightly different scales for the red, green and blue images (the dispersion). This module owns
 * the numbers and the map:
 *
 * - {@link REFRACT}: band width, the deepest push and the overscan pad the layer extends beyond the host so a pixel pushed
 *   outward still has picture under it;
 * - {@link DISPERSION}: the per-channel scales around green;
 * - {@link sizeClass}: the quantisation that lets hundreds of hosts share a handful of filters;
 * - {@link rimMap}: the displacement map of one class, RGBA, neutral (128, 128, 128, 255) everywhere but the band.
 *
 * Nothing here reads the document direction: the light is always at the top left (red leans to it), in LTR and RTL alike.
 */

export const REFRACT = {
  /** Width of the refracting band inside the host's rim, CSS px (capped at half the host's short side). */
  bandPx: 12,
  /** The deepest displacement at the rim, CSS px, for the green channel. */
  depthPx: 8,
  /** How far the layer reaches past the host on every side, CSS px: at least `depthPx × DISPERSION.r`. */
  padPx: 10,
} as const;

/**
 * Per-channel multipliers on {@link REFRACT.depthPx}. The design language's `--gel-disperse-r/-b` are ∓0.75px against a
 * `--gel-bevel` of 4px: red leans toward the top-left light by 0.75/4 more than green, blue by as much less
 * (`jelly-refract.test.ts` keeps the three in step).
 */
export const DISPERSION = { r: 1.1875, g: 1, b: 0.8125 } as const;

export interface SizeClass {
  key: string;
  w: number;
  h: number;
  r: number;
}

const BASE = 16;
const RATIO = 1.15;
/** The radii a class may have, px. Anything between snaps to the nearest; a pill is its own radius (half the short side). */
const RADII = [0, 4, 8, 12, 16, 24, 32, 48, 64, 96, 128] as const;

function bucket(v: number): number {
  if (!(v > BASE)) return BASE;
  const k = Math.ceil(Math.log(v / BASE) / Math.log(RATIO) - 1e-9);
  return Math.round(BASE * RATIO ** k);
}

/**
 * Quantise a host to a size class: width and height round UP to the next geometric bucket (ratio 1.15 from 16 px, so a
 * 200 to 800 px sweep is 10 classes), and the radius snaps to a short list. The filter's map is stretched over the real
 * box, so a class is only ever up to 15% off the host it serves. A radius at or above half the short side is the pill of
 * the class.
 */
export function sizeClass(w: number, h: number, r: number): SizeClass {
  const W = bucket(w);
  const H = bucket(h);
  const half = Math.floor(Math.min(W, H) / 2);
  let R: number;
  if (!(r > 0)) R = 0;
  else if (r >= Math.min(w, h) / 2) R = half;
  else {
    R = RADII[0];
    for (const cand of RADII) if (Math.abs(cand - r) < Math.abs(R - r)) R = cand;
    R = Math.min(R, half);
  }
  return { key: `${W}x${H}r${R}`, w: W, h: H, r: R };
}

/** Pixel size of a class's map: the host box plus the pad on every side. */
export function mapSize(
  c: { w: number; h: number },
  pad: number = REFRACT.padPx,
): { width: number; height: number } {
  return { width: Math.ceil(c.w) + 2 * pad, height: Math.ceil(c.h) + 2 * pad };
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/**
 * The displacement map of a class: RGBA, `mapSize(c, pad)` px, row-major. R carries the x push and G the y push of
 * `feDisplacementMap` (128 = none): the outward normal of the rounded rectangle scaled by a smoothstep falloff that is 1 at
 * the rim and 0 `band` px in. B is neutral and A opaque. Everything outside the host box (the pad) and in the interior is
 * exactly neutral, so only the band ever moves a pixel. Only the ring is computed; the rest is a fill.
 */
export function rimMap(
  c: { w: number; h: number; r: number },
  band: number,
  pad: number = REFRACT.padPx,
): Uint8ClampedArray {
  const { width, height } = mapSize(c, pad);
  const out = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < out.length; i += 4) {
    out[i] = 128;
    out[i + 1] = 128;
    out[i + 2] = 128;
    out[i + 3] = 255;
  }
  const w = Math.max(c.w, 0);
  const h = Math.max(c.h, 0);
  const b = Math.max(0, Math.min(band, w / 2, h / 2));
  if (b === 0) return out;
  const r = Math.max(0, Math.min(c.r, w / 2, h / 2));
  const hw = w / 2;
  const hh = h / 2;
  const cx = pad + hw;
  const cy = pad + hh;
  const x0 = pad;
  const y0 = pad;
  const x1 = Math.min(width, Math.ceil(pad + w));
  const y1 = Math.min(height, Math.ceil(pad + h));
  for (let y = y0; y < y1; y++) {
    const rowInterior = y >= y0 + b && y + 1 <= y1 - b;
    for (let x = x0; x < x1; x++) {
      if (rowInterior && x >= x0 + b && x + 1 <= x1 - b) {
        x = Math.max(x, Math.floor(x1 - b) - 1);
        continue;
      }
      const px = x + 0.5 - cx;
      const py = y + 0.5 - cy;
      const qx = Math.abs(px) - (hw - r);
      const qy = Math.abs(py) - (hh - r);
      const ox = Math.max(qx, 0);
      const oy = Math.max(qy, 0);
      const len = Math.hypot(ox, oy);
      // Signed distance to the rounded rectangle: negative inside. `e` is how far inside the rim this pixel is.
      const e = -(len + Math.min(Math.max(qx, qy), 0) - r);
      if (e < 0 || e >= b) continue;
      let nx: number;
      let ny: number;
      if (len > 0) {
        nx = ox / len;
        ny = oy / len;
      } else if (qx > qy) {
        nx = 1;
        ny = 0;
      } else {
        nx = 0;
        ny = 1;
      }
      const k = smooth(1 - e / b);
      const o = (y * width + x) * 4;
      out[o] = Math.round(128 + 127 * nx * k * (px < 0 ? -1 : 1));
      out[o + 1] = Math.round(128 + 127 * ny * k * (py < 0 ? -1 : 1));
    }
  }
  return out;
}
