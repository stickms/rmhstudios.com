/**
 * Contrast guard for custom accents (§13). Pure, framework-agnostic, and
 * unit-tested — used by the settings panel, the Providers runtime, and the API.
 *
 * A custom accent is used as a fill with a black/white label on it. The guard's
 * guarantee is concrete and testable: **the chosen label foreground passes WCAG
 * AA (>= 4.5:1) against the accent**, nudging the accent's lightness toward the
 * label when a mid-tone can't clear the bar. (Cross-surface accent-as-text
 * contrast is inherently theme-dependent and left to each theme.)
 */

const AA = 4.5;

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export function parseHex(hex: string): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`invalid hex: ${hex}`);
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function toHex({ r, g, b }: RGB): string {
  const h = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance (0..1). */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = parseHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * Which CSS `color-scheme` a background belongs to, by WCAG luminance. Used to
 * pin the UA colour scheme (native form controls, scrollbars, autofill, and
 * `<select>` option popups) to the ACTUAL theme background — built-in, curated,
 * marketplace user theme, or full-screen app chrome alike — so it never falls
 * back to the OS default, which is what makes native UI render white-on-white or
 * black-on-black when the visitor's system theme disagrees with the site theme.
 *
 * Lenient on purpose: accepts 3- or 6-digit hex (theme backgrounds include short
 * forms like `#000`) and returns `'light'` for anything it can't parse, so it can
 * never throw inside the pre-paint theme script.
 */
export function colorSchemeForBackground(bg: string): 'light' | 'dark' {
  try {
    let h = bg.trim().replace(/^#/, '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return relativeLuminance(`#${h}`) < 0.5 ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/** WCAG contrast ratio (1..21) between two colors. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

const WHITE = '#ffffff';
const BLACK = '#111111';

/** The more legible of white/black text on the given background. */
export function readableForeground(hex: string): string {
  return contrastRatio(hex, WHITE) >= contrastRatio(hex, BLACK) ? WHITE : BLACK;
}

// ── HSL for lightness nudging ───────────────────────────────────────────────
function rgbToHsl({ r, g, b }: RGB): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  const d = max - min;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
    else if (max === gn) h = ((bn - rn) / d + 2) / 6;
    else h = ((rn - gn) / d + 4) / 6;
  }
  return { h, s, l };
}

function hslToRgb(h: number, s: number, l: number): RGB {
  if (s === 0) {
    const v = l * 255;
    return { r: v, g: v, b: v };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  return { r: hue(h + 1 / 3) * 255, g: hue(h) * 255, b: hue(h - 1 / 3) * 255 };
}

export interface AccentResult {
  /** The accent color to use (possibly lightness-nudged for AA). */
  hex: string;
  /** The label foreground that passes AA on `hex`. */
  fg: string;
  /** Whether the input accent was adjusted. */
  adjusted: boolean;
}

/**
 * Ensure a legible accent/label pair. Picks the better of white/black label;
 * if neither clears AA on the given accent, nudges the accent's lightness
 * (darker for a white label, lighter for a black label) until it does or the
 * range is exhausted.
 */
export function ensureReadableAccent(input: string): AccentResult {
  const original = toHex(parseHex(input)); // normalize (throws on invalid)
  let fg = readableForeground(original);
  if (contrastRatio(original, fg) >= AA) {
    return { hex: original, fg, adjusted: false };
  }

  const { h, s, l } = rgbToHsl(parseHex(original));
  // A white label wants a darker accent; a black label wants a lighter one.
  const wantDarker = fg === WHITE;
  let best = original;
  for (let step = 1; step <= 20; step++) {
    const nl = wantDarker ? Math.max(0, l - step * 0.03) : Math.min(1, l + step * 0.03);
    const candidate = toHex(hslToRgb(h, s, nl));
    if (contrastRatio(candidate, fg) >= AA) {
      return { hex: candidate, fg, adjusted: true };
    }
    best = candidate;
  }
  // Range exhausted — return the extreme and flip fg if that reads better.
  fg = readableForeground(best);
  return { hex: best, fg, adjusted: true };
}
