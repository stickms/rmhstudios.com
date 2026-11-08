/**
 * Chromatic dispersion of a bolt's light (CSS-first jelly Task 9, "properly refracted"; docs/plasmatic-jelly-system.md
 * §1.1, the gel's RGB-led edge).
 *
 * A bolt's glow is split into red, green and blue copies offset perpendicular to the channel, so its edge fringes like
 * light through glass, the same split the gel's rim shows (`--gel-disperse-r/-g/-b`: red toward the top-left light,
 * blue away). The split is physical in shape, not in size:
 *
 * - **Zero at the core, growing outward.** A pass's offset depends on its half-width (how far its light sits from
 *   the channel's centre line): the white-hot core never splits, the mid glow splits a little, the bloom most. The
 *   curve is a saturating exponential, so it is monotone and bounded by {@link DISPERSION.maxPx}.
 * - **Stronger at a rim and inside the gel.** Where the channel passes close to a host's rim (`rimProximity`, a
 *   Gaussian of the signed distance) or runs inside a host (`gel`, the refracted entry stub), the split grows, as it
 *   does where light crosses a lens edge. The product is clamped to {@link DISPERSION.capPx} whatever the inputs.
 *
 * Colour: the three channel colours are the channel's light (the renderer passes the near-white core token: a tinted
 * glow has little of the other primaries to fringe) multiplied by masks that sum to one per component, so where the
 * copies overlap (`lighter`) they add back to exactly that colour, and only the fringes show red or blue. No
 * channel may be a WCAG 2.3.1 "saturated red" (R/(R+G+B) ≥ 0.8 in linear light): one that would be is desaturated.
 *
 * Pure: plain numbers and `Float32Array`s, no DOM. Offsets are computed once per strike (renderer cost rule).
 */

export const DISPERSION = {
  /** Offset per px of half-width near the core (the curve's initial slope). */
  slope: 0.35,
  /** The asymptote of the plain (no rim, no gel) curve, px. */
  maxPx: 2.6,
  /** At the rim the split is × (1 + rimBoost). */
  rimBoost: 1.2,
  /** Gaussian width of the rim boost, px of signed distance. */
  rimFalloffPx: 14,
  /** Inside the gel the split is × (1 + gelBoost). */
  gelBoost: 1.4,
  /** Never more than this, px (the bound the tests hold whatever the inputs). */
  capPx: 6,
  /** Channel masks; each component sums to 1 across r, g, b. */
  masks: {
    r: [0.6, 0.2, 0.2],
    g: [0.2, 0.6, 0.2],
    b: [0.2, 0.2, 0.6],
  },
  /** WCAG 2.3.1's saturated-red ratio, R/(R+G+B), in linear light. */
  saturatedRedRatio: 0.8,
  /** A channel that would be saturated red is lifted to this ratio (below the WCAG one). */
  safeRedRatio: 0.7,
  /**
   * Light themes composite `source-over`, where a channel copy cannot add light, only cover: the split there is a
   * hue fringe, the glow mixed this far toward a warm and a cool primary (green stays the glow).
   */
  fringeMix: 0.5,
  fringeWarm: [1, 0.3, 0.45],
  fringeCool: [0.25, 0.55, 1],
} as const;

/**
 * The perpendicular offset (px) of a channel copy of a pass whose light sits `halfWidth` px from the core.
 * `rim` and `gel` are 0..1 weights (values above 1 are clamped).
 */
export function channelOffset(halfWidth: number, rim = 0, gel = 0): number {
  if (!(halfWidth > 0)) return 0;
  const plain =
    DISPERSION.maxPx * (1 - Math.exp((-DISPERSION.slope * halfWidth) / DISPERSION.maxPx));
  const r = Math.max(0, Math.min(1, Number.isFinite(rim) ? rim : 0));
  const g = Math.max(0, Math.min(1, Number.isFinite(gel) ? gel : 0));
  const boosted = plain * (1 + DISPERSION.rimBoost * r) * (1 + DISPERSION.gelBoost * g);
  return Math.min(DISPERSION.capPx, boosted);
}

