/**
 * The electric-arc overlay (docs/plans/plasmatic-jelly/03-arcs.md §1, §4; master plan R13).
 *
 * One Canvas2D layer, `<canvas class="jelly-arc-layer">`, appended to `<body>` (never React-rendered, so no route
 * re-render can unmount it; its CSS is `app/jelly-arcs.css`). It does not share the glass engine's WebGL2 context:
 * arcs live BETWEEN surfaces, and Canvas2D strokes cost the length of the bolt, not the viewport (§4.2).
 *
 * ## Idle at rest
 *
 * Frames come from the jelly frame driver (`lib/jelly/frame.ts`, the ONE `requestAnimationFrame` behind every jelly
 * service) at `order: 30`, after the drag owners (5) and the pointer variable (25). {@link ArcRenderer.add} wakes the driver and it stays
 * awake only while an arc, its afterglow or a contact flare is alive (≤ ~410ms after the last add); the frame that
 * finds nothing left clears what it drew and lets the driver sleep. Teardown, {@link ArcRenderer.clear} (hidden tab,
 * global off) and a resize unregister the driver, which cancels a pending frame no other service wants. A page with
 * no arcs asks for no frame. No arc file calls `requestAnimationFrame`.
 *
 * ## Cost rules
 *
 * - Bolt points are generated once per strike (`bolt.ts`, at arc creation). Frames only stroke precomputed paths: no
 *   geometry work and no DOM reads per frame.
 * - Dirty rects: each frame clears the union of the previous and the current arcs' bounds, never the whole canvas.
 * - The backing store is allocated on the first arc, at `min(devicePixelRatio, 1.5)` (1 on coarse pointers), and
 *   re-sized only on a debounced `resize`, which drops live arcs.
 * - No blur filters, no shadows: glow is a wide low-alpha stroke under the core (a Gaussian per stroke is the cost
 *   model this file exists to avoid; `renderer.test.ts` scans for it).
 *
 * ## Colour
 *
 * `--site-arc-core` / `--site-arc-glow` are resolved through probe spans inside the canvas (canvas fallback content is
 * never rendered, but it computes style), read only when `<html>`'s `class`/`style`/`data-theme` changes — never per
 * frame. Dark themes composite with `lighter` (emissive); light themes with `source-over`, where `lighter` would add
 * white to white. Dark versus light comes from the luminance of `--site-bg`. A saturated red core is rotated to violet
 * (§1.3 red clamp, WCAG's saturated-red caution).
 */

import { luminance, resolveColor, type RGBA } from '../../liquid/glass/color';
import { drive, type FrameDriver } from '../frame';
import { FINE_POINTER_QUERY, jellyMotionLevel } from '../tiers';
import { generateBolt, generateFizz, restrikeBolt, type BoltPath } from './bolt';
import { channelColours, fringeColours } from './dispersion';
import { buildArcFx, type ArcFx } from './fx';
import type { RoundedRect } from './geometry';
import { arcIntensityScale, glowPasses } from './glow';
import {
  BRANCH_WIDTH,
  CONTACT_GLOW,
  GEL_LIGHT,
  HALO,
  RIM_STOPS,
  STREAK_STOPS,
  boltLayers,
  centreScales,
  colourValue,
  fitFrame,
  impactItem,
  type AreaLayer,
  type CentreItem,
  type ImpactAlphas,
} from './flash-budget';
import { IMPACT, IMPACT_STOPS, impactSample, type ImpactSample } from './impact';
import { RIM_LIGHT } from './reflection';
import type { FlashLedger } from './ledger';
import { ARC_BUDGET } from './rate';
import {
  planArc,
  truncateStrikes,
  arcIntensity,
  type ArcSample,
  type ArcTimeline,
} from './timeline';
import { clamp01 } from '@/lib/core/math';

/** What `arc:strike` reports as the arc's origin. */
export type ArcEmitKind = 'ambient' | 'click' | 'key';

/** One contact of an arc: a point on a rim (or the cursor) and its OUTWARD unit normal. */
export interface ArcEnd {
  x: number;
  y: number;
  nx: number;
  ny: number;
  /** The jelly element this end lands on; absent for a cursor end. */
  el?: Element | null;
  /** That element's rounded rect at strike time (refraction, the rim light and the ring clip); absent for a cursor. */
  rect?: RoundedRect | null;
}

/** The press point of a click (its impact), and the pressed host's rect when known (the ring's clip). */
export interface ArcOrigin {
  x: number;
  y: number;
  rect?: RoundedRect | null;
}

export interface Bounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface LiveArc {
  id: number;
  /** `flare` is a contact glow with no channel (the click's charge entering the jelly) and is not a flash. */
  shape: 'bolt' | 'fizz' | 'flare';
  emitKind: ArcEmitKind;
  /** Renderer-clock ms at which the arc's timeline starts (may be in the future: staggered click bolts). */
  start: number;
  timeline: ArcTimeline;
  /** One path per strike (re-strikes precomputed). Empty for fizz and flare. */
  paths: BoltPath[];
  /** Fizz sparks. */
  sparks: Float32Array[];
  /** Contact glows (rim ends; a discharge's cursor end is left out). */
  contacts: ArcEnd[];
  contactRadius: number;
  energy: number;
  /** The faint third halo pass (click arcs with energy ≥ 0.8). */
  halo: boolean;
  /** Struck inside an open modal: lift the layer to `--z-arcs-modal` while alive. */
  modal: boolean;
  bounds: Bounds;
  /** Strikes the flash ledger has admitted so far (the first is admitted before {@link ArcRenderer.add}). */
  admitted: number;
  /** The first strike has been reached (and announced). */
  struck: boolean;
  /** Set on scroll: the arc fades over {@link SCROLL_FADE_MS} instead of tracking its elements. */
  fadeFrom?: number;
  /** Bolts: the precomputed light geometry (refracted channel, RGB split, gel stubs, lit rims). */
  fx?: ArcFx;
  /** A click bolt's press point, which gets its own impact. */
  origin?: ArcOrigin;
  /** The motion level's intensity (calm < 1), fixed when the arc is added. */
  scale?: number;
}

