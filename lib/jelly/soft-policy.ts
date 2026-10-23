/**
 * Soft-body policy: which jelly behaviour an element gets, how many bodies may be awake, who is evicted first, and
 * which neighbours a release may nudge (docs/plans/plasmatic-jelly/02-soft-body.md §1.2–§4, master plan R3/R11/R12).
 *
 * Pure. Nothing here touches the DOM: the physics service (`lib/jelly/physics.ts`) reads an element ONCE at
 * activation into an {@link ElementTraits} record and asks {@link resolveSoftPolicy} what to do with it, so the whole
 * selector/alias/exclusion table is unit-testable without jsdom and is resolved once per activation, never per move.
 *
 * The shared, cross-service policy (tiers, budgets, off predicate, motion bounds) lives in `lib/jelly/tiers.ts`; this
 * file only adds what is specific to the soft body, and every number it shares with another service is imported from
 * there rather than restated.
 */

import {
  AMBIENT_BOUNDS,
  JELLY_BUDGETS,
  MOTION_BOUNDS,
  type JellyMotion,
  type JellyTier,
} from './tiers';

/* ── Modes ───────────────────────────────────────────────────────────────── */

/**
 * The body kind an element resolves to (02 §3.2).
 *
 * - `control` — buttons, tabs, menu items: hover *dent*, sink press, corner flex when small.
 * - `card` — cards, evert targets, card links: hover *plump* + lean, lift press, Tier L rim when admitted.
 * - `pane` — panes, chrome, overlays, `.app-glass`, fields: Tier L only; the host never moves.
 * - `drag` — surfaces that move with the pointer: drag stretch; the slop starts a drag instead of cancelling.
 * - `off` — opted out or always excluded.
 */
export type SoftBodyMode = 'control' | 'card' | 'pane' | 'drag' | 'off';

/** Base press scale per press style — exactly the legacy `useFluidPress` `MODES`, so a centre press is unchanged. */
export const PRESS_BASE = {
  /** A control you push INTO the surface. */
  sink: 0.96,
  /** Large surfaces, where 4% is a lot of pixels. */
  firm: 0.985,
  /** A card/tile you pick UP off the surface. */
  lift: 1.028,
} as const;

export type PressStyle = keyof typeof PRESS_BASE;

/** Soft-body constants that are not shared with other services (shared ones are in `tiers.ts`). */
export const SOFT_BODY = {
  /** Hover plump on cards (scale delta). */
  hoverPlump: 0.008,
  /** Hover dent on controls (scale delta, negative). */
  hoverDent: 0.004,
  /** Press squash amount `q` (volume-preserving, 02 §1.2). */
  pressSquash: 0.025,
  /** Weight softening in `w = u² / (ux² + uy² + 0.15)`. */
  pressWeightSoftening: 0.15,
  /** Share of the lean the press translate moves toward the contact. */
  pressLeanShare: 0.3,
  /** Lean as a share of the short side, capped at {@link SOFT_BODY.maxLeanPx}. */
  leanPerSize: 0.006,
  maxLeanPx: 2,
  /** Hover-entry velocity kick: `min(1, |v| / kickSpeed) · kickScale` /s on the scale springs. */
  kickSpeed: 1500,
  kickScale: 0.6,
  /** Drag stretch: `s_par = 1 + min(dragMax, |v| / dragSpeed · dragMax)`. */
  dragMax: 0.035,
  dragSpeed: 2400,
  /** Trailing lag translate against the drag velocity. */
  dragLagPx: 2,
  /** Plastic memory: presses held longer than this keep a fraction of the squash. */
  plasticHoldMs: 350,
  /** Hold over which the plastic fraction ramps from 0 to its maximum. */
  plasticRampMs: 650,
  /** Max fraction of the squash kept (Tier E) / of the dent kept (Tier L). */
  plasticMaxEnvelope: 0.4,
  plasticMaxLattice: 0.3,
  /** Plastic decay constant (s); the memory is gone (exactly 0) after `3τ`. */
  plasticTau: 0.6,
  /** Hover hysteresis: the pointer has left only outside the rest rect grown by this. */
  hoverMarginPx: 4,
  /** Pointer travel that releases a press (or starts a drag on `drag` bodies). */
  scrollSlopPx: 10,
  /** No hover activation and no nudge this soon after a scroll. */
  scrollQuietMs: 150,
  /** A release/drag-end nudges neighbours only above this stored energy (px). */
  nudgeEnergyPx: 2,
  /** Candidate rects read once at press time (02 §2). */
  nudgeCandidates: 16,
  /** Corner flex: small controls only, ±25% of the rest radius, ≤3 at once. */
  cornerFlexMaxW: 160,
  cornerFlexMaxH: 64,
  cornerFlexAmount: 0.25,
  cornerFlexMax: 3,
  /** Tier L outward bulge cap (px) before the overdraw bound; see {@link latticeCaps}. */
  latticeOutwardPx: 3,
  /** Tier L dent: `−min(dentBevelShare · bevel, dentMaxPx)`. */
  dentBevelShare: 0.6,
  dentMaxPx: 10,
} as const;

