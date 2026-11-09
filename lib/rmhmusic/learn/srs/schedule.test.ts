import { describe, expect, it } from 'vitest';
import {
  DAY_MS,
  MAX_INTERVAL_DAYS,
  MIN_INTERVAL_DAYS,
  dueCards,
  isDue,
  newCard,
  review,
  type CardState,
  type Grade,
} from './schedule';

const T0 = 1_700_000_000_000;
const days = (s: CardState, now: number) => (s.due - now) / DAY_MS;

/** Review each grade in turn, always on the day the card falls due. */
function run(grades: Grade[], start = T0): CardState {
  let s = newCard(start);
  let now = start;
  for (const g of grades) {
    s = review(s, g, now);
    now = s.due;
  }
  return s;
}

describe('newCard', () => {
  it('is due now and counts as never seen', () => {
    const s = newCard(T0);
    expect(s).toEqual({ due: T0, stability: 0, difficulty: 5, reps: 0, lapses: 0, last: null });
    expect(isDue(s, T0)).toBe(true);
  });
});

describe('review', () => {
  it('again on a new card is not a lapse and returns within the minimum interval', () => {
    const s = review(newCard(T0), 'again', T0);
    expect(s.lapses).toBe(0);
    expect(s.reps).toBe(1);
    expect(s.last).toBe(T0);
    expect(s.due).toBeGreaterThanOrEqual(T0);
    expect(days(s, T0)).toBeLessThanOrEqual(MIN_INTERVAL_DAYS + 1e-9);
  });

  it('grows the interval on each good review', () => {
    const first = run(['good']);
    const second = run(['good', 'good']);
    expect(days(second, second.last!)).toBeGreaterThan(days(first, first.last!));
  });

  it('grows more on easy than on good from the same state', () => {
    const base = run(['good', 'good']);
    const now = base.due;
    const good = review(base, 'good', now);
    const easy = review(base, 'easy', now);
    expect(easy.stability).toBeGreaterThan(good.stability);
    expect(easy.due).toBeGreaterThan(good.due);
  });

  it('hard still grows, but less than good', () => {
    const base = run(['good', 'good']);
    const now = base.due;
    const hard = review(base, 'hard', now);
    expect(hard.stability).toBeGreaterThan(base.stability);
    expect(hard.stability).toBeLessThan(review(base, 'good', now).stability);
  });

  it('again after a few reps is a lapse and shrinks stability', () => {
    const base = run(['good', 'good', 'good']);
    expect(base.reps).toBe(3);
    const lapsed = review(base, 'again', base.due);
    expect(lapsed.lapses).toBe(1);
    expect(lapsed.reps).toBe(4);
    expect(lapsed.stability).toBeLessThan(base.stability);
    expect(days(lapsed, base.due)).toBeLessThanOrEqual(MIN_INTERVAL_DAYS + 1e-9);
  });

  it('never schedules beyond the maximum interval, even after 50 easy reviews', () => {
    let s = newCard(T0);
    let now = T0;
    for (let i = 0; i < 50; i++) {
      s = review(s, 'easy', now);
      expect(days(s, now)).toBeLessThanOrEqual(MAX_INTERVAL_DAYS + 1e-9);
      expect(s.stability).toBeLessThanOrEqual(MAX_INTERVAL_DAYS);
      now = s.due;
    }
    expect(days(s, s.last!)).toBeCloseTo(MAX_INTERVAL_DAYS, 6);
  });

  it('counts a lapse only when the card had been successfully reviewed', () => {
    const missedTwice = review(review(newCard(T0), 'again', T0), 'again', T0 + DAY_MS);
    expect(missedTwice.lapses).toBe(0);
    expect(missedTwice.reps).toBe(2);
    const forgotten = review(review(newCard(T0), 'good', T0), 'again', T0 + 3 * DAY_MS);
    expect(forgotten.lapses).toBe(1);
    expect(forgotten.reps).toBe(2);
  });

  it('throws RangeError for an unknown grade instead of treating it as again', () => {
    const s = newCard(T0);
    for (const bad of ['', 'GOOD', 'toString', undefined, null, 3]) {
      expect(() => review(s, bad as unknown as Grade, T0)).toThrow(RangeError);
    }
  });

  it('keeps difficulty within [1, 10] under any run of grades', () => {
    for (const g of ['again', 'easy'] as const) {
      let s = newCard(T0);
      let now = T0;
      for (let i = 0; i < 60; i++) {
        s = review(s, g, now);
        now = s.due;
        expect(s.difficulty).toBeGreaterThanOrEqual(1);
        expect(s.difficulty).toBeLessThanOrEqual(10);
      }
    }
  });

  it('survives a clock that went backwards', () => {
    const s = run(['good', 'good']);
    const earlier = s.last! - 400 * DAY_MS;
    for (const g of ['again', 'hard', 'good', 'easy'] as const) {
      const r = review(s, g, earlier);
      expect(Number.isFinite(r.due)).toBe(true);
      expect(r.due).toBeGreaterThanOrEqual(earlier);
      expect(r.due - earlier).toBeLessThanOrEqual(MAX_INTERVAL_DAYS * DAY_MS + 1);
      expect(Number.isFinite(r.stability)).toBe(true);
      expect(r.stability).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(r.difficulty)).toBe(true);
      expect(r.last).toBe(earlier);
    }
  });

  it('survives a gap of many years and never lets the interval exceed the maximum', () => {
    const s = run(['good', 'good']);
    const later = s.last! + 50 * 365 * DAY_MS;
    const r = review(s, 'good', later);
    expect(Number.isFinite(r.due)).toBe(true);
    expect(r.due - later).toBeLessThanOrEqual(MAX_INTERVAL_DAYS * DAY_MS + 1);
    expect(r.stability).toBeLessThanOrEqual(MAX_INTERVAL_DAYS);
  });

  it('stays finite for extreme timestamps', () => {
    const s = review(newCard(-1e300), 'good', -1e300);
    const r = review(s, 'good', 1e300);
    for (const v of [r.due, r.stability, r.difficulty, r.reps, r.lapses]) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('repairs a corrupt stored state instead of propagating NaN', () => {
    const bad = {
      due: NaN,
      stability: Infinity,
      difficulty: -Infinity,
      reps: NaN,
      lapses: -4,
      last: NaN,
    } as CardState;
    const r = review(bad, 'good', T0);
    expect(r.due).toBeGreaterThanOrEqual(T0);
    expect(Number.isFinite(r.due)).toBe(true);
    expect(r.stability).toBeLessThanOrEqual(MAX_INTERVAL_DAYS);
    expect(r.difficulty).toBeGreaterThanOrEqual(1);
    expect(r.difficulty).toBeLessThanOrEqual(10);
    expect(Number.isInteger(r.reps) && r.reps >= 1).toBe(true);
    expect(r.lapses).toBe(0);
  });

  it('yields finite, bounded state for any mix of odd states, grades and clocks', () => {
    let seed = 12345;
    const rand = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    const odd = [NaN, Infinity, -Infinity, 0, -1, 1e300, -1e300, T0, T0 * 3, -T0];
    const pick = <V>(xs: V[]) => xs[Math.floor(rand() * xs.length)]!;
    const grades: Grade[] = ['again', 'hard', 'good', 'easy'];
    for (let i = 0; i < 2000; i++) {
      const s = {
        due: pick(odd),
        stability: pick([...odd, rand() * 1000]),
        difficulty: pick([...odd, rand() * 20]),
        reps: pick([...odd, 3]),
        lapses: pick([...odd, 1]),
        last: pick([null, ...odd]),
      } as CardState;
      const now = pick(odd.filter(Number.isFinite));
      const r = review(s, pick(grades), now);
      for (const v of [r.due, r.stability, r.difficulty, r.reps, r.lapses]) {
        expect(Number.isFinite(v)).toBe(true);
      }
      expect(r.due).toBeGreaterThanOrEqual(now);
      expect(r.due).toBeLessThanOrEqual(now + MAX_INTERVAL_DAYS * DAY_MS + Math.abs(now) * 1e-9);
      expect(r.stability).toBeGreaterThanOrEqual(0);
      expect(r.stability).toBeLessThanOrEqual(MAX_INTERVAL_DAYS);
      expect(r.difficulty).toBeGreaterThanOrEqual(1);
      expect(r.difficulty).toBeLessThanOrEqual(10);
      expect(typeof isDue(s, now)).toBe('boolean');
    }
  });

  it('does not mutate its input', () => {
    const s = newCard(T0);
    const copy = { ...s };
    review(s, 'good', T0);
    expect(s).toEqual(copy);
  });

  it('throws RangeError for a non-finite now', () => {
    const s = newCard(T0);
    for (const bad of [NaN, Infinity, -Infinity]) {
      expect(() => review(s, 'good', bad)).toThrow(RangeError);
      expect(() => newCard(bad)).toThrow(RangeError);
      expect(() => isDue(s, bad)).toThrow(RangeError);
      expect(() => dueCards([{ state: s }], bad, 5)).toThrow(RangeError);
    }
  });
});

describe('isDue', () => {
  it('is false before the due time and true from it', () => {
    const s = review(newCard(T0), 'good', T0);
    expect(isDue(s, s.due - 1)).toBe(false);
    expect(isDue(s, s.due)).toBe(true);
  });

  it('treats a never-seen card as new, however old its stored due is', () => {
    expect(isDue({ ...newCard(T0), due: T0 + 1000 * DAY_MS }, T0)).toBe(true);
  });

  it('does not strand a card for years when the clock was once ahead', () => {
    // Reviewed while the device clock ran 5000 days ahead: stability 2.2 days,
    // so the stored due is ~T0 + 5002 days.
    const s = review(newCard(T0), 'good', T0 + 5000 * DAY_MS);
    expect(days(s, s.last!)).toBeCloseTo(2.2, 6);
    expect(s.due).toBeGreaterThan(T0 + 5000 * DAY_MS);
    // The clock is corrected: the card is shown by T0 + 3 days, not ~5000 days later.
    expect(isDue(s, T0)).toBe(true);
    expect(isDue(s, T0 + 3 * DAY_MS)).toBe(true);
    expect(dueCards([{ state: s }], T0, 5)).toHaveLength(1);
    // Reviewing it then re-anchors it to the corrected clock.
    const again = review(s, 'good', T0);
    expect(again.last).toBe(T0);
    expect(isDue(again, T0 + 1 * DAY_MS)).toBe(false);
  });

  it('keeps the stored due for a review only slightly ahead of now (cross-device skew)', () => {
    const s = review(newCard(T0), 'good', T0 + 1000);
    expect(isDue(s, T0)).toBe(false);
    expect(isDue(s, s.due)).toBe(true);
  });

  it('shows a reviewed card that lost its last review time', () => {
    const s = { ...review(newCard(T0), 'good', T0), last: null };
    expect(isDue(s, T0)).toBe(true);
  });
});

describe('dueCards', () => {
  const card = (id: string, due: number, reps = 1) => ({
    id,
    state: { ...newCard(0), due, reps, last: due - DAY_MS },
  });

  it('returns due cards, most overdue first, capped at limit', () => {
    const now = T0;
    const cards = [
      card('a', now - 1 * DAY_MS),
      card('b', now - 9 * DAY_MS),
      card('c', now + DAY_MS),
      card('d', now - 5 * DAY_MS),
    ];
    expect(dueCards(cards, now, 10).map((c) => c.id)).toEqual(['b', 'd', 'a']);
    expect(dueCards(cards, now, 2).map((c) => c.id)).toEqual(['b', 'd']);
  });

  it('puts never-seen cards after genuinely overdue ones, in input order', () => {
    const now = T0;
    const cards = [
      { id: 'n1', state: newCard(now - 400 * DAY_MS) },
      card('late', now - DAY_MS),
      { id: 'n2', state: newCard(now - 500 * DAY_MS) },
    ];
    expect(dueCards(cards, now, 10).map((c) => c.id)).toEqual(['late', 'n1', 'n2']);
  });

  it('handles odd limits and does not mutate the input', () => {
    const cards = [card('a', T0 - 1), card('b', T0 - 2)];
    const order = cards.map((c) => c.id);
    expect(dueCards(cards, T0, 0)).toEqual([]);
    expect(dueCards(cards, T0, -3)).toEqual([]);
    expect(dueCards(cards, T0, NaN)).toEqual([]);
    expect(dueCards(cards, T0, 1.9)).toHaveLength(1);
    expect(dueCards(cards, T0, Infinity)).toHaveLength(2);
    expect(cards.map((c) => c.id)).toEqual(order);
  });
});
