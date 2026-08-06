import { describe, it, expect } from 'vitest';
import { ANNUAL_INTEREST_RATE, DEBT_EPOCH_MS, accrualFactor } from '@/lib/kaikai-debt/debt';
import {
  CATEGORY_ORDER,
  DISTRIBUTION_EDGES,
  buildGrid,
  densifyRhythm,
  distributionIndex,
  distributionLabel,
  endOfMonthMs,
  formatCompactDebt,
  formatShare,
  linearScale,
  linePath,
  logScale,
  logTicks,
  nearestIndex,
  niceTicks,
  projectSeries,
  squarify,
  sumStats,
  timeToReachMs,
  valueNow,
  withCumulative,
  type GridCell,
  type RhythmCell,
  type TimelineBucket,
} from '@/lib/kaikai-debt/stats';

const YEAR_MS = 365.2425 * 24 * 3_600_000;

describe('valueNow — the one arithmetic every chart shares', () => {
  it('is exactly the counter’s own projection', () => {
    const stat = { count: 3, principalCents: 1_000, basisCents: 800 };
    const atMs = DEBT_EPOCH_MS + YEAR_MS;
    // A bar chart that disagreed with the odometer above it would be worse than
    // no bar chart, so this is asserted rather than assumed.
    expect(valueNow(stat, atMs)).toBeCloseTo(800 * Math.exp(ANNUAL_INTEREST_RATE), 6);
  });

  it('never discounts below the epoch', () => {
    const stat = { count: 1, principalCents: 500, basisCents: 500 };
    expect(valueNow(stat, DEBT_EPOCH_MS - YEAR_MS)).toBeCloseTo(500, 6);
  });

  it('sums groups without touching their bases', () => {
    const total = sumStats([
      { count: 1, principalCents: 100, basisCents: 90 },
      { count: 2, principalCents: 250, basisCents: 200 },
    ]);
    expect(total).toEqual({ count: 3, principalCents: 350, basisCents: 290 });
  });
});

describe('withCumulative', () => {
  const timeline: TimelineBucket[] = [
    { startMs: Date.UTC(2026, 0, 1), count: 2, principalCents: 1_000, basisCents: 1_000 },
    { startMs: Date.UTC(2026, 1, 1), count: 1, principalCents: 500, basisCents: 400 },
  ];

  it('accumulates both money columns', () => {
    const rows = withCumulative(timeline);
    expect(rows.map((r) => r.cumulativePrincipalCents)).toEqual([1_000, 1_500]);
    expect(rows.map((r) => r.cumulativeBasisCents)).toEqual([1_000, 1_400]);
  });

  it('values each bucket at the END of its month, not the start', () => {
    // A bucket's own entries have to be inside the value it reports, or every
    // point on the line lags a month behind the rows that produced it.
    const rows = withCumulative(timeline);
    const endOfJanuary = endOfMonthMs(Date.UTC(2026, 0, 1));
    expect(rows[0]!.valueAtCents).toBeCloseTo(1_000 * accrualFactor(endOfJanuary), 6);
    expect(rows[0]!.valueAtCents).toBeGreaterThan(1_000);
  });

  it('is monotone when every bucket adds debt', () => {
    const rows = withCumulative(timeline);
    expect(rows[1]!.valueAtCents).toBeGreaterThan(rows[0]!.valueAtCents);
  });
});

describe('endOfMonthMs', () => {
  it('lands one millisecond before the next month, in UTC', () => {
    expect(endOfMonthMs(Date.UTC(2026, 0, 1))).toBe(Date.UTC(2026, 1, 1) - 1);
  });

  it('rolls the year over in December', () => {
    expect(endOfMonthMs(Date.UTC(2026, 11, 1))).toBe(Date.UTC(2027, 0, 1) - 1);
  });
});

describe('projectSeries', () => {
  it('starts at the current balance and ends at the horizon', () => {
    const from = DEBT_EPOCH_MS + YEAR_MS;
    const to = from + YEAR_MS;
    const series = projectSeries(1_000, from, to, 12);
    expect(series).toHaveLength(13);
    expect(series[0]!.cents).toBeCloseTo(1_000 * accrualFactor(from), 6);
    expect(series.at(-1)!.cents).toBeCloseTo(1_000 * accrualFactor(to), 6);
  });

  it('is strictly increasing — the debt only goes one way', () => {
    const series = projectSeries(500, DEBT_EPOCH_MS, DEBT_EPOCH_MS + YEAR_MS, 20);
    for (let i = 1; i < series.length; i++) {
      expect(series[i]!.cents).toBeGreaterThan(series[i - 1]!.cents);
    }
  });
});

