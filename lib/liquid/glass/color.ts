/**
 * Computed-style colours to 0..1 RGBA, without a canvas readback.
 *
 * A glass surface's tint is a low-alpha `color-mix(…)`, so what `getComputedStyle` returns is `color(srgb r g b / a)` in
 * Chromium, Firefox and Safari alike, or `rgb()`/`rgba()` for a plain colour. Reading it back through a canvas instead
 * would quantise the colour at 8 bits AFTER premultiplying by a small alpha, which is badly wrong at a 10% tint. Parsing
 * the string is exact for the formats engines actually return; anything else (oklch, lab) falls back to a canvas read of
 * the OPAQUE colour, with the alpha taken from the string separately.
 */
export type RGBA = [number, number, number, number];

const NUM = '(-?[\\d.]+(?:e-?\\d+)?)';
const ALPHA = '(?:\\s*[/,]\\s*([\\d.]+%?))?';
const RGB = new RegExp(`^rgba?\\(\\s*${NUM}[\\s,]+${NUM}[\\s,]+${NUM}${ALPHA}\\s*\\)$`, 'i');
const SRGB = new RegExp(
  `^color\\(\\s*srgb(?:-linear)?\\s+${NUM}\\s+${NUM}\\s+${NUM}${ALPHA}\\s*\\)$`,
  'i',
);

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const alphaOf = (s: string | undefined) => {
  if (s === undefined) return 1;
  return clamp01(s.endsWith('%') ? parseFloat(s) / 100 : parseFloat(s));
};

/** Parse `rgb()`, `rgba()` and `color(srgb …)`. Returns null for anything else. */
export function parseColor(css: string): RGBA | null {
  const s = css.trim();
  if (!s || s === 'transparent') return s === 'transparent' ? [0, 0, 0, 0] : null;
  let m = RGB.exec(s);
  if (m) {
    return [
      clamp01(parseFloat(m[1]!) / 255),
      clamp01(parseFloat(m[2]!) / 255),
      clamp01(parseFloat(m[3]!) / 255),
      alphaOf(m[4]),
    ];
  }
  m = SRGB.exec(s);
  if (m)
    return [
      clamp01(parseFloat(m[1]!)),
      clamp01(parseFloat(m[2]!)),
      clamp01(parseFloat(m[3]!)),
      alphaOf(m[4]),
    ];
  return null;
}

/** Perceptual-enough luminance of an sRGB colour, 0..1. */
export function luminance(c: readonly [number, number, number, ...number[]]): number {
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

const cache = new Map<string, RGBA>();

/** Resolve any CSS colour string. `doc` is only used for the canvas fallback. */
export function resolveColor(css: string, fallback: RGBA, doc?: Document): RGBA {
  const hit = cache.get(css);
  if (hit) return hit;
  let out = parseColor(css);
  if (!out && doc) {
    try {
      const alpha = /\/\s*([\d.]+%?)\s*\)/.exec(css)?.[1];
      const c = doc.createElement('canvas');
      c.width = c.height = 1;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.fillStyle = '#000';
        ctx.fillStyle = css.replace(/\/\s*[\d.]+%?\s*\)/, ') ');
        ctx.fillRect(0, 0, 1, 1);
        const d = ctx.getImageData(0, 0, 1, 1).data;
        out = [d[0]! / 255, d[1]! / 255, d[2]! / 255, alphaOf(alpha)];
      }
    } catch {
      out = null;
    }
  }
  const resolved = out ?? fallback;
  if (cache.size > 96) cache.clear();
  cache.set(css, resolved);
  return resolved;
}
