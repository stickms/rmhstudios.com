/**
 * Colour contrast under WCAG 2.2 (success criteria 1.4.3, 1.4.6 and 1.4.11).
 *
 * Colours are parsed from the forms people paste: `#rgb`, `#rrggbb` (with or
 * without the `#`, alpha forms ignored), `rgb(…)` and `hsl(…)` in the comma or
 * space syntax. The ratio is the WCAG formula on relative luminance, and a
 * suggestion is the nearest lightness of the same hue that passes a target.
 */

import { clamp } from '@/lib/core/math';

/** Starting pair: near-black on white, so the page opens on a passing example. */
export const DEFAULT_FOREGROUND = '#222222';
export const DEFAULT_BACKGROUND = '#ffffff';

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

function parseHex(input: string): Rgb | null {
  const hex = input.replace(/^#/, '');
  if (!/^([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(hex)) return null;
  const full =
    hex.length <= 4
      ? hex
          .slice(0, 3)
          .split('')
          .map((c) => c + c)
          .join('')
      : hex.slice(0, 6);
  return {
    r: Number.parseInt(full.slice(0, 2), 16),
    g: Number.parseInt(full.slice(2, 4), 16),
    b: Number.parseInt(full.slice(4, 6), 16),
  };
}

function splitArgs(body: string): string[] {
  // `rgb(1 2 3 / 50%)`, `rgb(1, 2, 3)`: drop any alpha after a slash, then split on commas or spaces.
  const [colour = ''] = body.split('/');
  return colour
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean);
}

function channel(part: string): number | null {
  if (/^-?\d+(\.\d+)?%$/.test(part)) return clamp(Math.round((Number.parseFloat(part) / 100) * 255), 0, 255);
  if (/^-?\d+(\.\d+)?$/.test(part)) return clamp(Math.round(Number.parseFloat(part)), 0, 255);
  return null;
}

export function hslToRgb(h: number, s: number, l: number): Rgb {
  const hue = ((h % 360) + 360) % 360;
  const sat = clamp(s, 0, 1);
  const lig = clamp(l, 0, 1);
  const c = (1 - Math.abs(2 * lig - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lig - c / 2;
  const [r1, g1, b1] =
    hue < 60
      ? [c, x, 0]
      : hue < 120
        ? [x, c, 0]
        : hue < 180
          ? [0, c, x]
          : hue < 240
            ? [0, x, c]
            : hue < 300
              ? [x, 0, c]
              : [c, 0, x];
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

export function rgbToHsl({ r, g, b }: Rgb): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return { h: h * 60, s, l };
}

/** Parse a colour string, or `null` when it is not one of the supported forms. */
export function parseColor(input: string): Rgb | null {
  const text = input.trim().toLowerCase();
  if (!text) return null;
  const fn = /^(rgba?|hsla?)\((.*)\)$/.exec(text);
  if (!fn) return parseHex(text);
  const kind = fn[1] ?? '';
  const parts = splitArgs(fn[2] ?? '');
  if (parts.length < 3) return null;
  const [a = '', b = '', c = ''] = parts;
  if (kind.startsWith('rgb')) {
    const r = channel(a);
    const g = channel(b);
    const bl = channel(c);
    return r === null || g === null || bl === null ? null : { r, g, b: bl };
  }
  const h = Number.parseFloat(a.replace(/deg$/, ''));
  const s = Number.parseFloat(b);
  const l = Number.parseFloat(c);
  if (![h, s, l].every(Number.isFinite) || !b.endsWith('%') || !c.endsWith('%')) return null;
  return hslToRgb(h, s / 100, l / 100);
}

export function toHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map((n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0')).join('')}`;
}

function linear(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance({ r, g, b }: Rgb): number {
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** The WCAG contrast ratio, 1 to 21. Order does not matter. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export type ContrastCheck = 'aa-normal' | 'aa-large' | 'aaa-normal' | 'aaa-large' | 'ui';

/** The minimum ratio each check needs. */
export const CONTRAST_THRESHOLDS: Record<ContrastCheck, number> = {
  'aa-normal': 4.5,
  'aa-large': 3,
  'aaa-normal': 7,
  'aaa-large': 4.5,
  ui: 3,
};

export const CONTRAST_CHECKS: readonly ContrastCheck[] = ['aa-normal', 'aa-large', 'aaa-normal', 'aaa-large', 'ui'];

/**
 * WCAG compares the unrounded ratio against the threshold; showing it is a
 * different matter, so the display rounds down to two places — a pair that
 * displays as 4.50 really does pass AA.
 */
export function formatRatio(ratio: number): string {
  return (Math.floor(ratio * 100) / 100).toFixed(2);
}

export function passes(ratio: number, check: ContrastCheck): boolean {
  return ratio >= CONTRAST_THRESHOLDS[check];
}

/**
 * The colour of the same hue and saturation as `fg`, at the lightness closest to
 * the original, that reaches `target` against `bg`. Searches darker and lighter
 * and returns whichever needs the smaller change, or `null` if neither direction
 * can reach it (only possible for targets above what black or white give).
 */
export function suggestForeground(fg: Rgb, bg: Rgb, target: number): Rgb | null {
  if (contrastRatio(fg, bg) >= target) return fg;
  const { h, s, l } = rgbToHsl(fg);
  let best: { colour: Rgb; distance: number } | null = null;
  for (const dir of [-1, 1] as const) {
    for (let step = 1; step <= 1000; step++) {
      const next = l + (dir * step) / 1000;
      if (next < 0 || next > 1) break;
      const colour = hslToRgb(h, s, next);
      if (contrastRatio(colour, bg) >= target) {
        const distance = Math.abs(next - l);
        if (!best || distance < best.distance) best = { colour, distance };
        break;
      }
    }
  }
  return best?.colour ?? null;
}
