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
 * - **Bounded peak and bounded area.** The disc's peak added luminance is at most {@link FLASH_LUMINANCE.maxPeak}
 *   (scaled by the arc's intensity and `calm`), treating its colour as white, which over-estimates every real
 *   palette. And the total area in which ALL impacts drawn in one frame raise luminance by ≥ 0.1 stays within
 *   {@link FLASH_LUMINANCE.areaBudgetPx2}, a quarter of WCAG's threshold area: {@link impactShare} dims every impact
 *   of a crowded frame until the sum fits. The bolt strokes themselves are lines a few px wide.
 *
 * Pure: plain numbers, no DOM.
 */

export const FLASH_LUMINANCE = {
  /** WCAG 2.3.1: a change of this much relative luminance (of white) is a flash transition. */
  flashDelta: 0.1,
  /**
   * The px² per frame in which impacts may raise luminance by ≥ `flashDelta`: a quarter of WCAG's small-area
   * threshold (0.006 sr ≈ 341 × 256 px = 87,296 px²), so even a stray overlap with other flashing content stays
   * well under it.
   */
  areaBudgetPx2: 21_824,
  /** No impact element draws past this radius from its point, px (well under the ~160px "small" bound). */
  maxFlashRadiusPx: 140,
  /** The most an impact disc's centre may add to relative luminance (treated as white): 0.6 of full white. */
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
  /** Peak added luminance of the disc centre (≤ `FLASH_LUMINANCE.maxPeak`). */
  peak: 0.6,
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
  streakAlpha: 0.7,
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

/** Area (px²) of a flash disc of `radiusPx` over which it adds at least `threshold` relative luminance. */
export function discAreaAbove(
  peak: number,
  radiusPx: number,
  threshold: number = FLASH_LUMINANCE.flashDelta,
): number {
  const r =
    radiusAbove(IMPACT_STOPS, Math.min(peak, FLASH_LUMINANCE.maxPeak), threshold) * radiusPx;
  return Math.PI * r * r;
}

/**
 * The brightness share every impact of a frame drawing `n` of them gets, so their combined ≥ 0.1 area fits
 * {@link FLASH_LUMINANCE.areaBudgetPx2} (each counted at the larger, press-point disc). 1 when they already fit.
 */
export function impactShare(n: number): number {
  if (!(n > 1)) return 1;
  const area = (s: number) => n * discAreaAbove(IMPACT.peak * s, IMPACT.clickFlashRadiusPx);
  if (area(1) <= FLASH_LUMINANCE.areaBudgetPx2) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (area(mid) <= FLASH_LUMINANCE.areaBudgetPx2) lo = mid;
    else hi = mid;
  }
  return lo;
}
