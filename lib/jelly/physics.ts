/**
 * The soft-body document service: every eligible element is jelly under the pointer
 * (docs/plans/plasmatic-jelly/02-soft-body.md, master plan R11/R12).
 *
 * Pointer input arrives through the ONE window listener set (`pointer.ts`, `onJellyPointer`) and frames through the
 * ONE jelly frame driver (`frame.ts`, `drive(fn, { order: 10 })` — before the engine draws what it produces); the
 * driver is awake only while a body, dent or plasma level is moving. It absorbs the old press layer (`hooks/useFluidPress.ts`, deleted): the
 * `data-fluid-press*` attributes stay accepted aliases (`soft-policy.ts`), and a centre press still lands exactly on
 * the legacy `0.96 / 0.985 / 1.028` scales.
 *
 * ## Two tiers (02 D1)
 *
 * - **Tier E (envelope)** — four springs (`sx`, `sy`, `tx`, `ty`, `envelope.ts`) written to the independent CSS
 *   `translate` and `scale` properties, composed on the element's own Tailwind base (`compose.ts`). Hover plumps and
 *   leans cards / dents controls (fine pointers only), press squashes toward the contact, release wobbles back with
 *   the velocity it had, drag stretches along the motion.
 * - **Tier L (lattice)** — for hosts the glass engine admitted (`data-liquid-canvas="on"`), the service sets the
 *   lattice's input through `lattice-inputs.ts` (hover pull, press dent, drag pseudo-force, impulses). The engine owns
 *   and steps the lattice inside its own frame (02 D9), so the rim is never a frame behind the draw. Panes, chrome,
 *   overlays and fields get Tier L only — their hosts never move; admitted cards and controls get both.
 *
 * ## Cost rules (02 §4)
 *
 * - **Idle at rest.** A frame is scheduled only by input (or an arc strike / drag report) and re-scheduled while any
 *   body is awake. A page with no pointer activity runs no loop; a HELD body (hovered, pressed, dragged) that has
 *   arrived at its pose runs none either until the pointer moves again. A body nobody holds has exactly one exit —
 *   `envelopeAsleep` (springs at rest AND plastic memory gone), where it is cleared — and keeps its frames until then.
 * - **Read → step → write.** Every frame reads first (activation rects, the one `getComputedStyle` per activation,
 *   rect refreshes after a scroll/resize, the inline `transform` string for framer ownership), then steps with no
 *   DOM access, then writes `translate` / `scale` / `will-change` (+ corner-flex `border-radius` on small controls)
 *   and the `data-jelly-body` attribute. Writes below 0.0005 scale / 0.05px are skipped.
 * - **No geometry reads per pointer event.** `pointermove` stores coordinates and asks for a frame; `pointerover`
 *   does one `closest()` and enqueues an activation. Rects are read at activation and after a scroll/resize only.
 * - **Bounded.** At most `bodyCap()` Tier E bodies (≤ 12 fine / ≤ 6 coarse, never above `jellyBudget().bodies`):
 *   nudged bodies go first, then hovered, then released, lowest energy first; pressed and dragged bodies are never
 *   evicted. At most `jellyBudget().lattices` lattice drives at once.
 * - **Cleared at sleep.** A body at rest with no plastic memory gets its inline values restored, `will-change` and
 *   `data-jelly-body` removed, and leaves the active set.
 *
 * ## Press = liquid-glass dent (#989)
 *
 * A press sinks a Gaussian bowl under the contact (host-local px, σ = clamp(`DENT.radiusFrac` · short side)), its
 * depth easing to `DENT.depthPx` on the dent spring (`envelope.ts` `DENT_SPRING`, ζ = `DENT.damping`), published each
 * frame it changes through `setDent` for the engine's rim indent, glow and light dot. A mouse or pen press stays down
 * past the slop and the dent slides with the pointer; off the element the overshoot becomes a rubber-band stretch
 * (`rubberBand`, ≤ `DENT.rubberMaxPx`) published as `stretchX/Y`, and the envelope stretches toward it inside
 * `MOTION_BOUNDS`. Admitted slabs get the lattice press drive at the dent centre (outline indent ≈ `DENT.indentPx`,
 * far side bulging). The content under the dent refracts through `lens.ts` — one host at a time, material fully on
 * only, style restored exactly when the dent has eased out (then `setDent(el, null)`).
 *
 * ## Events
 *
 * Emits `plasma:level` `{el, level}` (#989): `PLASMA.wake` while hovered (fine pointer, full mode), `PLASMA.press`
 * while pressed or dragged, on keyboard focus-visible and briefly on click, eased back with `PLASMA.easeMs`, at most
 * once per frame per element and only when it moved ≥ 0.02 (or arrived). Listens for `charge:attract` (Coulomb, #989)
 * and turns it into one bounded tug (≤ `MOTION_BOUNDS.nudgePx`, per nudge period) on a body whose envelope is awake;
 * a resting body passes it to its support and does not move.
 *
 * Emits `body:release` `{el, x, y, energy ∈ [0,1]}` (arcs charge + material pulse) and `drag:start` / `drag:end` on the
 * shared `jellyBus`. Listens for `arc:strike` and gives the struck element a ≤ 1.5px impulse (R12). A strong release
 * nudges at most 4 neighbours within 24px by ≤ 1.5px, translate only, never chaining, never right after a scroll (02 §2).
 *
 * ## Degradation
 *
 * `jellyMode().deform` and `softFeatures(jellyTier(), jellyMotionLevel())` decide what may move: `off` (hidden,
 * print, forced colours, game playing) → nothing; `press` (perf-lite, reduced transparency, high contrast, `still`)
 * → isotropic-ish press with a critically damped release, no hover, nudge, corner flex or lattice. Re-evaluated on
 * every `onJellyEnvChange`.
 *
 * Client-only; nothing runs at import. Mounted once per document by the shared idle callback in
 * `hooks/useLiquidInteractions.ts`.
 */

import { VelocityTracker } from '@/lib/fluid';

