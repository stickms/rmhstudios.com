/**
 * What survives of the glass engine's policy module. The engine itself (rim slabs, haze canvases, the ambient clock,
 * lattice overdraw, charge-pulse rings) was deleted with the CSS-first migration; two pure pieces are still read:
 *
 * - {@link innerRadius}: the click arcs parse a host's corner radius with it (`lib/jelly/arcs/runtime.ts`);
 * - {@link PLASMA_LOOK}: the liquid globe's plasma look (`components/radial/LiquidGlobe.tsx`, `globe-protocol.ts`,
 *   `jelly-glass.ts`).
 */

/** Parse the corner radius a surface should be drawn with (the padding-box radius, in px). */
export function innerRadius(
  cssRadius: string,
  borderWidth: number,
  width: number,
  height: number,
): number {
  const v = parseFloat(cssRadius);
  if (!Number.isFinite(v)) return 0;
  const px = cssRadius.includes('%') ? (v / 100) * Math.min(width, height) : v;
  return Math.max(0, Math.min(px - borderWidth, Math.min(width, height) / 2));
}

/**
 * The peak alpha of the globe's dormant plasma at level 1 at its core (lower on a light ground, where an accent wash costs
 * dark ink more contrast); the legibility budget is the reason it is this low.
 */
export const PLASMA_LOOK = {
  peakDark: 0.14,
  peakLight: 0.1,
} as const;
