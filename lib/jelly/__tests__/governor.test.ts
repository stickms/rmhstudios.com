/**
 * The governor is the guardrail on an always-moving material (master plan R7, 04 §3.3). These pin its contract:
 * downscale-only, one step per 2 s window, the ladder order, warm-up and discontinuity immunity, and that it never
 * raises a budget.
 */
import { describe, expect, it } from 'vitest';
import {
  GOVERNOR_MAX_STEP,
  GOVERNOR_WARMUP_TICKS,
  GOVERNOR_WINDOW_MS,
  JellyGovernor,
  governBudget,
  knobsAt,
  p90,
} from '../governor';
import { JELLY_BUDGETS, type JellyBudget } from '../tiers';

/** Feed `ms` worth of ticks at `hz` with the given cost; returns the steps taken. */
function feed(
  g: JellyGovernor,
  ms: number,
  costMs: number,
  intervalMs = 1000 / g.clockHz,
): number[] {
  const steps: number[] = [];
  for (let t = 0; t < ms; t += intervalMs) {
    const s = g.record(costMs, intervalMs);
    if (s !== null) steps.push(s);
  }
  return steps;
}

const warm = (g: JellyGovernor) => {
  for (let i = 0; i < GOVERNOR_WARMUP_TICKS; i++) expect(g.record(100, 33)).toBeNull();
};

describe('ladder', () => {
  it('steps in the 04 §3.3 order', () => {
    expect(knobsAt(0)).toMatchObject({
      maxClockHz: Infinity,
      slotScale: 1,
      carrierScale: 1,
      ambientArcs: true,
      hazeScale: 1,
    });
    expect(knobsAt(1)).toMatchObject({ maxClockHz: 20, slotScale: 1 });
    expect(knobsAt(2)).toMatchObject({ slotScale: 0.5, carrierScale: 1 });
    expect(knobsAt(3)).toMatchObject({ carrierScale: 0.5, ambientArcs: true });
    expect(knobsAt(4)).toMatchObject({ ambientArcs: false, hazeScale: 1 });
    expect(knobsAt(5)).toMatchObject({ hazeScale: 0.125, maxClockHz: 20 });
    expect(knobsAt(6)).toMatchObject({ maxClockHz: 0 });
    expect(knobsAt(99).step).toBe(GOVERNOR_MAX_STEP);
  });

  it('never raises any budget value at any step', () => {
    for (const base of Object.values(JELLY_BUDGETS)) {
      for (let s = 0; s <= GOVERNOR_MAX_STEP; s++) {
        const b = governBudget(base, s);
        for (const k of Object.keys(base) as (keyof JellyBudget)[]) {
          if (k === 'ambientArcMinIntervalMs') expect(b[k]).toBeGreaterThanOrEqual(base[k]);
          else expect(b[k]).toBeLessThanOrEqual(base[k]);
        }
      }
    }
  });

  it('applies the knobs to the desktop budget', () => {
    const full = JELLY_BUDGETS.full;
    expect(governBudget(full, 0)).toEqual(full);
    expect(governBudget(full, 1).clockHz).toBe(20);
    expect(governBudget(full, 2).hazeSlots).toBe(4);
    expect(governBudget(full, 3).carriers).toBe(12);
    expect(governBudget(full, 4).ambientArcMinIntervalMs).toBe(Infinity);
    const last = governBudget(full, 6);
    expect([last.clockHz, last.idleClockHz]).toEqual([0, 0]);
  });
});

describe('p90', () => {
  it('is nearest-rank', () => {
    expect(p90([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toBe(9);
    expect(p90([5])).toBe(5);
    expect(p90([])).toBe(0);
  });
});

describe('JellyGovernor', () => {
  it('ignores the warm-up, however bad', () => {
    const g = new JellyGovernor('full', 30);
    warm(g);
    expect(g.step).toBe(0);
  });

  it('does nothing while within budget', () => {
    const g = new JellyGovernor('full', 30);
    warm(g);
    expect(feed(g, 20_000, 1)).toEqual([]);
    expect(g.step).toBe(0);
  });

  it('steps once per 2 s window on cost, never faster', () => {
    const g = new JellyGovernor('full', 30);
    warm(g);
    const steps = feed(g, GOVERNOR_WINDOW_MS * 3 + 200, 5);
    expect(steps).toEqual([1, 2, 3]);
    expect(g.clockHz).toBe(20);
  });

  it('uses the handheld cost target', () => {
    const desk = new JellyGovernor('full', 30);
    const hand = new JellyGovernor('handheld', 15);
    warm(desk);
    warm(hand);
    expect(feed(desk, GOVERNOR_WINDOW_MS + 100, 2.5)).toEqual([1]);
    expect(feed(hand, GOVERNOR_WINDOW_MS + 100, 2.5)).toEqual([]);
  });

  it('steps on late ticks (p90 interval > 1.5 × the clock period)', () => {
    const g = new JellyGovernor('full', 30);
    warm(g);
    // 30 Hz asked, 18 Hz delivered: 55 ms > 50 ms.
    expect(feed(g, GOVERNOR_WINDOW_MS + 100, 0.5, 55)).toEqual([1]);
    // Now at 20 Hz the same 55 ms is on time (≤ 75 ms).
    expect(feed(g, GOVERNOR_WINDOW_MS * 3, 0.5, 55)).toEqual([]);
  });

  it('treats a long gap (hidden tab, scroll pause) as a discontinuity, not load', () => {
    const g = new JellyGovernor('full', 30);
    warm(g);
    for (let i = 0; i < 20; i++) expect(g.record(0.5, 5000)).toBeNull();
    expect(g.step).toBe(0);
  });

  it('stops at clock 0 and never steps back up', () => {
    const g = new JellyGovernor('full', 30);
    warm(g);
    feed(g, GOVERNOR_WINDOW_MS * 20, 10);
    expect(g.step).toBe(GOVERNOR_MAX_STEP);
    expect(g.clockHz).toBe(0);
    expect(g.record(0, 33)).toBeNull();
    expect(g.step).toBe(GOVERNOR_MAX_STEP);
  });

  it('reset starts a route fresh, warm-up included', () => {
    const g = new JellyGovernor('full', 30);
    warm(g);
    feed(g, GOVERNOR_WINDOW_MS + 100, 10);
    expect(g.step).toBe(1);
    g.reset();
    expect(g.step).toBe(0);
    expect(g.clockHz).toBe(30);
    warm(g);
    expect(g.step).toBe(0);
  });
});
