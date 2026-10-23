/**
 * The electric field (#989, layered on the arc system): click charge and its hops, breakdown-gap arcs and Coulomb
 * attraction. Laws and cadence numbers are in `charge.ts`; the tuning constants are `CHARGE` in `lib/jelly/tiers.ts`.
 *
 * ## Click charge and hops
 *
 * {@link ElectricField.deposit} adds charge to a body (a click deposits `CHARGE.clickCharge`) and emits
 * `charge:pulse` at the deposit point — the engine renders the ring travelling through the gel. When the ring reaches
 * the rim facing the nearest neighbour in reach (`ARC_BUDGET.clickRadius`, never the body it just came from), the
 * charge jumps: an arc through the shared flash ledger carries `q · hopFraction` to the neighbour (the sender keeps the
 * rest), the neighbour gets its own `charge:pulse` at the landing point, and the chain continues from there. A hop that
 * would carry less than `minHopCharge` is never made, so the chain halves itself to a stop. A hop the ledger refuses
 * waits for the ledger to free (≤ `ELECTRIC.hopWaitMaxMs`, the charge decaying meanwhile) instead of flashing early.
 *
 * ## Breakdown
 *
 * Any visible pair whose rim gap is below `breakdownGap(max(qa, qb))` strikes after `CHARGE.formativeLagMs` of
 * continuously meeting that condition — deterministic, alongside the probabilistic ambient rate — and the strike
 * shares the pair's charge equally. With bodies laid out ≥ 16px apart this only happens to charged or too-close pairs;
 * a too-close pair "arcs forever", once per `ELECTRIC.breakdownRefractoryMs` at most, and always inside the flash
 * ledger (≤ 3 onsets/s site-wide).
 *
 * ## Coulomb attraction
 *
 * Pairs within `CHARGE.attractReachPx` whose ends both hold more than `minHopCharge` get a `charge:attract` on each
 * body — equal and opposite unit directions (centre to centre), force `coulombForce(qa, qb, gap)` ∈ [0, 1] — at most
 * `ELECTRIC.attractMaxHz` per pair. Physics turns it into a bounded translate.
 *
 * ## Cost
 *
 * One `setTimeout`, never a frame. It is armed only while something needs evaluating: a charged body (every
 * `ELECTRIC.tickMs`), or a pending breakdown (at its due time). With nothing charged and no pair too close the field
 * holds no timer at all; {@link ElectricField.poke} re-checks after a rect, gate or quiet-state change. Pair geometry is
 * the ambient scheduler's cached pair list (rebuilt only on registry change); only the elements a bolt joins are
 * measured fresh, inside the strike.
 */

import type { JellyBus } from '../bus';
import { CHARGE } from '../tiers';
import {
  attractEligible,
  breaksDown,
  coulombForce,
  ELECTRIC,
  hopCarry,
  ringDelayMs,
} from './charge';
import type { ArcActions } from './clicks';
import { closestRimPoints, roundedRectGap, type RoundedRect } from './geometry';
import type { FlashLedger } from './ledger';
import type { ArcPair } from './pairs';
import { ARC_BUDGET } from './rate';
import { CHARGE_FLOOR, type ArcCandidate, type ChargeBook } from './scheduler';

/** The modal a body lives in (hops stay inside it, like click bolts). */
const MODAL_ROOT =
  '[role="dialog"][aria-modal="true"],[role="alertdialog"][aria-modal="true"],dialog[open]';

type TimerHandle = ReturnType<typeof setTimeout>;

export interface ElectricFieldOptions {
  actions: Pick<ArcActions, 'strikeArc'>;
  charge: ChargeBook;
  ledger: FlashLedger;
  bus: Pick<JellyBus, 'emit' | 'listenerCount'>;
  /** Cached candidates (visible jelly hosts, endpoint exclusions applied). */
  candidates(): readonly ArcCandidate[];
  /** Cached pairs, indices into {@link ElectricFieldOptions.candidates}. */
  pairs(): readonly ArcPair[];
  /** A fresh rounded rect for one element, or null. */
  measure(el: Element): RoundedRect | null;
  now(): number;
  /** Charge hops may jump (arcs on: `full` or `clicks`, hub closed). */
  hops(): boolean;
  /** Breakdown strikes allowed (`full` arcs, ambient gates, no quiet state). */
  breakdown(): boolean;
  /** Coulomb attraction allowed (arcs on, no quiet state). */
  attract(): boolean;
  /** Rects are stale (mid-scroll): a hop due now ends its chain instead of landing in the wrong place. */
  scrolling?(): boolean;
}

