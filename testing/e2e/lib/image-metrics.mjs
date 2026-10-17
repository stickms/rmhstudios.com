// ─────────────────────────────────────────────────────────────────────────────
// Image metrics for the eversion e2e suites (T14; spec §11.2 S#28/S#29, §11.3).
//
// The eversion is a picture, so most of its acceptance criteria are statements
// about pixels: "the first frame looks like the page it replaced" (SSIM), "there
// is no hard cut" (frame-to-frame delta), "nothing flashes" (luminance over
// time), "no fragment is any colour but red, blue, glass or veil" (colour-class
// histogram). This file turns decoded frames into those numbers and holds the
// detectors that turn the numbers into verdicts, so T27/T34/T35 share ONE
// definition of "a hard cut" instead of three drifting thresholds.
//
// ## Decoding
//
// `sharp` is already a dependency (the image-variant generator uses it), so PNG
// screenshots and CDP screencast frames are decoded with it — no new package.
// Everything downstream works on plain `{ width, height, data }` RGBA buffers,
// which the self-test builds synthetically without touching a decoder at all.
//
// ## Pure on purpose
//
// Nothing here talks to a browser. That is what lets the self-test prove the
// metrics and detectors on synthetic images.
// ─────────────────────────────────────────────────────────────────────────────

import sharp from 'sharp';

/** @typedef {{ width: number, height: number, data: Uint8Array | Uint8ClampedArray }} Rgba8 RGBA, row-major, 4 bytes/pixel. */

/** Decode a PNG/JPEG buffer (a screenshot or a screencast frame) to RGBA. */
export async function decodeImage(buffer) {
  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8Array(data) };
}

function assertSameSize(a, b) {
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(
      `image-metrics: size mismatch ${a.width}x${a.height} vs ${b.width}x${b.height} — ` +
        'capture at the same viewport before comparing',
    );
  }
}

/** Rec. 601 luma in 0..255, one float per pixel. Alpha is ignored (frames are opaque). */
export function toGray(img) {
  const n = img.width * img.height;
  const out = new Float32Array(n);
  const d = img.data;
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    out[i] = 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2];
  }
  return out;
}

/** Window size (S§11.3: "grayscale, 8 × 8 windows"). */
export const SSIM_WINDOW = 8;
/** Window stride. 4 (overlapping) so a 1-px shift of an edge is seen by several windows. */
export const SSIM_STRIDE = 4;

/**
 * Mean structural similarity of two images, 1 = identical.
 *
 * Grayscale, 8 × 8 windows, standard constants (K1 = 0.01, K2 = 0.03, L = 255),
 * unweighted windows. Throws on a size mismatch: a silent resize would hide
 * exactly the capture-geometry bugs S#29 exists to catch.
 */
export function ssim(a, b) {
  assertSameSize(a, b);
  const ga = toGray(a);
  const gb = toGray(b);
  const W = a.width;
  const H = a.height;
  const C1 = (0.01 * 255) ** 2;
  const C2 = (0.03 * 255) ** 2;
  const win = Math.min(SSIM_WINDOW, W, H);
  const n = win * win;
  const denom = n > 1 ? n - 1 : 1;
  let sum = 0;
  let count = 0;
  for (let y = 0; y + win <= H; y += SSIM_STRIDE) {
    for (let x = 0; x + win <= W; x += SSIM_STRIDE) {
      let ma = 0;
      let mb = 0;
      for (let j = 0; j < win; j++) {
        const row = (y + j) * W + x;
        for (let i = 0; i < win; i++) {
          ma += ga[row + i];
          mb += gb[row + i];
        }
      }
      ma /= n;
      mb /= n;
      let va = 0;
      let vb = 0;
      let cov = 0;
      for (let j = 0; j < win; j++) {
        const row = (y + j) * W + x;
        for (let i = 0; i < win; i++) {
          const da = ga[row + i] - ma;
          const db = gb[row + i] - mb;
          va += da * da;
          vb += db * db;
          cov += da * db;
        }
      }
      va /= denom;
      vb /= denom;
      cov /= denom;
      sum += ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2));
      count++;
    }
  }
  return count ? sum / count : 1;
}

/** Mean absolute difference of two images' gray values, normalised to 0..1. */
export function meanAbsDelta(a, b) {
  assertSameSize(a, b);
  const ga = toGray(a);
  const gb = toGray(b);
  let s = 0;
  for (let i = 0; i < ga.length; i++) s += Math.abs(ga[i] - gb[i]);
  return s / ga.length / 255;
}

/**
 * Mean-absolute frame delta between consecutive frames.
 * @param {Rgba8[]} frames
 * @returns {number[]} length `frames.length - 1`; entry `i` is frame `i` → `i+1`.
 */
