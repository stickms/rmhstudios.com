import { describe, expect, it } from 'vitest';
import {
  AGAIN,
  EASY,
  GOOD,
  HARD,
  initDifficulty,
  initStability,
  intervalFor,
  nextMemory,
  retrievability,
  type Memory,
  type Rating,
} from './fsrs';
import { DAY_MS, newCard, recallChance, review } from './schedule';

// Golden values computed with the reference implementation (ts-fsrs 5.4.2, FSRS-6 defaults, no
// fuzz) for one learner's history: [days since the last review, rating, stability, difficulty].
const GOLDEN: [number, Rating, number, number][] = [
  [0, 3, 2.3065, 2.1181],
  [2, 3, 10.96433, 2.11121],
  [5, 4, 46.86576, 1],
  [12, 1, 2.76889, 7.02699],
  [1, 3, 5.0036, 7.01519],
  [0, 3, 5.0036, 7.0034],
  [4, 2, 9.20871, 7.99595],
  [8, 3, 18.50458, 7.98318],
];

describe('FSRS-6 core', () => {
  it('reproduces the reference implementation step for step', () => {
    let m: Memory | null = null;
    for (const [t, g, s, d] of GOLDEN) {
      m = nextMemory(m, t, g);
      expect(m.stability).toBeCloseTo(s, 4);
      expect(m.difficulty).toBeCloseTo(d, 4);
    }
  });

  it('retrievability is 90% at one stability, 1 at once, and falls with time', () => {
    expect(retrievability(0, 10)).toBe(1);
    expect(retrievability(10, 10)).toBeCloseTo(0.9, 6);
    expect(retrievability(3, 10)).toBeCloseTo(0.96102427, 6);
    expect(retrievability(30, 10)).toBeLessThan(retrievability(10, 10));
  });

  it('schedules the next review where recall falls to the desired retention', () => {
    expect(intervalFor(30)).toBeCloseTo(30, 6);
    expect(intervalFor(30, 0.8)).toBeGreaterThan(30);
    expect(retrievability(intervalFor(12, 0.8), 12)).toBeCloseTo(0.8, 6);
  });

  it('starts better grades with more stability and less difficulty', () => {
    expect(initStability(AGAIN)).toBeLessThan(initStability(HARD));
    expect(initStability(HARD)).toBeLessThan(initStability(GOOD));
    expect(initStability(GOOD)).toBeLessThan(initStability(EASY));
    expect(initDifficulty(AGAIN)).toBeGreaterThan(initDifficulty(GOOD));
    expect(initDifficulty(EASY)).toBeGreaterThanOrEqual(1);
  });

  it('grows stability on a recall, more when recalled later, and cuts it on a lapse', () => {
    const base: Memory = { stability: 10, difficulty: 5 };
    const soon = nextMemory(base, 3, GOOD).stability;
    const late = nextMemory(base, 30, GOOD).stability;
    expect(soon).toBeGreaterThan(10);
    expect(late).toBeGreaterThan(soon);
    expect(nextMemory(base, 10, HARD).stability).toBeLessThan(nextMemory(base, 10, GOOD).stability);
    expect(nextMemory(base, 10, GOOD).stability).toBeLessThan(nextMemory(base, 10, EASY).stability);
    expect(nextMemory(base, 10, AGAIN).stability).toBeLessThan(10);
  });

  it('keeps difficulty in [1, 10] and stability positive under any run of grades', () => {
    let m: Memory | null = null;
    for (let i = 0; i < 400; i++) {
      const g = (((i * 7 + (i >> 2)) % 4) + 1) as Rating;
      m = nextMemory(m, i % 5 === 0 ? 0 : 1 + (i % 40), g);
      expect(m.difficulty).toBeGreaterThanOrEqual(1);
      expect(m.difficulty).toBeLessThanOrEqual(10);
      expect(m.stability).toBeGreaterThan(0);
      expect(Number.isFinite(m.stability)).toBe(true);
    }
  });

  it('repairs a non-finite elapsed time instead of propagating NaN', () => {
    const m = nextMemory({ stability: 5, difficulty: 5 }, Number.NaN, GOOD);
    expect(Number.isFinite(m.stability)).toBe(true);
    expect(Number.isFinite(m.difficulty)).toBe(true);
  });

  it('throws on a rating outside the four', () => {
    expect(() => nextMemory(null, 0, 5 as Rating)).toThrow(RangeError);
  });
});

describe('scheduler on FSRS', () => {
  const T0 = Date.UTC(2026, 10, 22);

  it('reads a row written by the earlier scheduler as FSRS memory and keeps growing it', () => {
    const old = { due: T0, stability: 6.6, difficulty: 4.2, reps: 4, lapses: 0, last: T0 - 6 * DAY_MS };
    const next = review(old, 'good', T0);
    expect(next.stability).toBeGreaterThan(6.6);
    expect(next.reps).toBe(5);
    expect(next.due).toBeGreaterThan(T0 + 6 * DAY_MS);
  });

  it('a lapse on a graduated card counts and returns within minutes; the relearn pass does not', () => {
    let s = review(newCard(T0), 'good', T0);
    s = review(s, 'good', s.due);
    const lapsed = review(s, 'again', s.due + DAY_MS);
    expect(lapsed.lapses).toBe(1);
    expect(lapsed.due - (s.due + DAY_MS)).toBeLessThanOrEqual(15 * 60_000);
    expect(lapsed.stability).toBeLessThan(s.stability);
  });

  it('reports the recall chance: null while new, 90% on the due day, lower after', () => {
    const fresh = newCard(T0);
    expect(recallChance(fresh, T0)).toBeNull();
    const s = review(fresh, 'good', T0);
    expect(recallChance(s, T0)).toBe(1);
    const atDue = recallChance(s, s.due)!;
    expect(atDue).toBeGreaterThan(0.85);
    expect(atDue).toBeLessThan(0.95);
    expect(recallChance(s, s.due + 30 * DAY_MS)!).toBeLessThan(atDue);
    expect(recallChance(s, T0 - DAY_MS)).toBe(1);
  });
});