/** Live arcs fade out over this on scroll (§4.3). */
export const SCROLL_FADE_MS = 60;
/** The click flare: a 14px contact glow over 90ms (§3). */
export const FLARE = { radius: 14, lifeMs: 90, riseMs: 20, peak: 0.8 } as const;
/** The arcs' place in the shared frame: after physics (10) and the engine (20), so a bolt draws over this frame's gel. */
export const ARC_FRAME_ORDER = 30;
/** Resize debounce (§4.3). */
export const RESIZE_DEBOUNCE_MS = 150;
/** Contact-glow radius by kind (§1.1). */
export const CONTACT_RADIUS = { ambient: 10, click: 14 } as const;
/** Dirty-rect pad round every impact point: the ring, the disc and half a streak, plus anti-aliasing. */
export const IMPACT_PAD =
  Math.max(IMPACT.ringEndPx, IMPACT.clickFlashRadiusPx, IMPACT.streakLenPx / 2) + 2;

/** An impact's brightness is × (floor + (1 − floor)·energy): a dim keyboard arc lands softer than a click. */
export const IMPACT_ENERGY_FLOOR = 0.5;
const WHITE = 'rgb(255 255 255)';
const WHITE_RGB = [255, 255, 255] as const;

/** How long an arc stays alive: its timeline, or until its impact has played out, whichever is later. */
export function arcLife(arc: LiveArc): number {
  if (arc.shape === 'flare') return FLARE.lifeMs;
  const first = arc.timeline.strikes[0];
  if (arc.shape === 'bolt' && arc.fx && first) {
    return Math.max(arc.timeline.lifeMs, first.at + IMPACT.lifeMs);
  }
  return arc.timeline.lifeMs;
}

let nextId = 1;

function inflate(b: Bounds, by: number): Bounds {
  return { x0: b.x0 - by, y0: b.y0 - by, x1: b.x1 + by, y1: b.y1 + by };
}

function union(a: Bounds | null, b: Bounds | null): Bounds | null {
  if (!a) return b;
  if (!b) return a;
  return {
    x0: Math.min(a.x0, b.x0),
    y0: Math.min(a.y0, b.y0),
    x1: Math.max(a.x1, b.x1),
    y1: Math.max(a.y1, b.y1),
  };
}

function boundsOfPoints(arrays: readonly Float32Array[], ends: readonly ArcEnd[]): Bounds {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const arr of arrays) {
    for (let i = 0; i < arr.length; i += 2) {
      x0 = Math.min(x0, arr[i]);
      x1 = Math.max(x1, arr[i]);
      y0 = Math.min(y0, arr[i + 1]);
      y1 = Math.max(y1, arr[i + 1]);
    }
  }
  for (const e of ends) {
    x0 = Math.min(x0, e.x);
    x1 = Math.max(x1, e.x);
    y0 = Math.min(y0, e.y);
    y1 = Math.max(y1, e.y);
  }
  return { x0, y0, x1, y1 };
}

/** Pad = the widest stroke's half width (halo 6) or the contact glow radius, plus 2px of anti-aliasing. */
function padFor(contactRadius: number): number {
  return Math.max(HALO.width / 2, contactRadius) + 2;
}

// ── Arc construction (pure: no DOM, no clock) ────────────────────────────────

export interface BoltArcSpec {
  kind: 'ambient' | 'click' | 'key' | 'discharge';
  emitKind: ArcEmitKind;
  a: ArcEnd;
  b: ArcEnd;
  seed: number;
  start: number;
  /** Override the timeline's energy (the API's `strike(a, b, { energy })`). */
  energy?: number;
  modal?: boolean;
  /** A click's press point (its impact). */
  origin?: ArcOrigin;
}

