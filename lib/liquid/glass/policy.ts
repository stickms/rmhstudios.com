/**
 * Pure decisions for the glass engine: no DOM, no GL. Everything the runtime must choose per surface or per frame that
 * can be wrong in a way a user sees lives here, so it can be tested without a browser.
 *
 * The Plasmatic Jelly half (below the rim decisions) answers: which admitted slabs get a moving haze canvas, at what
 * resolution, how often the ambient clock ticks and when it stops (master plan R6/R7, 01 §2.2–2.3, 04 §3), how many
 * haze draws one frame may issue, how far a squished rim may overdraw its host, and how a charge pulse decays.
 */
import { AMBIENT_BOUNDS, CHARGE, IDLE_AFTER_MS, PLASMA } from '@/lib/jelly/tiers';

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

/**
 * Bevel width for a surface: wide enough to refract visibly, never so wide that content sits inside it. `shoulder`
 * (`--gel-shoulder`, 0.5..2) widens it for the molded rim's rounded shoulder; the ceiling grows with it, and the molded
 * shading stays in the bevel's outer 60%, so text in a card's padding is still clear of it.
 *
 * `room` is how far the shoulder may reach before it would run under something else ({@link roomFor}): a nested body
 * or the host's padded content. A parent's edge never overlaps a child's, so nested surfaces mold into each other
 * instead of stacking two rims on one line.
 */
export function bevelFor(
  width: number,
  height: number,
  radius: number,
  shoulder = 1,
  room = Infinity,
): number {
  const short = Math.min(width, height);
  const k = Math.max(0.5, Math.min(2, shoulder));
  const wanted = Math.min(short * 0.26, Math.max(radius * 0.9, 16)) * k;
  return Math.max(
    BEVEL_MIN,
    Math.min(
      Math.round(24 * Math.max(1, k)),
      Math.round(wanted),
      Math.floor(short / 2) - 1,
      Math.floor(room),
    ),
  );
}

/** The thinnest shoulder a surface is drawn with: below this the rim reads as an outline again. */
export const BEVEL_MIN = 3;
/** Clear space kept between a parent's shoulder and a nested body's silhouette, CSS px. */
export const NEST_GAP = 2;

/**
 * How far a surface's shoulder may reach, CSS px. `padding` is the host's smallest padding: when it has any, the
 * shoulder stays in it, so text never sits on the slope (a full-bleed host — padding 0, a media card — keeps its whole
 * shoulder over the media). `childInset` is the smallest distance from the host's edge to a nested body's edge; the
 * shoulder stops {@link NEST_GAP} short of it.
 */
