/**
 * The electric field (field.ts, #989): click charge hops through the shared ledger, halving to a stop and never
 * straight back; breakdown waits the formative lag and scales with charge; Coulomb attraction is equal and opposite,
 * bounded and rate-limited. Fake timers; strikes are recorded by a fake `strikeArc` that asks the real ledger.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createJellyBus, type JellyEvents } from '../../bus';
import { CHARGE, FLASH_LEDGER } from '../../tiers';
import { breakdownGap } from '../charge';
import { createElectricField, type ElectricField } from '../field';
import type { RoundedRect } from '../geometry';
import { createFlashLedger, type FlashLedger } from '../ledger';
import { buildPairs } from '../pairs';
import type { LiveArc } from '../renderer';
import { createChargeBook, type ArcCandidate, type ChargeBook } from '../scheduler';
import { FakeEl } from './arc-dom';

const R = 8;
const rectOf = (el: FakeEl): RoundedRect => ({
  x: el.box.left,
  y: el.box.top,
  w: el.box.width,
  h: el.box.height,
  r: R,
});

/** `n` 80×32 buttons in a row, `gap` px apart (rim to rim). */
function row(n: number, gap: number) {
  return Array.from(
    { length: n },
    (_, i) =>
      new FakeEl('button', { left: 100 + i * (80 + gap), top: 100, width: 80, height: 32 }, true),
  );
}

interface Harness {
  field: ElectricField;
  charge: ChargeBook;
  ledger: FlashLedger;
  strikes: { a: number; b: number; kind: string; t: number }[];
  onsets: number[];
  pulses: JellyEvents['charge:pulse'][];
  pulls: (JellyEvents['charge:attract'] & { t: number })[];
  els: FakeEl[];
  gates: { hops: boolean; breakdown: boolean; attract: boolean };
}

function harness(els: FakeEl[], o: { ledger?: FlashLedger } = {}): Harness {
  const ledger = o.ledger ?? createFlashLedger();
  const charge = createChargeBook();
  const bus = createJellyBus();
  const h: Harness = {
    field: null as never,
    charge,
    ledger,
    strikes: [],
    onsets: [],
    pulses: [],
    pulls: [],
    els,
    gates: { hops: true, breakdown: false, attract: false },
  };
  bus.on('charge:pulse', (p) => h.pulses.push(p));
  bus.on('charge:attract', (p) => h.pulls.push({ ...p, t: Date.now() }));
  const cands: ArcCandidate[] = els.map((el) => ({
    el: el as unknown as Element,
    rect: rectOf(el),
  }));
  const pairs = buildPairs(cands.map((c) => c.rect));
  const idx = (el: Element) => cands.findIndex((c) => c.el === el);
  h.field = createElectricField({
    actions: {
      strikeArc(a, b, opts = {}) {
        const t = Date.now();
        if (!ledger.tryOnset(t)) return null;
        h.onsets.push(t);
        h.strikes.push({ a: idx(a), b: idx(b), kind: opts.kind ?? 'click', t });
        const ra = cands[idx(a)].rect;
        const rb = cands[idx(b)].rect;
        const end = (r: RoundedRect, el: Element) => ({
          x: r.x + r.w / 2,
          y: r.y + r.h / 2,
          nx: 0,
          ny: 0,
          el,
        });
        return { contacts: [end(ra, a), end(rb, b)] } as unknown as LiveArc;
      },
    },
    charge,
    ledger,
    bus,
    candidates: () => cands,
    pairs: () => pairs,
    measure: (el) => cands[idx(el)]?.rect ?? null,
    now: () => Date.now(),
    hops: () => h.gates.hops,
    breakdown: () => h.gates.breakdown,
    attract: () => h.gates.attract,
  });
  return h;
}

const el = (h: Harness, i: number) => h.els[i] as unknown as Element;
const centre = (h: Harness, i: number) => {
  const r = rectOf(h.els[i]);
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
};

function maxPerWindow(times: number[], windowMs: number = FLASH_LEDGER.windowMs) {
  let max = 0;
  for (const s of times)
    max = Math.max(max, times.filter((t) => t >= s && t < s + windowMs).length);
  return max;
}