/** 1 on a rim, falling off as a Gaussian of the signed distance from it (inside or outside alike). */
export function rimProximity(signedDistance: number): number {
  if (!Number.isFinite(signedDistance)) return 0;
  const u = signedDistance / DISPERSION.rimFalloffPx;
  return Math.exp(-u * u);
}

/**
 * Which perpendicular is the lit side: +1 when the left-hand normal of the chord (first → last point) faces the
 * top-left light, else −1. One sign per polyline, so the split never flips along a bolt.
 */
export function lightSide(points: Float32Array): 1 | -1 {
  const n = points.length;
  if (n < 4) return 1;
  const tx = points[n - 2] - points[0];
  const ty = points[n - 1] - points[1];
  // Left-hand normal (ty, −tx); the light is toward (−1, −1).
  const dot = ty * -1 + -tx * -1;
  return dot >= 0 ? 1 : -1;
}

/**
 * Move each point `offsets[i]·sign` px along its own unit normal (the left-hand normal of the tangent through its
 * neighbours). Returns a new array; endpoints move only by their own offset.
 */
export function splitPolyline(
  points: Float32Array,
  offsets: Float32Array,
  sign: number,
): Float32Array {
  const n = points.length / 2;
  const out = new Float32Array(points.length);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    const tx = points[2 * b] - points[2 * a];
    const ty = points[2 * b + 1] - points[2 * a + 1];
    const len = Math.hypot(tx, ty) || 1;
    const o = (offsets[i] ?? 0) * sign;
    out[2 * i] = points[2 * i] + (ty / len) * o;
    out[2 * i + 1] = points[2 * i + 1] + (-tx / len) * o;
  }
  return out;
}

type RGB = [number, number, number];

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** WCAG 2.3.1 saturated red: R/(R+G+B) ≥ 0.8, on linearised sRGB (0..1). Black is not red. */
export function saturatedRed(rgb: readonly number[]): boolean {
  const r = toLinear(rgb[0]);
  const sum = r + toLinear(rgb[1]) + toLinear(rgb[2]);
  return sum > 0 && r / sum >= DISPERSION.saturatedRedRatio;
}

/** Lift green and blue (in linear light) until the red ratio is {@link DISPERSION.safeRedRatio}. */
function desaturateRed(rgb: RGB): RGB {
  if (!saturatedRed(rgb)) return rgb;
  const r = toLinear(rgb[0]);
  // r / (r + 2x) = safe → x = r(1 − safe) / (2·safe)
  const x = (r * (1 - DISPERSION.safeRedRatio)) / (2 * DISPERSION.safeRedRatio);
  const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
  const lift = (c: number) => toGamma(Math.max(toLinear(c), x));
  return [rgb[0], lift(rgb[1]), lift(rgb[2])];
}

/** A light's colour split into its three channel colours (sRGB 0..1). */
export function channelColours(light: readonly number[]): { r: RGB; g: RGB; b: RGB } {
  const mul = (m: readonly number[]): RGB => [light[0] * m[0], light[1] * m[1], light[2] * m[2]];
  return {
    r: desaturateRed(mul(DISPERSION.masks.r)),
    g: mul(DISPERSION.masks.g),
    b: mul(DISPERSION.masks.b),
  };
}

/**
 * Light themes: the fringe colours a `source-over` split draws (red side, middle, blue side). Each keeps the glow's
 * lightness roughly and only leans its hue, so the fringes read as colour, not as a darker smudge.
 */
export function fringeColours(glow: readonly number[]): { r: RGB; g: RGB; b: RGB } {
  const mix = (to: readonly number[]): RGB => {
    const k = DISPERSION.fringeMix;
    return [
      glow[0] + (to[0] - glow[0]) * k,
      glow[1] + (to[1] - glow[1]) * k,
      glow[2] + (to[2] - glow[2]) * k,
    ];
  };
  return {
    r: desaturateRed(mix(DISPERSION.fringeWarm)),
    g: [glow[0], glow[1], glow[2]],
    b: mix(DISPERSION.fringeCool),
  };
}
