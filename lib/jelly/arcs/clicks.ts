/**
 * Click arcs (docs/plans/plasmatic-jelly/03-arcs.md §3): a press on a jelly element discharges 1–3 bolts from its rim
 * to the nearest neighbours within 180px, or a rim fizz when nothing is in range; a press on the page background near
 * a rim draws the charge out to the cursor; a keyboard activation strikes one dimmer arc.
 *
 * Two halves:
 *
 * - {@link createArcActions} turns an intent (press here, strike these two) into admitted arcs on the renderer. It is
 *   the only place an arc between elements is assembled, so the ambient scheduler, clicks and the public API
 *   (`strike`, `dischargeAt`) all pass through the same fresh-rect read, the same flash ledger and the same charge
 *   bookkeeping. Nothing here bypasses the ledger: callers degrade by dropping bolts, never by forcing one.
 * - {@link installClickArcs} is the delegated input: ONE capture `pointerdown` and ONE capture `click` on the
 *   document, no per-component listener. Disabled, `aria-disabled`, editable and opted-out targets arc nothing, and
 *   Tab focus moves never arc (focus is not an action).
 *
 * Rects: neighbours come from the registry's cache (no layout per press), and exactly the elements a bolt joins are
 * re-read at strike time, so a stale cache never puts a bolt in the wrong place.
 */

import { JELLY_SELECTOR, jellyOptedOut } from '../tiers';
import { closestRimPoints, pointToRoundedRect, type RoundedRect } from './geometry';
import type { FlashLedger } from './ledger';
import { clickTargets, nearestRimWithin, type ClickTarget } from './pairs';
import { ARC_BUDGET, clickBoltCount, clickWeight, pickWeighted } from './rate';
import {
  admitArc,
  boltArc,
  fizzArc,
  flareArc,
  type ArcEmitKind,
  type ArcEnd,
  type ArcRenderer,
} from './renderer';
import { mixSeed, type Rand } from './rng';
import { isEditable, type ArcCandidate, type ChargeBook } from './scheduler';

/** An open modal: click arcs inside it lift the layer to `--z-arcs-modal` and stay inside it. */
export const MODAL_ROOT_SELECTOR =
  '[role="dialog"][aria-modal="true"],[role="alertdialog"][aria-modal="true"],dialog[open]';

/** A press on (or inside) these never arcs. */
export const CLICK_BLOCK_SELECTOR =
  '[disabled],[aria-disabled="true"],[aria-hidden="true"],[inert],[data-jelly-arcs="off"]';

/**
 * Pick `n` distinct targets weighted by `exp(−gap/L)` (not strictly nearest, so repeated clicks vary). Pure.
 */
export function chooseClickTargets(
  targets: readonly ClickTarget[],
  n: number,
  rand: Rand,
): ClickTarget[] {
  const pool = [...targets];
  const out: ClickTarget[] = [];
  while (out.length < n && pool.length > 0) {
    const i = pickWeighted(
      pool.map((t) => clickWeight(t.gap)),
      rand(),
    );
    if (i < 0) break;
    out.push(pool[i]);
    pool.splice(i, 1);
  }
  return out;
}

/** The jelly host a press lands on, or null (none, blocked, editable or opted out). */
export function pressHost(target: EventTarget | null): Element | null {
  const el = target as Element | null;
  if (!el || typeof el.closest !== 'function') return null;
  if (isEditable(el)) return null;
  const host = el.closest(JELLY_SELECTOR);
  if (!host) return null;
  if (el.closest(CLICK_BLOCK_SELECTOR) || jellyOptedOut(host)) return null;
  return host;
}

export interface ArcContext {
  renderer: ArcRenderer;
  ledger: FlashLedger;
  charge: ChargeBook;
  rand: Rand;
  /** Cached candidates (visible jelly hosts with rects). */
  candidates(): readonly ArcCandidate[];
  /** A FRESH rounded rect for one element (one `getBoundingClientRect`), or null when it has no box. */
  measure(el: Element): RoundedRect | null;
  /** The tier's bolts per click (0 = click arcs off). */
  clickBolts(): number;
}

