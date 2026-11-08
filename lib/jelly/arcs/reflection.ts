/**
 * Reflected light on a struck host's rim (CSS-first jelly Task 9, "properly reflected").
 *
 * A bolt is a light source an inch from the gel, so the stretch of the host's rim nearest the strike catches it: a
 * thin additive stroke along the outline, brightest at the contact and fading along the rim, drawn on the arc canvas
 * (never by changing the host's styles) and fading with the bolt. It follows the rounded rect, so a strike on a
 * corner wraps its light round the corner.
 *
 * Pure: a rounded rect in, polylines out, computed once per strike.
 */

import { clampRadius, type Point, type RoundedRect } from './geometry';

export const RIM_LIGHT = {
  /** Length of the lit stretch along the outline, px (centred on the contact). */
  spanPx: 132,
  /** Stroke width, px. */
  widthPx: 1.5,
  /** Peak alpha of the stroke (× the bolt's intensity and the luminance cap). */
  alpha: 0.85,
  /** Outline sampling: straight edges every this many px, corners in this many steps. */
  edgeStepPx: 4,
  cornerSteps: 10,
} as const;

/** The rounded rect's outline as a closed polyline (clockwise from the top edge; the start is not repeated). */
export function outlinePoints(rr: RoundedRect): Float32Array {
  const r = clampRadius(rr);
  const pts: number[] = [];
  const edge = (x0: number, y0: number, x1: number, y1: number) => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(1, Math.ceil(len / RIM_LIGHT.edgeStepPx));
    for (let i = 0; i < n; i++) pts.push(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n);
  };
  const corner = (cx: number, cy: number, a0: number) => {
    if (r <= 0) return;
    for (let i = 0; i < RIM_LIGHT.cornerSteps; i++) {
      const a = a0 + (Math.PI / 2) * (i / RIM_LIGHT.cornerSteps);
      pts.push(cx + r * Math.cos(a), cy + r * Math.sin(a));
    }
  };
  const { x, y, w, h } = rr;
  edge(x + r, y, x + w - r, y);
  corner(x + w - r, y + r, -Math.PI / 2);
  edge(x + w, y + r, x + w, y + h - r);
  corner(x + w - r, y + h - r, 0);
  edge(x + w - r, y + h, x + r, y + h);
  corner(x + r, y + h - r, Math.PI / 2);
  edge(x, y + h - r, x, y + r);
  corner(x + r, y + r, Math.PI);
  return new Float32Array(pts);
}

export interface RimLight {
  /** The lit stretch, ordered along the outline. */
  points: Float32Array;
}

/** The stretch of the outline within half of {@link RIM_LIGHT.spanPx} (along the rim) of the point nearest `contact`. */
export function rimLightPath(
  rr: RoundedRect,
  contact: Point,
  spanPx: number = RIM_LIGHT.spanPx,
): RimLight | null {
  if (!(rr.w > 0 && rr.h > 0)) return null;
  const pts = outlinePoints(rr);
  const n = pts.length / 2;
  if (n < 3) return null;
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < n; i++) {
    const d = (pts[2 * i] - contact.x) ** 2 + (pts[2 * i + 1] - contact.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  const half = spanPx / 2;
  const at = (i: number) => ((i % n) + n) % n;
  const walk = (dir: 1 | -1): number[] => {
    const out: number[] = [];
    let len = 0;
    let i = best;
    for (let k = 0; k < n - 1; k++) {
      const j = at(i + dir);
      const step = Math.hypot(pts[2 * j] - pts[2 * i], pts[2 * j + 1] - pts[2 * i + 1]);
      if (len + step > half) break;
      len += step;
      out.push(j);
      i = j;
    }
    return out;
  };
  const back = walk(-1).reverse();
  const fwd = walk(1);
  const order = [...back, best, ...fwd];
  const out = new Float32Array(order.length * 2);
  order.forEach((idx, k) => {
    out[2 * k] = pts[2 * idx];
    out[2 * k + 1] = pts[2 * idx + 1];
  });
  return { points: out };
}