describe('click charge hops', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('deposits, pulses, then jumps after the ring reaches the rim — halving until below the hop floor', () => {
    const h = harness(row(6, 20));
    const c = centre(h, 0);
    expect(h.field.deposit(el(h, 0), c.x, c.y)).toBe(true);
    expect(h.pulses).toHaveLength(1);
    const { el: first, ...at } = h.pulses[0];
    expect(first).toBe(el(h, 0));
    expect(at).toEqual({ x: c.x, y: c.y, q: CHARGE.clickCharge });
    // The ring needs (centre → facing rim) / pulseSpeed: nothing jumps before it arrives.
    vi.advanceTimersByTime(10);
    expect(h.strikes).toHaveLength(0);
    vi.advanceTimersByTime(3000);

    expect(h.strikes.map((s) => [s.a, s.b])).toEqual([
      [0, 1],
      [1, 2],
    ]);
    // Each receiver gets about half of what its sender held (less the decay during the ring), never below the floor.
    const qs = h.pulses.map((p) => p.q);
    expect(qs).toHaveLength(3);
    for (let i = 1; i < qs.length; i++) {
      expect(qs[i]).toBeLessThanOrEqual(qs[i - 1] * CHARGE.hopFraction + 1e-9);
      expect(qs[i]).toBeGreaterThan(qs[i - 1] * CHARGE.hopFraction * 0.85);
      expect(qs[i]).toBeGreaterThanOrEqual(CHARGE.minHopCharge);
    }
    // The last holder could only pass on less than the floor, so the chain stopped.
    expect(qs[qs.length - 1] * CHARGE.hopFraction).toBeLessThan(CHARGE.minHopCharge);
    expect(h.field.pendingHops).toBe(0);
    // The sender keeps what it did not hand on.
    expect(h.charge.electric(el(h, 0), h.strikes[0].t)).toBeCloseTo(
      qs[0] * Math.exp(-(h.strikes[0].t - 10_000) / CHARGE.decayMs) - qs[1],
      6,
    );
  });

  it('never hops straight back to the body the charge came from', () => {
    const h = harness(row(2, 20));
    const c = centre(h, 0);
    h.field.deposit(el(h, 0), c.x, c.y);
    vi.advanceTimersByTime(3000);
    // B received ~0.5 (enough to hop on) but its only neighbour is the sender.
    expect(h.strikes.map((s) => [s.a, s.b])).toEqual([[0, 1]]);
    expect(h.pulses[1].q).toBeGreaterThan(CHARGE.minHopCharge / CHARGE.hopFraction);
  });

  it('a hop the ledger refuses waits for the ledger instead of flashing early', () => {
    const ledger = createFlashLedger();
    for (let i = 0; i < FLASH_LEDGER.maxOnsets; i++) ledger.tryOnset(10_000);
    const h = harness(row(3, 20), { ledger });
    const c = centre(h, 0);
    expect(h.field.deposit(el(h, 0), c.x, c.y)).toBe(true);
    vi.advanceTimersByTime(900);
    expect(h.strikes).toHaveLength(0);
    vi.advanceTimersByTime(2000);
    expect(h.strikes.length).toBeGreaterThan(0);
    expect(h.strikes[0].t).toBeGreaterThanOrEqual(10_000 + FLASH_LEDGER.windowMs);
  });

  it('a storm of deposits across many bodies keeps every hop inside the flash ledger', () => {
    const h = harness(row(8, 20));
    for (let i = 0; i < 60; i++) {
      const k = i % 8;
      const c = centre(h, k);
      h.field.deposit(el(h, k), c.x, c.y);
      vi.advanceTimersByTime(50);
    }
    vi.advanceTimersByTime(3000);
    expect(h.onsets.length).toBeGreaterThan(5);
    expect(maxPerWindow(h.onsets)).toBeLessThanOrEqual(FLASH_LEDGER.maxOnsets);
  });

  it('with hops gated off the charge still lands and pulses, but never jumps', () => {
    const h = harness(row(3, 20));
    h.gates.hops = false;
    const c = centre(h, 0);
    expect(h.field.deposit(el(h, 0), c.x, c.y)).toBe(false);
    vi.advanceTimersByTime(3000);
    expect(h.pulses).toHaveLength(1);
    expect(h.strikes).toHaveLength(0);
  });

  it('stop() cancels pending hops', () => {
    const h = harness(row(3, 20));
    const c = centre(h, 0);
    h.field.deposit(el(h, 0), c.x, c.y);
    expect(h.field.pendingHops).toBe(1);
    h.field.stop();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(3000);
    expect(h.strikes).toHaveLength(0);
  });
});