/* ── Element traits → policy ──────────────────────────────────────────────── */

/**
 * What the physics service reads from an element at activation. Everything is a plain value, so tests build these
 * by hand. `attrs` holds the raw attribute values (missing = `undefined`; present-but-empty = `''`).
 */
export interface ElementTraits {
  /** Lower-case tag name. */
  tag: string;
  /** `role` attribute, if any. */
  role?: string | null;
  /** Class list. */
  classes?: readonly string[];
  attrs?: Readonly<Record<string, string | undefined>>;
  /** `[disabled]`, `[aria-disabled=true]` or inside `[inert]`. */
  disabled?: boolean;
  /** `input`, `textarea`, `select`, `[contenteditable]`: caret/IME must never wobble. */
  editable?: boolean;
  /** Inside a `[data-jelly-scope="off"]` (or alias) subtree. */
  scopeOff?: boolean;
  /** An untagged `a[href]` inside running text. */
  proseLink?: boolean;
  /** Rest border-box size (CSS px), when known. */
  width?: number;
  height?: number;
  /** The glass engine admitted this element as a shader slab (Tier L). */
  admitted?: boolean;
  /** Children with `overflow: visible` overhang (badges) — disables corner flex. */
  overhangingChildren?: boolean;
  /** The inline `transform` holds a non-zero translate/scale at activation (framer `x`/`y` at rest). */
  inlineTransformOffset?: boolean;
}

export interface SoftPolicy {
  mode: SoftBodyMode;
  /** Base press scale (`s0`). 1 for panes and drag bodies. */
  base: number;
  /** Tier E: the host takes a `scale`/`translate` affine. */
  envelope: boolean;
  /** Tier E may write `scale` (false = lean only). */
  scale: boolean;
  /** Tier L: an 8-node lattice warps the rim (only when the engine admitted the surface). */
  lattice: boolean;
  /** Hover response. `none` on panes, drag bodies and fields. */
  hover: 'plump' | 'dent' | 'none';
  /** Small-control radius morph. */
  cornerFlex: boolean;
  /** Pointer travel starts a drag instead of cancelling. */
  drag: boolean;
  /** Lattice amplitude multiplier (large surfaces × 0.5, 04 §4.3). */
  latticeAmplitude: number;
}

const OFF: SoftPolicy = {
  mode: 'off',
  base: 1,
  envelope: false,
  scale: false,
  lattice: false,
  hover: 'none',
  cornerFlex: false,
  drag: false,
  latticeAmplitude: 0,
};

/** Tags that never take a body: their content is a surface of its own. */
export const EXCLUDED_TAGS: ReadonlySet<string> = new Set(['canvas', 'video', 'iframe']);

/**
 * Classes that are never soft bodies: the globe stage and eversion ghosts animate themselves.
 */
export const EXCLUDED_CLASSES: readonly string[] = [
  'radial-globe__stage',
  'eversion-overlay',
  'evert-ghost',
];