export function roomFor(padding: number, childInset: number): number {
  const pad = padding > 0 ? padding : Infinity;
  return Math.max(BEVEL_MIN, Math.min(pad, childInset - NEST_GAP));
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

/**
 * The haze's own clock, in seconds. It is not `performance.now()`: the ambient clock stops while a scroll is in
 * flight, the tab is hidden or the window is unfocused, and a field keyed to the wall clock resumes the other side of
 * the pause with everything it would have flowed meanwhile — a visible jump the moment scrolling comes to rest. This
 * one advances only on a tick, by the time since the previous one, so a pause freezes the field and the resume carries
 * on from the frame it stopped on. A gap of more than three periods is a pause: it counts as one period, not the gap.
 */
export function advanceHazeClock(clock: number, now: number, last: number, hz: number): number {
  if (!(last > 0) || !(hz > 0)) return clock;
  const period = 1000 / hz;
  return clock + Math.max(0, Math.min(now - last, period * 3)) / 1000;
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

// ── #989: dormant plasma level, charge rings, gel tokens ─────────────────────────────────────────────────────────────

/**
 * Ease a surface's plasma wake level toward its target (`plasma:level` from physics: 0 rest, `PLASMA.wake` hover, 1
 * press/focus/click) with time constant {@link PLASMA.easeMs}, frame-rate independent. Snaps within 0.002 so a settled
 * surface stops asking for frames; non-finite input settles to the (clamped) target.
 */
export function easePlasma(
  current: number,
  target: number,
  dtMs: number,
  easeMs: number = PLASMA.easeMs,
): number {
  const goal = Math.max(0, Math.min(1, Number.isFinite(target) ? target : 0));
  if (!Number.isFinite(current) || !(dtMs > 0)) return Number.isFinite(current) ? current : goal;
  const next = current + (goal - current) * (1 - Math.exp(-dtMs / Math.max(1, easeMs)));
  return Math.abs(next - goal) < 0.002 ? goal : next;
}

/**
 * The look of the dormant plasma and its charge rings. Peak alpha is what the plasma reaches at level 1 at its core
 * (lower on a light ground, where an accent wash costs dark ink more contrast); the legibility budget is the reason it
 * is this low. Rings travel at `CHARGE.pulseSpeedPxS` and decay with `CHARGE.pulseTauMs`.
 */
export const PLASMA_LOOK = {
  peakDark: 0.14,
  peakLight: 0.1,
  /** Calm halves the plasma's own motion (the haze has its own `CALM.amplitude`). */
  calmMotion: 0.5,
  /** Rings per surface (the shader's `uRings[4]` has one spare). Older rings are replaced. */
  ringsPerSurface: 3,
  /** A ring whose strength falls below this is gone. */
  ringFloor: 0.02,
  /** Gaussian half-width of the ring front, CSS px. */
  ringWidthPx: 10,
  /** Two rings on one surface within this time and distance are one charge (an arc strike and its `charge:pulse`). */
  mergeMs: 60,
  mergePx: 32,
} as const;

export interface PulseRing {
  /** Origin, host-local CSS px. */
  x: number;
  y: number;
  /** Charge 0..1. */
  q: number;
  /** `performance.now()` it started. */
  at: number;
}

/** A ring's front radius (px) and strength `ageMs` after it started. Strength is 0 before it starts. */
export function ringState(q: number, ageMs: number): { radius: number; amp: number } {
  if (!(ageMs >= 0)) return { radius: 0, amp: 0 };
  const strength = Math.max(0, Math.min(1, q));
  return {
    radius: (CHARGE.pulseSpeedPxS * ageMs) / 1000,
    amp: strength * Math.exp(-ageMs / CHARGE.pulseTauMs),
  };
}

/** The longest a ring of charge `q` can live: until its strength falls below {@link PLASMA_LOOK.ringFloor}. */
export function ringLifetimeMs(q: number): number {
  const strength = Math.max(0, Math.min(1, q));
  if (strength <= PLASMA_LOOK.ringFloor) return 0;
  return CHARGE.pulseTauMs * Math.log(strength / PLASMA_LOOK.ringFloor);
}

/** Alive: still above the floor, and its front has not yet left a surface whose farthest point is `reachPx` away. */
export function ringAlive(ring: PulseRing, now: number, reachPx: number): boolean {
  const { radius, amp } = ringState(ring.q, now - ring.at);
  return amp > PLASMA_LOOK.ringFloor && radius < reachPx + PLASMA_LOOK.ringWidthPx * 2;
}

/**
 * Add a ring to a surface's list: a ring started within {@link PLASMA_LOOK.mergeMs} and {@link PLASMA_LOOK.mergePx}
 * of an existing one is the same charge (keeps the stronger); otherwise it is appended and the oldest beyond
 * {@link PLASMA_LOOK.ringsPerSurface} are dropped. Returns a new array.
 */
export function addRing(rings: readonly PulseRing[], ring: PulseRing): PulseRing[] {
  if (!(ring.q > 0)) return [...rings];
  const q = Math.min(1, ring.q);
  const twin = rings.findIndex(
    (r) =>
      Math.abs(r.at - ring.at) <= PLASMA_LOOK.mergeMs &&
      Math.hypot(r.x - ring.x, r.y - ring.y) <= PLASMA_LOOK.mergePx,
  );
  if (twin >= 0) {
    const out = [...rings];
    out[twin] = { ...out[twin]!, q: Math.max(out[twin]!.q, q) };
    return out;
  }
  const out = [...rings, { ...ring, q }];
  return out.slice(Math.max(0, out.length - PLASMA_LOOK.ringsPerSurface));
}

/**
 * Pack the live rings into the shader's `uRings[4]` (x, y, radius, strength; unused slots zero). Returns the number
 * packed.
 */
export function packRings(rings: readonly PulseRing[], now: number, out: Float32Array): number {
  out.fill(0);
  let n = 0;
  for (const r of rings) {
    if (n >= 4) break;
    const { radius, amp } = ringState(r.q, now - r.at);
    if (amp <= PLASMA_LOOK.ringFloor) continue;
    out[n * 4] = r.x;
    out[n * 4 + 1] = r.y;
    out[n * 4 + 2] = radius;
    out[n * 4 + 3] = amp;
    n++;
  }
  return n;
}

/** Parse a CSS length/number token (`"1.5px"`, `"2"`) to px, or `fallback`. */
export function cssPx(value: string, fallback: number): number {
  const v = parseFloat(value);
  return Number.isFinite(v) ? v : fallback;
}
