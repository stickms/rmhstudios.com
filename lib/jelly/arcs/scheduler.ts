/**
 * The ambient arc scheduler and the quiet states that pause it (docs/plans/plasmatic-jelly/03-arcs.md §2).
 *
 * ## Ambient arcs: one timer, never a frame
 *
 * Candidates (visible jelly hosts with cached rounded rects) are paired by `buildPairs`, each pair carrying
 * `λ_pair(gap) = λ0·exp(−gap/L)`. The superposed process has rate `Λ = min(Σλ·m, Λ_max, 1000/tierInterval)`; one
 * `setTimeout` holds the next event at `max(last + T_min, now + Exp(Λ))`. On fire, the scheduler re-checks quiet,
 * picks a pair weighted by `λ·q_a·q_b` (both charges ≥ 0.35), hands it to the runtime and re-arms. When `Λ = 0`, the
 * tier says no ambient arcs, or a quiet state holds, NO timer is armed; it re-arms on the next rect-cache change
 * ({@link AmbientScheduler.invalidate}) or quiet-state edge ({@link AmbientScheduler.poke}). It never calls rAF.
 *
 * Re-arming re-samples the exponential, which is exact for a Poisson process (it is memoryless), and the `T_min`
 * floor is measured from the last arc, so frequent re-arms can neither starve nor hurry the next arc.
 *
 * ## Charge
 *
 * Each element holds `q ∈ [0, 1]`, recharging as `q += (1 − q)(1 − e^{−dt/4s})`, evaluated lazily from timestamps (no
 * timer per element). An arc drains both ends by 0.6; a click drains the clicked element to 0; a soft-body release
 * (`body:release`) adds charge. The same two buttons therefore do not arc twice in a row, and a cluster that has just
 * discharged goes quiet for a few seconds.
 *
 * ## Quiet states (§2.3)
 *
 * {@link createQuietTracker} owns the event-driven ones — scrolling (800ms after the last scroll), typing in a field
 * (2500ms after the last key), a drag (`drag:start` … `drag:end` + 600ms on the jelly bus) — and evaluates the stateful
 * ones on demand: a non-empty text selection, an open modal/menu/tooltip, a visible playing video over 15% of the
 * viewport, and fullscreen. It reports edges through `onChange` so the scheduler can clear or re-arm its one timer.
 * Click arcs ignore quiet states (only the global-off list in the runtime stops them).
 */

import type { JellyBus } from '../bus';
import type { RoundedRect } from './geometry';
import { buildPairs, type ArcPair } from './pairs';
import { ARC_BUDGET, chargeAt, chargeEligible, pickWeighted, totalRate } from './rate';
import { randExp, type Rand } from './rng';

export interface ArcCandidate {
  el: Element;
  /** Viewport rect + corner radius at the last cache refresh. */
  rect: RoundedRect;
}

// ── Charge ───────────────────────────────────────────────────────────────────

export interface ChargeBook {
  /** Current charge (full = 1 for an element never seen). */
  get(el: Element, now: number): number;
  set(el: Element, q: number, now: number): void;
  /** Subtract `amount` (clamped at 0). */
  drain(el: Element, amount: number, now: number): void;
  /** Add `amount` (clamped at 1). */
  add(el: Element, amount: number, now: number): void;
}

export function createChargeBook(): ChargeBook {
  const book = new WeakMap<Element, { q: number; t: number }>();
  const get = (el: Element, now: number) => {
    const s = book.get(el);
    return s ? chargeAt(s.q, now - s.t) : 1;
  };
  const set = (el: Element, q: number, now: number) => {
    book.set(el, { q: Math.max(0, Math.min(1, q)), t: now });
  };
  return {
    get,
    set,
    drain: (el, amount, now) => set(el, get(el, now) - amount, now),
    add: (el, amount, now) => set(el, get(el, now) + amount, now),
  };
}

// ── The ambient scheduler ────────────────────────────────────────────────────

type TimerHandle = ReturnType<typeof setTimeout>;

export interface AmbientSchedulerOptions {
  /** The candidate set (read on {@link AmbientScheduler.invalidate}, never per event). */
  candidates(): readonly ArcCandidate[];
  /** True while ambient arcs must hold (quiet state). Checked when arming and again at fire time. */
  quiet(): boolean;
  /** The tier's `ambientArcMinIntervalMs`; `Infinity` = no ambient arcs. */
  minIntervalMs(): number;
  /** Pointer multiplier `m`: 1 fine, 0.6 coarse. */
  multiplier(): number;
  /**
   * Strike this pair. Returns true when an arc was actually drawn (the flash ledger may refuse; then neither charge
   * nor the `T_min` clock is spent).
   */
  fire(a: ArcCandidate, b: ArcCandidate, pair: ArcPair): boolean;
  rand: Rand;
  now(): number;
  /** Charge model; `null` disables it (tests of the pure rate ratio). */
  charge?: ChargeBook | null;
  /** Extra pair exclusion; default: either element contains the other. */
  nested?(a: Element, b: Element): boolean;
}