const CONTROL_ROLES: ReadonlySet<string> = new Set([
  'button',
  'tab',
  'menuitem',
  'switch',
  'option',
]);
const PANE_CLASSES: readonly string[] = [
  'glass-pane',
  'glass-chrome',
  'glass-overlay',
  'app-glass',
  'glass-inset',
];
const CARD_CLASSES: readonly string[] = ['glass-fill', 'glass-interactive'];

/** Selector twins of the tables below, for the one `closest()` the physics service does at activation. */
export const SOFT_BODY_SELECTOR = [
  '[data-jelly]',
  '[data-fluid-press]',
  'button',
  '[role="button"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="switch"]',
  '[role="option"]',
  'summary',
  '[data-slot="button"]',
  'a[href]',
  '[data-evert]',
  '[data-liquid-surface]',
  ...CARD_CLASSES.map((c) => `.${c}`),
  ...PANE_CLASSES.map((c) => `.${c}`),
  '[data-liquid-glass]',
].join(',');

/** Always-excluded elements (02 §3.2). `[inert]` descendants are reported through {@link ElementTraits.disabled}. */
export const SOFT_BODY_EXCLUDE_SELECTOR = [
  'canvas',
  'video',
  'iframe',
  '[data-gesture]:not([data-gesture="hold"])',
  '[draggable="true"]:not([data-jelly="drag"])',
  ...EXCLUDED_CLASSES.map((c) => `.${c}`),
  '[disabled]',
  '[aria-disabled="true"]',
].join(',');

/** Opt-out values of `data-jelly` and its legacy aliases (R11: `data-fluid-press*` stays accepted). */
const OFF_VALUES: ReadonlySet<string> = new Set(['off', 'none']);

function has(t: ElementTraits, name: string): boolean {
  return t.attrs?.[name] !== undefined;
}

function attr(t: ElementTraits, name: string): string | undefined {
  return t.attrs?.[name];
}

function hasClass(t: ElementTraits, names: readonly string[]): boolean {
  return !!t.classes?.some((c) => names.includes(c));
}

/**
 * Resolve the explicit mode an element asks for, through `data-jelly` first and then the legacy aliases:
 * `data-fluid-press` → `control`, `="lift"` → lift, `="none" | "off"` → off (02 §3.2 Aliases).
 * Returns `null` when nothing explicit is set.
 */
export function explicitMode(t: ElementTraits): { mode: SoftBodyMode; press?: PressStyle } | null {
  const jelly = attr(t, 'data-jelly');
  if (jelly !== undefined) {
    if (OFF_VALUES.has(jelly)) return { mode: 'off' };
    if (jelly === 'control' || jelly === 'card' || jelly === 'pane' || jelly === 'drag')
      return { mode: jelly };
    if (jelly === 'sink' || jelly === 'firm') return { mode: 'control', press: jelly };
    if (jelly === 'lift') return { mode: 'card', press: 'lift' };
    // `lite` is a material override (tiers.ts), not a body mode: fall through to the defaults.
  }
  const press = attr(t, 'data-fluid-press');
  if (press !== undefined) {
    if (OFF_VALUES.has(press)) return { mode: 'off' };
    if (press === 'lift') return { mode: 'card', press: 'lift' };
    if (press === 'firm') return { mode: 'control', press: 'firm' };
    return { mode: 'control', press: 'sink' };
  }
  return null;
}

/** The default mode for an element with no explicit attribute (02 §3.2 table). */
export function defaultMode(t: ElementTraits): SoftBodyMode {
  if (hasClass(t, PANE_CLASSES) || t.editable) return 'pane';
  if (has(t, 'data-liquid-glass') && !hasClass(t, CARD_CLASSES)) return 'pane';
  if (hasClass(t, CARD_CLASSES) || has(t, 'data-evert') || has(t, 'data-liquid-surface'))
    return 'card';
  if (t.tag === 'button' || t.tag === 'summary' || attr(t, 'data-slot') === 'button')
    return 'control';
  if (t.role && CONTROL_ROLES.has(t.role)) return 'control';
  if (t.tag === 'a' && has(t, 'href')) return t.proseLink ? 'off' : 'card';
  return 'off';
}

