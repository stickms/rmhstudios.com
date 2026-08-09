/**
 * Bum's Rush — the palette the canvas draws with.
 *
 * Every colour in this pipeline comes from the `--bum-*` custom properties
 * defined once in `components/bums-rush/bums-rush.css`. Drawing code never
 * writes a hex literal, for the same reason components never do: the world-8
 * override (highlighter on black sugar paper) inverts the whole token group,
 * and a hardcoded `#1e2430` in a stroke call is a stroke that stays near-black
 * on a near-black sheet.
 *
 * `getComputedStyle` is a layout read, so it happens exactly twice — once when
 * the renderer is created and once if the level changes the world tint — never
 * inside a frame. The resolved {@link BumPalette} is what the hot path holds.
 *
 * The one exception to "no hex in this directory" is {@link FALLBACK_PALETTE}
 * below: SSR has no computed style, and unit tests have no document. It is a
 * verbatim copy of the `.bums-theme` block, and it is the only place these
 * values may be written twice. If the CSS moves, this moves with it.
 */

import type { LevelPalette } from '../types';

export interface BumPalette {
  paper: string;
  paper2: string;
  paperEdge: string;
  rule: string;
  margin: string;
  ink: string;
  inkSoft: string;
  graphite: string;
  highlight: string;
  tape: string;
  splat: string;
  /** Seat 1–4, in `SEAT_INK` order. */
  seat: readonly [string, string, string, string];
  surface: string;
  surface2: string;
  danger: string;
  success: string;
}

/**
 * The `.bums-theme` values, duplicated for SSR and for tests that have no DOM.
 * Keep in sync with `components/bums-rush/bums-rush.css`.
 */
export const FALLBACK_PALETTE: BumPalette = {
  paper: '#f4ead6',
  paper2: '#ece0c8',
  paperEdge: '#d8c9aa',
  rule: '#b9c9d6',
  margin: '#e2a0a8',
  ink: '#1e2430',
  inkSoft: 'rgba(71, 80, 96, 0.5)',
  graphite: '#6b7280',
  highlight: '#fff6a8',
  tape: 'rgba(232, 220, 192, 0.8)',
  splat: '#232b3a',
  seat: ['#d1495b', '#2a7fbf', '#3f8f52', '#c9761a'],
  surface: 'rgba(244, 234, 214, 0.92)',
  surface2: 'rgba(236, 224, 200, 0.96)',
  danger: '#c02a37',
  success: '#3f8f52',
};

/** Custom-property name for each field, so the read is one loop and not fifteen. */
const TOKENS: Readonly<Record<keyof Omit<BumPalette, 'seat'>, string>> = {
  paper: '--bum-paper',
  paper2: '--bum-paper-2',
  paperEdge: '--bum-paper-edge',
  rule: '--bum-rule',
  margin: '--bum-margin',
  ink: '--bum-ink',
  inkSoft: '--bum-ink-soft',
  graphite: '--bum-graphite',
  highlight: '--bum-highlight',
  tape: '--bum-tape',
  splat: '--bum-splat',
  surface: '--bum-surface',
  surface2: '--bum-surface-2',
  danger: '--bum-danger',
  success: '--bum-success',
};

const SEAT_TOKENS = ['--bum-seat-1', '--bum-seat-2', '--bum-seat-3', '--bum-seat-4'] as const;

/**
 * Resolve the live `--bum-*` group off an element (the `.bums-theme` host).
 *
 * Falls back per-token rather than wholesale: a stylesheet that has loaded
 * partially should still yield the tokens it defined, and a missing one should
 * not drag the whole palette back to cream on a dark world.
 */