describe('breakdown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('an uncharged pair at layout spacing never breaks down, and arms no timer once it has looked', () => {
    const h = harness(row(2, 20));
    h.gates.hops = false;
    h.gates.breakdown = true;
    h.field.poke();
    vi.advanceTimersByTime(5000);
    expect(h.strikes).toHaveLength(0);
    expect(h.field.armed).toBe(false);
  });

  it('the threshold scales with charge, and the strike waits the formative lag', () => {
    const gap = 20;
    expect(gap).toBeGreaterThan(breakdownGap(0));
    expect(gap).toBeLessThan(breakdownGap(1));
    const h = harness(row(2, gap));
    h.gates.hops = false;
    h.gates.breakdown = true;
    h.charge.setElectric(el(h, 0), 1, Date.now());
    h.field.poke();
    vi.advanceTimersByTime(CHARGE.formativeLagMs - 1);
    expect(h.strikes).toHaveLength(0);
    vi.advanceTimersByTime(2);
    expect(h.strikes).toHaveLength(1);
    expect(h.strikes[0].kind).toBe('ambient');
    // The strike shares the charge: both now hold about half.
    const t = h.strikes[0].t;
    expect(h.charge.electric(el(h, 0), t)).toBeCloseTo(h.charge.electric(el(h, 1), t), 9);
    expect(h.pulses).toHaveLength(1);
    expect(h.pulses[0].el).toBe(el(h, 1));
  });

  it('a weaker charge needs a narrower gap', () => {
    const q = 0.2;
    const gap = 20; // breakdownGap(0.2) = 15.6 < 20
    expect(breakdownGap(q)).toBeLessThan(gap);
    const h = harness(row(2, gap));
    h.gates.hops = false;
    h.gates.breakdown = true;
    h.charge.setElectric(el(h, 0), q, Date.now());
    h.field.poke();
    vi.advanceTimersByTime(2000);
    expect(h.strikes).toHaveLength(0);
  });

  it('a too-close pair arcs forever — but never above the ledger cap', () => {
    const h = harness(row(2, 8));
    h.gates.hops = false;
    h.gates.breakdown = true;
    h.field.poke();
    vi.advanceTimersByTime(5000);
    expect(h.strikes.length).toBeGreaterThanOrEqual(5);
    expect(maxPerWindow(h.onsets)).toBeLessThanOrEqual(FLASH_LEDGER.maxOnsets);
    // First strike only after the formative lag.
    expect(h.strikes[0].t - 10_000).toBeGreaterThanOrEqual(CHARGE.formativeLagMs);
  });

  it('turning breakdown off (clicks mode, a quiet state) stops it', () => {
    const h = harness(row(2, 8));
    h.gates.hops = false;
    h.gates.breakdown = true;
    h.field.poke();
    vi.advanceTimersByTime(1000);
    const n = h.strikes.length;
    expect(n).toBeGreaterThan(0);
    h.gates.breakdown = false;
    vi.advanceTimersByTime(5000);
    expect(h.strikes.length).toBe(n);
    expect(h.field.armed).toBe(false);
  });
});

describe('Coulomb attraction', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('pulls a charged pair equal and opposite, bounded and at most 10 Hz, until the charge falls below the floor', () => {
    const h = harness(row(2, 40));
    h.gates.hops = false;
    h.gates.attract = true;
    h.charge.setElectric(el(h, 0), 0.9, Date.now());
    h.charge.setElectric(el(h, 1), 0.9, Date.now());
    h.field.poke();
    vi.advanceTimersByTime(1000);

    expect(h.pulls.length).toBeGreaterThan(0);
    expect(h.pulls.length % 2).toBe(0);
    for (let i = 0; i < h.pulls.length; i += 2) {
      const [p, q] = [h.pulls[i], h.pulls[i + 1]];
      expect(p.el).toBe(el(h, 0));
      expect(q.el).toBe(el(h, 1));
      expect(p.force).toBe(q.force);
      expect(p.force).toBeGreaterThan(0);
      expect(p.force).toBeLessThanOrEqual(1);
      expect(Math.hypot(p.nx, p.ny)).toBeCloseTo(1, 9);
      expect(q.nx).toBeCloseTo(-p.nx, 12);
      expect(q.ny).toBeCloseTo(-p.ny, 12);
      // Body 0 is left of body 1: it is pulled right.
      expect(p.nx).toBeGreaterThan(0);
    }
    // Rate limit: ≤ 10 impulses per pair per second (+1 for the window edge).
    expect(h.pulls.length / 2).toBeLessThanOrEqual(11);
    const times = h.pulls.filter((p) => p.el === el(h, 0)).map((p) => p.t);
    for (let i = 1; i < times.length; i++)
      expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(100);

    // Decay: once q ≤ minHopCharge the pull stops, and so does the timer.
    vi.advanceTimersByTime(10_000);
    const lastT = h.pulls[h.pulls.length - 1].t;
    const qAtLast = 0.9 * Math.exp(-(lastT - 10_000) / CHARGE.decayMs);
    expect(qAtLast).toBeGreaterThan(CHARGE.minHopCharge);
    expect(lastT - 10_000).toBeLessThan(CHARGE.decayMs * Math.log(0.9 / CHARGE.minHopCharge) + 150);
    expect(h.field.armed).toBe(false);
  });

  it('the force grows as the gap closes', () => {
    const near = harness(row(2, 20));
    const far = harness(row(2, 80));
    for (const h of [near, far]) {
      h.gates.hops = false;
      h.gates.attract = true;
      h.charge.setElectric(el(h, 0), 0.5, Date.now());
      h.charge.setElectric(el(h, 1), 0.5, Date.now());
      h.field.poke();
    }
    vi.advanceTimersByTime(1);
    expect(near.pulls[0].force).toBeGreaterThan(far.pulls[0].force);
  });

  it('no pull beyond the reach, with one end uncharged, or while attraction is gated off', () => {
    const beyond = harness(row(2, CHARGE.attractReachPx + 4));
    const single = harness(row(2, 20));
    const gated = harness(row(2, 20));
    for (const h of [beyond, single, gated]) {
      h.gates.hops = false;
      h.gates.attract = h !== gated;
      h.charge.setElectric(el(h, 0), 1, Date.now());
      if (h !== single) h.charge.setElectric(el(h, 1), 1, Date.now());
      h.field.poke();
    }
    vi.advanceTimersByTime(2000);
    expect(beyond.pulls).toHaveLength(0);
    expect(single.pulls).toHaveLength(0);
    expect(gated.pulls).toHaveLength(0);
    expect(gated.field.armed).toBe(false);
  });
});