export interface ElectricField {
  /**
   * Add `q` (default `CHARGE.clickCharge`) to `el` at viewport (x, y), emit its pulse and plan the hop. `from` is the
   * body the charge just came from (never hopped straight back to). True when a hop is planned.
   */
  deposit(el: Element, x: number, y: number, q?: number, from?: Element | null): boolean;
  /** Something changed (rects, gates, quiet state, a deposit): re-evaluate whether the field needs its timer. */
  poke(): void;
  /** Clear every timer for good (gates off, teardown). Charge itself stays in the book and keeps decaying. */
  stop(): void;
  /** The field timer is armed. */
  readonly armed: boolean;
  /** Hops scheduled and not yet made. */
  readonly pendingHops: number;
}

const nested = (a: Element, b: Element) => a.contains(b) || b.contains(a);

export function createElectricField(opts: ElectricFieldOptions): ElectricField {
  const { charge, ledger, bus } = opts;
  const hopTimers = new Set<TimerHandle>();
  let timer: TimerHandle | undefined;
  let timerAt = Infinity;
  let stopped = false;

  // Pair bookkeeping keyed by element identity (ids, so a pair key is a cheap string).
  const ids = new WeakMap<Element, number>();
  let nextId = 1;
  const idOf = (el: Element) => {
    let id = ids.get(el);
    if (id === undefined) ids.set(el, (id = nextId++));
    return id;
  };
  const keyOf = (a: Element, b: Element) => {
    const x = idOf(a);
    const y = idOf(b);
    return x < y ? `${x}:${y}` : `${y}:${x}`;
  };
  /** Breakdown: when each pair currently meeting the condition is due to strike. */
  const due = new Map<string, number>();
  /** Attraction: last impulse per pair. */
  const lastPull = new Map<string, number>();

  const modalOf = (el: Element) =>
    typeof el.closest === 'function' ? el.closest(MODAL_ROOT) : null;

  /** The nearest candidate in click reach of `el` (fresh `src`), never `from`. */
  const nearest = (el: Element, src: RoundedRect, from: Element | null) => {
    const modal = modalOf(el);
    let best: { el: Element; rect: RoundedRect; gap: number } | null = null;
    for (const c of opts.candidates()) {
      if (c.el === el || c.el === from || nested(c.el, el)) continue;
      if (modal && !modal.contains(c.el)) continue;
      const gap = roundedRectGap(src, c.rect);
      if (!(gap > 0) || gap > ARC_BUDGET.clickRadius) continue;
      if (!best || gap < best.gap) best = { el: c.el, rect: c.rect, gap };
    }
    return best;
  };

  const pulse = (el: Element, x: number, y: number, q: number) => {
    if (bus.listenerCount('charge:pulse') > 0) bus.emit('charge:pulse', { el, x, y, q });
  };

  const later = (ms: number, fn: () => void) => {
    const h = setTimeout(
      () => {
        hopTimers.delete(h);
        if (!stopped) fn();
      },
      Math.max(0, ms),
    );
    hopTimers.add(h);
  };

  /** Jump `el`'s charge to its nearest neighbour (not `from`). */
  const hop = (el: Element, from: Element | null, waited: number) => {
    if (!opts.hops() || opts.scrolling?.()) return;
    const t = opts.now();
    const q = charge.electric(el, t);
    const carry = hopCarry(q);
    if (!(carry > 0)) return;
    const src = opts.measure(el);
    if (!src) return;
    const target = nearest(el, src, from);
    if (!target) return;
    if (!ledger.canOnset(t)) {
      const wait = ledger.nextFreeAt(t) - t;
      if (Number.isFinite(wait) && waited + wait <= ELECTRIC.hopWaitMaxMs) {
        later(wait + 1, () => hop(el, from, waited + wait + 1));
      }
      return;
    }
    const arc = opts.actions.strikeArc(el, target.el, {
      kind: 'click',
      energy: Math.min(1, 0.4 + 0.6 * carry),
    });
    if (!arc) return;
    charge.setElectric(el, q - carry, t);
    const land = arc.contacts[1] ?? arc.contacts[0];
    deposit(target.el, land.x, land.y, carry, el);
  };

  const deposit = (
    el: Element,
    x: number,
    y: number,
    amount: number = CHARGE.clickCharge,
    from: Element | null = null,
  ): boolean => {
    if (stopped) return false;
    const t = opts.now();
    const q = charge.deposit(el, amount, t);
    pulse(el, x, y, q);
    poke();
    if (!opts.hops()) return false;
    const src = opts.measure(el);
    if (!src) return false;
    const target = nearest(el, src, from);
    if (!target) return false;
    // The ring leaves the deposit point and reaches the rim facing the neighbour first.
    const contact = closestRimPoints(src, target.rect);
    const rim = contact?.a ?? { x, y };
    const delay = ringDelayMs(Math.hypot(rim.x - x, rim.y - y));
    if (!(hopCarry(q * Math.exp(-delay / CHARGE.decayMs)) > 0)) return false;
    later(delay, () => hop(el, from, 0));
    return true;
  };

  // ── The field tick: breakdown + attraction ─────────────────────────────────
  const clear = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    timerAt = Infinity;
  };

  const armAt = (at: number) => {
    if (stopped || !Number.isFinite(at)) return;
    if (timer !== undefined && timerAt <= at) return;
    clear();
    const t = opts.now();
    timerAt = at;
    timer = setTimeout(tick, Math.max(0, at - t));
  };

  function tick() {
    timer = undefined;
    timerAt = Infinity;
    if (stopped) return;
    const t = opts.now();
    const anyCharged = charge.charged(t).length > 0;
    const doBreak = opts.breakdown();
    const doPull = anyCharged && opts.attract() && bus.listenerCount('charge:attract') > 0;
    if (!doBreak) due.clear();
    if (!doPull) lastPull.clear();
    if (!doBreak && !doPull) return;

    const cands = opts.candidates();
    const pairs = opts.pairs();
    const seenBreak = new Set<string>();
    const seenPull = new Set<string>();
    let next = Infinity;

    for (const p of pairs) {
      const a = cands[p.a];
      const b = cands[p.b];
      if (!a || !b) continue;
      const qa = charge.electric(a.el, t);
      const qb = charge.electric(b.el, t);
      const key = keyOf(a.el, b.el);

      if (doBreak && breaksDown(p.gap, qa, qb)) {
        seenBreak.add(key);
        let at = due.get(key);
        if (at === undefined) due.set(key, (at = t + CHARGE.formativeLagMs));
        if (t >= at) {
          if (ledger.canOnset(t)) {
            const arc = opts.actions.strikeArc(a.el, b.el, {
              kind: 'ambient',
              energy: Math.min(1, 0.5 + 0.5 * Math.max(qa, qb)),
            });
            if (arc) {
              const share = (qa + qb) / 2;
              charge.setElectric(a.el, share, t);
              charge.setElectric(b.el, share, t);
              // The body that gained charge shows it entering.
              if (Math.abs(qa - qb) >= CHARGE_FLOOR) {
                const gainer = qa < qb ? 0 : 1;
                const land = arc.contacts[gainer] ?? arc.contacts[0];
                if (land?.el) pulse(land.el, land.x, land.y, share);
              }
              at = t + Math.max(ELECTRIC.breakdownRefractoryMs, CHARGE.formativeLagMs);
            } else {
              // Geometry refused (overlap, no box): look again after another lag.
              at = t + CHARGE.formativeLagMs;
            }
          } else {
            at = Math.max(t + 1, ledger.nextFreeAt(t));
          }
          due.set(key, at);
        }
        next = Math.min(next, at);
      }

      if (doPull && p.gap <= CHARGE.attractReachPx && attractEligible(qa, qb)) {
        seenPull.add(key);
        const last = lastPull.get(key) ?? -Infinity;
        const minGap = 1000 / ELECTRIC.attractMaxHz;
        if (t - last >= minGap) {
          const force = coulombForce(qa, qb, p.gap);
          const ra = a.rect;
          const rb = b.rect;
          const dx = rb.x + rb.w / 2 - (ra.x + ra.w / 2);
          const dy = rb.y + rb.h / 2 - (ra.y + ra.h / 2);
          const d = Math.hypot(dx, dy);
          if (force > 0 && d > 0) {
            const nx = dx / d;
            const ny = dy / d;
            bus.emit('charge:attract', { el: a.el, nx, ny, force });
            bus.emit('charge:attract', { el: b.el, nx: -nx, ny: -ny, force });
            lastPull.set(key, t);
          }
        }
        next = Math.min(next, (lastPull.get(key) ?? t) + minGap);
      }
    }
    for (const k of [...due.keys()]) if (!seenBreak.has(k)) due.delete(k);
    for (const k of [...lastPull.keys()]) if (!seenPull.has(k)) lastPull.delete(k);
    // Charge changes the breakdown gap and the force as it decays: keep looking while any remains.
    if (charge.charged(t).length > 0) next = Math.min(next, t + ELECTRIC.tickMs);
    armAt(next);
  }

  function poke() {
    if (stopped) return;
    const t = opts.now();
    // Breakdown can hold between uncharged, too-close bodies, so it is checked whenever it is allowed; attraction
    // only while something is charged.
    if (opts.breakdown() || (opts.attract() && charge.charged(t).length > 0)) armAt(t);
  }

  return {
    deposit: (el, x, y, q, from) => deposit(el, x, y, q, from ?? null),
    poke,
    stop() {
      stopped = true;
      clear();
      for (const h of hopTimers) clearTimeout(h);
      hopTimers.clear();
      due.clear();
      lastPull.clear();
    },
    get armed() {
      return timer !== undefined;
    },
    get pendingHops() {
      return hopTimers.size;
    },
  };
}
