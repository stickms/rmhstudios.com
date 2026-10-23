/**
 * Closest points between rounded rects (docs/plans/plasmatic-jelly/03-arcs.md §4.4).
 *
 * A rounded rect is its **core** rect swept by a disc of radius `r` (a Minkowski sum), so the rim-to-rim problem
 * reduces to closest points between two axis-aligned core rects, each pushed out by its radius along the joining
 * direction:
 *
 * ```
 * core(R)   = { x+r, y+r, w−2r, h−2r }
 * per axis  : core intervals overlap → both points share one coordinate, sampled uniformly in the overlap (jitter)
 *             otherwise              → each point takes its interval's near end
 * gap       = |p2 − p1| − rA − rB          (≤ 0 → overlapping or nested: no arc)
 * endpoints = p1 + rA·d̂ ,  p2 − rB·d̂      (exactly on each rim)
 * ```
 *
 * Facing edges give a straight perpendicular arc that lands anywhere along the overlap; diagonal neighbours give a
 * corner-to-corner arc landing on the corner arcs. Pure; coordinates are viewport CSS px.
 */

import type { Rand } from './rng';

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A rect plus its corner radius (the maximum when corners differ: endpoints land slightly inside, never in air). */
export interface RoundedRect extends Rect {
  r: number;
}

export interface RimContact {
  /** Contact point on A's rim and on B's rim. */
  a: Point;
  b: Point;
  /** Outward unit normals at each contact: `na = d̂` (A toward B), `nb = −d̂`. */
  na: Point;
  nb: Point;
  /** Rim-to-rim distance (> 0). */
  gap: number;
}

/** The radius clamped to `[0, min(w, h)/2]`, so pills work and a radius larger than the box cannot invert it. */
export function clampRadius(rr: RoundedRect): number {
  const r = Number.isFinite(rr.r) ? rr.r : 0;
  return Math.max(0, Math.min(r, Math.max(0, rr.w) / 2, Math.max(0, rr.h) / 2));
}

/** The core rect the radius disc is swept around. */
export function coreRect(rr: RoundedRect): Rect & { r: number } {
  const r = clampRadius(rr);
  return {
    x: rr.x + r,
    y: rr.y + r,
    w: Math.max(0, rr.w - 2 * r),
    h: Math.max(0, rr.h - 2 * r),
    r,
  };
}

/** Closest coordinates on two intervals; shared (jittered) when they overlap. */
function axisPair(a0: number, a1: number, b0: number, b1: number, rand?: Rand): [number, number] {
  const lo = Math.max(a0, b0);
  const hi = Math.min(a1, b1);
  if (lo <= hi) {
    const v = rand ? lo + (hi - lo) * rand() : (lo + hi) / 2;
    return [v, v];
  }
  return a1 < b0 ? [a1, b0] : [a0, b1];
}

/** Rim-to-rim gap between two rounded rects (negative when they overlap). */
export function roundedRectGap(a: RoundedRect, b: RoundedRect): number {
  const ca = coreRect(a);
  const cb = coreRect(b);
  const [ax, bx] = axisPair(ca.x, ca.x + ca.w, cb.x, cb.x + cb.w);
  const [ay, by] = axisPair(ca.y, ca.y + ca.h, cb.y, cb.y + cb.h);
  return Math.hypot(bx - ax, by - ay) - ca.r - cb.r;
}

/**
 * The arc's two contact points, or `null` when the rects overlap or nest (`gap ≤ 0`). `rand` jitters the landing
 * point along the facing overlap; without it the overlap's midpoint is used.
 */
export function closestRimPoints(a: RoundedRect, b: RoundedRect, rand?: Rand): RimContact | null {
  const ca = coreRect(a);
  const cb = coreRect(b);
  const [ax, bx] = axisPair(ca.x, ca.x + ca.w, cb.x, cb.x + cb.w, rand);
  const [ay, by] = axisPair(ca.y, ca.y + ca.h, cb.y, cb.y + cb.h, rand);
  const dx = bx - ax;
  const dy = by - ay;
  const dist = Math.hypot(dx, dy);
  const gap = dist - ca.r - cb.r;
  if (!(dist > 0) || !(gap > 0)) return null;
  const ux = dx / dist;
  const uy = dy / dist;
  return {
    a: { x: ax + ca.r * ux, y: ay + ca.r * uy },
    b: { x: bx - cb.r * ux, y: by - cb.r * uy },
    na: { x: ux, y: uy },
    nb: { x: -ux, y: -uy },
    gap,
  };
}

export interface RimPoint {
  /** The nearest point on the rim. */
  point: Point;
  /** Outward unit normal there. */
  normal: Point;
  /** Signed distance from the rim: positive outside, negative inside. */
  distance: number;
}

/**
 * The rim point nearest `p` (same Minkowski construction with a point): for the cursor discharge and the click
 * flare's nearest rim point. Inside the shape the nearest rim point is found through the core's nearest side.
 */
export function pointToRoundedRect(p: Point, rr: RoundedRect): RimPoint {
  const c = coreRect(rr);
  const qx = Math.max(c.x, Math.min(c.x + c.w, p.x));
  const qy = Math.max(c.y, Math.min(c.y + c.h, p.y));
  const dx = p.x - qx;
  const dy = p.y - qy;
  const d = Math.hypot(dx, dy);
  if (d > 0) {
    const nx = dx / d;
    const ny = dy / d;
    return {
      point: { x: qx + c.r * nx, y: qy + c.r * ny },
      normal: { x: nx, y: ny },
      distance: d - c.r,
    };
  }
  // Inside the core: leave through the nearest core side.
  const left = p.x - c.x;
  const right = c.x + c.w - p.x;
  const top = p.y - c.y;
  const bottom = c.y + c.h - p.y;
  const m = Math.min(left, right, top, bottom);
  let normal: Point;
  if (m === left) normal = { x: -1, y: 0 };
  else if (m === right) normal = { x: 1, y: 0 };
  else if (m === top) normal = { x: 0, y: -1 };
  else normal = { x: 0, y: 1 };
  const depth = m + c.r;
  return {
    point: { x: p.x + normal.x * depth, y: p.y + normal.y * depth },
    normal,
    distance: -depth,
  };
}

/** True when `outer` fully contains `inner` (ancestor/descendant geometry). */
export function rectContains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  );
}