export interface StrikeOptions {
  kind?: 'ambient' | 'click' | 'key';
  /** 0..1; default from the kind's timeline. */
  energy?: number;
  /** Renderer-clock start (staggered click bolts); default now. */
  start?: number;
  modal?: boolean;
}

export interface DischargeOptions {
  /** Treat as a touch press (fewer bolts). Default: a fine pointer. */
  pointerType?: 'mouse' | 'pen' | 'touch';
}

export interface ArcActions {
  /** One bolt between two elements; false when they overlap, nest, have no box or the ledger refuses. */
  strike(a: Element, b: Element, opts?: StrikeOptions): boolean;
  /** A press on jelly element `el` at viewport (x, y). */
  press(el: Element, x: number, y: number, fine: boolean): boolean;
  /** A press outside every jelly element: discharge to the cursor from a rim within 90px. */
  background(x: number, y: number): boolean;
  /** A keyboard activation of `el`. */
  key(el: Element): boolean;
}

const end = (
  p: { x: number; y: number },
  n: { x: number; y: number },
  el?: Element | null,
): ArcEnd => ({
  x: p.x,
  y: p.y,
  nx: n.x,
  ny: n.y,
  el,
});

export function createArcActions(ctx: ArcContext): ArcActions {
  const seed = () => Math.floor(ctx.rand() * 0x100000000) >>> 0;
  const modalRoot = (el: Element) => el.closest(MODAL_ROOT_SELECTOR);
  const nestedEl = (a: Element, b: Element) => a.contains(b) || b.contains(a);

  const strike = (a: Element, b: Element, opts: StrikeOptions = {}): boolean => {
    if (a === b || nestedEl(a, b)) return false;
    const ra = ctx.measure(a);
    const rb = ctx.measure(b);
    if (!ra || !rb) return false;
    const contact = closestRimPoints(ra, rb, ctx.rand);
    if (!contact) return false;
    const kind = opts.kind ?? 'click';
    const arc = boltArc({
      kind,
      emitKind: kind,
      a: end(contact.a, contact.na, a),
      b: end(contact.b, contact.nb, b),
      seed: seed(),
      start: opts.start ?? ctx.renderer.now(),
      energy: opts.energy,
      modal: opts.modal ?? !!modalRoot(a),
    });
    if (!admitArc(arc, ctx.ledger)) return false;
    ctx.renderer.add(arc);
    return true;
  };

  const fizz = (
    el: Element,
    src: RoundedRect,
    at: { x: number; y: number },
    emitKind: ArcEmitKind,
    count: number | undefined,
    modal: boolean,
  ): boolean => {
    const rim = pointToRoundedRect(at, src);
    const arc = fizzArc({
      origin: end(rim.point, rim.normal, el),
      emitKind,
      seed: seed(),
      start: ctx.renderer.now(),
      count,
      modal,
    });
    if (!admitArc(arc, ctx.ledger)) return false;
    ctx.renderer.add(arc);
    return true;
  };

  /** In-range neighbours of `el` (cached rects; `src` fresh), nearest first. */
  const neighbours = (el: Element, src: RoundedRect, modal: Element | null) => {
    const cands = ctx
      .candidates()
      .filter((c) => c.el !== el && !nestedEl(c.el, el) && (!modal || modal.contains(c.el)));
    const rects = [src, ...cands.map((c) => c.rect)];
    const targets = clickTargets(0, rects, ARC_BUDGET.clickRadius).map((t) => ({
      ...t,
      index: t.index - 1,
    }));
    return { cands, targets };
  };

  return {
    strike,
    press(el, x, y, fine) {
      const tierMax = ctx.clickBolts();
      if (tierMax <= 0) return false;
      const modal = modalRoot(el);
      const now = ctx.renderer.now();
      // The charge entering the jelly: always shown, never a flash.
      ctx.renderer.add(flareArc(x, y, now, !!modal));
      const src = ctx.measure(el);
      if (!src) return false;
      ctx.charge.set(el, 0, now);
      const { cands, targets } = neighbours(el, src, modal);
      const n = clickBoltCount(
        targets.map((t) => t.gap),
        fine,
        tierMax,
      );
      if (n === 0) return fizz(el, src, { x, y }, 'click', undefined, !!modal);
      let any = false;
      chooseClickTargets(targets, n, ctx.rand).forEach((t, i) => {
        const target = cands[t.index].el;
        const ok = strike(el, target, {
          kind: 'click',
          start: now + i * ARC_BUDGET.clickStaggerMs,
          modal: !!modal,
        });
        if (ok) {
          any = true;
          ctx.charge.drain(target, ARC_BUDGET.chargeDrain, now);
        }
      });
      return any;
    },
    background(x, y) {
      if (ctx.clickBolts() <= 0) return false;
      const cands = ctx.candidates();
      const hit = nearestRimWithin(
        { x, y },
        cands.map((c) => c.rect),
        ARC_BUDGET.dischargeRadius,
      );
      if (!hit) return false;
      const el = cands[hit.index].el;
      const now = ctx.renderer.now();
      const toCursor = { x: -hit.rim.normal.x, y: -hit.rim.normal.y };
      const arc = boltArc({
        kind: 'discharge',
        emitKind: 'click',
        a: end(hit.rim.point, hit.rim.normal, el),
        b: end({ x, y }, toCursor),
        seed: mixSeed(seed(), 0xd15c),
        start: now,
      });
      ctx.renderer.add(flareArc(x, y, now));
      if (!admitArc(arc, ctx.ledger)) return false;
      ctx.renderer.add(arc);
      return true;
    },
    key(el) {
      if (ctx.clickBolts() <= 0) return false;
      const src = ctx.measure(el);
      if (!src) return false;
      const modal = modalRoot(el);
      ctx.charge.set(el, 0, ctx.renderer.now());
      const { cands, targets } = neighbours(el, src, modal);
      const centre = { x: src.x + src.w / 2, y: src.y + src.h / 2 };
      if (targets.length === 0) return fizz(el, src, centre, 'key', 2, !!modal);
      return strike(el, cands[targets[0].index].el, { kind: 'key', modal: !!modal });
    },
  };
}