import { jellyBus } from './bus';
import { drive, type FrameDriver } from './frame';
import { createJellyLens, type JellyLens } from './lens';
import { onJellyPointer } from './pointer';
import {
  FramerWatch,
  IDENTITY_BASE,
  composeScale,
  composeTranslate,
  hasInlineTransformOffset,
  readBase,
  type ComposeBase,
} from './compose';
import {
  beginPlastic,
  cornerFlexRadii,
  createDentSprings,
  createEnvelope,
  dentContact,
  dentRadius,
  dentSettled,
  dragTarget,
  envelopeAsleep,
  envelopeSettled,
  hoverKick,
  hoverTarget,
  nudgeEnvelope,
  phaseSprings,
  pressTarget,
  renderEnvelope,
  restTarget,
  stepDent,
  stepEnvelope,
  stretchTarget,
  type DentSprings,
  type EnvelopeBody,
  type EnvelopePose,
  type EnvelopeSize,
  type UnitOffset,
} from './envelope';
import { latticeImpulse, setDent, setLatticeDrive, type JellyDent } from './lattice-inputs';
import type { LatticeInput } from './lattice';
import {
  SOFT_BODY,
  SOFT_BODY_SELECTOR,
  bodyCap,
  bodyEnergy,
  pickEvictions,
  pickNudgeTargets,
  resolveSoftPolicy,
  softFeatures,
  type BodyPhase,
  type ElementTraits,
  type NudgeRect,
  type SoftFeatures,
  type SoftPolicy,
} from './soft-policy';
import {
  DENT,
  FINE_POINTER_QUERY,
  JELLY_LAYOUT,
  MOTION_BOUNDS,
  PLASMA,
  OPT_OUT_SCOPE_SELECTOR,
  OPT_OUT_SELECTOR,
  jellyBudget,
  jellyMode,
  jellyMotionLevel,
  jellyTier,
  onJellyEnvChange,
} from './tiers';

/* ── Constants ───────────────────────────────────────────────────────────── */

/** Fields keep native editing: a press that lands in one never squashes the card around it. */
const FIELD_SELECTOR = 'input,textarea,select,[contenteditable="true"]';
/** Ancestors whose subtree belongs to a gesture or a self-animating stage (02 §3.2 Always excluded). */
const EXCLUDED_ANCESTOR =
  '[data-gesture]:not([data-gesture="hold"]),.radial-globe__stage,.eversion-overlay,.evert-ghost';
/** Running text: an untagged link inside one of these is a prose link and never a body. */
const PROSE_SELECTOR = 'p,blockquote,figcaption,dd,.prose';
/** A link that fills its `[data-evert]` card and stands for it (components/radial/WheelCard.tsx). */
const DELEGATE_ATTR = 'data-evert-delegate';
/** The engine marks an admitted shader slab with this attribute (`lib/liquid/glass/engine.ts`). */
const ADMITTED_ATTR = 'data-liquid-canvas';
/** Attributes `resolveSoftPolicy` reads. */
const TRAIT_ATTRS = [
  'data-jelly',
  'data-fluid-press',
  'data-jelly-scale',
  'data-fluid-scale',
  'data-slot',
  'data-evert',
  'data-liquid-surface',
  'data-liquid-glass',
  'data-gesture',
  'draggable',
  'href',
] as const;
/** A pointer that has not moved for this long has stopped: the drag velocity reads 0. */
const DRAG_IDLE_MS = 60;
/** Release energy (px) assumed for a lattice-only press, scaled by how long it was held (0..180ms). */
const LATTICE_RELEASE_PX = 3;
/** Arc strike / nudge impulse ceiling (R12). */
const STRIKE_PX = MOTION_BOUNDS.nudgePx;
/** A Coulomb pull lands on a body at most once per nudge period (`jellyNudge`, 0.4s): one bounded tug at a time. */
const ATTRACT_INTERVAL_MS = 400;
/** Dent publish threshold (px): smaller changes are not re-published. */
const DENT_EPSILON = 0.01;
/** Below this depth with no stretch, a released dent is gone. */
const DENT_GONE_PX = 0.02;
/** Plasma: emit when the level moved at least this far since the last emission (or arrived at its target). */
const PLASMA_STEP = 0.02;
/** Plasma: within this of the target, snap to it. */
const PLASMA_SNAP = 0.005;
/** The driver order of the soft body: before the engine (20) that draws its dent and lattice, and the arcs (30). */
const PHYSICS_ORDER = 10;

/* ── Types ───────────────────────────────────────────────────────────────── */

type Rect = NudgeRect;

interface Press {
  pointerId: number;
  /** Contact point (client px). */
  ox: number;
  oy: number;
  /** Current pointer (client px): the dent slides with it. */
  cx: number;
  cy: number;
  at: number;
}

/** The #989 press dent of one body (host-local px; see `JellyDent`). */
interface Dent {
  springs: DentSprings;
  x: number;
  y: number;
  radius: number;
  /** What was last handed to `setDent` (null = nothing published yet). */
  published: JellyDent | null;
}

/** Dormant plasma of one host (#989): eased toward its target and announced on `plasma:level`. */
interface Plasma {
  level: number;
  emitted: number;
  /** A click holds the level at `PLASMA.press` until this time (ms). */
  flashUntil: number;
}

interface Drag {
  /** Pointer that drives a delegated `data-jelly="drag"` body; `null` for a `reportJellyDrag` owner. */
  pointerId: number | null;
  tx: VelocityTracker;
  ty: VelocityTracker;
  /** Reported velocity (external owners) — px/s. */
  vx: number;
  vy: number;
  lastMove: number;
  /** Previous frame's velocity, for the lattice pseudo-force. */
  pvx: number;
  pvy: number;
}

interface Body {
  el: HTMLElement;
  traits: ElementTraits;
  policy: SoftPolicy;
  env: EnvelopeBody;
  /** Rest rect in client px; `null` until the first read phase. */
  rect: Rect | null;
  epoch: number;
  ready: boolean;
  base: ComposeBase;
  framer: FramerWatch | null;
  framerOwned: boolean;
  /** Corner-flex rest radius (px) and inline value to restore. */
  radius: number;
  inlineRadius: string;
  inlineWillChange: string;
  phase: BodyPhase;
  hovering: boolean;
  kick: { vx: number; vy: number } | null;
  press: Press | null;
  pressPose: EnvelopePose | null;
  drag: Drag | null;
  /** The caller owns the translation (useFluidDrag): never write `translate`. */
  externalDrag: boolean;
  wantCandidates: boolean;
  candidates: { key: HTMLElement; rect: NudgeRect }[];
  /** Impulses that arrived before the body was ready. */
  impulses: { dx: number; dy: number; peak: number }[];
  /** A release that happened before the first read (quick tap). */
  pendingRelease: { x: number; y: number; held: number; cancelled: boolean } | null;
  written: boolean;
  last: EnvelopePose;
  cornerWritten: boolean;
  lastRadii: string;
  latticeDrive: LatticeInput | null;
  /** The target the springs head for this frame (kept for the settle test). */
  settled: boolean;
  /** The press dent while pressed or easing out; `null` once it has gone. */
  dent: Dent | null;
  /** The lens may refract this host (no stylesheet filter of its own); decided at activation. */
  lensOk: boolean;
  /** Last accepted `charge:attract` (ms). */
  attractAt: number;
}

/* ── Module-level handle (for drag owners) ───────────────────────────────── */

interface Service {
  doc: Document;
  drag(el: HTMLElement, vx: number, vy: number, phase: 'move' | 'end'): void;
}

let service: Service | null = null;
const reportedDrags = new WeakSet<Element>();