export function readBumPalette(el: Element | null | undefined): BumPalette {
  if (!el || typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') {
    return FALLBACK_PALETTE;
  }
  let style: CSSStyleDeclaration;
  try {
    style = window.getComputedStyle(el);
  } catch {
    return FALLBACK_PALETTE;
  }
  const read = (token: string, fallback: string): string => {
    const value = style.getPropertyValue(token).trim();
    return value.length > 0 ? value : fallback;
  };
  return {
    paper: read(TOKENS.paper, FALLBACK_PALETTE.paper),
    paper2: read(TOKENS.paper2, FALLBACK_PALETTE.paper2),
    paperEdge: read(TOKENS.paperEdge, FALLBACK_PALETTE.paperEdge),
    rule: read(TOKENS.rule, FALLBACK_PALETTE.rule),
    margin: read(TOKENS.margin, FALLBACK_PALETTE.margin),
    ink: read(TOKENS.ink, FALLBACK_PALETTE.ink),
    inkSoft: read(TOKENS.inkSoft, FALLBACK_PALETTE.inkSoft),
    graphite: read(TOKENS.graphite, FALLBACK_PALETTE.graphite),
    highlight: read(TOKENS.highlight, FALLBACK_PALETTE.highlight),
    tape: read(TOKENS.tape, FALLBACK_PALETTE.tape),
    splat: read(TOKENS.splat, FALLBACK_PALETTE.splat),
    seat: [
      read(SEAT_TOKENS[0], FALLBACK_PALETTE.seat[0]),
      read(SEAT_TOKENS[1], FALLBACK_PALETTE.seat[1]),
      read(SEAT_TOKENS[2], FALLBACK_PALETTE.seat[2]),
      read(SEAT_TOKENS[3], FALLBACK_PALETTE.seat[3]),
    ],
    surface: read(TOKENS.surface, FALLBACK_PALETTE.surface),
    surface2: read(TOKENS.surface2, FALLBACK_PALETTE.surface2),
    danger: read(TOKENS.danger, FALLBACK_PALETTE.danger),
    success: read(TOKENS.success, FALLBACK_PALETTE.success),
  };
}

// ─── Colour arithmetic ──────────────────────────────────────────────────────
//
// A level's `palette` overrides three colours (paper, ink, accent). The other
// twelve are *derived* from them rather than authored, so a world tint moves
// the ruled lines, the torn underlay and the pencil together instead of leaving
// a cold-grey sheet ruled in warm blue.

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

const HEX3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])([0-9a-f])?$/i;
const HEX6 = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})?$/i;
const RGB_FN = /^rgba?\(([^)]+)\)$/i;

