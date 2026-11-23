import { describe, expect, it } from 'vitest';
import { ARRIVALS_MIN, enoughArrivals, shapeArrivals } from './arrivals';

describe('shapeArrivals', () => {
  it('sums groups into Monday-first weekdays and 24 hours', () => {
    const s = shapeArrivals([
      { dow: 1, hr: 9, n: 4 },
      { dow: 1, hr: 17, n: 2 },
      { dow: 7, hr: 9, n: 1 },
    ]);
    expect(s.total).toBe(7);
    expect(s.weekdays).toEqual([6, 0, 0, 0, 0, 0, 1]);
    expect(s.hours[9]).toBe(5);
    expect(s.hours[17]).toBe(2);
    expect(s.hours).toHaveLength(24);
  });

  it('ignores groups outside the calendar and empty ones', () => {
    const s = shapeArrivals([
      { dow: 0, hr: 3, n: 5 },
      { dow: 2, hr: 24, n: 5 },
      { dow: 2, hr: 3, n: 0 },
    ]);
    expect(s.total).toBe(0);
  });

  it('needs ten events to draw', () => {
    expect(enoughArrivals(ARRIVALS_MIN - 1)).toBe(false);
    expect(enoughArrivals(ARRIVALS_MIN)).toBe(true);
  });
});