describe('timeToReachMs — the projection, inverted', () => {
  it('agrees with the projection it inverts', () => {
    const basis = 1_234;
    const target = basis * 10;
    const atMs = timeToReachMs(basis, target);
    expect(atMs).not.toBeNull();
    expect(basis * accrualFactor(atMs!)).toBeCloseTo(target, 3);
  });

  it('returns null for a target already behind us', () => {
    expect(timeToReachMs(1_000, 500)).toBeNull();
  });

  it('returns null when there is no debt at all', () => {
    // A basis of zero never reaches anything, which is the honest answer.
    expect(timeToReachMs(0, 1_000_000)).toBeNull();
  });
});

describe('the histogram ladder', () => {
  it('is strictly ascending', () => {
    for (let i = 1; i < DISTRIBUTION_EDGES.length; i++) {
      expect(DISTRIBUTION_EDGES[i]!).toBeGreaterThan(DISTRIBUTION_EDGES[i - 1]!);
    }
  });

  it('buckets every positive amount, including past the top edge', () => {
    expect(distributionIndex(1)).toBe(0);
    expect(distributionIndex(99)).toBe(0);
    expect(distributionIndex(100)).toBe(1);
    expect(distributionIndex(Number.MAX_SAFE_INTEGER)).toBe(DISTRIBUTION_EDGES.length - 1);
  });

  it('labels the open-ended top bucket with a plus', () => {
    expect(distributionLabel(DISTRIBUTION_EDGES.length - 1)).toMatch(/\+$/);
    expect(distributionLabel(0)).toContain('–');
  });
});

describe('scales and ticks', () => {
  it('maps a linear domain onto a range', () => {
    const scale = linearScale(0, 10, 0, 100);
    expect(scale(0)).toBe(0);
    expect(scale(5)).toBe(50);
    expect(scale(10)).toBe(100);
  });

  it('collapses a degenerate domain to the middle rather than dividing by zero', () => {
    expect(linearScale(5, 5, 0, 100)(5)).toBe(50);
    expect(Number.isFinite(logScale(1, 1, 0, 100)(1))).toBe(true);
  });

  it('floors a log scale instead of returning −Infinity', () => {
    const scale = logScale(1, 1_000, 0, 300, 1);
    expect(Number.isFinite(scale(0))).toBe(true);
    expect(scale(1)).toBeCloseTo(0, 6);
    expect(scale(1_000)).toBeCloseTo(300, 6);
  });

  it('produces round tick values', () => {
    const ticks = niceTicks(0, 97, 5);
    expect(ticks.length).toBeGreaterThan(2);
    for (const tick of ticks) expect(tick % 20 === 0 || tick % 25 === 0).toBe(true);
  });

  it('produces powers of ten on a log axis', () => {
    for (const tick of logTicks(1, 5_000)) {
      expect(Math.log10(tick) % 1).toBeCloseTo(0, 9);
    }
  });
});

describe('linePath and nearestIndex', () => {
  it('emits an empty path for an empty series rather than a broken one', () => {
    expect(linePath([])).toBe('');
  });

  it('finds the nearest x by binary search', () => {
    const xs = [0, 10, 20, 30, 40];
    expect(nearestIndex(xs, -5)).toBe(0);
    expect(nearestIndex(xs, 14)).toBe(1);
    expect(nearestIndex(xs, 16)).toBe(2);
    expect(nearestIndex(xs, 999)).toBe(4);
    expect(nearestIndex([], 3)).toBe(-1);
  });
});