/** A bolt between two ends with every strike's path precomputed (§1.1, §1.2). */
export function boltArc(spec: BoltArcSpec): LiveArc {
  const timeline = planArc(spec.kind, spec.seed);
  const energy = Math.max(0, Math.min(1, spec.energy ?? timeline.energy));
  const base = generateBolt(spec.a, spec.b, { seed: spec.seed });
  const paths: BoltPath[] = [base];
  for (let k = 1; k < timeline.strikes.length; k++) {
    paths.push(restrikeBolt(paths[k - 1], spec.a, spec.b, k));
  }
  const click = spec.kind === 'click';
  const contactRadius = click ? CONTACT_RADIUS.click : CONTACT_RADIUS.ambient;
  // A discharge's far end is the cursor: the flare marks it, not a rim glow.
  const contacts = spec.kind === 'discharge' ? [spec.a] : [spec.a, spec.b];
  const arrays = paths.flatMap((p) => [p.points, ...p.branches.map((br) => br.points)]);
  const fx = buildArcFx(paths, [spec.a, spec.b], energy, spec.seed);
  // Impacts land on the struck rims and the press point: pad the dirty rect round each.
  const impactPts: ArcEnd[] = [...contacts.filter((c) => c.rect)];
  if (spec.origin) impactPts.push({ x: spec.origin.x, y: spec.origin.y, nx: 0, ny: -1 });
  let bounds = inflate(boundsOfPoints(arrays, contacts), padFor(contactRadius));
  for (const p of impactPts) bounds = union(bounds, inflate(boundsOfPoints([], [p]), IMPACT_PAD))!;
  return {
    id: nextId++,
    shape: 'bolt',
    emitKind: spec.emitKind,
    start: spec.start,
    timeline: { ...timeline, energy },
    paths,
    sparks: [],
    contacts,
    contactRadius,
    energy,
    halo: click && energy >= HALO.minEnergy,
    modal: !!spec.modal,
    bounds,
    admitted: 0,
    struck: false,
    fx,
    origin: spec.origin ?? undefined,
  };
}

export interface FizzArcSpec {
  origin: ArcEnd;
  emitKind: ArcEmitKind;
  seed: number;
  start: number;
  /** Spark count (the keyboard fizz uses 2); default 3–5. */
  count?: number;
  modal?: boolean;
}

/** A rim fizz: 3–5 short sparks from the rim, one onset in the ledger (§3). */
export function fizzArc(spec: FizzArcSpec): LiveArc {
  const timeline = planArc('fizz', spec.seed);
  const sparks = generateFizz(
    spec.origin,
    { x: spec.origin.nx, y: spec.origin.ny },
    spec.seed,
    spec.count,
  );
  const contacts = [spec.origin];
  return {
    id: nextId++,
    shape: 'fizz',
    emitKind: spec.emitKind,
    start: spec.start,
    timeline,
    paths: [],
    sparks,
    contacts,
    contactRadius: CONTACT_RADIUS.ambient,
    energy: timeline.energy,
    halo: false,
    modal: !!spec.modal,
    bounds: inflate(boundsOfPoints(sparks, contacts), padFor(CONTACT_RADIUS.ambient)),
    admitted: 0,
    struck: false,
  };
}

/** The click flare at the press point: a contact glow only. Never a flash, so never ledgered. */
export function flareArc(x: number, y: number, start: number, modal = false): LiveArc {
  const end: ArcEnd = { x, y, nx: 0, ny: -1 };
  const timeline: ArcTimeline = {
    kind: 'fizz',
    energy: 0,
    preGlowMs: 0,
    strikes: [],
    strikeEndMs: 0,
    afterglowMs: 0,
    lifeMs: FLARE.lifeMs,
  };
  return {
    id: nextId++,
    shape: 'flare',
    emitKind: 'click',
    start,
    timeline,
    paths: [],
    sparks: [],
    contacts: [end],
    contactRadius: FLARE.radius,
    energy: 0,
    halo: false,
    modal,
    bounds: inflate(boundsOfPoints([], [end]), FLARE.radius + 2),
    admitted: 0,
    struck: true,
  };
}

/**
 * Ask the ledger for the arc's FIRST onset, timed where the flash will actually happen (`start + strikes[0].at`), so
 * the ledger's window holds real flash times. Refused → the caller drops the bolt (and keeps its flare).
 */
export function admitArc(arc: LiveArc, ledger: FlashLedger): boolean {
  if (arc.shape === 'flare') return true;
  const first = arc.timeline.strikes[0];
  if (!first) return false;
  if (!ledger.tryOnset(arc.start + first.at)) return false;
  arc.admitted = 1;
  return true;
}

function flareSample(t: number): ArcSample {
  if (!(t >= 0) || t >= FLARE.lifeMs) return { I: 0, glow: 0, phase: 'done', strike: -1 };
  const glow =
    t < FLARE.riseMs
      ? (FLARE.peak * t) / FLARE.riseMs
      : (FLARE.peak * (FLARE.lifeMs - t)) / (FLARE.lifeMs - FLARE.riseMs);
  return { I: 0, glow, phase: 'preglow', strike: -1 };
}

// ── Colour ───────────────────────────────────────────────────────────────────

type RGB = [number, number, number];

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

/** sRGB (0..1) → OKLCH `[L, C, h°]`. */
export function srgbToOklch(rgb: readonly number[]): RGB {
  const r = toLinear(rgb[0]);
  const g = toLinear(rgb[1]);
  const b = toLinear(rgb[2]);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const h = (Math.atan2(B, A) * 180) / Math.PI;
  return [L, Math.hypot(A, B), h < 0 ? h + 360 : h];
}

/** OKLCH → sRGB (0..1, clamped). */
export function oklchToSrgb([L, C, h]: readonly number[]): RGB {
  const hr = (h * Math.PI) / 180;
  const A = C * Math.cos(hr);
  const B = C * Math.sin(hr);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    clamp01(toGamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)),
    clamp01(toGamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)),
    clamp01(toGamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)),
  ];
}

/** §1.3 red clamp: a saturated core (chroma > 0.12) hued within 0–40° or 340–360° is rotated to violet (300°). */
export function clampRed(rgb: readonly number[]): RGB {
  const [L, C, h] = srgbToOklch(rgb);
  if (C > 0.12 && (h <= 40 || h >= 340)) return oklchToSrgb([L, C, 300]);
  return [rgb[0], rgb[1], rgb[2]];
}

