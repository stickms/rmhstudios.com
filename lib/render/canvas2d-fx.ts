/**
 * Canvas-2D effect gating — the 2D counterpart to `lib/render/tier.ts`.
 *
 * `tier.ts` maps a device to 3D knobs (DPR, antialias, shadow maps). A 2D canvas
 * has a different dominant cost: **blurred shadows**. `ctx.shadowBlur` with a
 * non-zero value makes the browser rasterise the shape to a scratch surface, blur
 * it, and composite the result — so a single blurred fill can cost many times an
 * ordinary one, and a frame that enables it repeatedly pays that over and over.
 *
 * Measured with `scripts/perf/canvas2d-probe.mjs`: slice-it enabled a blurred
 * shadow ~10 times per frame against only ~15 rasterising operations — two thirds
 * of everything it drew was drawn through a blur, and that was at rest.
 *
 * The gate reuses the site's existing low-end signals rather than inventing a new
 * heuristic: `html.perf-lite` (set by Providers from device memory/cores, the same
 * class that turns off the glass blur, the aurora parallax and the liquid layer)
 * and the user's reduced-motion preference. Read it once per theme/class change,
 * not per frame — resolving it inside a draw loop would defeat the point.
 */

/**
 * Whether decorative blurred shadows / glows are affordable right now.
 *
 * SSR-safe (returns true, so the first client frame matches the server's
 * assumption and a capable device never flickers into the cheap look).
 */
export function canvasGlowEnabled(): boolean {
  if (typeof document === 'undefined') return true;
  const root = document.documentElement;
  if (root.classList.contains('perf-lite')) return false;
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  } catch {
    /* matchMedia unavailable — keep the effects */
  }
  return true;
}
