import { describe, expect, it } from 'vitest';
import { bucketDaily, median, summarize } from '../price-history';

const now = new Date('2026-10-30T12:00:00Z');
const sale = (daysAgo: number, price: number) => ({
  priceCoins: price,
  closedAt: new Date(now.getTime() - daysAgo * 86_400_000),
});

describe('median', () => {
  it('handles odd, even and empty', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBe(0);
  });
});

describe('bucketDaily', () => {
  it('returns one bucket per day, oldest first, ending today', () => {
    const b = bucketDaily([], now, 30);
    expect(b).toHaveLength(30);
    expect(b[29].day).toBe('2026-10-30');
    expect(b[0].day).toBe('2026-10-01');
    expect(b.every((x) => x.volume === 0 && x.avg === null)).toBe(true);
  });

  it('aggregates average, low, high and volume per UTC day', () => {
    const b = bucketDaily([sale(0, 100), sale(0, 200), sale(2, 50)], now, 30);
    expect(b[29]).toMatchObject({ avg: 150, min: 100, max: 200, volume: 2 });
    expect(b[27]).toMatchObject({ avg: 50, min: 50, max: 50, volume: 1 });
  });

  it('ignores sales outside the window', () => {
    const b = bucketDaily([sale(31, 999), sale(40, 999)], now, 30);
    expect(b.reduce((n, x) => n + x.volume, 0)).toBe(0);
  });
});

describe('summarize', () => {
  it('reports median, low, high and total volume', () => {
    expect(summarize([sale(1, 10), sale(2, 30), sale(3, 20)])).toEqual({
      median: 20,
      low: 10,
      high: 30,
      volume: 3,
    });
  });

  it('is null with no sales', () => {
    expect(summarize([])).toBeNull();
  });
});
