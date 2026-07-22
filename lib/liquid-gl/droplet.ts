/**
 * §17.1 trail-droplet cohesion — the pure geometry that keeps the lagging droplet
 * fused to its capsule in BOTH render tiers.
 *
 * The droplet trails the capsule centre on a soft spring (`TRAIL_SPRING` in
 * liquid-morph). Nothing about that spring bounds the lag, so a fast, wide tab
 * jump (100–300 px) throws the droplet far outside what either fusion primitive
 * can bridge — the CSS `#glass-goo` (blur stdDev 9 → alpha 16/−6) only fuses
 * blobs whose edge gap is ≲ 2× the blur radius (~18 px), and the GL shader's
 * `smin(d, di, k)` likewise only bridges within `k` (≈26 device px). Beyond that
 * the droplet renders as a free-floating ball (the owner's report).
 *
 * {@link computeDroplet} derives the droplet's RENDERED centre + diameter from the
 * raw spring position by (a) clamping the centre so the droplet's leading edge
 * never falls further behind the capsule's trailing edge than {@link MERGE_GAP}
 * (comfortably inside both bridges), and (b) tapering the diameter down as the lag
 * grows (full when merged, {@link TAPER_MIN} at maximum lag) so the pinch-off
 * reads as surface tension shrinking a droplet, not a blob teleporting away.
 *
 * It is pure (no DOM / React / motion-value state) so it is unit-tested directly
 * and so the SAME clamped values feed the CSS goo blobs (via the motion-value
 * graph) and the GL bodies (pushed into the registry) — one source, both tiers.
 */

/** Droplet diameter as a fraction of the capsule's short side, at zero lag (§15.3). */
export const DROP_FACTOR = 0.7;

/**
 * Maximum edge gap (CSS px) allowed between the capsule's trailing edge and the
 * droplet's leading edge. Kept well under the CSS goo bridge (~18 px) and the GL
 * `smin` k (~26 px), so the fusion neck is always present — never a detached ball.
 */
export const MERGE_GAP = 8;

/** Droplet size multiplier at maximum lag — it shrinks to 40 % as it pinches off. */
export const TAPER_MIN = 0.4;

export interface DropletState {
  /** Rendered droplet centre (same coordinate space as the capsule centre). */
  cx: number;
  cy: number;
  /** Rendered droplet diameter (CSS px), tapered by lag. */
  d: number;
}

/**
 * Project the raw (spring) droplet centre onto the cohesive teardrop.
 *
 * @param cx    capsule centre x
 * @param cy    capsule centre y
 * @param rawX  raw spring droplet centre x (may lag arbitrarily far)
 * @param rawY  raw spring droplet centre y
 * @param w     capsule width
 * @param h     capsule height
 */
export function computeDroplet(
  cx: number,
  cy: number,
  rawX: number,
  rawY: number,
  w: number,
  h: number,
): DropletState {
  const short = Math.min(w, h);
  const baseD = short * DROP_FACTOR;

  // Lag vector (capsule → raw droplet). At rest it is ~0 and the droplet sits
  // exactly under the capsule centre (fully merged).
  const lagX = cx - rawX;
  const lagY = cy - rawY;
  const lagLen = Math.hypot(lagX, lagY);
  if (lagLen < 1e-3) return { cx, cy, d: baseD };

  const ux = lagX / lagLen;
  const uy = lagY / lagLen;

  // Capsule half-extent along the lag direction (box projection). This is the
  // distance from the capsule centre to its trailing edge on the lag axis.
  const halfAlong = Math.abs(ux) * (w / 2) + Math.abs(uy) * (h / 2);

  // Taper factor from the raw lag. `maxLag0` uses the UN-tapered radius as an upper
  // bound, so the true clamp below (which uses the tapered radius) is always ≤ it —
  // the two converge and never separate the edge by more than MERGE_GAP.
  const maxLag0 = halfAlong + baseD / 2 + MERGE_GAP;
  const f = Math.min(lagLen / maxLag0, 1);
  const s = 1 - (1 - TAPER_MIN) * f;
  const d = baseD * s;

  // Clamp so the droplet's leading edge stays within MERGE_GAP of the capsule's
  // trailing edge: maxLag = halfAlong + dropRadius + MERGE_GAP.
  const maxLag = halfAlong + d / 2 + MERGE_GAP;
  const lag = Math.min(lagLen, maxLag);

  return { cx: cx - ux * lag, cy: cy - uy * lag, d };
}
