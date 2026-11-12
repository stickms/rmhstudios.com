import { describe, expect, it } from 'vitest';
import { RIPPLE } from '@/lib/fluid';
import {
  AMBIENT_RESUME_MS,
  DWELL_MS,
  GlobeEngine,
  IDLE_SPIN,
  RETICLE,
  SCROLL_SPIN_MAX,
  placePoints,
} from '../engine';

const IDLE = { tick: 0, focusInside: false };

/** Step at 60 Hz from `from` for `ms`; returns the time reached and the last result. */
function run(e: GlobeEngine, from: number, ms: number, input = IDLE) {
  let t = from;
  let last = { painted: false, busy: false };
  for (; t < from + ms; t += 1000 / 60) last = e.step(t, input);
  return { t, ...last };
}

/** Step until the engine reports rest (or a generous limit). */
function settle(e: GlobeEngine, from: number) {
  let t = from;
  for (let i = 0; i < 60 * 30; i++) {
    t += 1000 / 60;
    if (!e.step(t, IDLE).busy) return t;
  }
  throw new Error('the globe never came to rest');
}

describe('the globe engine (the liquid globe\'s physics, headless)', () => {
  it('places destinations deterministically on the unit sphere', () => {
    const a = placePoints(5);
    expect(a).toEqual(placePoints(5));
    for (const p of a) expect(Math.hypot(p.bx, p.by, p.bz)).toBeCloseTo(1, 10);
  });

  it('is at rest when nothing has touched it: one step, then not busy', () => {
    const e = new GlobeEngine(placePoints(5));
    expect(e.step(1000, IDLE).busy).toBe(false);
  });

  it('a drag turns it about the axis the pointer implies, and the glass stays under the finger', () => {
    const e = new GlobeEngine([{ bx: 0, by: 0, bz: 1 }]);
    e.grab(0, 0, 0);
    e.move(0.3, 0, 16);
    e.step(32, IDLE);
    // The point that was dead centre followed the pointer to x = 0.3 on the unit sphere.
    expect(e.px[0]).toBeCloseTo(0.3, 5);
    expect(e.py[0]).toBeCloseTo(0, 5);
  });

  it('a release throws it: it coasts on friction and comes to rest by itself', () => {
    const e = new GlobeEngine([]);
    e.grab(-0.4, 0, 0);
    let t = 0;
    for (let i = 1; i <= 6; i++) {
      t = i * 16;
      e.move(-0.4 + i * 0.1, 0, t);
      e.step(t, IDLE);
    }
    expect(e.release(true)).toBe(-1);
    const speedAtRelease = Math.hypot(e.w[0]!, e.w[1]!, e.w[2]!);
    expect(speedAtRelease).toBeGreaterThan(50);
    const after = run(e, t, 200);
    expect(Math.hypot(e.w[0]!, e.w[1]!, e.w[2]!)).toBeLessThan(speedAtRelease);
    expect(after.busy).toBe(true);
    settle(e, after.t);
    expect(Math.hypot(e.w[0]!, e.w[1]!, e.w[2]!)).toBe(0);
  });

  it('locks the destination inside the reticle and no other', () => {
    const e = new GlobeEngine(placePoints(5));
    e.orient(2);
    e.step(0, IDLE);
    expect(e.lock).toBe(2);
    expect(Math.hypot(e.px[2]!, e.py[2]!)).toBeLessThan(RETICLE);
  });

  it('nothing navigates without a deliberate hold: an early release returns -1, a full ring returns the lock', () => {
    const e = new GlobeEngine(placePoints(5));
    e.orient(1);
    e.step(0, IDLE);
    e.grab(0, 0, 0);
    const early = run(e, 16, DWELL_MS / 3);
    expect(e.fill).toBeGreaterThan(0);
    expect(e.ready).toBe(false);
    expect(e.release(true)).toBe(-1);
    // The ring drains, faster than it filled.
    const drained = settle(e, early.t);
    expect(e.fill).toBe(0);

    e.grab(0, 0, drained);
    run(e, drained + 16, DWELL_MS + 200);
    expect(e.ready).toBe(true);
    expect(e.release(true)).toBe(1);
  });

  it('a cancelled press never navigates, even with the ring full', () => {
    const e = new GlobeEngine(placePoints(5));
    e.orient(0);
    e.step(0, IDLE);
    e.grab(0, 0, 0);
    run(e, 16, DWELL_MS + 200);
    expect(e.ready).toBe(true);
    expect(e.release(false)).toBe(-1);
  });

  it('keyboard focus glides the globe until that destination faces the viewer', () => {
    const e = new GlobeEngine(placePoints(5));
    e.face(4);
    settle(e, 0);
    expect(e.pz[4]).toBeCloseTo(1, 3);
    expect(e.lock).toBe(4);
  });

  it('a scroll kicks the spin about the vertical, bounded', () => {
    const e = new GlobeEngine([]);
    e.scroll(30);
    expect(e.w[1]).toBe(120);
    e.scroll(100000);
    expect(e.w[1]).toBe(SCROLL_SPIN_MAX);
    expect(e.w[0]).toBe(0);
    settle(e, 0);
  });

  it('drifts on the ambient tick until taken hold of, and again once an ambient globe is let go', () => {
    const e = new GlobeEngine([{ bx: 0, by: 0, bz: 1 }]);
    e.step(0, { tick: 1, focusInside: false });
    // One second of drift is IDLE_SPIN degrees about the vertical.
    expect(Math.asin(e.px[0]!) * (180 / Math.PI)).toBeCloseTo(IDLE_SPIN, 3);

    e.grab(0, 0, 100);
    e.release(false);
    const rest = settle(e, 100);
    const before = e.px[0]!;
    e.step(rest + 16, { tick: 1, focusInside: false });
    expect(e.px[0]).toBeCloseTo(before, 6); // held still: it was touched
    expect(e.letGoIn(rest)).toBeGreaterThan(0);

    const later = 100 + AMBIENT_RESUME_MS + 50;
    e.step(later, IDLE); // lets go
    e.step(later + 16, { tick: 1, focusInside: false });
    expect(e.px[0]).not.toBeCloseTo(before, 3);
  });

  it('an open (non-ambient) globe that was touched does not drift again', () => {
    const e = new GlobeEngine([{ bx: 0, by: 0, bz: 1 }]);
    e.ambient = false;
    e.face(0);
    const rest = settle(e, 0);
    const before = e.px[0]!;
    e.step(rest + AMBIENT_RESUME_MS * 2, { tick: 1, focusInside: false });
    expect(e.px[0]).toBeCloseTo(before, 6);
  });

  it('a poke ripples, rocks and dents the ball, moves no destination, and all of it dies away', () => {
    const e = new GlobeEngine([{ bx: 0, by: 0, bz: 1 }]);
    e.step(0, IDLE);
    e.strike(0.5, 0.2, 0);
    const first = e.step(16, IDLE);
    expect(first.busy).toBe(true);
    expect(e.rippling).toBe(true);
    expect(e.soft).toBe(true);
    // Display only: the true projection the lock reads has not moved.
    expect(e.px[0]).toBeCloseTo(0, 10);
    expect(e.py[0]).toBeCloseTo(0, 10);
    // ...while the drawn rotation has (the wobble).
    run(e, 32, 120);
    expect(Math.abs(e.drawM[2]!) + Math.abs(e.drawM[5]!)).toBeGreaterThan(1e-4);

    const out = new Float32Array(12);
    e.ripplesInto(out, 500);
    expect(out[3]).toBeCloseTo(0.5, 5);
    expect(out[7]).toBe(-1);

    const rest = settle(e, 150);
    expect(rest).toBeGreaterThan(RIPPLE.life * 1000);
    expect(e.rippling).toBe(false);
    expect(e.soft).toBe(false);
    expect(e.waveAt({ bx: 0, by: 0, bz: 1 }, rest)).toBe(0);
  });

  it('a poke off the ball does nothing', () => {
    const e = new GlobeEngine([]);
    e.strike(1.4, 0, 0);
    expect(e.step(16, IDLE).busy).toBe(false);
  });
});