/** True when the element is on the always-excluded list (02 §3.2). */
export function alwaysExcluded(t: ElementTraits): boolean {
  if (EXCLUDED_TAGS.has(t.tag)) return true;
  if (hasClass(t, EXCLUDED_CLASSES)) return true;
  if (t.disabled) return true;
  const gesture = attr(t, 'data-gesture');
  if (gesture !== undefined && gesture !== 'hold') return true;
  if (attr(t, 'draggable') === 'true' && attr(t, 'data-jelly') !== 'drag') return true;
  if (
    t.proseLink &&
    attr(t, 'data-jelly') === undefined &&
    attr(t, 'data-fluid-press') === undefined
  )
    return true;
  return false;
}

/** Corner flex gate (02 §1.4): small controls only, never with overhanging children. */
export function cornerFlexEligible(
  width: number,
  height: number,
  overhangingChildren = false,
): boolean {
  return (
    !overhangingChildren &&
    width > 0 &&
    height > 0 &&
    width <= SOFT_BODY.cornerFlexMaxW &&
    height <= SOFT_BODY.cornerFlexMaxH
  );
}

/** Large surfaces get no host affine and half the lattice amplitude (04 §4.3). */
export function isLargeSurface(width: number, height: number): boolean {
  return width * height > AMBIENT_BOUNDS.largeSurfaceAreaPx2;
}

export interface ResolveOptions {
  /** Degradation knobs from {@link softFeatures}; defaults to everything on. */
  features?: SoftFeatures;
}

/**
 * The full decision for one element. Resolved once at activation and cached by the service in a `WeakMap`.
 */
export function resolveSoftPolicy(t: ElementTraits, opts: ResolveOptions = {}): SoftPolicy {
  const features = opts.features ?? softFeatures('full', 'lively');
  if (!features.press || t.scopeOff || alwaysExcluded(t)) return OFF;
  const explicit = explicitMode(t);
  const mode = explicit?.mode ?? defaultMode(t);
  if (mode === 'off') return OFF;

  const w = t.width ?? 0;
  const h = t.height ?? 0;
  const large = isLargeSurface(w, h);
  const overrideScale = Number(attr(t, 'data-jelly-scale') ?? attr(t, 'data-fluid-scale') ?? NaN);
  const style: PressStyle = explicit?.press ?? (mode === 'card' ? 'lift' : 'sink');
  const base =
    mode === 'pane' || mode === 'drag'
      ? 1
      : Number.isFinite(overrideScale) && overrideScale > 0
        ? overrideScale
        : PRESS_BASE[style];

  // Panes, chrome, overlays and fields never take a host affine; their rim is Tier L only.
  const envelope = mode !== 'pane' && !t.editable;
  const scale = envelope && !large && !t.inlineTransformOffset;
  const lattice = !!t.admitted && features.lattice;
  const hover: SoftPolicy['hover'] =
    !features.hover || !envelope || mode === 'drag'
      ? 'none'
      : mode === 'control'
        ? 'dent'
        : 'plump';
  const cornerFlex =
    features.cornerFlex &&
    mode === 'control' &&
    envelope &&
    !lattice &&
    cornerFlexEligible(w, h, t.overhangingChildren);

  return {
    mode,
    base,
    envelope,
    scale,
    lattice,
    hover,
    cornerFlex,
    drag: mode === 'drag',
    latticeAmplitude: lattice ? (large ? AMBIENT_BOUNDS.largeLatticeScale : 1) : 0,
  };
}

/* ── Degradation ─────────────────────────────────────────────────────────── */