export interface AmbientScheduler {
  /** The rect cache changed: rebuild pairs, re-arm if the rate changed (or nothing is armed). */
  invalidate(): void;
  /** A quiet state or a gate changed: clear the timer if quiet, arm one if not. */
  poke(): void;
  /** Clear the timer for good (until the next {@link poke} / {@link invalidate}). */
  stop(): void;
  /** A timer is armed. */
  readonly armed: boolean;
  /** Current `Λ` (s⁻¹). */
  rate(): number;
  /** Current pairs (rebuilding them if stale). */
  pairs(): readonly ArcPair[];
}

const defaultNested = (a: Element, b: Element) => a.contains(b) || b.contains(a);

export function createAmbientScheduler(opts: AmbientSchedulerOptions): AmbientScheduler {
  const charge = opts.charge === undefined ? createChargeBook() : opts.charge;
  const nested = opts.nested ?? defaultNested;
  let cache: { cands: readonly ArcCandidate[]; pairs: ArcPair[] } | null = null;
  let timer: TimerHandle | undefined;
  let armedRate = 0;
  let last = -Infinity;

  const build = () => {
    const cands = opts.candidates();
    const pairs = buildPairs(
      cands.map((c) => c.rect),
      { nested: (i, j) => nested(cands[i].el, cands[j].el) },
    );
    return { cands, pairs };
  };
  const current = () => (cache ??= build());

  const clear = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    armedRate = 0;
  };

  const rateNow = (): number => {
    const minI = opts.minIntervalMs();
    if (!Number.isFinite(minI)) return 0;
    return totalRate(
      current().pairs.map((p) => p.rate),
      opts.multiplier(),
      minI,
    );
  };

  const arm = (force: boolean) => {
    if (opts.quiet()) return clear();
    const rate = rateNow();
    if (!(rate > 0)) return clear();
    if (timer !== undefined && !force && Math.abs(rate - armedRate) < 1e-12) return;
    clear();
    const t = opts.now();
    const due = Math.max(
      t + randExp(opts.rand, rate) * 1000,
      last + ARC_BUDGET.minAmbientIntervalMs,
    );
    armedRate = rate;
    timer = setTimeout(onFire, Math.max(0, due - t));
  };

  function onFire() {
    timer = undefined;
    armedRate = 0;
    if (opts.quiet()) return; // resumes on the quiet tracker's edge
    const { cands, pairs } = current();
    const t = opts.now();
    const weights = pairs.map((p) => {
      if (!charge) return p.rate;
      const qa = charge.get(cands[p.a].el, t);
      const qb = charge.get(cands[p.b].el, t);
      return chargeEligible(qa, qb) ? p.rate * qa * qb : 0;
    });
    const i = pickWeighted(weights, opts.rand());
    if (i >= 0) {
      const p = pairs[i];
      const a = cands[p.a];
      const b = cands[p.b];
      if (opts.fire(a, b, p)) {
        last = opts.now();
        if (charge) {
          charge.drain(a.el, ARC_BUDGET.chargeDrain, last);
          charge.drain(b.el, ARC_BUDGET.chargeDrain, last);
        }
      }
    }
    arm(true);
  }

  return {
    invalidate() {
      cache = null;
      arm(false);
    },
    poke() {
      arm(false);
    },
    stop: clear,
    get armed() {
      return timer !== undefined;
    },
    rate: rateNow,
    pairs: () => current().pairs,
  };
}

// ── Quiet states ─────────────────────────────────────────────────────────────

/** Resume delays after the last event (§2.3). */
export const QUIET = { scrollMs: 800, typingMs: 2500, dragMs: 600, videoShare: 0.15 } as const;

/** Open modal dialogs, menus and tooltips: ambient arcs hold while one is up. */
export const MODAL_SELECTOR =
  '[role="dialog"][aria-modal="true"],[role="alertdialog"][aria-modal="true"],dialog[open],[role="menu"],[role="tooltip"]';

/** Where typing happens. Buttons, checkboxes and sliders are inputs but not typing. */
export const EDITABLE_SELECTOR =
  'textarea,select,[contenteditable=""],[contenteditable="true"],[contenteditable="plaintext-only"],input:not([type="button"],[type="submit"],[type="reset"],[type="checkbox"],[type="radio"],[type="range"],[type="color"],[type="file"],[type="image"])';

export function isEditable(target: EventTarget | null | undefined): boolean {
  const el = target as Element | null | undefined;
  return !!el && typeof el.closest === 'function' && el.closest(EDITABLE_SELECTOR) !== null;
}

export type QuietReason =
  'scrolling' | 'typing' | 'drag' | 'selection' | 'modal' | 'video' | 'fullscreen';