// ── Delegated input ──────────────────────────────────────────────────────────

export interface ClickInputOptions {
  /** May click arcs fire right now (global gates + tier). */
  allowed(): boolean;
  actions: Pick<ArcActions, 'press' | 'background' | 'key'>;
}

const focusVisible = (el: Element): boolean => {
  try {
    return el.matches(':focus-visible');
  } catch {
    return true;
  }
};

/** One capture `pointerdown` + one capture `click` on the document. Returns the teardown. */
export function installClickArcs(doc: Document, opts: ClickInputOptions): () => void {
  const onPointerDown = (e: PointerEvent) => {
    if (e.isPrimary === false) return;
    const touch = e.pointerType === 'touch';
    if (!touch && e.button !== 0) return;
    if (!opts.allowed()) return;
    const target = e.target as Element | null;
    if (!target || typeof target.closest !== 'function') return;
    const host = pressHost(target);
    if (host) {
      opts.actions.press(host, e.clientX, e.clientY, !touch);
      return;
    }
    // Only a press on bare page (no jelly ancestor, nothing blocked or editable) draws charge to the cursor.
    if (
      target.closest(JELLY_SELECTOR) ||
      target.closest(CLICK_BLOCK_SELECTOR) ||
      isEditable(target)
    )
      return;
    opts.actions.background(e.clientX, e.clientY);
  };
  const onClick = (e: MouseEvent) => {
    // detail 0: a keyboard- or AT-synthesised activation. Pointer clicks already arced on pointerdown.
    if (e.detail !== 0) return;
    if (!opts.allowed()) return;
    const host = pressHost(e.target);
    if (!host) return;
    const focused = (e.target as Element | null) ?? host;
    if (!focusVisible(focused) && !focusVisible(host)) return;
    opts.actions.key(host);
  };
  const capture = { capture: true, passive: true } as const;
  doc.addEventListener('pointerdown', onPointerDown, capture);
  doc.addEventListener('click', onClick, capture);
  return () => {
    doc.removeEventListener('pointerdown', onPointerDown, capture);
    doc.removeEventListener('click', onClick, capture);
  };
}