/** What the soft body may do under a tier and motion level (02 §4 Degradation, 04 §4). */
export interface SoftFeatures {
  press: boolean;
  /** Release overshoot. Off → the release is critically damped (`jellyRelease` ζ → 1). */
  wobble: boolean;
  hover: boolean;
  nudge: boolean;
  cornerFlex: boolean;
  lattice: boolean;
  /** Awake Tier E bodies. */
  bodies: number;
  /** Awake Tier L lattices. */
  lattices: number;
}

/**
 * Degradation matrix. `lite` and `off` keep an isotropic press with no wobble (the material is gone, the press is
 * not); `still` behaves the same, because the user asked for no motion beyond acknowledgement. Coarse and handheld
 * tiers have no hover (touch has no hover tier).
 */
export function softFeatures(tier: JellyTier, motion: JellyMotion = 'lively'): SoftFeatures {
  const budget = JELLY_BUDGETS[tier];
  const degraded = tier === 'lite' || tier === 'off' || motion === 'still';
  if (degraded) {
    return {
      press: budget.bodies > 0,
      wobble: false,
      hover: false,
      nudge: false,
      cornerFlex: false,
      lattice: false,
      bodies: Math.min(budget.bodies, JELLY_BUDGETS.lite.bodies),
      lattices: 0,
    };
  }
  const touch = tier === 'coarse' || tier === 'handheld';
  return {
    press: budget.bodies > 0,
    wobble: true,
    hover: !touch,
    nudge: motion === 'lively',
    cornerFlex: true,
    lattice: budget.lattices > 0,
    bodies: budget.bodies,
    lattices: budget.lattices,
  };
}

/* ── Active set and eviction ─────────────────────────────────────────────── */

/** Body phase, in eviction order: earlier phases are evicted first (02 §4). */
export type BodyPhase = 'nudge' | 'hover' | 'released' | 'pressed' | 'dragged';

export const EVICTION_ORDER: readonly BodyPhase[] = [
  'nudge',
  'hover',
  'released',
  'pressed',
  'dragged',
];

/** Pressed and dragged bodies are never evicted. */
export const PINNED_PHASES: ReadonlySet<BodyPhase> = new Set(['pressed', 'dragged']);

export interface BodyRef<K = unknown> {
  key: K;
  phase: BodyPhase;
  /** Stored energy (px), see {@link bodyEnergy}. Lower energy goes first within a phase. */
  energy: number;
}

/**
 * Which bodies to evict so that at most `cap` remain. Lowest phase first (nudge < hover < released), lowest energy
 * first within a phase; pinned phases are never returned, so the result may leave more than `cap` bodies when that
 * many are pressed or dragged.
 */
export function pickEvictions<K>(bodies: readonly BodyRef<K>[], cap: number): K[] {
  const excess = bodies.length - Math.max(0, cap);
  if (excess <= 0) return [];
  const rank = (p: BodyPhase) => EVICTION_ORDER.indexOf(p);
  return bodies
    .filter((b) => !PINNED_PHASES.has(b.phase))
    .slice()
    .sort((a, b) => rank(a.phase) - rank(b.phase) || a.energy - b.energy)
    .slice(0, excess)
    .map((b) => b.key);
}

/** Tier E cap for the pointer kind (02 D7), never above the tier's budget. */
export function bodyCap(features: SoftFeatures, coarsePointer: boolean): number {
  return Math.min(features.bodies, coarsePointer ? 6 : 12);
}

/**
 * Stored energy of a body in px: `|s − 1|·size + |t|`, maximised over the axes (02 §2 Trigger).
 */
export function bodyEnergy(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  width: number,
  height: number,
): number {
  return Math.max(
    Math.abs(sx - 1) * width + Math.abs(tx),
    Math.abs(sy - 1) * height + Math.abs(ty),
  );
}

/* ── Neighbour nudge ─────────────────────────────────────────────────────── */

export interface NudgeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface NudgeTarget<K = number> {
  key: K;
  /** Unit direction away from the source (centre to centre). */
  dx: number;
  dy: number;
  /** Peak displacement (px). */
  peak: number;
  gap: number;
}