export interface QuietTracker {
  quiet(): boolean;
  /** The first quiet state that holds, or null. */
  reason(): QuietReason | null;
  dispose(): void;
}

export interface QuietTrackerOptions {
  bus?: Pick<JellyBus, 'on'> | null;
  /** `registry.scrolling` (stale rects mid-scroll). */
  scrolling?: () => boolean;
  /** Called on every quiet-state edge (enter and resume). */
  onChange: () => void;
  /** Called on every scroll event (the renderer fades live arcs). */
  onScroll?: () => void;
  now?: () => number;
}

export function createQuietTracker(doc: Document, opts: QuietTrackerOptions): QuietTracker {
  const now = opts.now ?? (() => Date.now());
  const root = doc.documentElement;
  let scrollUntil = -Infinity;
  let typingUntil = -Infinity;
  let dragUntil = -Infinity;
  const drags = new Set<Element>();
  let resumeTimer: TimerHandle | undefined;
  let disposed = false;

  const deadline = () => Math.max(scrollUntil, typingUntil, dragUntil);

  const scheduleResume = () => {
    if (resumeTimer !== undefined || disposed) return;
    const wait = deadline() - now();
    if (!(wait > 0)) return;
    resumeTimer = setTimeout(() => {
      resumeTimer = undefined;
      if (disposed) return;
      // Extended since (more scrolling / typing): wait out the remainder without an edge.
      if (deadline() > now()) return scheduleResume();
      opts.onChange();
    }, wait + 1);
  };

  const onScroll = () => {
    const t = now();
    const edge = t >= scrollUntil;
    scrollUntil = t + QUIET.scrollMs;
    opts.onScroll?.();
    scheduleResume();
    if (edge) opts.onChange();
  };
  const onKey = (e: Event) => {
    if (!isEditable(e.target)) return;
    const t = now();
    const edge = t >= typingUntil;
    typingUntil = t + QUIET.typingMs;
    scheduleResume();
    if (edge) opts.onChange();
  };
  const onEdge = () => opts.onChange();

  const capture = { capture: true, passive: true } as const;
  doc.addEventListener('scroll', onScroll, capture);
  doc.addEventListener('keydown', onKey, capture);
  doc.addEventListener('input', onKey, capture);
  doc.addEventListener('selectionchange', onEdge);
  doc.addEventListener('fullscreenchange', onEdge);
  // Media events do not bubble, but they do pass through the capture phase.
  for (const type of ['play', 'pause', 'ended'] as const)
    doc.addEventListener(type, onEdge, capture);

  const offBus = [
    opts.bus?.on('drag:start', ({ el }) => {
      drags.add(el);
      opts.onChange();
    }),
    opts.bus?.on('drag:end', ({ el }) => {
      drags.delete(el);
      dragUntil = now() + QUIET.dragMs;
      scheduleResume();
    }),
  ];

  const selection = () => {
    try {
      const sel = doc.getSelection?.();
      return !!sel && sel.rangeCount > 0 && !sel.isCollapsed;
    } catch {
      return false;
    }
  };
  const videoPlaying = () => {
    const win = doc.defaultView;
    if (!win) return false;
    const vw = win.innerWidth;
    const vh = win.innerHeight;
    const min = QUIET.videoShare * vw * vh;
    for (const v of doc.querySelectorAll('video')) {
      if (v.paused || v.ended) continue;
      const r = v.getBoundingClientRect();
      const w = Math.min(r.right, vw) - Math.max(r.left, 0);
      const h = Math.min(r.bottom, vh) - Math.max(r.top, 0);
      if (w > 0 && h > 0 && w * h > min) return true;
    }
    return false;
  };

  const reason = (): QuietReason | null => {
    const t = now();
    if (t < scrollUntil || opts.scrolling?.() || root.hasAttribute('data-scrolling'))
      return 'scrolling';
    if (t < typingUntil) return 'typing';
    if (drags.size > 0 || t < dragUntil) return 'drag';
    if (selection()) return 'selection';
    if (doc.querySelector(MODAL_SELECTOR)) return 'modal';
    if (doc.fullscreenElement) return 'fullscreen';
    if (videoPlaying()) return 'video';
    return null;
  };

  return {
    quiet: () => reason() !== null,
    reason,
    dispose() {
      if (disposed) return;
      disposed = true;
      if (resumeTimer !== undefined) clearTimeout(resumeTimer);
      doc.removeEventListener('scroll', onScroll, capture);
      doc.removeEventListener('keydown', onKey, capture);
      doc.removeEventListener('input', onKey, capture);
      doc.removeEventListener('selectionchange', onEdge);
      doc.removeEventListener('fullscreenchange', onEdge);
      for (const type of ['play', 'pause', 'ended'] as const)
        doc.removeEventListener(type, onEdge, capture);
      for (const off of offBus) off?.();
      drags.clear();
    },
  };
}