/**
 * Drag owners (`hooks/useFluidDrag.ts`) report host motion so jelly can stretch it (02 §3.3). The owner keeps the
 * drag translation itself; jelly only adds the deformation — envelope stretch on a Tier E host (scale only), the
 * lattice pseudo-force on an admitted slab. Emits `drag:start` on the first move and `drag:end` at the end, whether
 * or not the service is installed (the arcs listen too).
 */
export function reportJellyDrag(
  el: HTMLElement,
  vx: number,
  vy: number,
  phase: 'move' | 'end',
): void {
  if (phase === 'move' && !reportedDrags.has(el)) {
    reportedDrags.add(el);
    jellyBus.emit('drag:start', { el });
  }
  service?.drag(el, vx, vy, phase);
  if (phase === 'end' && reportedDrags.has(el)) {
    reportedDrags.delete(el);
    jellyBus.emit('drag:end', { el });
  }
}

/* ── Installation ────────────────────────────────────────────────────────── */

/**
 * Install the soft-body service on `doc`. Returns the teardown, which removes every listener, cancels the frame and
 * restores every inline style it wrote. Installing twice on the same document returns a no-op for the second call.
 */
export function installJellyPhysics(
  doc: Document = document,
  opts: { lens?: JellyLens } = {},
): () => void {
  const win = doc.defaultView as (Window & typeof globalThis) | null;
  if (!win || (service && service.doc === doc)) return () => {};

  const bodies = new Map<HTMLElement, Body>();
  const traitCache = new WeakMap<Element, { gen: number; traits: ElementTraits }>();
  let traitGen = 0;
  let epoch = 0;
  const plasma = new Map<HTMLElement, Plasma>();
  /** The host with keyboard focus-visible (plasma at press level), and the last input's modality. */
  let focusHost: HTMLElement | null = null;
  let keyboardModality = false;
  const lens = opts.lens ?? createJellyLens(doc);
  let lastScroll = -Infinity;

  const pointer = { x: 0, y: 0, t: 0, fine: false, inDoc: false };
  const pvx = new VelocityTracker();
  const pvy = new VelocityTracker();

  const now = () => win.performance?.now?.() ?? Date.now();

  const fineMq = (() => {
    try {
      return win.matchMedia?.(FINE_POINTER_QUERY) ?? null;
    } catch {
      return null;
    }
  })();

  // ── Environment ──────────────────────────────────────────────────────────

  let features: SoftFeatures = softFeatures('off', 'still');
  let cap = 0;
  let latticeCap = 0;
  let deformOff = true;
  /** `jellyMode().deform === 'full'`: the material is on, so the lens may refract (press mode keeps rim + indent). */
  let deformFull = false;

  const evaluate = () => {
    const mode = jellyMode({ doc, win });
    deformOff = mode.deform === 'off';
    deformFull = mode.deform === 'full';
    const tier = jellyTier({ doc, win });
    const motion = jellyMotionLevel(doc);
    // `press` mode is perf-lite / material-off / `still`, which `softFeatures` already degrades to press-only.
    features = softFeatures(tier, motion);
    const budget = jellyBudget({ doc, win });
    const coarse = !(fineMq?.matches ?? false);
    cap = deformOff
      ? 0
      : Math.min(bodyCap(features, coarse), budget.bodies, JELLY_LAYOUT.bodyBudget);
    latticeCap = deformOff || !features.lattice ? 0 : Math.min(features.lattices, budget.lattices);
    traitGen++;
    if (deformOff) {
      clearAll();
      clearPlasma();
    } else enforceCap();
  };

  // ── Traits and policy ────────────────────────────────────────────────────

  const traitsFor = (el: HTMLElement): ElementTraits => {
    const hit = traitCache.get(el);
    let base: ElementTraits;
    if (hit && hit.gen === traitGen) base = hit.traits;
    else {
      const attrs: Record<string, string | undefined> = {};
      for (const name of TRAIT_ATTRS) {
        const v = el.getAttribute(name);
        if (v !== null) attrs[name] = v;
      }
      const tag = el.tagName.toLowerCase();
      const explicit = attrs['data-jelly'] !== undefined || attrs['data-fluid-press'] !== undefined;
      const slot = attrs['data-slot'];
      const classes = Array.from(el.classList ?? []);
      base = {
        tag,
        role: el.getAttribute('role'),
        classes,
        attrs,
        editable:
          tag === 'input' ||
          tag === 'textarea' ||
          tag === 'select' ||
          el.getAttribute('contenteditable') === 'true' ||
          slot === 'input' ||
          slot === 'textarea',
        scopeOff:
          el.matches(OPT_OUT_SELECTOR) ||
          el.closest(OPT_OUT_SCOPE_SELECTOR) !== null ||
          (!explicit && el.parentElement?.closest(EXCLUDED_ANCESTOR) != null),
        proseLink:
          tag === 'a' &&
          !explicit &&
          !classes.some((c) => c.startsWith('glass-')) &&
          el.parentElement?.closest(PROSE_SELECTOR) != null,
        overhangingChildren: Array.from(el.children ?? []).some(
          (c) => c.classList?.contains('absolute') || c.hasAttribute('data-badge'),
        ),
      };
      traitCache.set(el, { gen: traitGen, traits: base });
    }
    // Dynamic every activation: disabled state, engine admission, an inline framer offset.
    return {
      ...base,
      disabled:
        el.hasAttribute('disabled') ||
        el.getAttribute('aria-disabled') === 'true' ||
        el.closest('[inert]') !== null,
      admitted: el.getAttribute(ADMITTED_ATTR) === 'on',
      inlineTransformOffset: hasInlineTransformOffset(el.style?.transform),
    };
  };

  const policyFor = (traits: ElementTraits): SoftPolicy => resolveSoftPolicy(traits, { features });

  const moves = (p: SoftPolicy) => p.envelope || p.lattice;

  // ── Body lifecycle ──────────────────────────────────────────────────────

  const create = (el: HTMLElement): Body | null => {
    if (deformOff) return null;
    const traits = traitsFor(el);
    const policy = policyFor(traits);
    if (policy.mode === 'off' || !moves(policy)) return null;
    const body: Body = {
      el,
      traits,
      policy,
      env: createEnvelope(),
      rect: null,
      epoch: -1,
      ready: false,
      base: IDENTITY_BASE,
      framer: null,
      framerOwned: false,
      radius: 0,
      inlineRadius: '',
      inlineWillChange: '',
      phase: 'hover',
      hovering: false,
      kick: null,
      press: null,
      pressPose: null,
      drag: null,
      externalDrag: false,
      wantCandidates: false,
      candidates: [],
      impulses: [],
      pendingRelease: null,
      written: false,
      last: { sx: 1, sy: 1, tx: 0, ty: 0 },
      cornerWritten: false,
      lastRadii: '',
      latticeDrive: null,
      settled: false,
      dent: null,
      lensOk: false,
      attractAt: -Infinity,
    };
    bodies.set(el, body);
    return body;
  };

  const bodyFor = (el: HTMLElement): Body | null => bodies.get(el) ?? create(el);

  /** Restore everything the service wrote on `b.el` and forget the body. */
  const clear = (b: Body) => {
    const s = b.el.style;
    if (b.written) {
      if (!b.externalDrag) s.translate = b.base.inlineTranslate;
      s.scale = b.base.inlineScale;
      s.willChange = b.inlineWillChange;
      b.el.removeAttribute('data-jelly-body');
    }
    if (b.cornerWritten) s.borderRadius = b.inlineRadius;
    if (b.press) b.el.removeAttribute('data-jelly-active');
    if (b.latticeDrive) setLatticeDrive(b.el, null);
    if (b.dent) {
      if (b.dent.published) setDent(b.el, null);
      lens.release(b.el);
      b.dent = null;
    }
    bodies.delete(b.el);
  };

  function clearAll() {
    for (const b of [...bodies.values()]) clear(b);
  }

  const energyOf = (b: Body): number =>
    b.rect
      ? bodyEnergy(
          b.env.sx.value,
          b.env.sy.value,
          b.env.tx.value,
          b.env.ty.value,
          b.rect.w,
          b.rect.h,
        )
      : 0;

  function enforceCap() {
    const envBodies = [...bodies.values()].filter((b) => b.policy.envelope);
    if (envBodies.length <= cap) return;
    const evict = pickEvictions(
      envBodies.map((b) => ({ key: b, phase: b.phase, energy: energyOf(b) })),
      cap,
    );
    for (const b of evict) clear(b);
  }

  // ── Frame scheduling: one driver on the shared jelly frame (`frame.ts`) ─

  const driver: FrameDriver = drive((ts, dtMs) => frame(ts, dtMs), { order: PHYSICS_ORDER }, win);

  const requestFrame = () => {
    if (bodies.size === 0 && plasma.size === 0) return;
    driver.wake();
  };

  // ── Plasma (#989): dormant, woken by hover, brightened by press / focus-visible / click ──

  const emitPlasma = (el: HTMLElement, level: number) => {
    if (jellyBus.listenerCount('plasma:level') > 0) jellyBus.emit('plasma:level', { el, level });
  };

  const plasmaFor = (el: HTMLElement): Plasma => {
    let p = plasma.get(el);
    if (!p) plasma.set(el, (p = { level: PLASMA.rest, emitted: PLASMA.rest, flashUntil: 0 }));
    return p;
  };

  function clearPlasma() {
    for (const [el, p] of plasma) if (p.emitted !== PLASMA.rest) emitPlasma(el, PLASMA.rest);
    plasma.clear();
    focusHost = null;
  }

  /** The host whose plasma an event on `target` wakes: a soft body that is not off, disabled or opted out. */
  const plasmaHost = (target: EventTarget | null): HTMLElement | null => {
    if (deformOff) return null;
    const el = bodyElFrom(target);
    if (!el) return null;
    const traits = traitsFor(el);
    if (traits.disabled || traits.scopeOff) return null;
    return policyFor(traits).mode === 'off' ? null : el;
  };

  const plasmaTarget = (el: HTMLElement, p: Plasma, t: number): number => {
    if (deformOff) return PLASMA.rest;
    const b = bodies.get(el);
    if (b?.press || b?.drag || el === focusHost || p.flashUntil > t) return PLASMA.press;
    if (b?.hovering && features.hover && pointer.fine) return PLASMA.wake;
    return PLASMA.rest;
  };

  /**
   * Ease every plasma level toward its target (time constant `PLASMA.easeMs`) and announce it on `plasma:level` — at
   * most once per frame per element, and only when it moved ≥ 0.02 since the last announcement or arrived at its
   * target. Returns whether any level still needs frames.
   */
  const stepPlasma = (dtS: number, t: number): boolean => {
    let busy = false;
    const k = 1 - Math.exp(-(dtS * 1000) / PLASMA.easeMs);
    for (const [el, p] of [...plasma]) {
      const target = plasmaTarget(el, p, t);
      p.level += (target - p.level) * k;
      if (Math.abs(target - p.level) < PLASMA_SNAP) p.level = target;
      if (
        Math.abs(p.level - p.emitted) >= PLASMA_STEP ||
        (p.level === target && p.emitted !== target)
      ) {
        p.emitted = p.level;
        emitPlasma(el, p.level);
      }
      if (p.level === PLASMA.rest && target === PLASMA.rest && p.emitted === PLASMA.rest) {
        plasma.delete(el);
        continue;
      }
      if (p.level !== target || p.flashUntil > t) busy = true;
    }
    return busy;
  };

  // ── Activation entry points ─────────────────────────────────────────────

  const hoverAllowed = () =>
    features.hover && (fineMq?.matches ?? false) && now() - lastScroll >= SOFT_BODY.scrollQuietMs;

  const bodyElFrom = (target: EventTarget | null): HTMLElement | null => {
    const t = target as Element | null;
    if (!t || typeof t.closest !== 'function') return null;
    const el = t.closest<HTMLElement>(SOFT_BODY_SELECTOR);
    // A card's body link (`data-evert-delegate`) fills the card and stands for it, as it does for the eversion layer
    // (`controlAt` in lib/evert-auto.ts): the CARD is the soft body, so host, glass and text move together. The link
    // as a body of its own slid the text and hit area off a still card's glass. Sibling actions keep their own body.
    if (el?.hasAttribute(DELEGATE_ATTR)) {
      const host = el.parentElement?.closest<HTMLElement>('[data-evert]');
      if (host?.matches(SOFT_BODY_SELECTOR)) return host;
    }
    return el;
  };

  const impulse = (b: Body, dx: number, dy: number, peak: number) => {
    if (!b.policy.envelope) return;
    if (b.ready) nudgeEnvelope(b.env, dx, dy, peak);
    else b.impulses.push({ dx, dy, peak });
    if (b.phase === 'hover' && !b.hovering && !b.press) b.phase = 'nudge';
  };

  /** Neighbour nudge or arc strike on `el`: envelope impulse (translate only) and/or a lattice edge impulse. */
  const strike = (el: HTMLElement, dx: number, dy: number, peak: number) => {
    if (deformOff || !features.wobble || !(peak > 0)) return;
    if (latticeCap > 0 && el.getAttribute(ADMITTED_ATTR) === 'on')
      latticeImpulse(el, dx, dy, Math.min(2, peak));
    const existing = bodies.get(el);
    const b = existing ?? create(el);
    if (!b) return;
    if (!existing) b.phase = 'nudge';
    impulse(b, dx, dy, Math.min(STRIKE_PX, peak));
    enforceCap();
    requestFrame();
  };

  // ── Pointer listeners (no geometry reads in any of them) ────────────────

  const trackPointer = (e: PointerEvent) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.t = now();
    pointer.fine = e.pointerType !== 'touch';
    pointer.inDoc = true;
  };

  const onOver = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return;
    trackPointer(e);
    if (!hoverAllowed()) return;
    const el = bodyElFrom(e.target);
    if (!el) return;
    const existing = bodies.get(el);
    if (existing?.hovering) return;
    const b = existing ?? create(el);
    if (!b) return;
    b.hovering = true;
    if (!b.press && !b.drag) b.phase = 'hover';
    b.kick = { vx: pvx.get(), vy: pvy.get() };
    plasmaFor(el);
    enforceCap();
    requestFrame();
  };

  const onOut = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return;
    if (e.relatedTarget === null) {
      // Left the window: no further moves will arrive to decide the hysteresis.
      pointer.inDoc = false;
      for (const b of bodies.values()) b.hovering = false;
    }
    requestFrame();
  };

  const startDrag = (b: Body, pointerId: number | null) => {
    b.drag = {
      pointerId,
      tx: new VelocityTracker(),
      ty: new VelocityTracker(),
      vx: 0,
      vy: 0,
      lastMove: now(),
      pvx: 0,
      pvy: 0,
    };
    b.phase = 'dragged';
  };

  const onDown = (e: PointerEvent) => {
    keyboardModality = false;
    if (e.button > 0) return;
    trackPointer(e);
    const el = bodyElFrom(e.target);
    if (!el) return;
    const field = (e.target as Element).closest?.(FIELD_SELECTOR);
    if (field && field !== el && el.contains(field)) return;
    const b = bodyFor(el);
    if (!b) return;
    b.press = {
      pointerId: e.pointerId,
      ox: e.clientX,
      oy: e.clientY,
      cx: e.clientX,
      cy: e.clientY,
      at: now(),
    };
    b.phase = 'pressed';
    b.pendingRelease = null;
    b.wantCandidates = features.nudge && b.policy.envelope;
    el.setAttribute('data-jelly-active', '');
    plasmaFor(el);
    if (deformFull) lens.prepare();
    enforceCap();
    requestFrame();
  };

  const onMove = (e: PointerEvent) => {
    trackPointer(e);
    const t = pointer.t;
    if (e.pointerType !== 'touch') {
      pvx.add(e.clientX, t);
      pvy.add(e.clientY, t);
    }
    if (bodies.size === 0) return;
    for (const b of bodies.values()) {
      const press = b.press;
      if (press && press.pointerId === e.pointerId) {
        // The dent slides with the pointer (#989).
        press.cx = e.clientX;
        press.cy = e.clientY;
      }
      if (press && press.pointerId === e.pointerId && !b.drag) {
        const dx = e.clientX - press.ox;
        const dy = e.clientY - press.oy;
        if (dx * dx + dy * dy > SOFT_BODY.scrollSlopPx ** 2) {
          if (b.policy.drag) {
            startDrag(b, e.pointerId);
            jellyBus.emit('drag:start', { el: b.el });
          } else if (e.pointerType === 'touch') release(b, e.clientX, e.clientY, true);
          // A mouse or pen press stays down past the slop (it cannot be a scroll): the dent slides with it and a
          // drag off the element stretches the gel. Touch past the slop is a scroll, released silently.
        }
      }
      const d = b.drag;
      if (d && d.pointerId === e.pointerId) {
        d.tx.add(e.clientX, t);
        d.ty.add(e.clientY, t);
        d.lastMove = t;
      }
    }
    requestFrame();
  };

  /**
   * Finish a press (and a delegated drag): plastic memory, release event, neighbour nudge. A `cancelled` release
   * (scroll slop, pointercancel, blur) springs back without announcing a release or nudging anyone.
   */
  function release(b: Body, x: number, y: number, cancelled = false) {
    const press = b.press;
    if (!press) return;
    b.press = null;
    b.el.removeAttribute('data-jelly-active');
    const held = now() - press.at;
    if (b.drag && b.drag.pointerId === press.pointerId) {
      b.drag = null;
      jellyBus.emit('drag:end', { el: b.el });
    }
    b.phase = 'released';
    if (!b.ready) b.pendingRelease = { x, y, held, cancelled };
    else settleRelease(b, x, y, held, cancelled);
    requestFrame();
  }

  function settleRelease(b: Body, x: number, y: number, held: number, cancelled: boolean) {
    let energyPx = 0;
    if (b.policy.envelope && b.rect) {
      if (b.pressPose) beginPlastic(b.env, b.pressPose, b.policy.base, held);
      const pose = renderEnvelope(b.env, b.rect, b.policy.base, { scale: b.policy.scale });
      energyPx = bodyEnergy(pose.sx, pose.sy, pose.tx, pose.ty, b.rect.w, b.rect.h);
    } else if (b.policy.lattice) {
      energyPx = LATTICE_RELEASE_PX * Math.min(1, held / 180);
    }
    b.pressPose = null;
    if (cancelled) {
      b.candidates = [];
      return;
    }
    if (jellyBus.listenerCount('body:release') > 0) {
      jellyBus.emit('body:release', {
        el: b.el,
        x,
        y,
        energy: Math.min(1, energyPx / MOTION_BOUNDS.maxEdgeTravelPx),
      });
    }
    if (features.nudge && b.rect && b.candidates.length > 0) {
      const targets = pickNudgeTargets(b.rect, b.candidates, energyPx, now() - lastScroll);
      for (const t of targets) {
        // Never chains: a nudged body has no press, so it never reaches this function.
        strike(t.key, t.dx, t.dy, t.peak);
      }
    }
    b.candidates = [];
  }

  const onUp = (e: PointerEvent) => {
    trackPointer(e);
    const cancelled = e.type === 'pointercancel';
    for (const b of [...bodies.values()]) {
      if (b.press?.pointerId === e.pointerId) release(b, e.clientX, e.clientY, cancelled);
    }
  };

  const releaseAll = () => {
    for (const b of [...bodies.values()]) {
      b.hovering = false;
      if (b.press) release(b, b.press.ox, b.press.oy, true);
    }
    requestFrame();
  };

  const onScroll = () => {
    lastScroll = now();
    epoch++;
    // A feed flick must not leave a wake of plumped cards.
    for (const b of bodies.values()) b.hovering = false;
    requestFrame();
  };

  const onResize = () => {
    epoch++;
    requestFrame();
  };

  const onVisibility = () => {
    if (doc.hidden) {
      clearAll();
      clearPlasma();
    }
  };

  // ── Focus, keyboard and click: plasma only ───────────────────────────────

  const onKeyDown = () => {
    keyboardModality = true;
  };

  const onFocusIn = (e: FocusEvent) => {
    if (!keyboardModality) return;
    const host = plasmaHost(e.target);
    if (!host) return;
    focusHost = host;
    plasmaFor(host);
    requestFrame();
  };

  const onFocusOut = (e: FocusEvent) => {
    if (!focusHost) return;
    const next = e.relatedTarget as Node | null;
    if (next && focusHost.contains(next)) return;
    focusHost = null;
    requestFrame();
  };

  const onClick = (e: MouseEvent) => {
    const host = plasmaHost(e.target);
    if (!host) return;
    plasmaFor(host).flashUntil = now() + PLASMA.easeMs;
    requestFrame();
  };

  // ── Coulomb attraction (#989): a bounded tug on a body that is already awake ──

  const attract = (el: HTMLElement, nx: number, ny: number, force: number) => {
    const b = bodies.get(el);
    // Resting bodies (no envelope awake) pass the pull to their support: nothing moves.
    if (!b || !b.ready || !b.policy.envelope || deformOff || !features.wobble) return;
    const f = Math.max(0, Math.min(1, Number.isFinite(force) ? force : 0));
    const t = now();
    if (!(f > 0) || t - b.attractAt < ATTRACT_INTERVAL_MS) return;
    b.attractAt = t;
    strike(el, nx, ny, STRIKE_PX * f);
  };

  // ── External drag owners ─────────────────────────────────────────────────

  const drag = (el: HTMLElement, vx: number, vy: number, phase: 'move' | 'end') => {
    if (phase === 'end') {
      const b = bodies.get(el);
      if (b?.drag && b.drag.pointerId === null) {
        // Hand the stretch to the release spring with the velocity it has.
        b.drag = null;
        b.phase = 'released';
        requestFrame();
      }
      return;
    }
    const b = bodyFor(el);
    if (!b) return;
    if (!b.drag) startDrag(b, null);
    b.externalDrag = true;
    const d = b.drag!;
    d.vx = Number.isFinite(vx) ? vx : 0;
    d.vy = Number.isFinite(vy) ? vy : 0;
    d.lastMove = now();
    enforceCap();
    requestFrame();
  };

  // ── The frame ───────────────────────────────────────────────────────────

  const readRect = (el: Element): Rect => {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  };

  const readCandidates = (b: Body) => {
    b.wantCandidates = false;
    b.candidates = [];
    const el = b.el;
    const group = el.closest<HTMLElement>('[data-jelly-group]');
    if (group?.getAttribute('data-jelly-group') === 'off') return;
    const pool: Element[] = [];
    if (group) pool.push(...Array.from(group.querySelectorAll(SOFT_BODY_SELECTOR)));
    else if (el.parentElement) {
      for (const child of Array.from(el.parentElement.children)) {
        const hit = child.matches(SOFT_BODY_SELECTOR)
          ? child
          : child.querySelector(SOFT_BODY_SELECTOR);
        if (hit) pool.push(hit);
      }
    }
    for (const c of pool) {
      if (b.candidates.length >= SOFT_BODY.nudgeCandidates) break;
      if (c === el || c.contains(el) || el.contains(c)) continue;
      b.candidates.push({ key: c as HTMLElement, rect: readRect(c) });
    }
  };

  /** Read phase for one body: rect, policy with size, base (one getComputedStyle), candidates. */
  const activate = (b: Body): boolean => {
    const el = b.el;
    if (!el.isConnected) return false;
    const rect = readRect(el);
    b.rect = rect;
    b.epoch = epoch;
    b.policy = resolveSoftPolicy({ ...b.traits, width: rect.w, height: rect.h }, { features });
    if (b.policy.mode === 'off' || !moves(b.policy)) return false;
    b.lensOk = !el.style.filter;
    if (b.policy.envelope) {
      const computed = win.getComputedStyle(el);
      // A host with a stylesheet filter of its own keeps it: the lens never replaces (or chains after) one.
      const own = (computed as { filter?: string }).filter;
      if (own && own !== 'none') b.lensOk = false;
      b.base = readBase(el.style, computed);
      b.inlineWillChange = el.style.willChange ?? '';
      b.framer = new FramerWatch(el.style.transform);
      if (b.policy.cornerFlex) {
        const r = Number.parseFloat(computed.borderTopLeftRadius ?? '');
        b.radius = Number.isFinite(r) ? Math.min(r, Math.min(rect.w, rect.h) / 2) : 0;
        b.inlineRadius = el.style.borderRadius ?? '';
      }
    }
    if (b.wantCandidates) readCandidates(b);
    b.ready = true;
    for (const i of b.impulses) nudgeEnvelope(b.env, i.dx, i.dy, i.peak);
    b.impulses = [];
    return true;
  };

  /** After a scroll/resize: re-read the rect and undo our own pose to recover the rest rect. */
  const refresh = (b: Body) => {
    const r = readRect(b.el);
    const p = b.written ? b.last : { sx: 1, sy: 1, tx: 0, ty: 0 };
    const w = r.w / (p.sx || 1);
    const h = r.h / (p.sy || 1);
    const cx = r.x + r.w / 2 - p.tx;
    const cy = r.y + r.h / 2 - p.ty;
    b.rect = { x: cx - w / 2, y: cy - h / 2, w, h };
    b.epoch = epoch;
  };

  const unit = (rect: Rect, x: number, y: number): UnitOffset => ({
    x: rect.w > 0 ? (x - (rect.x + rect.w / 2)) / (rect.w / 2) : 0,
    y: rect.h > 0 ? (y - (rect.y + rect.h / 2)) / (rect.h / 2) : 0,
  });

  const inside = (rect: Rect, x: number, y: number, margin: number) =>
    x >= rect.x - margin &&
    x <= rect.x + rect.w + margin &&
    y >= rect.y - margin &&
    y <= rect.y + rect.h + margin;

  const dragVelocity = (d: Drag, t: number): { vx: number; vy: number } => {
    if (t - d.lastMove > DRAG_IDLE_MS) return { vx: 0, vy: 0 };
    if (d.pointerId === null) return { vx: d.vx, vy: d.vy };
    return { vx: d.tx.get(), vy: d.ty.get() };
  };

  /** The lens may refract `b` now: material fully on, no own filter, framer not animating it. */
  const lensAllowed = (b: Body) => deformFull && b.lensOk && !b.framerOwned;

  /**
   * Step the press dent of `b` (#989): depth eases to `DENT.depthPx` while pressed and back to 0 after; the centre
   * follows the pointer, clamped to the host, and the overshoot past an edge becomes a capped rubber-band stretch.
   * Returns what to publish: a dent, `null` (it has gone) or `undefined` (nothing changed enough to re-publish).
   */
  const stepBodyDent = (b: Body, rect: Rect, dt: number): JellyDent | null | undefined => {
    if (!b.press && !b.dent) return undefined;
    if (!b.dent) {
      b.dent = {
        springs: createDentSprings(),
        x: 0,
        y: 0,
        radius: dentRadius(rect.w, rect.h),
        published: null,
      };
    }
    const d = b.dent;
    let target = { depth: 0, stretchX: 0, stretchY: 0 };
    if (b.press) {
      const c = dentContact(b.press.cx - rect.x, b.press.cy - rect.y, rect.w, rect.h);
      d.x = c.x;
      d.y = c.y;
      // The stretch is deformation: `press` mode (degraded, `still`) keeps only the dent itself.
      const stretch = features.wobble && !b.externalDrag;
      target = {
        depth: DENT.depthPx,
        stretchX: stretch ? c.stretchX : 0,
        stretchY: stretch ? c.stretchY : 0,
      };
    }
    stepDent(d.springs, target, dt);
    const arrived = dentSettled(d.springs, target);
    if (!arrived) b.settled = false;
    const depth = Math.max(0, Math.min(DENT.depthPx * 1.5, d.springs.depth.value));
    const sx = d.springs.stretchX.value;
    const sy = d.springs.stretchY.value;
    if (!b.press && depth < DENT_GONE_PX && Math.hypot(sx, sy) < DENT_GONE_PX) {
      if (d.published) return null;
      b.dent = null;
      return undefined;
    }
    const next: JellyDent = { x: d.x, y: d.y, depth, radius: d.radius, stretchX: sx, stretchY: sy };
    const prev = d.published;
    if (
      prev &&
      Math.abs(prev.x - next.x) < DENT_EPSILON &&
      Math.abs(prev.y - next.y) < DENT_EPSILON &&
      Math.abs(prev.depth - next.depth) < DENT_EPSILON &&
      Math.abs(prev.stretchX - next.stretchX) < DENT_EPSILON &&
      Math.abs(prev.stretchY - next.stretchY) < DENT_EPSILON
    )
      return undefined;
    return next;
  };

  function frame(_ts: number, dtMs: number): boolean {
    const dt = Math.min(0.25, Math.max(0, dtMs / 1000));
    const t = now();

    // ── 1. READ ──
    for (const b of [...bodies.values()]) {
      if (!b.ready) {
        if (!activate(b)) {
          clear(b);
          continue;
        }
        if (b.pendingRelease) {
          const r = b.pendingRelease;
          b.pendingRelease = null;
          settleRelease(b, r.x, r.y, r.held, r.cancelled);
        }
      } else {
        if (b.epoch !== epoch && b.el.isConnected) refresh(b);
        if (b.wantCandidates) readCandidates(b);
      }
      b.framerOwned = b.framer ? b.framer.observe(b.el.style.transform) : false;
    }

    // ── 2. STEP (no DOM) ──
    let drives = 0;
    for (const b of bodies.values()) if (b.latticeDrive) drives++;
    let corners = 0;
    for (const b of bodies.values()) if (b.cornerWritten) corners++;

    const plan: {
      b: Body;
      pose: EnvelopePose | null;
      drive: LatticeInput | null;
      radii: string | null;
      dent: JellyDent | null | undefined;
    }[] = [];
    let again = false;
    for (const b of bodies.values()) {
      // Created mid-frame (a neighbour nudged from a deferred release): read next frame.
      if (!b.ready || !b.rect) {
        again = true;
        continue;
      }
      const rect = b.rect;
      // Hover hysteresis against the REST rect grown by 4px: a bulging edge cannot flicker enter/leave.
      if (
        b.hovering &&
        (!pointer.inDoc || !inside(rect, pointer.x, pointer.y, SOFT_BODY.hoverMarginPx))
      )
        b.hovering = false;

      const dv = b.drag ? dragVelocity(b.drag, t) : null;
      let pose: EnvelopePose | null = null;
      let radii: string | null = null;
      b.settled = true;
      const dent = stepBodyDent(b, rect, dt);
      const dentSettledNow = b.settled;

      if (b.policy.envelope) {
        const size: EnvelopeSize = { w: rect.w, h: rect.h };
        let target: EnvelopePose;
        let phase: 'hover' | 'press' | 'release' | 'drag';
        if (b.framerOwned) {
          target = restTarget(b.env);
          phase = 'release';
        } else if (b.drag && dv) {
          target = dragTarget(dv.vx, dv.vy);
          phase = 'drag';
        } else if (b.press) {
          target = pressTarget(unit(rect, b.press.cx, b.press.cy), b.policy.base, size);
          b.pressPose = target;
          // Dragged off the element: the gel stretches toward the pointer (rubber band, inside MOTION_BOUNDS).
          if (b.dent) {
            target = stretchTarget(
              target,
              b.dent.springs.stretchX.value,
              b.dent.springs.stretchY.value,
              size,
            );
          }
          phase = 'press';
        } else if (b.hovering && b.policy.hover !== 'none') {
          target = hoverTarget(unit(rect, pointer.x, pointer.y), size, b.policy.hover);
          phase = 'hover';
        } else {
          target = restTarget(b.env);
          phase = 'release';
        }
        if (b.kick) {
          if (phase === 'hover') hoverKick(b.env, b.kick.vx, b.kick.vy);
          b.kick = null;
        }
        stepEnvelope(b.env, target, phaseSprings(phase, features.wobble), dt);
        b.settled = dentSettledNow && envelopeSettled(b.env, target) && !(dv && (dv.vx || dv.vy));
        pose = renderEnvelope(b.env, size, b.policy.base, { scale: b.policy.scale });

        if (b.policy.cornerFlex && b.radius > 0 && !b.framerOwned) {
          const span = Math.abs(b.policy.base - 1);
          const iso = Math.sqrt(pose.sx * pose.sy);
          const amount = span > 0 ? Math.min(1, Math.abs(iso - 1) / span) : 0;
          if (amount > 0.01 && (b.cornerWritten || corners < SOFT_BODY.cornerFlexMax)) {
            const contact = b.press
              ? unit(rect, b.press.cx, b.press.cy)
              : unit(rect, pointer.x, pointer.y);
            radii = cornerFlexRadii(b.radius, contact, amount)
              .map((r) => `${r.toFixed(1)}px`)
              .join(' ');
            if (!b.cornerWritten) corners++;
          }
        }
      }

      let drive: LatticeInput | null = null;
      if (b.policy.lattice && latticeCap > 0) {
        if (b.drag && dv) {
          const ax = (dv.vx - b.drag.pvx) / Math.max(dt, 1 / 240);
          const ay = (dv.vy - b.drag.pvy) / Math.max(dt, 1 / 240);
          b.drag.pvx = dv.vx;
          b.drag.pvy = dv.vy;
          drive = { kind: 'drag', ax, ay };
          if (dv.vx || dv.vy) b.settled = false;
        } else if (b.press) {
          // The outline indents under the dent (≈ DENT.indentPx, lattice.ts) and the far side bulges.
          drive = b.dent
            ? { kind: 'press', x: b.dent.x, y: b.dent.y }
            : { kind: 'press', x: b.press.cx - rect.x, y: b.press.cy - rect.y };
        } else if (b.hovering && features.hover && pointer.fine) {
          drive = { kind: 'hover', x: pointer.x - rect.x, y: pointer.y - rect.y };
        }
        if (drive && !b.latticeDrive) {
          if (drives >= latticeCap) drive = null;
          else drives++;
        }
      }
      plan.push({ b, pose, drive, radii, dent });
    }

    // ── 3. WRITE ──
    for (const { b, pose, drive, radii, dent } of plan) {
      const el = b.el;
      if (drive || b.latticeDrive) {
        setLatticeDrive(el, drive);
        b.latticeDrive = drive;
      }
      if (dent !== undefined && b.dent) {
        setDent(el, dent);
        b.dent.published = dent;
        if (dent === null) b.dent = null;
      }
      if (b.dent?.published && lensAllowed(b)) lens.update(el, b.dent.published);
      else lens.release(el);
      // The ONE sleep decision. A body nobody holds either sleeps now (cleared: inline values restored exactly) or
      // keeps its frames until it does — `b.settled` (springs on THIS frame's target) never stops an idle body,
      // because a released target still carries plastic memory that only ages inside `stepEnvelope`. Before this,
      // a body settled on its plastic target asked for no frame, never aged, never slept, and the next unrelated
      // pointer frame wrote its stale pose (`scale: 1.0004 1.0003`) long after the gesture ended.
      const busy = !!(b.press || b.drag || b.hovering);
      if (!busy && !b.dent && (!b.policy.envelope || envelopeAsleep(b.env))) {
        clear(b);
        continue;
      }
      if (pose) writePose(b, pose);
      if (radii !== null) {
        if (radii !== b.lastRadii) {
          el.style.borderRadius = radii;
          b.lastRadii = radii;
        }
        b.cornerWritten = true;
      } else if (b.cornerWritten) {
        el.style.borderRadius = b.inlineRadius;
        b.cornerWritten = false;
        b.lastRadii = '';
      }
      // Only a held body (hovered, pressed, dragged) that has arrived may idle without frames: the input that moves
      // it on (a pointermove, the release) asks for the next one.
      if (!busy || !b.settled) again = true;
    }
    const plasmaBusy = stepPlasma(dt, t);
    return (again && bodies.size > 0) || plasmaBusy;
  }

  const writePose = (b: Body, pose: EnvelopePose) => {
    const s = b.el.style;
    const near =
      Math.abs(pose.sx - 1) < 0.0005 &&
      Math.abs(pose.sy - 1) < 0.0005 &&
      Math.abs(pose.tx) < 0.05 &&
      Math.abs(pose.ty) < 0.05;
    if (b.framerOwned && near) {
      // framer owns the transform this frame and jelly is at rest: hand the element back entirely.
      if (b.written) {
        if (!b.externalDrag) s.translate = b.base.inlineTranslate;
        s.scale = b.base.inlineScale;
        s.willChange = b.inlineWillChange;
        b.el.removeAttribute('data-jelly-body');
        b.written = false;
        b.last = { sx: 1, sy: 1, tx: 0, ty: 0 };
      }
      return;
    }
    const l = b.last;
    const changed =
      !b.written ||
      Math.abs(pose.sx - l.sx) >= 0.0005 ||
      Math.abs(pose.sy - l.sy) >= 0.0005 ||
      Math.abs(pose.tx - l.tx) >= 0.05 ||
      Math.abs(pose.ty - l.ty) >= 0.05;
    if (!changed) return;
    if (!b.written) {
      b.el.setAttribute('data-jelly-body', '');
      s.willChange = 'transform';
      b.written = true;
    }
    if (!b.externalDrag) s.translate = composeTranslate(b.base, pose.tx, pose.ty);
    if (b.policy.scale) s.scale = composeScale(b.base, pose.sx, pose.sy);
    b.last = pose;
  };

  // ── Wiring ──────────────────────────────────────────────────────────────

  const listenOpts = { capture: true, passive: true } as const;
  // Pointer input arrives through the ONE window listener set (`pointer.ts`), shared with arcs and the engine.
  const offPointer = [
    onJellyPointer('pointerover', onOver, win),
    onJellyPointer('pointerout', onOut, win),
    onJellyPointer('pointerdown', onDown, win),
    onJellyPointer('pointermove', onMove, win),
    onJellyPointer('pointerup', onUp, win),
    onJellyPointer('pointercancel', onUp, win),
  ];
  doc.addEventListener('scroll', onScroll, listenOpts);
  doc.addEventListener('keydown', onKeyDown, listenOpts);
  doc.addEventListener('focusin', onFocusIn as EventListener, listenOpts);
  doc.addEventListener('focusout', onFocusOut as EventListener, listenOpts);
  doc.addEventListener('click', onClick as EventListener, listenOpts);
  doc.addEventListener('visibilitychange', onVisibility);
  win.addEventListener('resize', onResize, { passive: true });
  win.addEventListener('blur', releaseAll);
  const offEnv = onJellyEnvChange(evaluate, doc);
  // `(nx, ny)` is the inward normal at the contact — the direction of the kick (03 §6.3).
  const offStrike = jellyBus.on('arc:strike', ({ el, nx, ny, energy }) => {
    strike(el as HTMLElement, nx, ny, STRIKE_PX * Math.max(0, Math.min(1, energy)));
  });
  // `(nx, ny)` points toward the charged neighbour; arcs emit the equal and opposite pull on the other body.
  const offAttract = jellyBus.on('charge:attract', ({ el, nx, ny, force }) => {
    attract(el as HTMLElement, nx, ny, force);
  });

  evaluate();

  // Build the lens filter at idle, so no frame ever pays for it (a no-op where the lens is unsupported).
  const idle = (win as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
  let idleHandle: ReturnType<typeof setTimeout> | number | null = idle
    ? idle.call(win, () => {
        idleHandle = null;
        if (deformFull) lens.prepare();
      })
    : null;

  const self: Service = { doc, drag };
  service = self;

  return () => {
    for (const off of offPointer) off();
    doc.removeEventListener('scroll', onScroll, listenOpts);
    doc.removeEventListener('keydown', onKeyDown, listenOpts);
    doc.removeEventListener('focusin', onFocusIn as EventListener, listenOpts);
    doc.removeEventListener('focusout', onFocusOut as EventListener, listenOpts);
    doc.removeEventListener('click', onClick as EventListener, listenOpts);
    doc.removeEventListener('visibilitychange', onVisibility);
    win.removeEventListener('resize', onResize);
    win.removeEventListener('blur', releaseAll);
    offEnv();
    offStrike();
    offAttract();
    if (idleHandle !== null)
      (win as { cancelIdleCallback?: (h: number) => void }).cancelIdleCallback?.(
        idleHandle as number,
      );
    driver.stop();
    clearAll();
    clearPlasma();
    if (!opts.lens) lens.destroy();
    if (service === self) service = null;
  };
}