const cssRgb = (c: readonly number[]) =>
  `rgb(${Math.round(c[0] * 255)} ${Math.round(c[1] * 255)} ${Math.round(c[2] * 255)})`;

export interface ArcPalette {
  core: string;
  glow: string;
  /** The channel light's red, green and blue copies (`dispersion.ts`): they add back to `core` where they overlap. */
  chR: string;
  chG: string;
  chB: string;
  /** 0–255 triples for gradient stops that carry their own alpha. */
  coreRgb: readonly [number, number, number];
  glowRgb: readonly [number, number, number];
  /** The glow token's own alpha (it is a `color-mix(… transparent)`), folded into the glow passes. */
  glowAlpha: number;
  composite: GlobalCompositeOperation;
  dark: boolean;
  /** Coverage values for the flash budget (`flash-budget.ts` `colourValue`): glow, disc/streak light, core, fringes. */
  values: { glow: number; hot: number; core: number; fringe: number };
}

const FALLBACK_CORE: RGBA = [0.42, 0.3, 0.86, 1];
const FALLBACK_GLOW: RGBA = [0.5, 0.45, 1, 0.6];
const FALLBACK_BG: RGBA = [0.95, 0.96, 0.98, 1];

/** Build the palette from resolved token colours. Pure; exported for the tests. */
export function paletteFrom(core: RGBA, glow: RGBA, bg: RGBA): ArcPalette {
  const dark = luminance(bg) < 0.5;
  const c = clampRed(core);
  const g = clampRed(glow);
  // Dark: the split is of the bolt's own near-white light (the core token), not of its tinted glow: a blue glow has
  // almost no red in it to fringe, the hot channel does; the copies add (`lighter`). Light: `source-over` cannot add,
  // so the copies are hue fringes of the glow.
  const ch = dark ? channelColours(c) : fringeColours(g);
  const to255 = (v: readonly number[]) =>
    [Math.round(v[0] * 255), Math.round(v[1] * 255), Math.round(v[2] * 255)] as const;
  return {
    core: cssRgb(c),
    glow: cssRgb(g),
    chR: cssRgb(ch.r),
    chG: cssRgb(ch.g),
    chB: cssRgb(ch.b),
    coreRgb: to255(c),
    glowRgb: to255(g),
    glowAlpha: clamp01(glow[3] ?? 1),
    composite: dark ? 'lighter' : 'source-over',
    dark,
    values: {
      glow: colourValue(g, dark),
      // Dark: the disc and streaks are white. Light: they tint with the core, fading through the glow.
      hot: dark ? 1 : Math.max(colourValue(c, false), colourValue(g, false)),
      core: colourValue(c, dark),
      fringe: Math.max(colourValue(ch.r, dark), colourValue(ch.g, dark), colourValue(ch.b, dark)),
    },
  };
}

// ── The renderer ─────────────────────────────────────────────────────────────

export interface ArcRendererOptions {
  /** Renderer clock (ms). Default `performance.now()`. */
  now?: () => number;
  /** The shared flash ledger, asked before every re-strike. */
  ledger?: FlashLedger;
  /** Called once per arc at its first strike (the runtime emits `arc:strike` per endpoint from it). */
  onStrike?: (arc: LiveArc) => void;
}

export interface ArcRenderer {
  readonly canvas: HTMLCanvasElement;
  /** Add an admitted arc (see {@link admitArc}); starts the frame if none is pending. */
  add(arc: LiveArc): void;
  /** Scroll: every live arc fades over {@link SCROLL_FADE_MS}. */
  fade(): void;
  /** Kill every arc, cancel the frame and clear what was drawn. */
  clear(): void;
  /** Live arcs (flares included). */
  live(): number;
  /** Current composite mode (reads the theme if it is stale). */
  palette(): ArcPalette;
  now(): number;
  /** Clear, disconnect and remove the canvas. */
  dispose(): void;
}

const MAX_FLARES = 2;