describe('squarify', () => {
  const box = { width: 400, height: 300 };

  it('tiles the whole box', () => {
    const values = [40, 30, 15, 10, 5];
    const tiles = squarify(values, box.width, box.height);
    const area = tiles.reduce((sum, tile) => sum + tile.width * tile.height, 0);
    expect(area).toBeCloseTo(box.width * box.height, 3);
  });

  it('gives each tile an area proportional to its value', () => {
    const values = [50, 25, 25];
    const tiles = squarify(values, box.width, box.height);
    const total = box.width * box.height;
    const byIndex = new Map(tiles.map((tile) => [tile.index, tile.width * tile.height]));
    expect(byIndex.get(0)! / total).toBeCloseTo(0.5, 3);
    expect(byIndex.get(1)! / total).toBeCloseTo(0.25, 3);
  });

  it('keeps the original index so colour survives the layout', () => {
    // Colour follows the entity, never its rank — the layout sorts by value and
    // must not take the palette with it.
    const tiles = squarify([1, 100, 10], box.width, box.height);
    expect(tiles.map((tile) => tile.index).sort()).toEqual([0, 1, 2]);
    const biggest = tiles.reduce((a, b) => (a.width * a.height > b.width * b.height ? a : b));
    expect(biggest.index).toBe(1);
  });

  it('drops zero and negative values instead of laying out degenerate hit targets', () => {
    const tiles = squarify([10, 0, -5, 10], box.width, box.height);
    expect(tiles.map((tile) => tile.index).sort()).toEqual([0, 3]);
  });

  it('returns nothing for an empty or zero-area request', () => {
    expect(squarify([], 100, 100)).toEqual([]);
    expect(squarify([1, 2], 0, 100)).toEqual([]);
  });

  it('keeps tiles near square rather than producing slivers', () => {
    // The entire reason for squarifying rather than slicing: a long thin sliver
    // reads as a large object, so area stops carrying magnitude.
    const tiles = squarify([30, 25, 20, 15, 10], 400, 300);
    for (const tile of tiles) {
      const ratio = Math.max(tile.width / tile.height, tile.height / tile.width);
      expect(ratio).toBeLessThan(6);
    }
  });
});

describe('densifyRhythm', () => {
  it('always returns the full 7 × 24 grid', () => {
    const sparse: RhythmCell[] = [
      { weekday: 3, hour: 14, count: 5, principalCents: 100, basisCents: 90 },
    ];
    const dense = densifyRhythm(sparse);
    expect(dense).toHaveLength(168);
    // An empty cell and a missing cell look identical once drawn, but only one
    // of them means "nothing happened then".
    expect(dense.find((cell) => cell.weekday === 3 && cell.hour === 14)!.count).toBe(5);
    expect(dense.every((cell) => cell.count >= 0)).toBe(true);
  });
});

describe('buildGrid', () => {
  const january = Date.UTC(2026, 0, 1);
  const february = Date.UTC(2026, 1, 1);
  const grid: GridCell[] = [
    { startMs: january, category: 'food', count: 3, principalCents: 900, basisCents: 850 },
    { startMs: february, category: 'rent', count: 1, principalCents: 5_000, basisCents: 4_000 },
  ];

  it('produces one cell per month per category, in canonical order', () => {
    const frame = buildGrid(grid);
    expect(frame.months).toEqual([january, february]);
    expect(frame.cells).toHaveLength(2 * CATEGORY_ORDER.length);
    expect(frame.cells.slice(0, 8).map((cell) => cell.category)).toEqual([...CATEGORY_ORDER]);
  });

  it('is month-major, so index arithmetic recovers both coordinates', () => {
    const frame = buildGrid(grid);
    const index = frame.cells.findIndex(
      (cell) => cell.startMs === february && cell.category === 'rent',
    );
    expect(Math.floor(index / CATEGORY_ORDER.length)).toBe(1);
    expect(index % CATEGORY_ORDER.length).toBe(CATEGORY_ORDER.indexOf('rent'));
  });

  it('reports the maxima every spatial view normalises against', () => {
    const frame = buildGrid(grid);
    expect(frame.maxCount).toBe(3);
    expect(frame.maxPrincipalCents).toBe(5_000);
    expect(frame.maxBasisCents).toBe(4_000);
  });

  it('zero-fills the cells the payload does not carry', () => {
    const frame = buildGrid(grid);
    const empty = frame.cells.find(
      (cell) => cell.startMs === january && cell.category === 'gambling',
    )!;
    expect(empty.count).toBe(0);
    expect(empty.basisCents).toBe(0);
  });
});

describe('formatting', () => {
  it('keeps small amounts as ordinary currency', () => {
    expect(formatCompactDebt(1_234)).toBe('$12.34');
  });

  it('compacts large ones', () => {
    expect(formatCompactDebt(123_456_789)).toBe('$1.2M');
  });

  it('survives a non-finite value rather than rendering NaN', () => {
    expect(formatCompactDebt(Number.POSITIVE_INFINITY)).toBe('—');
    expect(formatShare(Number.NaN)).toBe('—');
  });

  it('renders a share to one decimal', () => {
    expect(formatShare(0.4213)).toBe('42.1%');
  });
});
