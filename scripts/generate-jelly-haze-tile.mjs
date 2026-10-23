#!/usr/bin/env node
/**
 * Generates `public/jelly/haze-tile.webp` — the static haze floor of the
 * Plasmatic Jelly material (docs/plans/plasmatic-jelly/01-material.md §3.2, §3.6, M4).
 *
 * What it is: a 192 px, seamlessly TILEABLE, neutral (white) fbm grain whose
 * alpha never exceeds 0.06. `app/jelly-material.css` lays it under the static
 * haze gradient (`--jelly-static-haze`) and inside the `.jelly-flow` carrier's
 * drift span, so a surface reads as faintly milky jelly before — and without —
 * any JavaScript or WebGL. It carries no hue: colour lives in the light (the
 * plasma tokens), never in the grain, so one file serves every theme.
 *
 * Why a file and not a CSS/SVG noise: SVG `feTurbulence` re-runs per frame over
 * the filter region (filter-cost-budget.test.ts), and there is no CSS noise
 * primitive. A 192 px raster is decoded once and composited for free.
 *
 * Deterministic: a fixed seed, so re-running produces the same bytes (modulo
 * encoder version) and the committed output never churns.
 *
 *   node scripts/generate-jelly-haze-tile.mjs
 *
 * Budget: the output must stay under 8 KB (asserted below). A missing asset
 * degrades to gradient-only haze, never to a broken layer.
 */
import { mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const SIZE = 192;
const MAX_ALPHA = 0.06;
const MAX_BYTES = 8 * 1024;
const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'public',
  'jelly',
  'haze-tile.webp',
);

// Small deterministic PRNG (mulberry32).
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A periodic value-noise lattice: `period` cells per tile, so it wraps seamlessly. */
function lattice(period, rand) {
  const g = new Float32Array(period * period);
  for (let i = 0; i < g.length; i++) g[i] = rand();
  return (x, y) => {
    // x, y in [0, 1) tile space.
    const fx = x * period;
    const fy = y * period;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const at = (ix, iy) =>
      g[(((iy % period) + period) % period) * period + (((ix % period) + period) % period)];
    const a = at(x0, y0);
    const b = at(x0 + 1, y0);
    const c = at(x0, y0 + 1);
    const d = at(x0 + 1, y0 + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

const rand = rng(0x6a311e);
// Low-frequency body (soft milky clouds) plus one fine grain octave.
const octaves = [
  { n: lattice(3, rand), w: 0.5 },
  { n: lattice(6, rand), w: 0.28 },
  { n: lattice(12, rand), w: 0.14 },
  { n: lattice(48, rand), w: 0.08 },
];
const wSum = octaves.reduce((s, o) => s + o.w, 0);

const px = Buffer.alloc(SIZE * SIZE * 4);
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    let v = 0;
    for (const o of octaves) v += o.n(x / SIZE, y / SIZE) * o.w;
    v /= wSum; // 0..1, mean ~0.5
    // Contrast-stretch the fbm a little, then map into the alpha budget.
    const s = Math.min(1, Math.max(0, (v - 0.2) / 0.6));
    const i = (y * SIZE + x) * 4;
    px[i] = 255;
    px[i + 1] = 255;
    px[i + 2] = 255;
    px[i + 3] = Math.round(s * MAX_ALPHA * 255);
  }
}

mkdirSync(dirname(OUT), { recursive: true });
await sharp(px, { raw: { width: SIZE, height: SIZE, channels: 4 } })
  .webp({ quality: 60, alphaQuality: 50, effort: 6, smartSubsample: true })
  .toFile(OUT);

const bytes = statSync(OUT).size;
if (bytes >= MAX_BYTES) {
  console.error(`haze-tile.webp is ${bytes} B — over the ${MAX_BYTES} B budget.`);
  process.exit(1);
}
console.warn(`wrote ${OUT} (${SIZE}px, ${bytes} B, alpha <= ${MAX_ALPHA})`);