export function createArcRenderer(doc: Document, opts: ArcRendererOptions = {}): ArcRenderer {
  const win = doc.defaultView!;
  const now = opts.now ?? (() => win.performance.now());
  const root = doc.documentElement;

  const canvas = doc.createElement('canvas');
  canvas.className = 'jelly-arc-layer';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.setAttribute('data-liquid-glass', 'off');
  canvas.setAttribute('data-jelly-arcs', 'off');
  canvas.width = 0;
  canvas.height = 0;
  // Probes: canvas fallback content is never rendered but does compute style, and inherits the theme's tokens.
  const probe = (token: string) => {
    const span = doc.createElement('span');
    span.style.color = `var(${token})`;
    canvas.appendChild(span);
    return span;
  };
  const probes = {
    core: probe('--site-arc-core'),
    glow: probe('--site-arc-glow'),
    bg: probe('--site-bg'),
  };
  doc.body.appendChild(canvas);

  let ctx: CanvasRenderingContext2D | null = null;
  let scale = 1;
  let sized = false;
  let driver: FrameDriver | null = null;
  let resizeTimer: ReturnType<typeof setTimeout> | undefined;
  let prev: Bounds | null = null;
  let disposed = false;
  let arcs: LiveArc[] = [];
  let themeStale = true;
  let pal: ArcPalette = paletteFrom(FALLBACK_CORE, FALLBACK_GLOW, FALLBACK_BG);

  const readTheme = () => {
    themeStale = false;
    try {
      const read = (el: HTMLElement, fallback: RGBA) =>
        resolveColor(win.getComputedStyle(el).color.trim(), fallback, doc);
      pal = paletteFrom(
        read(probes.core, FALLBACK_CORE),
        read(probes.glow, FALLBACK_GLOW),
        read(probes.bg, FALLBACK_BG),
      );
    } catch {
      /* keep the last palette */
    }
  };
  const themeObserver = new win.MutationObserver(() => {
    themeStale = true;
  });
  themeObserver.observe(root, {
    attributes: true,
    attributeFilter: ['class', 'style', 'data-theme'],
  });

  const fineQuery = (() => {
    try {
      return win.matchMedia(FINE_POINTER_QUERY);
    } catch {
      return null;
    }
  })();

  const size = () => {
    const coarse = !(fineQuery?.matches ?? true);
    const cap = coarse ? ARC_BUDGET.dprCapCoarse : ARC_BUDGET.dprCap;
    scale = Math.max(0.5, Math.min(win.devicePixelRatio || 1, cap));
    canvas.width = Math.max(1, Math.round(win.innerWidth * scale));
    canvas.height = Math.max(1, Math.round(win.innerHeight * scale));
    ctx = canvas.getContext('2d');
    sized = true;
    prev = null;
  };

  const setModal = () => {
    const modal = arcs.some((a) => a.modal);
    if (modal) canvas.setAttribute('data-layer', 'modal');
    else canvas.removeAttribute('data-layer');
  };

  const cancel = () => {
    driver?.stop();
    driver = null;
  };

  const wipe = () => {
    if (ctx && sized) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    prev = null;
  };

  const clear = () => {
    cancel();
    arcs = [];
    setModal();
    wipe();
  };

  const onResize = () => {
    if (resizeTimer !== undefined) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resizeTimer = undefined;
      if (disposed || !sized) return;
      // Mid-resize, live arcs are dropped: their viewport positions are stale.
      clear();
      size();
    }, RESIZE_DEBOUNCE_MS);
  };
  win.addEventListener('resize', onResize, { passive: true });
  win.visualViewport?.addEventListener('resize', onResize, { passive: true });

  /** Sample an arc, asking the ledger for each re-strike as it is reached. */
  const sample = (arc: LiveArc, t: number): ArcSample => {
    if (arc.shape === 'flare') return flareSample(t);
    let s = arcIntensity(arc.timeline, t);
    if (s.phase === 'strike' || s.phase === 'dip' || s.phase === 'afterglow') {
      while (arc.admitted <= s.strike && arc.admitted < arc.timeline.strikes.length) {
        const k = arc.admitted;
        if (k === 0 || !opts.ledger || opts.ledger.tryOnset(now())) {
          arc.admitted++;
          continue;
        }
        // Refused: skip this and every later re-strike; straight to afterglow.
        arc.timeline = truncateStrikes(arc.timeline, k);
        s = arcIntensity(arc.timeline, t);
        break;
      }
    }
    if (!arc.struck && s.strike >= 0) {
      arc.struck = true;
      opts.onStrike?.(arc);
    }
    return s;
  };

  const strokeLine = (c: CanvasRenderingContext2D, pts: Float32Array) => {
    if (pts.length < 4) return;
    c.beginPath();
    c.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
    c.stroke();
  };

  /** A contact glow on a rim (or the press flare): `alpha` is final (the flash budget's, already scaled). */
  const drawContact = (
    c: CanvasRenderingContext2D,
    x: number,
    y: number,
    nx: number,
    ny: number,
    radius: number,
    alpha: number,
  ) => {
    if (!(alpha > 0.002)) return;
    c.save();
    c.translate(x, y);
    // x along the normal, y along the rim tangent: squash the tangent so the glow sits ON the rim.
    c.rotate(Math.atan2(ny, nx));
    c.scale(1, CONTACT_GLOW.squash);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, radius);
    g.addColorStop(0, pal.glow);
    g.addColorStop(1, 'rgb(0 0 0 / 0)');
    c.globalAlpha = Math.min(1, alpha);
    c.fillStyle = g;
    c.beginPath();
    c.arc(0, 0, radius, 0, Math.PI * 2);
    c.fill();
    c.restore();
  };

  const stroke = (c: CanvasRenderingContext2D, pts: Float32Array, style: string, alpha: number) => {
    if (!(alpha > 0.002)) return;
    c.strokeStyle = style;
    c.globalAlpha = Math.min(1, alpha);
    strokeLine(c, pts);
  };

  /**
   * The channel's layered passes (`glow.ts`), the glow ones as three channel copies (`fx.channels`). Glow passes are
   * drawn × `fGlow`, the core and white-hot lines × `fLine` (the frame's flash budget, `flash-budget.ts`).
   */
  const drawChannel = (
    c: CanvasRenderingContext2D,
    main: Float32Array,
    channels: ArcFx['strikes'][number]['channels'] | undefined,
    energy: number,
    k: number,
    after: boolean,
    f: Factors,
    widthScale = 1,
  ) => {
    for (const p of glowPasses(pal.dark, energy, k)) {
      // The afterglow is the core cooling: no glow passes (§1.2).
      if (after && p.colour === 'glow') continue;
      c.lineWidth = p.width * widthScale;
      if (p.colour === 'glow') {
        const a = p.alpha * pal.glowAlpha * f.glow;
        const ch = channels?.find((q) => q.id === p.id);
        if (ch) {
          stroke(c, ch.r, pal.chR, a);
          stroke(c, main, pal.chG, a);
          stroke(c, ch.b, pal.chB, a);
        } else stroke(c, main, pal.glow, a);
      } else stroke(c, main, p.colour === 'white' ? WHITE : pal.core, p.alpha * f.line);
    }
  };

  /** The light carrying on into the gel at each struck end: per-colour refracted stubs, dimmer than in air. */
  const drawStubs = (
    c: CanvasRenderingContext2D,
    fx: ArcFx,
    energy: number,
    k: number,
    after: boolean,
    f: Factors,
  ) => {
    for (const p of glowPasses(pal.dark, energy, k)) {
      if (p.id === 'bloom' || (after && p.colour === 'glow')) continue;
      c.lineWidth = p.width * GEL_LIGHT.width;
      for (const st of fx.stubs) {
        if (p.colour === 'glow') {
          const a = p.alpha * pal.glowAlpha * GEL_LIGHT.glow * f.glow;
          stroke(c, st.r, pal.chR, a);
          stroke(c, st.g, pal.chG, a);
          stroke(c, st.b, pal.chB, a);
        } else if (p.colour === 'white') stroke(c, st.g, WHITE, p.alpha * GEL_LIGHT.hot * f.line);
        else stroke(c, st.g, pal.core, p.alpha * GEL_LIGHT.core * f.line);
      }
    }
  };

  /** The bolt itself: halo, channel, branches and the refracted stubs (impacts, rims and contacts are points). */
  const drawBolt = (c: CanvasRenderingContext2D, pl: Plan, f: Factors) => {
    const { arc, k, after } = pl;
    if (!(k > 0)) return;
    const e = arc.energy;
    if (arc.shape === 'fizz') {
      for (const sp of arc.sparks) drawChannel(c, sp, undefined, e, k, after, f);
      return;
    }
    const path = arc.paths[pl.idx];
    if (!path) return;
    const sfx = arc.fx?.strikes[pl.idx];
    const main = sfx?.main ?? path.points;
    if (!after && arc.halo) {
      c.lineWidth = HALO.width;
      stroke(c, main, pal.glow, HALO.alpha * k * pal.glowAlpha * f.glow);
    }
    drawChannel(c, main, sfx?.channels, e, k, after, f);
    if (!after) {
      for (const br of path.branches)
        drawChannel(c, br.points, undefined, e, k * br.intensity, false, f, BRANCH_WIDTH);
    }
    if (arc.fx) drawStubs(c, arc.fx, e, k, after, f);
  };

  // ── Points: contact glows, lit rims and impacts ────────────────────────────

  interface Point {
    x: number;
    y: number;
    /** Outward normal (the contact glow squashes across it, the streak runs along the tangent); absent at the press point. */
    nx?: number;
    ny?: number;
    rect?: RoundedRect | null;
    sample: ImpactSample | null;
    rim?: Float32Array;
    contactRadius: number;
    alphas: ImpactAlphas;
  }

  interface Plan {
    arc: LiveArc;
    k: number;
    after: boolean;
    idx: number;
  }

  interface Factors {
    /** Glow passes, stubs' glow, halo. */
    glow: number;
    /** Core and white-hot lines. */
    line: number;
  }

  const lengths = new WeakMap<Float32Array, number>();
  const lengthOf = (pts: Float32Array): number => {
    let L = lengths.get(pts);
    if (L === undefined) {
      L = 0;
      for (let i = 2; i < pts.length; i += 2)
        L += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
      lengths.set(pts, L);
    }
    return L;
  };

  /** One arc's share of the frame: its bolt's area layers, and its points' per-pixel profiles and area layers. */
  const planFrameArc = (
    arc: LiveArc,
    s: ArcSample,
    age: number,
    fade: number,
    out: {
      plans: Plan[];
      points: Point[];
      items: CentreItem[];
      scaled: AreaLayer[];
      lines: AreaLayer[];
    },
  ) => {
    const scale = arc.scale ?? 1;
    const k = s.I > 0 ? s.I * fade * scale : 0;
    const g = s.glow > 0 ? s.glow * fade * scale : 0;
    const after = s.phase === 'afterglow';
    const idx = Math.max(0, Math.min(arc.paths.length - 1, s.strike));
    out.plans.push({ arc, k, after, idx });
    const v = pal.values;
    if (k > 0) {
      const path = arc.paths[idx];
      const main = arc.fx?.strikes[idx]?.main ?? path?.points;
      const bolt = boltLayers({
        energy: arc.energy,
        k,
        dark: pal.dark,
        glowAlpha: pal.glowAlpha,
        coreValue: v.core,
        fringeValue: v.fringe,
        halo: arc.halo,
        after,
        mainLength:
          arc.shape === 'fizz'
            ? arc.sparks.reduce((n, sp) => n + lengthOf(sp), 0)
            : main
              ? lengthOf(main)
              : 0,
        branches: path
          ? path.branches.map((b) => ({ length: lengthOf(b.points), intensity: b.intensity }))
          : [],
        stubLengths: arc.fx ? arc.fx.stubs.map((st) => lengthOf(st.g)) : [],
      });
      out.scaled.push(...bolt.scaled);
      out.lines.push(...bolt.lines);
    }
    // The impact, from the first (admitted) strike on.
    const first = arc.timeline.strikes[0];
    const t = first ? age - first.at : -1;
    const iScale = scale * fade * (IMPACT_ENERGY_FLOOR + (1 - IMPACT_ENERGY_FLOOR) * arc.energy);
    const live = arc.shape === 'bolt' && !!arc.fx;
    const rimSample = live ? impactSample(t, { scale: iScale }) : null;
    const point = (p: Omit<Point, 'alphas'>, contactAlpha: number, rimK: number, tag: string) => {
      const it = impactItem({
        x: p.x,
        y: p.y,
        sample: p.sample,
        ring: !!p.rect,
        contactAlpha,
        rimK,
        dark: pal.dark,
        glowAlpha: pal.glowAlpha,
        values: { glow: v.glow, hot: v.hot },
        contactRadius: p.contactRadius,
        contactTag: tag,
      });
      if (it.centre.profiles.length === 0) return;
      out.points.push({ ...p, alphas: it.alphas });
      out.items.push(it.centre);
      out.scaled.push(...it.area);
    };
    for (const e of arc.contacts) {
      const rim =
        k > 0 && e.rect ? arc.fx?.rims.find((r) => r.x === e.x && r.y === e.y) : undefined;
      point(
        {
          x: e.x,
          y: e.y,
          nx: e.nx,
          ny: e.ny,
          rect: e.rect,
          sample: e.rect ? rimSample : null,
          rim: rim?.points,
          contactRadius: arc.contactRadius,
        },
        g,
        rim ? k : 0,
        arc.shape === 'flare' ? 'flare' : 'contact',
      );
    }
    if (live && arc.origin) {
      const o = impactSample(t, { scale: iScale, click: true });
      if (o) {
        point(
          { x: arc.origin.x, y: arc.origin.y, rect: arc.origin.rect, sample: o, contactRadius: 0 },
          0,
          0,
          'contact',
        );
      }
    }
  };

  const roundRectPath = (c: CanvasRenderingContext2D, r: RoundedRect) => {
    c.beginPath();
    if (typeof c.roundRect === 'function')
      c.roundRect(r.x, r.y, r.w, r.h, Math.min(r.r, r.w / 2, r.h / 2));
    else c.rect(r.x, r.y, r.w, r.h);
  };

  /** A gradient's colour stops from the flash budget's own stop list, so drawn and counted shapes are the same. */
  const fillStops = (
    grad: CanvasGradient,
    stops: readonly (readonly [number, number])[],
    rgb: readonly number[],
    alpha: number,
  ) => {
    for (const [o, v] of stops)
      grad.addColorStop(o, `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]} / ${alpha * v})`);
  };

  /** A soft elliptical streak through (0, 0) along +x: a radial gradient squashed across, hollow at the disc. */
  const streak = (
    c: CanvasRenderingContext2D,
    len: number,
    rgb: readonly number[],
    alpha: number,
  ) => {
    if (!(alpha > 0.002) || !(len > 1)) return;
    c.save();
    c.scale(1, IMPACT.streakWidthPx / (len / 2));
    const g = c.createRadialGradient(0, 0, 0, 0, 0, len / 2);
    fillStops(g, STREAK_STOPS, rgb, alpha);
    c.fillStyle = g;
    c.beginPath();
    c.arc(0, 0, len / 2, 0, Math.PI * 2);
    c.fill();
    c.restore();
  };

  /**
   * One point: its contact glow, its lit rim, and (when an impact is live) the shock ring clipped to the host, the
   * flash disc and its specular streaks. Every alpha is `impactItem`'s (the flash budget's own figure) × `f`.
   */
  const drawPoint = (c: CanvasRenderingContext2D, p: Point, f: number) => {
    const a = p.alphas;
    drawContact(c, p.x, p.y, p.nx ?? 0, p.ny ?? -1, p.contactRadius, a.contact * f);
    const [gr, gg, gb] = pal.glowRgb;
    if (p.rim && a.rim * f > 0.002) {
      const grad = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, RIM_LIGHT.spanPx / 2);
      fillStops(grad, RIM_STOPS, pal.glowRgb, a.rim * f);
      c.globalAlpha = 1;
      c.strokeStyle = grad;
      c.lineWidth = RIM_LIGHT.widthPx;
      strokeLine(c, p.rim);
      if (a.rimWhite * f > 0.002) {
        const hot = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, RIM_LIGHT.spanPx / 4);
        fillStops(hot, RIM_STOPS, WHITE_RGB, a.rimWhite * f);
        c.strokeStyle = hot;
        c.lineWidth = RIM_LIGHT.widthPx / 2;
        strokeLine(c, p.rim);
      }
    }
    const sm = p.sample;
    if (!sm) return;
    c.globalAlpha = 1;
    if (p.rect && a.ring * f > 0.002) {
      c.save();
      roundRectPath(c, p.rect);
      c.clip();
      c.beginPath();
      c.arc(p.x, p.y, sm.ringRadius, 0, Math.PI * 2);
      c.lineWidth = sm.ringWidth;
      c.strokeStyle = pal.glow;
      c.globalAlpha = Math.min(1, a.ring * f);
      c.stroke();
      c.restore();
      c.globalAlpha = 1;
    }
    const disc = a.disc * f;
    if (!(disc > 0.002)) return;
    const hot: readonly number[] = pal.dark ? WHITE_RGB : pal.coreRgb;
    const grad = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, sm.flashRadius);
    grad.addColorStop(
      IMPACT_STOPS[0][0],
      `rgb(${hot[0]} ${hot[1]} ${hot[2]} / ${disc * IMPACT_STOPS[0][1]})`,
    );
    grad.addColorStop(IMPACT_STOPS[1][0], `rgb(${gr} ${gg} ${gb} / ${disc * IMPACT_STOPS[1][1]})`);
    grad.addColorStop(IMPACT_STOPS[2][0], `rgb(${gr} ${gg} ${gb} / 0)`);
    c.fillStyle = grad;
    c.beginPath();
    c.arc(p.x, p.y, sm.flashRadius, 0, Math.PI * 2);
    c.fill();
    c.save();
    c.translate(p.x, p.y);
    // Along the rim tangent (perpendicular to the normal); the press point streaks horizontally, like a lens.
    c.rotate(p.nx === undefined ? 0 : Math.atan2(p.ny ?? 0, p.nx) + Math.PI / 2);
    streak(c, sm.streakLength, hot, a.streak * f);
    c.rotate(Math.PI / 2);
    streak(c, sm.streakLength * IMPACT.crossStreakShare, hot, a.cross * f);
    c.restore();
  };

  /** One frame. True keeps the driver awake (arcs remain). */
  const frame = (): boolean => {
    if (disposed) return false;
    const t = now();
    const c = ctx;
    const plan = {
      plans: [] as Plan[],
      points: [] as Point[],
      items: [] as CentreItem[],
      scaled: [] as AreaLayer[],
      lines: [] as AreaLayer[],
    };
    const keep: LiveArc[] = [];
    let cur: Bounds | null = null;
    for (const arc of arcs) {
      const age = t - arc.start;
      const fade =
        arc.fadeFrom === undefined ? 1 : Math.max(0, 1 - (t - arc.fadeFrom) / SCROLL_FADE_MS);
      if (fade <= 0 || age >= arcLife(arc)) continue;
      keep.push(arc);
      if (age < 0) continue;
      planFrameArc(arc, sample(arc, age), age, fade, plan);
      cur = union(cur, arc.bounds);
    }
    const modalBefore = arcs.some((a) => a.modal);
    arcs = keep;
    if (modalBefore !== arcs.some((a) => a.modal)) setModal();
    if (c) {
      const dirty = union(prev, cur);
      c.setTransform(scale, 0, 0, scale, 0, 0);
      if (dirty) {
        c.clearRect(dirty.x0, dirty.y0, dirty.x1 - dirty.x0, dirty.y1 - dirty.y0);
      }
      // The frame's flash budget (flash-budget.ts, WCAG 2.3.1): one area scale for everything the frame draws, and the
      // per-pixel cap over every point's overlapping layers.
      const fit = fitFrame(plan.scaled, plan.lines, pal.dark);
      const f: Factors = { glow: fit.scale, line: fit.lineScale };
      const caps = centreScales(plan.items, pal.dark);
      c.globalCompositeOperation = pal.composite;
      c.lineJoin = 'round';
      c.lineCap = 'round';
      for (const pl of plan.plans) drawBolt(c, pl, f);
      plan.points.forEach((p, i) => drawPoint(c, p, Math.min(fit.scale, caps[i])));
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'source-over';
    }
    prev = cur;
    if (arcs.length > 0) return true;
    if (prev && c) {
      // Nothing left: clear what the last frame drew and sleep.
      c.setTransform(scale, 0, 0, scale, 0, 0);
      c.clearRect(prev.x0, prev.y0, prev.x1 - prev.x0, prev.y1 - prev.y0);
      prev = null;
    }
    return false;
  };

  const request = () => {
    if (disposed || arcs.length === 0) return;
    driver ??= drive(frame, { order: ARC_FRAME_ORDER }, win as Window & typeof globalThis);
    driver.wake();
  };

  return {
    canvas,
    add(arc) {
      if (disposed) return;
      if (themeStale) readTheme();
      if (!sized) size();
      arc.scale ??= arcIntensityScale(jellyMotionLevel(doc));
      if (arc.shape === 'flare') {
        const flares = arcs.filter((a) => a.shape === 'flare');
        if (flares.length >= MAX_FLARES) arcs = arcs.filter((a) => a !== flares[0]);
      } else {
        const bolts = arcs.filter((a) => a.shape !== 'flare');
        if (bolts.length >= ARC_BUDGET.maxLiveArcs) {
          // Oldest ambient first, else the oldest of any kind.
          const drop = bolts.find((a) => a.emitKind === 'ambient') ?? bolts[0];
          arcs = arcs.filter((a) => a !== drop);
        }
      }
      arcs.push(arc);
      setModal();
      request();
    },
    fade() {
      const t = now();
      for (const arc of arcs) if (arc.fadeFrom === undefined) arc.fadeFrom = t;
    },
    clear,
    live: () => arcs.length,
    palette() {
      if (themeStale) readTheme();
      return pal;
    },
    now,
    dispose() {
      if (disposed) return;
      clear();
      disposed = true;
      themeObserver.disconnect();
      if (resizeTimer !== undefined) clearTimeout(resizeTimer);
      win.removeEventListener('resize', onResize);
      win.visualViewport?.removeEventListener('resize', onResize);
      canvas.remove();
    },
  };
}