/** Edge-to-edge gap between two axis-aligned rects (0 when touching or overlapping). */
export function rectGap(a: NudgeRect, b: NudgeRect): number {
  const gx = Math.max(0, b.x - (a.x + a.w), a.x - (b.x + b.w));
  const gy = Math.max(0, b.y - (a.y + a.h), a.y - (b.y + b.h));
  return Math.hypot(gx, gy);
}

/** Peak nudge for a neighbour at `gap` px: `1.5px · (1 − gap/24)`, 0 beyond the radius. */
export function nudgePeak(gap: number): number {
  if (!(gap >= 0) || gap > MOTION_BOUNDS.nudgeRadiusPx) return 0;
  return MOTION_BOUNDS.nudgePx * (1 - gap / MOTION_BOUNDS.nudgeRadiusPx);
}

/**
 * Pick the neighbours a release nudges (02 §2): only above the energy threshold, never while a scroll happened in
 * the last 150ms, at most 4, within 24px of the source's rest rect, nearest first. Overlapping candidates (gap 0
 * with intersecting boxes, i.e. ancestors/descendants) are skipped. Never chains: callers must not call this for a
 * nudged body.
 */
export function pickNudgeTargets<K>(
  source: NudgeRect,
  candidates: readonly { key: K; rect: NudgeRect }[],
  energy: number,
  msSinceScroll = Infinity,
): NudgeTarget<K>[] {
  if (energy <= SOFT_BODY.nudgeEnergyPx || msSinceScroll < SOFT_BODY.scrollQuietMs) return [];
  const cx = source.x + source.w / 2;
  const cy = source.y + source.h / 2;
  const out: NudgeTarget<K>[] = [];
  for (const c of candidates.slice(0, SOFT_BODY.nudgeCandidates)) {
    const r = c.rect;
    const overlaps =
      r.x < source.x + source.w &&
      source.x < r.x + r.w &&
      r.y < source.y + source.h &&
      source.y < r.y + r.h;
    if (overlaps) continue;
    const gap = rectGap(source, r);
    const peak = nudgePeak(gap);
    if (peak <= 0) continue;
    let dx = r.x + r.w / 2 - cx;
    let dy = r.y + r.h / 2 - cy;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    out.push({ key: c.key, dx, dy, peak, gap });
  }
  out.sort((a, b) => a.gap - b.gap);
  return out.slice(0, MOTION_BOUNDS.nudgeMax);
}

/* ── Lattice caps ────────────────────────────────────────────────────────── */

/**
 * Tier L displacement caps for a bevel (02 §1.3): outward ≤ 3px, and never past the focus ring's offset
 * (`AMBIENT_BOUNDS.maxOverdrawPx`, 04 §4.5); inward (the dent) ≤ `min(0.6·bevel, 10px)`. Both scale with
 * `amplitude` (0.5 on large surfaces).
 */
export function latticeCaps(bevel: number, amplitude = 1): { outward: number; inward: number } {
  const a = Math.max(0, amplitude);
  return {
    outward: Math.min(SOFT_BODY.latticeOutwardPx, AMBIENT_BOUNDS.maxOverdrawPx) * a,
    inward: Math.min(SOFT_BODY.dentBevelShare * Math.max(0, bevel), SOFT_BODY.dentMaxPx) * a,
  };
}

/** Plastic fraction kept after a press held `heldMs` (0 under 350ms, ramping to `max`). */
export function plasticFraction(heldMs: number, max: number): number {
  if (!(heldMs > SOFT_BODY.plasticHoldMs)) return 0;
  return max * Math.min(1, (heldMs - SOFT_BODY.plasticHoldMs) / SOFT_BODY.plasticRampMs);
}

/** Remaining share of a plastic memory `ageS` seconds after release: `exp(−t/τ)`, exactly 0 from `3τ` on. */
export function plasticDecay(ageS: number): number {
  const tau = SOFT_BODY.plasticTau;
  if (ageS >= 3 * tau) return 0;
  return Math.exp(-Math.max(0, ageS) / tau);
}
