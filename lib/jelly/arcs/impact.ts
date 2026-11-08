/**
 * The impact of a strike (CSS-first jelly Task 9, "more oomph"), and the luminance cap that keeps it safe.
 *
 * Where a bolt lands, and at the press point, the gel takes a hit: a short radial flash (a soft white-hot disc with
 * anisotropic specular streaks along the rim tangent) and a shock ring that expands through the host, clipped to its
 * rounded rect. Everything rides one ease-out timeline, {@link impactSample}, over {@link IMPACT.lifeMs}.
 *
 * ## The luminance cap (WCAG 2.3.1, a hard gate)
 *
 * WCAG counts a flash as a pair of opposing changes of ≥ 10% relative luminance, and exempts flashes whose combined
 * area is under 0.006 sr (25% of a 10° visual field; ≈ 341 × 256 px on a 1024 × 768 screen at a typical distance,
 * 87,296 px²). Two independent bounds hold here, on top of the flash ledger's ≤ 3 onsets per second
 * (`FLASH_LEDGER`, which alone already satisfies the "three flashes" rule):
 *
 * - **Small.** No impact draws past {@link FLASH_LUMINANCE.maxFlashRadiusPx}; the flash disc is far smaller.
 * - **Bounded per pixel.** The summed coverage of EVERY impact layer at any pixel — disc, both streaks, ring, lit rim,
 *   contact glow and press flare, within one impact and between neighbours — changes luminance by at most
 *   {@link FLASH_LUMINANCE.maxPeak} (`flash-budget.ts` `centreScale`, which the renderer applies to all of them).
 * - **Bounded area.** Summed over every layer of every arc live in a frame (bolt passes, stubs, halo, rims, rings,
 *   discs, streaks, contacts, flares), the area that changes by ≥ 0.1 stays within
 *   {@link FLASH_LUMINANCE.areaBudgetPx2} (`flash-budget.ts` `fitFrame`). The arithmetic is in flash-budget.ts.
 *
 * Pure: plain numbers, no DOM.
 */

export const FLASH_LUMINANCE = {
  /** WCAG 2.3.1: a change of this much relative luminance (of white) is a flash transition. */
  flashDelta: 0.1,
  /**
   * The px² per frame, summed over every layer the arc layer draws, in which luminance may change by ≥ `flashDelta`:
   * a quarter of WCAG's small-area threshold (0.006 sr ≈ 341 × 256 px = 87,296 px²), so even a stray overlap with
   * other flashing content stays well under it.
   */
  areaBudgetPx2: 21_824,
  /** No impact element draws past this radius from its point, px (well under the ~160px "small" bound). */
  maxFlashRadiusPx: 140,
  /**
   * The most the impact layers together may change relative luminance at any one pixel, on the worst ground (see
   * flash-budget.ts `centreBudget`): bright enough to read as a hit, never a white-out of the area under it.
   */
  maxPeak: 0.6,
} as const;

export const IMPACT = {
  /** The whole impact, ms (the brief's 260–420ms). */
  lifeMs: 340,
  /** Linear rise of the flash, ms; then a cubic ease-out to 0. */
  riseMs: 18,
  /** Flash disc radius at a bolt's end, px. */
  flashRadiusPx: 34,
  /** …and at the press point, px. */
  clickFlashRadiusPx: 44,
  /** The disc starts at this share of its radius and eases out to the full radius. */
  flashGrowFrom: 0.75,
  /** The disc centre's alpha at the flash's peak (the frame's per-pixel cap scales it with every other layer). */
  peak: 0.45,
  /** Shock ring: radius from → to, px, ease-out. */
  ringStartPx: 4,
  ringEndPx: 96,
  /** Ring stroke width from → to, px. */
  ringWidthStartPx: 4,
  ringWidthEndPx: 1,
  /** Ring alpha at its peak. */
  ringAlpha: 0.45,
  /** Specular streak along the rim tangent (full length), and across it (a short cross streak), px. */
  streakLenPx: 72,
  crossStreakShare: 0.38,
  /** Streak thickness (the ellipse's minor radius), px. */
  streakWidthPx: 2.5,
  /** Streak brightness relative to the flash. */
  streakAlpha: 0.55,
} as const;

/** The flash disc's radial gradient: [offset 0..1, share of peak]. Monotonically decreasing. */
export const IMPACT_STOPS: readonly (readonly [number, number])[] = [
  [0, 1],
  [0.22, 0.4],
  [1, 0],
];

export interface ImpactSample {
  /** Flash envelope 0..1 (× `IMPACT.peak` for the disc centre's added luminance). */
  flash: number;
  flashRadius: number;
  ringRadius: number;
  ringWidth: number;
  ringAlpha: number;
  streakLength: number;
}

export interface ImpactOptions {
  /** Intensity scale (calm, the arc's energy): 0..1. */
  scale?: number;
  /** The press point gets the larger disc. */
  click?: boolean;
}

export const easeOutCubic = (u: number) => 1 - (1 - u) ** 3;

/** The impact at `t` ms after its strike, or null before it starts and once it is over. */
export function impactSample(t: number, opts: ImpactOptions = {}): ImpactSample | null {
  if (!(t >= 0) || t >= IMPACT.lifeMs) return null;
  const scale = Math.max(0, Math.min(1, opts.scale ?? 1));
  const u = t / IMPACT.lifeMs;
  const env =
    t < IMPACT.riseMs
      ? t / IMPACT.riseMs
      : (1 - (t - IMPACT.riseMs) / (IMPACT.lifeMs - IMPACT.riseMs)) ** 3;
  const grow = easeOutCubic(u);
  const radius = opts.click ? IMPACT.clickFlashRadiusPx : IMPACT.flashRadiusPx;
  return {
    flash: env * scale,
    flashRadius: radius * (IMPACT.flashGrowFrom + (1 - IMPACT.flashGrowFrom) * grow),
    ringRadius: IMPACT.ringStartPx + (IMPACT.ringEndPx - IMPACT.ringStartPx) * grow,
    ringWidth: IMPACT.ringWidthStartPx + (IMPACT.ringWidthEndPx - IMPACT.ringWidthStartPx) * grow,
    ringAlpha:
      IMPACT.ringAlpha *
      scale *
      (t < IMPACT.riseMs
        ? t / IMPACT.riseMs
        : (1 - u) ** 2 / (1 - IMPACT.riseMs / IMPACT.lifeMs) ** 2),
    streakLength: IMPACT.streakLenPx * Math.min(1, env) * (0.6 + 0.4 * grow),
  };
}

/**
 * The share (0..1) of the disc radius within which a disc of `peak` added luminance, shaped by `stops`, adds at least
 * `threshold`. The stops are piecewise linear and decreasing.
 */
export function radiusAbove(
  stops: readonly (readonly [number, number])[],
  peak: number,
  threshold: number,
): number {
  if (!(threshold > 0)) return 1;
  if (!(peak * stops[0][1] >= threshold)) return 0;
  for (let i = 1; i < stops.length; i++) {
    const [o0, v0] = stops[i - 1];
    const [o1, v1] = stops[i];
    const a = peak * v0;
    const b = peak * v1;
    if (b < threshold) {
      if (a === b) return o0;
      const f = (a - threshold) / (a - b);
      return o0 + (o1 - o0) * f;
    }
  }
  return stops[stops.length - 1][0];
}
