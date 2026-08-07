/**
 * A3 — lane palettes that survive colour-blindness.
 *
 * The renderer's defaults are blue (`#3b82f6`) and pink (`#f472b6`) with red
 * bombs (`#ef4444`). Blue against pink is fine; **red bombs against pink notes
 * is not** — under deuteranopia (~6% of men) those two collapse toward the same
 * muddy hue, and the one thing a player must never misread is which object ends
 * their run.
 *
 * Two rules hold for every palette here:
 *
 *  1. **Luminance carries the distinction, not just hue.** Two colours the same
 *     brightness are indistinguishable to anyone under monochromacy and hard for
 *     everyone at the speed a note crosses the screen.
 *  2. **Colour is never the only channel.** Bombs are drawn as a spiked polygon
 *     rather than a pill regardless of palette (see `drawSlice`), which is WCAG
 *     1.4.1 applied to a canvas: the palette is a reinforcement, not the signal.
 *
 * The dichromatic pairs are Okabe–Ito, which was designed for exactly this and
 * is worth preferring over anything hand-picked here.
 */

export interface LanePalette {
  id: string;
  /** Per lane, index-aligned. Longer than the chart's lane count is fine. */
  lanes: readonly string[];
  bomb: string;
}

export const LANE_PALETTES = {
  /** The shipped look. Kept as the default so nobody's game changes silently. */
  default: {
    id: 'default',
    lanes: ['#3b82f6', '#f472b6', '#22c55e', '#eab308', '#a855f7', '#f97316'],
    bomb: '#ef4444',
  },
  /**
   * Okabe–Ito blue/orange: the safest two-hue pair there is, distinguishable
   * under all three dichromacies AND separated in luminance.
   */
  deuteranopia: {
    id: 'deuteranopia',
    lanes: ['#0072b2', '#e69f00', '#009e73', '#f0e442', '#cc79a7', '#56b4e9'],
    bomb: '#000000',
  },
  /**
   * Tritanopia: the blue-yellow axis collapses, so the pair is warm-vs-teal —
   * and deliberately far apart in LUMINANCE too.
   *
   * The first draft here was Okabe-Ito's `#d55e00` against `#009e73`, which is
   * correct on hue and measured 1.13:1 on luminance: two mid-tone blobs moving
   * at speed. Hue separation alone is not enough when the shapes are small and
   * fast, which is the whole lesson of the `default` palette below it.
   */
  tritanopia: {
    id: 'tritanopia',
    lanes: ['#ffb01f', '#00524d', '#cc79a7', '#f5f5f5', '#8a3d00', '#999999'],
    bomb: '#000000',
  },
  /**
   * Luminance only. For anyone the hue pairs still fail, and — not incidentally
   * — the most readable option on a washed-out projector or in sunlight.
   */
  monochrome: {
    id: 'monochrome',
    lanes: ['#f5f5f5', '#4a4a4a', '#c8c8c8', '#7a7a7a', '#e0e0e0', '#2a2a2a'],
    bomb: '#000000',
  },
} as const satisfies Record<string, LanePalette>;

export type LanePaletteId = keyof typeof LANE_PALETTES;

export const LANE_PALETTE_IDS = Object.keys(LANE_PALETTES) as LanePaletteId[];

/** Narrow an arbitrary persisted string back to a palette. */
export function resolvePalette(id: string | null | undefined): LanePalette {
  // `id && …` would evaluate to the empty string for `id === ''` rather than
  // falling through to `??`, which is exactly the value a cleared setting
  // produces.
  if (!id) return LANE_PALETTES.default;
  return (LANE_PALETTES as Record<string, LanePalette>)[id] ?? LANE_PALETTES.default;
}

/** The colour a lane draws in, wrapping if a chart has more lanes than the
 *  palette names — better a repeated colour than `undefined`. */
export function laneColor(palette: LanePalette, lane: number): string {
  return palette.lanes[lane % palette.lanes.length];
}

/**
 * Relative luminance (WCAG), for asserting that a palette's lanes are actually
 * distinguishable without colour. Used by the tests rather than at runtime.
 */
export function relativeLuminance(hex: string): number {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const r = channel(parseInt(hex.slice(1, 3), 16));
  const g = channel(parseInt(hex.slice(3, 5), 16));
  const b = channel(parseInt(hex.slice(5, 7), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two hex colours. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
