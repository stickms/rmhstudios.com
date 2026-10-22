/**
 * Pure decisions for the glass engine: no DOM, no GL. Everything the runtime must choose per surface or per frame that
 * can be wrong in a way a user sees lives here, so it can be tested without a browser.
 */

export const GLASS_BUDGET = {
  /**
   * Surfaces drawn at once. Each is one canvas and one draw; more costs memory before it costs frames. Only VISIBLE surfaces
   * count, so this is "how many cards fit on screen", with headroom.
   */
  maxSurfaces: 24,
  /** CSS px². Above this a surface falls back to the CSS material. */
  maxArea: 640_000,
  /** CSS px. Smaller than this has no room for a bevel. */
  minSide: 16,
  /** Backing-store scale ceiling, and the lower ceiling for large surfaces. */
  maxDpr: 2,
  largeDpr: 1.5,
  largeArea: 250_000,
} as const;

/** Bevel width for a surface: wide enough to refract visibly, never so wide that content sits inside it. */
export function bevelFor(width: number, height: number, radius: number): number {
  const short = Math.min(width, height);
  const wanted = Math.min(short * 0.26, Math.max(radius * 0.9, 16));
  return Math.max(3, Math.min(24, Math.round(wanted), Math.floor(short / 2) - 1));
}

/** How far behind the surface the page appears to be: the reach of refraction. Shorter than the bevel by design. */
export function thicknessFor(bevel: number): number {
  return bevel * 0.95;
}

/** Backing-store scale for a surface. */
export function dprFor(deviceDpr: number, width: number, height: number): number {
  const cap = width * height > GLASS_BUDGET.largeArea ? GLASS_BUDGET.largeDpr : GLASS_BUDGET.maxDpr;
  return Math.max(1, Math.min(deviceDpr || 1, cap));
}

/** May this size be drawn as glass at all? */
export function sizeEligible(width: number, height: number): boolean {
  return (
    width >= GLASS_BUDGET.minSide &&
    height >= GLASS_BUDGET.minSide &&
    width * height <= GLASS_BUDGET.maxArea
  );
}

export type GlassRole = 'overlay' | 'chrome' | 'pane' | 'fill' | 'control' | 'other';

/** Admission priority: floating UI first (it sits over the most varied content), then chrome, panes, then repeated cards. */
export function rolePriority(role: GlassRole): number {
  const order: Record<GlassRole, number> = {
    overlay: 0,
    chrome: 1,
    pane: 2,
    fill: 3,
    control: 4,
    other: 5,
  };
  return order[role];
}

export interface Candidate {
  id: number;
  role: GlassRole;
  /** Registration order: the tie-break that keeps the choice stable across passes. */
  order: number;
  visible: boolean;
  width: number;
  height: number;
}

/** The surfaces to draw this pass: visible, sized, in role then registration order, up to the budget. */
export function admit<T extends Candidate>(candidates: readonly T[]): T[] {
  return candidates
    .filter((c) => c.visible && sizeEligible(c.width, c.height))
    .sort((a, b) => rolePriority(a.role) - rolePriority(b.role) || a.order - b.order)
    .slice(0, GLASS_BUDGET.maxSurfaces);
}

/**
 * How much of the page snapshot a surface can actually use, 0..1. The snapshot is the viewport at capture time; once
 * the page has scrolled, the part of it behind a viewport-anchored surface slides toward (and past) its edge. The
 * refracted rim must fade out as its sample region leaves the picture rather than smear the last row of pixels.
 *
 * `sceneY` is where the surface's top-left sits in the snapshot; `reach` sets how quickly the rim fades once the surface has
 * overhung the picture (fully gone after `2 * reach` px).
 */
export function sceneCoverage(
  sceneX: number,
  sceneY: number,
  width: number,
  height: number,
  sceneW: number,
  sceneH: number,
  reach: number,
): number {
  // How far the surface has slid PAST the picture's edge, px. Refraction samples inward from the surface's own edge, so a
  // surface that is flush with the picture (a sticky header at the top of the viewport) is fully covered: no fade.
  const over = Math.max(0, -sceneX, -sceneY, sceneX + width - sceneW, sceneY + height - sceneH);
  return Math.max(0, Math.min(1, 1 - over / Math.max(1, reach * 2)));
}

/** Strength of a tap's ripple on a surface `distance` px away: 1 at the finger, quadratic fall-off, 0 past the reach. */
export const RIPPLE_REACH = 520;
export function rippleAmplitude(distance: number, strength = 1): number {
  if (distance >= RIPPLE_REACH) return 0;
  const k = distance / 260;
  return strength / (1 + k * k);
}

/** Cursor light weight for a surface `distance` px from the pointer (0 inside the surface). */
export const LIGHT_REACH = 440;
export function lightTarget(distance: number): number {
  if (distance >= LIGHT_REACH) return 0;
  const t = 1 - distance / LIGHT_REACH;
  return t * t * (3 - 2 * t);
}

/** Unit-disc tilt toward a cursor INSIDE the slab. The shader caps the optical angle, never the DOM. */
export function cursorTilt(x: number, y: number, width: number, height: number): [number, number] {
  if (width <= 0 || height <= 0 || x < 0 || y < 0 || x > width || y > height) return [0, 0];
  const tx = (x / width) * 2 - 1;
  const ty = (y / height) * 2 - 1;
  const length = Math.max(1, Math.hypot(tx, ty));
  return [tx / length, ty / length];
}

/** Exponential approach, frame-rate independent. */
export function approach(current: number, target: number, rate: number, dt: number): number {
  const k = 1 - Math.exp(-rate * dt);
  const next = current + (target - current) * k;
  return Math.abs(next - target) < 0.003 ? target : next;
}

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
