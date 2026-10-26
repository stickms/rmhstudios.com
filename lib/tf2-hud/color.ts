/**
 * Colour maths for the picker: HSV ↔ RGB, hex / `rgb()` parsing, VGUI's
 * `"r g b a"` literal, and WCAG contrast.
 */

import type { Rgba } from './scheme/scheme';

export interface Hsv {
  /** 0–360 */
  h: number;
  /** 0–1 */
  s: number;
  /** 0–1 */
  v: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const byte = (n: number) => clamp(Math.round(n), 0, 255);

export function rgbToHsv({ r, g, b }: Rgba): Hsv {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const d = max - Math.min(rn, gn, bn);
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

export function hsvToRgb({ h, s, v }: Hsv, a = 255): Rgba {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return { r: byte((r + m) * 255), g: byte((g + m) * 255), b: byte((b + m) * 255), a: byte(a) };
}

const hex2 = (n: number) => byte(n).toString(16).padStart(2, '0');

export const toHex = (c: Rgba, withAlpha = false): string =>
  `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}${withAlpha ? hex2(c.a) : ''}`;

/** VGUI's literal form: `"235 227 203 255"`. */
export const toVguiLiteral = (c: Rgba): string =>
  `${byte(c.r)} ${byte(c.g)} ${byte(c.b)} ${byte(c.a)}`;

/**
 * Accepts `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb(r,g,b)`, `rgba(r,g,b,a)` (a 0–1)
 * and VGUI's space-separated `r g b [a]`. Returns undefined for anything else.
 */
export function parseColorInput(input: string): Rgba | undefined {
  const s = input.trim();
  let m = /^#([0-9a-f]{3,4})$/i.exec(s);
  if (m) {
    const [r, g, b, a] = [...m[1]].map((ch) => parseInt(ch + ch, 16));
    return { r, g, b, a: a ?? 255 };
  }
  m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(s);
  if (m) {
    const n = parseInt(m[1], 16);
    return {
      r: (n >> 16) & 255,
      g: (n >> 8) & 255,
      b: n & 255,
      a: m[2] ? parseInt(m[2], 16) : 255,
    };
  }
  m =
    /^rgba?\(\s*(\d+(?:\.\d+)?)\s*[, ]\s*(\d+(?:\.\d+)?)\s*[, ]\s*(\d+(?:\.\d+)?)\s*(?:[,/]\s*(\d*\.?\d+)\s*)?\)$/i.exec(
      s,
    );
  if (m) {
    return {
      r: byte(+m[1]),
      g: byte(+m[2]),
      b: byte(+m[3]),
      a: m[4] === undefined ? 255 : byte(+m[4] * 255),
    };
  }
  m = /^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)(?:\s+(\d+(?:\.\d+)?))?$/.exec(s);
  if (m)
    return {
      r: byte(+m[1]),
      g: byte(+m[2]),
      b: byte(+m[3]),
      a: m[4] === undefined ? 255 : byte(+m[4]),
    };
  return undefined;
}

const lin = (v: number) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
export const luminance = (c: Rgba): number =>
  0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);

/** WCAG contrast ratio of two opaque colours (1–21). */
export function contrast(a: Rgba, b: Rgba): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Composite `fg` (with its alpha) over an opaque `bg`. */
export function over(fg: Rgba, bg: Rgba): Rgba {
  const a = fg.a / 255;
  return {
    r: byte(fg.r * a + bg.r * (1 - a)),
    g: byte(fg.g * a + bg.g * (1 - a)),
    b: byte(fg.b * a + bg.b * (1 - a)),
    a: 255,
  };
}
