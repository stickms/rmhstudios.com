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
 * - {@link rimMap}: the map of one class, RGBA: R and G are the displacement (128 = none), B is the band's own opacity
 *   (255 at the rim, easing to 0 `band` px in, 0 everywhere else), so the filter fades the refracted picture into the live
 *   interior instead of ending it at an edge; neutral is (128, 128, 0, 255).
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
  /** Map pixels per CSS px: a 1x map stretched over a 2x or 3x screen shows its steps at a sharp edge. */
  mapScale: 2,
  /** Standard deviation of the blur that softens the displaced picture's steps, CSS px. */
  softenPx: 0.6,
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
  /**
   * Which way the band pushes. Outward (the default) pulls in what lies beyond the rim, as a lens does; inward pulls in what
   * lies just inside it. A host that is itself IN the picture (a card, pane or field) must go inward: outward would sample its
   * own edge and glow and show them a second time inside the band. A host hidden from the picture goes outward.
   */
  inward?: boolean;
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
export function sizeClass(w: number, h: number, r: number, inward = false): SizeClass {
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
  return { key: `${W}x${H}r${R}${inward ? 'i' : ''}`, w: W, h: H, r: R, inward };
}

/** Pixel size of a class's map: the host box plus the pad on every side, at `scale` map pixels per CSS px. */
export function mapSize(
  c: { w: number; h: number },
  pad: number = REFRACT.padPx,
  scale: number = REFRACT.mapScale,
): { width: number; height: number } {
  return {
    width: Math.ceil((Math.ceil(c.w) + 2 * pad) * scale),
    height: Math.ceil((Math.ceil(c.h) + 2 * pad) * scale),
  };
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/**
 * The map of a class: RGBA, `mapSize(c, pad, scale)` px, row-major. R carries the x push and G the y push of
 * `feDisplacementMap` (128 = none): the outward normal of the rounded rectangle scaled by a smoothstep falloff that is 1 at
 * the rim and 0 `band` px in (negated for an `inward` class). B carries the band's opacity (see the file header); A is opaque. Everything outside the host box
 * (the pad) and in the interior is exactly neutral, so only the band ever moves or shows a pixel. Only the ring is computed;
 * the rest is a fill. Lengths are CSS px; the rim is anti-aliased over one map pixel.
 */
export function rimMap(
  c: { w: number; h: number; r: number; inward?: boolean },
  band: number,
  pad: number = REFRACT.padPx,
  scale: number = REFRACT.mapScale,
): Uint8ClampedArray {
  const { width, height } = mapSize(c, pad, scale);
  const out = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < out.length; i += 4) {
    out[i] = 128;
    out[i + 1] = 128;
    out[i + 2] = 0;
    out[i + 3] = 255;
  }
  const w = Math.max(c.w, 0);
  const h = Math.max(c.h, 0);
  const b = Math.max(0, Math.min(band, w / 2, h / 2));
  if (b === 0) return out;
  const r = Math.max(0, Math.min(c.r, w / 2, h / 2));
  const sign = c.inward ? -1 : 1;
  const hw = w / 2;
  const hh = h / 2;
  const cx = pad + hw;
  const cy = pad + hh;
  // The ring's bounding box in map pixels, one pixel of margin for the anti-aliased rim.
  const x0 = Math.max(0, Math.floor((pad - 1) * scale));
  const y0 = Math.max(0, Math.floor((pad - 1) * scale));
  const x1 = Math.min(width, Math.ceil((pad + w + 1) * scale));
  const y1 = Math.min(height, Math.ceil((pad + h + 1) * scale));
  const inner = (pad + b + 1) * scale;
  const innerEndX = (pad + w - b - 1) * scale;
  const innerEndY = (pad + h - b - 1) * scale;
  for (let y = y0; y < y1; y++) {
    const rowInterior = y >= inner && y + 1 <= innerEndY;
    for (let x = x0; x < x1; x++) {
      if (rowInterior && x >= inner && x + 1 <= innerEndX) {
        x = Math.max(x, Math.floor(innerEndX) - 1);
        continue;
      }
      const px = (x + 0.5) / scale - cx;
      const py = (y + 0.5) / scale - cy;
      const qx = Math.abs(px) - (hw - r);
      const qy = Math.abs(py) - (hh - r);
      const ox = Math.max(qx, 0);
      const oy = Math.max(qy, 0);
      const len = Math.hypot(ox, oy);
      // Signed distance to the rounded rectangle: negative inside. `e` is how far inside the rim this pixel is.
      const e = -(len + Math.min(Math.max(qx, qy), 0) - r);
      if (e < -1 / scale || e >= b) continue;
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
      const ee = Math.max(e, 0);
      const k = smooth(1 - ee / b);
      // Coverage of the rim pixel: 1 inside, easing to 0 over one map pixel across the edge.
      const cover = Math.max(0, Math.min(1, 0.5 + e * scale));
      const o = (y * width + x) * 4;
      out[o] = Math.round(128 + 127 * sign * nx * k * (px < 0 ? -1 : 1));
      out[o + 1] = Math.round(128 + 127 * sign * ny * k * (py < 0 ? -1 : 1));
      out[o + 2] = Math.round(255 * Math.min(1, 1.5 * k) * cover);
    }
  }
  return out;
}
