/**
 * Seeded PRNG and tileable noise for the procedural textures. Pure and deterministic:
 * the same seed and inputs give the same numbers in Node and in the browser.
 * (No `Math.random()` anywhere — plan conventions.)
 */

/** mulberry32: returns a function giving floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer hash of (seed, x, y, z) to an unsigned 32-bit value. */
export function hash32(seed: number, x: number, y: number, z = 0): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (x | 0), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h ^ (y | 0), 0xc2b2ae35);
  h ^= h >>> 16;
  h = Math.imul(h ^ (z | 0), 0x27d4eb2f);
  h ^= h >>> 15;
  h = Math.imul(h, 0x165667b1);
  h ^= h >>> 13;
  return h >>> 0;
}

/** Hash to a float in [0, 1). */
export function hash01(seed: number, x: number, y: number, z = 0): number {
  return hash32(seed, x, y, z) / 4294967296;
}

const wrap = (i: number, p: number): number => ((i % p) + p) % p;
const smooth = (t: number): number => t * t * (3 - 2 * t);
const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);

/** Tileable value noise in [0, 1]; (x, y) in lattice units, wrapping every px / py cells. */
export function valueNoise(
  seed: number,
  x: number,
  y: number,
  px: number,
  py: number = px,
): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = smooth(x - x0);
  const fy = smooth(y - y0);
  const xa = wrap(x0, px);
  const xb = wrap(x0 + 1, px);
  const ya = wrap(y0, py);
  const yb = wrap(y0 + 1, py);
  const a = hash01(seed, xa, ya);
  const b = hash01(seed, xb, ya);
  const c = hash01(seed, xa, yb);
  const d = hash01(seed, xb, yb);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/** Tileable gradient (Perlin-style) noise in [0, 1]. */
export function gradientNoise(
  seed: number,
  x: number,
  y: number,
  px: number,
  py: number = px,
): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const dx = x - x0;
  const dy = y - y0;
  const corner = (ix: number, iy: number, ox: number, oy: number): number => {
    const ang = hash01(seed, wrap(ix, px), wrap(iy, py)) * Math.PI * 2;
    return Math.cos(ang) * ox + Math.sin(ang) * oy;
  };
  const u = fade(dx);
  const v = fade(dy);
  const n00 = corner(x0, y0, dx, dy);
  const n10 = corner(x0 + 1, y0, dx - 1, dy);
  const n01 = corner(x0, y0 + 1, dx, dy - 1);
  const n11 = corner(x0 + 1, y0 + 1, dx - 1, dy - 1);
  const r = n00 + (n10 - n00) * u + (n01 - n00) * v + (n00 - n10 - n01 + n11) * u * v;
  return Math.min(1, Math.max(0, 0.5 + r * 0.7));
}

/**
 * Fractal value noise in [0, 1], tileable over (u, v) in [0, 1): `fx` / `fy` are the integer
 * base cell counts per tile (unequal values stretch the grain), doubling each octave.
 */
export function fbm(
  seed: number,
  u: number,
  v: number,
  fx: number,
  fy: number = fx,
  octaves = 4,
  gain = 0.5,
): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let cx = fx;
  let cy = fy;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(seed + i * 101, u * cx, v * cy, cx, cy);
    norm += amp;
    amp *= gain;
    cx *= 2;
    cy *= 2;
  }
  return sum / norm;
}

/**
 * Tileable cellular noise on an n x n grid of jittered points: distances (in cell units) to
 * the nearest (f1) and second nearest (f2) point. `f2 - f1` is small along cell borders (cracks).
 */
export function cellular(
  seed: number,
  u: number,
  v: number,
  n: number,
): { f1: number; f2: number; id: number } {
  const x = u * n;
  const y = v * n;
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  let f1 = 9;
  let f2 = 9;
  let id = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const gx = cx + i;
      const gy = cy + j;
      const wx = wrap(gx, n);
      const wy = wrap(gy, n);
      const px = gx + hash01(seed, wx, wy, 1);
      const py = gy + hash01(seed, wx, wy, 2);
      const d = Math.hypot(px - x, py - y);
      if (d < f1) {
        f2 = f1;
        f1 = d;
        id = hash32(seed, wx, wy, 3);
      } else if (d < f2) f2 = d;
    }
  }
  return { f1, f2, id };
}
