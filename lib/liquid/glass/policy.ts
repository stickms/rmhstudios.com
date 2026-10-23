/**
 * Pure decisions for the glass engine: no DOM, no GL. Everything the runtime must choose per surface or per frame that
 * can be wrong in a way a user sees lives here, so it can be tested without a browser.
 *
 * The Plasmatic Jelly half (below the rim decisions) answers: which admitted slabs get a moving haze canvas, at what
 * resolution, how often the ambient clock ticks and when it stops (master plan R6/R7, 01 §2.2–2.3, 04 §3), how many
 * haze draws one frame may issue, how far a squished rim may overdraw its host, and how a charge pulse decays.
 */
import { AMBIENT_BOUNDS, IDLE_AFTER_MS } from '@/lib/jelly/tiers';

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

/**
 * The surfaces to draw this pass: visible, sized, in role then registration order, up to the budget. `max` is the
 * jelly tier's rim budget (`jellyBudget().rims`: 24 / 16 / 10, 2 while a game plays); it can lower the ceiling, never
 * raise it past {@link GLASS_BUDGET.maxSurfaces}.
 */
export function admit<T extends Candidate>(
  candidates: readonly T[],
  max: number = GLASS_BUDGET.maxSurfaces,
): T[] {
  const cap = Math.max(0, Math.min(GLASS_BUDGET.maxSurfaces, Math.floor(max)));
  return candidates
    .filter((c) => c.visible && sizeEligible(c.width, c.height))
    .sort((a, b) => rolePriority(a.role) - rolePriority(b.role) || a.order - b.order)
    .slice(0, cap);
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

// ── Plasmatic Jelly: haze, ambient clock, lattice overdraw, charge pulse ─────────────────────────────────────────────

/**
 * The haze canvases' fixed limits. Slot COUNTS come from `jellyBudget().hazeSlots` (8 / 6 / 4, R6) through the
 * registry; these bound what one slot and one frame may cost.
 */
export const HAZE = {
  /** Haze draws issued in any one frame; the rest wait for the next tick, oldest first (01 §2.2). */
  maxDrawsPerFrame: 6,
  /** CSS → backing-store scale ceiling; the field is low-frequency, so a bilinear upscale is invisible. */
  baseScale: 0.25,
  /** Long-side cap, px, for overlay / chrome / pane (tier A) and for fills (tier B, half rate). */
  maxSide: 256,
  fillMaxSide: 128,
  /** Fills tick on every other clock tick. */
  fillRateDivisor: 2,
} as const;

/** Roles that may hold a haze canvas. Controls never do: a button keeps its own fill and a field keeps a still caret. */
export function hazeEligible(role: GlassRole): boolean {
  return role !== 'control';
}

/**
 * Keep only haze-eligible slots. The registry ranks role-first (controls last), so dropping controls AFTER its cap
 * loses no non-control: a control is only ever in the ranked list once every eligible role already is.
 */
export function hazeSlots<T extends { role: GlassRole }>(ranked: readonly T[]): T[] {
  return ranked.filter((e) => hazeEligible(e.role));
}

/**
 * Backing-store scale for a haze canvas: at most {@link HAZE.baseScale} (or the governor's lower scale), and never
 * more than {@link HAZE.maxSide} px (128 for fills) on the long side.
 */
export function hazeScaleFor(width: number, height: number, role: GlassRole, governed = 1): number {
  const long = Math.max(1, width, height);
  const side = role === 'fill' ? HAZE.fillMaxSide : HAZE.maxSide;
  const base = Math.min(HAZE.baseScale, governed);
  return Math.max(0, Math.min(base, side / long));
}

/** Haze canvas backing size for a surface, px. */
export function hazeSize(
  width: number,
  height: number,
  role: GlassRole,
  governed = 1,
): [number, number] {
  const k = hazeScaleFor(width, height, role, governed);
  return [Math.max(1, Math.round(width * k)), Math.max(1, Math.round(height * k))];
}

export interface ClockState {
  /** `document.hidden`. */
  hidden: boolean;
  /** `document.hasFocus()`: a second-monitor tab costs nothing. */
  focused: boolean;
  /** A scroll is in flight: canvases scroll with their hosts, so a frozen field is correct. */
  scrolling: boolean;
  /** Haze canvases currently on screen. */
  hazeSurfaces: number;
  /** `jellyMode().ambient` (false under `still`, a playing game, a degraded root, a hidden tab). */
  ambient: boolean;
  /** Time since the last pointer, key, wheel, scroll or focus. */
  msSinceInput: number;
  /** The governed budget's clock and idle floor (`governBudget(jellyBudget(), step)`; calm already capped). */
  clockHz: number;
  idleClockHz: number;
}

/**
 * The ambient clock (R7). 0 — and so no loop — when the tab is hidden, the window is unfocused, a scroll is in flight,
 * no haze canvas is on screen, or ambient motion is off (degraded tier, `still`, a game playing). Otherwise the tier's
 * clock while someone is there and its idle floor after {@link IDLE_AFTER_MS}: never 0 while visible, by decision.
 */
export function ambientHz(s: ClockState): number {
  if (s.hidden || !s.focused || s.scrolling || !s.ambient || s.hazeSurfaces <= 0) return 0;
  const hz = s.msSinceInput > IDLE_AFTER_MS ? s.idleClockHz : s.clockHz;
  return Math.max(0, Math.min(hz, s.clockHz));
}

export interface HazeTicket {
  /** `performance.now()` this surface is next due. */
  due: number;
}

/**
 * The haze surfaces to draw this tick: those due (within `slackMs`), oldest due first, at most
 * {@link HAZE.maxDrawsPerFrame}. Whatever is left stays due and goes first next tick, so a full page is a round robin
 * rather than one expensive frame.
 */
export function dueHaze<T extends HazeTicket>(
  items: readonly T[],
  now: number,
  max: number = HAZE.maxDrawsPerFrame,
  slackMs = 2,
): T[] {
  const cap = Math.max(0, Math.min(HAZE.maxDrawsPerFrame, Math.floor(max)));
  return items
    .filter((i) => i.due <= now + slackMs)
    .sort((a, b) => a.due - b.due)
    .slice(0, cap);
}

/** When a surface drawn now is next due: one clock period, two for fills (tier B, half rate). */
export function nextDue(now: number, hz: number, role: GlassRole): number {
  if (!(hz > 0)) return Infinity;
  return now + (1000 / hz) * (role === 'fill' ? HAZE.fillRateDivisor : 1);
}

/** A stable per-surface seed in [0, 1): spreads phases and noise origins so neighbours never move in sync. */
export function seedFor(order: number): number {
  const x = Math.sin((order + 1) * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * How far a rim canvas may overdraw its host so an outward lattice bulge is not clipped: {@link
 * AMBIENT_BOUNDS.maxOverdrawPx} (2px, the focus ring's offset) for cards and controls, 0 for panes, chrome and
 * overlays — those are often flush with the viewport, where 2px of overflow would be a horizontal page scroll, and
 * their squish reads through the dent, which needs no margin. 0 everywhere when no lattice may run.
 */
export function overdrawMargin(role: GlassRole, latticesAllowed: boolean): number {
  if (!latticesAllowed) return 0;
  return role === 'fill' || role === 'control' ? AMBIENT_BOUNDS.maxOverdrawPx : 0;
}

/** Lattice amplitude: half on large surfaces (04 §4.3), full otherwise. */
export function latticeAmplitude(width: number, height: number): number {
  return width * height > AMBIENT_BOUNDS.largeSurfaceAreaPx2 ? AMBIENT_BOUNDS.largeLatticeScale : 1;
}

/** A charge pulse (`pulse(el, k)`): how long it lasts, and its ceiling on the rim's plasma strength. */
export const PULSE = { durationMs: 300, maxBoost: 0.35 } as const;

/** The pulse's added plasma strength `ageMs` after it fired with strength `k` (0..1): a quadratic fall to 0. */
export function pulseLevel(k: number, ageMs: number): number {
  if (!(ageMs >= 0) || ageMs >= PULSE.durationMs) return 0;
  const strength = Math.max(0, Math.min(1, k));
  const t = 1 - ageMs / PULSE.durationMs;
  return PULSE.maxBoost * strength * t * t;
}