/** Parse `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()` and `rgba()`. */
export function parseColor(css: string): Rgba | null {
  const value = css.trim();
  const hex3 = HEX3.exec(value);
  if (hex3) {
    return {
      r: parseInt(hex3[1] + hex3[1], 16),
      g: parseInt(hex3[2] + hex3[2], 16),
      b: parseInt(hex3[3] + hex3[3], 16),
      a: hex3[4] === undefined ? 1 : parseInt(hex3[4] + hex3[4], 16) / 255,
    };
  }
  const hex6 = HEX6.exec(value);
  if (hex6) {
    return {
      r: parseInt(hex6[1], 16),
      g: parseInt(hex6[2], 16),
      b: parseInt(hex6[3], 16),
      a: hex6[4] === undefined ? 1 : parseInt(hex6[4], 16) / 255,
    };
  }
  const fn = RGB_FN.exec(value);
  if (fn) {
    // Both the legacy comma form and the modern space form, since a computed
    // style may return either depending on the browser.
    const parts = fn[1]
      .replace(/\//g, ' ')
      .split(/[\s,]+/)
      .filter((p) => p.length > 0);
    if (parts.length >= 3) {
      const num = (p: string): number =>
        p.endsWith('%') ? (parseFloat(p) / 100) * 255 : parseFloat(p);
      const alpha = parts.length >= 4 ? parseFloat(parts[3]) : 1;
      return {
        r: num(parts[0]),
        g: num(parts[1]),
        b: num(parts[2]),
        a: Number.isFinite(alpha) ? alpha : 1,
      };
    }
  }
  return null;
}

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

export function toCss(c: Rgba): string {
  const a = c.a >= 1 ? 1 : c.a <= 0 ? 0 : c.a;
  return a >= 1
    ? `rgb(${clamp255(c.r)}, ${clamp255(c.g)}, ${clamp255(c.b)})`
    : `rgba(${clamp255(c.r)}, ${clamp255(c.g)}, ${clamp255(c.b)}, ${Math.round(a * 1000) / 1000})`;
}

/** Linear blend of two CSS colours; `t` 0 = `a`, 1 = `b`. Unparseable input returns `a`. */
export function mixColor(a: string, b: string, t: number): string {
  const ca = parseColor(a);
  const cb = parseColor(b);
  if (!ca || !cb) return a;
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  return toCss({
    r: ca.r + (cb.r - ca.r) * k,
    g: ca.g + (cb.g - ca.g) * k,
    b: ca.b + (cb.b - ca.b) * k,
    a: ca.a + (cb.a - ca.a) * k,
  });
}

/** The same colour at a different alpha — used for hints, ghosts and washes. */
export function withAlpha(css: string, alpha: number): string {
  const c = parseColor(css);
  if (!c) return css;
  return toCss({ r: c.r, g: c.g, b: c.b, a: c.a * alpha });
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(css: string): number {
  const c = parseColor(css);
  if (!c) return 1;
  const channel = (v: number): number => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}

/**
 * True when the sheet is darker than the ink — Marker Mosh (world 8) and any
 * level palette that inverts. Patterns and washes flip their blend mode on
 * this, because `multiply` over a near-black sheet draws nothing at all.
 */
export function isDarkPaper(palette: BumPalette): boolean {
  return luminance(palette.paper) < luminance(palette.ink);
}

/**
 * Apply a level's authored tint. `paper` and `ink` land directly; `accent`
 * becomes the highlighter, because that is the only "a person picked this up
 * and marked the page with it" colour in the token group. Everything else is
 * re-derived so the sheet stays internally consistent.
 */
export function withLevelPalette(base: BumPalette, level: LevelPalette | undefined): BumPalette {
  if (!level) return base;
  const paper = level.paper;
  const ink = level.ink;
  return {
    ...base,
    paper,
    ink,
    highlight: level.accent,
    paper2: mixColor(paper, ink, 0.08),
    paperEdge: mixColor(paper, ink, 0.18),
    rule: mixColor(paper, ink, 0.22),
    margin: mixColor(paper, base.margin, 0.65),
    inkSoft: withAlpha(mixColor(ink, paper, 0.3), 0.5),
    graphite: mixColor(ink, paper, 0.45),
    splat: mixColor(ink, paper, 0.06),
    surface: withAlpha(paper, 0.92),
    surface2: withAlpha(mixColor(paper, ink, 0.06), 0.96),
  };
}

/**
 * The ink a seat draws in, honouring their `cosmetics.ink` slot.
 *
 * Ids come from `cosmetics.ts`; anything unrecognised (an older or newer peer)
 * falls back to that seat's own pen rather than to a fixed colour, so the seat
 * stays distinguishable even when its cosmetic does not resolve.
 */
export function seatInk(palette: BumPalette, seat: number, cosmeticInk: string): string {
  switch (cosmeticInk) {
    case 'highlighter-yellow':
      return palette.highlight;
    case 'pencil-grey':
      return palette.graphite;
    case 'red-correction':
      return palette.danger;
    case 'gel-sparkle':
      return mixColor(palette.seat[seat & 3], palette.highlight, 0.35);
    case 'invisible-ink':
      // Outline only: the stroke colour is the paper, so only the graphite
      // under-pass reads. Deliberately hard to see; that is the joke.
      return palette.paper;
    case 'crayon':
      return mixColor(palette.seat[seat & 3], palette.paper, 0.22);
    case 'gold-ink':
      // The 100%-campaign reward. Built from the highlighter and the orange pen
      // so it stays gold when a world tints the sheet.
      return mixColor(palette.highlight, palette.seat[3], 0.55);
    default: {
      // 'seat-1'…'seat-4', or anything unknown, resolve to a seat pen.
      const parsed = /^seat-([1-4])$/.exec(cosmeticInk);
      const index = parsed ? Number(parsed[1]) - 1 : seat & 3;
      return palette.seat[index];
    }
  }
}