export function frameDeltaSeries(frames) {
  const out = [];
  for (let i = 1; i < frames.length; i++) out.push(meanAbsDelta(frames[i - 1], frames[i]));
  return out;
}

const LIN = new Float32Array(256).map((_, i) => {
  const c = i / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});

/** Mean WCAG relative luminance of an image, 0..1 (the quantity the flash rules are written in). */
export function relativeLuminance(img) {
  const n = img.width * img.height;
  const d = img.data;
  let s = 0;
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    s += 0.2126 * LIN[d[p]] + 0.7152 * LIN[d[p + 1]] + 0.0722 * LIN[d[p + 2]];
  }
  return s / n;
}

/** @param {Rgba8[]} frames @returns {number[]} one relative luminance per frame. */
export function luminanceSeries(frames) {
  return frames.map(relativeLuminance);
}

/**
 * Fraction of pixels in each named colour class (S#28: red / blue / glass / veil).
 *
 * @param {Rgba8} img
 * @param {Record<string, readonly [number, number, number]>} classes name → RGB
 * @param {number} [tolerance] max per-channel distance to count as a class member
 * @returns {Record<string, number>} fractions summing to 1, remainder in `other`.
 */
export function colourHistogram(img, classes, tolerance = 40) {
  const names = Object.keys(classes);
  const counts = Object.fromEntries([...names, 'other'].map((k) => [k, 0]));
  const n = img.width * img.height;
  const d = img.data;
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    let best = 'other';
    let bestDist = tolerance + 1;
    for (const name of names) {
      const c = classes[name];
      const dist = Math.max(
        Math.abs(d[p] - c[0]),
        Math.abs(d[p + 1] - c[1]),
        Math.abs(d[p + 2] - c[2]),
      );
      if (dist <= tolerance && dist < bestDist) {
        best = name;
        bestDist = dist;
      }
    }
    counts[best]++;
  }
  for (const k of Object.keys(counts)) counts[k] /= n;
  return counts;
}

/**
 * Default per-frame delta above which a step is a CUT rather than a fade.
 * A crossfade spreads its change over many frames (a 320 ms fade at 60 Hz is
 * ~19 steps, each a few percent); a cut lands all of it in one.
 */
export const HARD_CUT_DELTA = 0.25;

/**
 * Flag hard cuts in a delta series.
 *
 * @param {number[]} deltas from {@link frameDeltaSeries}
 * @param {number[]} times frame timestamps in ms, `deltas.length + 1` long
 *   (delta `i` spans `times[i]` → `times[i+1]`)
 * @param {{ threshold?: number, exclude?: {from:number,to:number}[] }} [opts]
 *   `exclude` lists windows to skip — the controller's deliberate crossfades,
 *   taken from its marks rather than hard-coded ms (S§11.3).
 * @returns {{ index: number, atMs: number, delta: number }[]}
 */
export function detectHardCuts(deltas, times, opts = {}) {
  const threshold = opts.threshold ?? HARD_CUT_DELTA;
  const exclude = opts.exclude ?? [];
  const hits = [];
  for (let i = 0; i < deltas.length; i++) {
    const at = times[i + 1];
    if (exclude.some((w) => at >= w.from && at <= w.to)) continue;
    if (deltas[i] > threshold) hits.push({ index: i, atMs: at, delta: deltas[i] });
  }
  return hits;
}

/** Default luminance step that counts as a flash within {@link FLASH_WINDOW_MS}. */
export const FLASH_LUMINANCE_JUMP = 0.25;
/** Window the jump must happen inside (S#32: 30 % in 50 ms). */
export const FLASH_WINDOW_MS = 50;

/**
 * Flag luminance jumps: any two frames within `windowMs` of each other whose
 * relative luminance differs by more than `threshold` (absolute, 0..1).
 *
 * Pairwise within the window rather than adjacent frames, so a flash is caught
 * at any refresh rate. This is the DEFAULT policy; T35 owns the photosensitivity
 * policy and may pass its own numbers.
 *
 * @param {number[]} times ms, ascending
 * @param {number[]} lums relative luminance per frame
 * @param {{ threshold?: number, windowMs?: number }} [opts]
 * @returns {{ fromMs: number, toMs: number, jump: number }[]}
 */
export function detectLuminanceJumps(times, lums, opts = {}) {
  const threshold = opts.threshold ?? FLASH_LUMINANCE_JUMP;
  const windowMs = opts.windowMs ?? FLASH_WINDOW_MS;
  const hits = [];
  for (let i = 0; i < times.length; i++) {
    for (let j = i + 1; j < times.length && times[j] - times[i] <= windowMs; j++) {
      const jump = Math.abs(lums[j] - lums[i]);
      if (jump > threshold) {
        hits.push({ fromMs: times[i], toMs: times[j], jump });
        break;
      }
    }
  }
  return hits;
}
