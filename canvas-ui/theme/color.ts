/**
 * Small color utilities for the canvas theme bridge.
 *
 * The DOM themes derive accent hover/dim states with CSS
 * `color-mix(in oklab, …)`; a canvas 2D context cannot evaluate CSS color
 * functions, so this module reimplements the same oklab mixing in JS. Only
 * what the accent pipeline needs — parse hex/rgb(a), mix in oklab, emit
 * rgba() strings.
 */

export interface Rgba {
  r: number; // 0-255
  g: number;
  b: number;
  a: number; // 0-1
}

/** Parse `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()`, `rgba()`, `transparent`. */
export function parseColor(input: string): Rgba | null {
  const s = input.trim().toLowerCase();
  if (s === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  if (s.startsWith("#")) {
    const hex = s.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      const [r, g, b, a] = hex.split("").map((c) => parseInt(c + c, 16));
      return { r, g, b, a: hex.length === 4 ? a / 255 : 1 };
    }
    if (hex.length === 6 || hex.length === 8) {
      const n = parseInt(hex.slice(0, 6), 16);
      const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
      return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a };
    }
    return null;
  }
  const m = s.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
  if (m) {
    return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: m[4] === undefined ? 1 : Number(m[4]) };
  }
  return null;
}

export function toCss({ r, g, b, a }: Rgba): string {
  const ri = Math.round(r);
  const gi = Math.round(g);
  const bi = Math.round(b);
  if (a >= 1) return `rgb(${ri}, ${gi}, ${bi})`;
  return `rgba(${ri}, ${gi}, ${bi}, ${Number(a.toFixed(4))})`;
}

// ---- oklab conversion (matches CSS Color 4 / color-mix(in oklab, …)) ----

interface Oklab {
  L: number;
  a: number;
  b: number;
  alpha: number;
}

function srgbToLinear(c: number): number {
  const x = c / 255;
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}

function linearToSrgb(x: number): number {
  const c = x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
  return Math.min(255, Math.max(0, c * 255));
}

function rgbaToOklab({ r, g, b, a }: Rgba): Oklab {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);
  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;
  const l3 = Math.cbrt(l);
  const m3 = Math.cbrt(m);
  const s3 = Math.cbrt(s);
  return {
    L: 0.2104542553 * l3 + 0.793617785 * m3 - 0.0040720468 * s3,
    a: 1.9779984951 * l3 - 2.428592205 * m3 + 0.4505937099 * s3,
    b: 0.0259040371 * l3 + 0.7827717662 * m3 - 0.808675766 * s3,
    alpha: a,
  };
}

function oklabToRgba({ L, a, b, alpha }: Oklab): Rgba {
  const l3 = L + 0.3963377774 * a + 0.2158037573 * b;
  const m3 = L - 0.1055613458 * a - 0.0638541728 * b;
  const s3 = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l3 * l3 * l3;
  const m = m3 * m3 * m3;
  const s = s3 * s3 * s3;
  return {
    r: linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    a: alpha,
  };
}

/**
 * `color-mix(in oklab, colorA pctA%, colorB)` — pctA is colorA's weight in
 * [0,1]; alpha is premultiplied per the spec so mixing with `transparent`
 * only scales alpha (which is exactly what `--site-accent-dim` relies on).
 */
export function mixOklab(colorA: string, weightA: number, colorB: string): string {
  const pa = parseColor(colorA);
  const pb = parseColor(colorB);
  if (!pa || !pb) return colorA;
  const wa = Math.min(1, Math.max(0, weightA));
  const wb = 1 - wa;
  const la = rgbaToOklab(pa);
  const lb = rgbaToOklab(pb);
  const alpha = la.alpha * wa + lb.alpha * wb;
  if (alpha === 0) return "rgba(0, 0, 0, 0)";
  // Premultiplied-alpha interpolation (CSS Color 4 §12.3).
  const mixed: Oklab = {
    L: (la.L * la.alpha * wa + lb.L * lb.alpha * wb) / alpha,
    a: (la.a * la.alpha * wa + lb.a * lb.alpha * wb) / alpha,
    b: (la.b * la.alpha * wa + lb.b * lb.alpha * wb) / alpha,
    alpha,
  };
  return toCss(oklabToRgba(mixed));
}

/** Apply an opacity multiplier to a color string. */
export function withAlpha(color: string, alpha: number): string {
  const p = parseColor(color);
  if (!p) return color;
  return toCss({ ...p, a: p.a * alpha });
}
