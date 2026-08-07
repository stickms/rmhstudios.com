/**
 * The Kaikai Debt Counter's statistics layer — the contract and the arithmetic.
 *
 * Client-safe, like `debt.ts` and for the same reason: every chart on the page
 * has to redraw against a clock that is still moving after the response landed.
 * The server hands over *aggregates* (counts, principals, and per-group **bases**
 * — see below); the browser turns those into whatever they are worth right now.
 * Anything that touches Prisma lives in `stats.server.ts`.
 *
 * ## Why every aggregate carries a basis
 *
 * `debt.ts` establishes that the whole ledger factorises into one scalar: the
 * sum of each entry's face value discounted back to the epoch. That trick is not
 * specific to the grand total — it works for **any** subset. So every group in
 * this payload (a category, a month, a creditor, an hour of the week) reports
 * its own basis alongside its face value, which means:
 *
 *  - a bar chart of "what each category is worth *now*" is one multiplication
 *    per bar, evaluated in the browser, and it keeps growing while you look at
 *    it — exactly like the counter above it;
 *  - nothing has to be refetched to stay honest, because the growth is a
 *    closed-form function of the clock rather than a number the server owns;
 *  - the charts and the odometer can never disagree, since both are
 *    `basis · e^(r·t)` with the same `r` and the same `t`.
 *
 * A chart that showed face value only would be a chart of a debt that does not
 * compound, on a page whose entire subject is compounding.
 *
 * ## What is NOT in here
 *
 * Colour. The categorical palette, the sequential ramp and the surfaces they sit
 * on are CSS (`components/kaikai-debt/kaikai-debt.css`, scoped to `.kd-root`),
 * because they are theme concerns and because the charts read them through the
 * same custom properties the rest of the page does. This module is numbers.
 */

import {
  ANNUAL_INTEREST_RATE,
  DEBT_CATEGORIES,
  DEBT_EPOCH_MS,
  accrualFactor,
  formatDebt,
  type DebtCategory,
  type DebtEntryDto,
  type DebtPerson,
  type DebtSource,
} from './debt';

/* -------------------------------------------------------------------------- */
/* Shape of the payload                                                       */
/* -------------------------------------------------------------------------- */

/**
 * One group's numbers. Every aggregate in this file is this shape or extends it,
 * so a chart component takes `AggregateStat[]` and does not care whether it was
 * grouped by category, by month or by person.
 */
export interface AggregateStat {
  /** How many rows are in the group. */
  count: number;
  /** Face value of the group, in integer cents — what was actually logged. */
  principalCents: number;
  /**
   * The group's share of the counter's basis. Multiply by `accrualFactor(now)`
   * to get what the group is worth at any instant — see {@link valueNow}.
   */
  basisCents: number;
}

export interface CategoryStat extends AggregateStat {
  category: DebtCategory;
  /** Smallest and largest single line in the group. Zero on an empty group. */
  minCents: number;
  maxCents: number;
  /** The member-added slice of the group — what real people put there. */
  memberCount: number;
  memberPrincipalCents: number;
}

/** One month of the ledger's history. Buckets are `date_trunc('month')`, UTC. */
export interface TimelineBucket extends AggregateStat {
  /** Epoch millis of the first instant of the month. */
  startMs: number;
}

/** A timeline bucket with the running totals a cumulative chart needs. */
export interface CumulativeBucket extends TimelineBucket {
  /** Face value of everything logged up to and including this month. */
  cumulativePrincipalCents: number;
  /** Basis of everything up to and including this month. */
  cumulativeBasisCents: number;
  /**
   * What that accumulated basis was worth **at the end of this bucket** — i.e.
   * the counter's own reading, backdated. This is the line that curves.
   */
  valueAtCents: number;
}

/** One bar of the amount histogram. Edges come from {@link DISTRIBUTION_EDGES}. */
export interface DistributionBucket extends AggregateStat {
  /** Index into {@link DISTRIBUTION_EDGES}. */
  index: number;
  loCents: number;
  /** `Infinity` on the open-ended top bucket. */
  hiCents: number;
}

/**
 * One cell of the (month × category) grid — the dataset the three spatial views
 * share.
 *
 * The 3D terrain reads it as a height field, the 4D projection reads it as a
 * point cloud, and the globe reads it as a set of pins. They are the *same
 * numbers* in all three, which is the point: a viewer who finds a spike in one
 * view can go looking for it in another and it is there.
 */
export interface GridCell extends AggregateStat {
  /** Epoch millis of the first instant of the month. */
  startMs: number;
  category: DebtCategory;
}

/**
 * How many months of the grid are shipped.
 *
 * The full grid is months × 8, and the archive walks backwards forever — at some
 * point that is a payload nobody should download to draw a picture. Forty-eight
 * months is four years of surface, which is more than a globe can show at once
 * and about as much as a 3D terrain stays readable at.
 */
export const GRID_MONTH_LIMIT = 48;

/** One cell of the 7 × 24 "when does he spend" heatmap, in UTC. */
export interface RhythmCell extends AggregateStat {
  /** 0 = Sunday … 6 = Saturday, matching `Date#getUTCDay`. */
  weekday: number;
  /** 0–23, UTC. */
  hour: number;
}

/** A person, with what they are owed (creditor) or what they logged (author). */
export interface PersonStat extends AggregateStat {
  person: DebtPerson;
}

/** The member/ledger split — how much of the pile people put there themselves. */
export interface SourceStat extends AggregateStat {
  source: DebtSource;
}

/**
 * The distribution's shape, as numbers rather than as a picture.
 *
 * Percentiles are over `amountCents` across every row on the books. `gini` and
 * `hhi` are concentration measures over the same column: a ledger of one
 * enormous debt and a thousand small ones has a very different character from a
 * thousand identical ones, and the histogram alone does not say which you are
 * looking at.
 */
export interface DebtMoments {
  p10Cents: number;
  p25Cents: number;
  p50Cents: number;
  p75Cents: number;
  p90Cents: number;
  p99Cents: number;
  meanCents: number;
  /** Population standard deviation of the line amounts, in cents. */
  stdevCents: number;
  /**
   * Gini coefficient of the line amounts, 0–1. 0 = every debt is the same size,
   * 1 = one debt is the entire pile.
   */
  gini: number;
  /**
   * Herfindahl–Hirschman index over the same amounts, 0–1: the sum of squared
   * shares. Reads as "if the ledger were an industry, how monopolised is it".
   */
  hhi: number;
}

/** Everything the analytics section draws, in one response. */
export interface DebtStats {
  /** Server clock when the aggregates were read. Charts render THIS first. */
  asOfMs: number;
  /** Grand totals, restated here so a chart never has to join two payloads. */
  totals: AggregateStat & {
    memberPrincipalCents: number;
    memberEntryCount: number;
    contributorCount: number;
    creditorCount: number;
  };
  /** Always all eight categories, in {@link DEBT_CATEGORIES} order, zero-filled. */
  categories: CategoryStat[];
  /** Ascending by month. May be long — the archive walks back years. */
  timeline: TimelineBucket[];
  /**
   * (month × category), most recent {@link GRID_MONTH_LIMIT} months, ascending
   * by month then in category order. Sparse: a month with no `rent` in it has no
   * `rent` cell. The spatial views densify it themselves, because each of them
   * wants a different thing from an empty cell.
   */
  grid: GridCell[];
  /** Always {@link DISTRIBUTION_EDGES}.length buckets, zero-filled. */
  distribution: DistributionBucket[];
  /** Always 168 cells (7 × 24), zero-filled. */
  rhythm: RhythmCell[];
  /** Who he owes the most to. Ordered by basis, descending. */
  creditors: PersonStat[];
  /** Who put the most on his tab. Ordered by basis, descending. */
  contributors: PersonStat[];
  /** The single biggest lines on the books, largest first. */
  largest: DebtEntryDto[];
  moments: DebtMoments;
  sources: SourceStat[];
  /** The ledger's extent in time. Equal when there is at most one row. */
  span: { oldestMs: number; newestMs: number };
}

/* -------------------------------------------------------------------------- */
/* Bucket geometry                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Lower edges of the amount histogram, in cents — a log-spaced ladder from a
 * cent to a hundred thousand dollars.
 *
 * Log-spaced because the amounts are: `sampleDebtCents` draws from a
 * hard-skewed distribution whose median is around $8 and whose tail reaches
 * $250, and a member's appraised debt has no upper bound at all
 * (`MAX_STORABLE_CENTS` is a column ceiling, not a policy). Linear buckets over
 * that range put 97% of the ledger in the first bar and nothing anywhere else,
 * which is a picture of the axis rather than of the data.
 *
 * Exported because the SQL buckets on exactly these edges and the axis labels
 * are drawn from exactly these edges. Two ladders that drift apart is a chart
 * whose bars mean something other than what they say.
 */
export const DISTRIBUTION_EDGES: readonly number[] = [
  1, 100, 250, 500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000, 100_000, 500_000, 1_000_000,
  10_000_000,
];

/** Human label for bucket `i` — `"$25–$50"`, `"$100k+"`. */
export function distributionLabel(index: number): string {
  const lo = DISTRIBUTION_EDGES[index] ?? 0;
  const hi = DISTRIBUTION_EDGES[index + 1];
  if (hi === undefined) return `${formatCompactDebt(lo)}+`;
  return `${formatCompactDebt(lo)}–${formatCompactDebt(hi)}`;
}

/** Which histogram bucket an amount falls in. Total over the whole integer range. */
export function distributionIndex(amountCents: number): number {
  let i = 0;
  while (i + 1 < DISTRIBUTION_EDGES.length && amountCents >= DISTRIBUTION_EDGES[i + 1]!) i++;
  return i;
}

/* -------------------------------------------------------------------------- */
/* Turning a basis into a number on a chart                                   */
/* -------------------------------------------------------------------------- */

/**
 * What a group is worth at `atMs`: its basis, compounded.
 *
 * The one function every chart calls. It is deliberately the *same* arithmetic
 * as `projectDebtCents` rather than a parallel implementation — a bar chart
 * whose bars summed to something other than the odometer above them would be
 * worse than no bar chart.
 */
export function valueNow(stat: AggregateStat, atMs: number): number {
  return stat.basisCents * accrualFactor(atMs);
}

/** Sum a set of groups into one. Used by the cross-filter, which sums a selection. */
export function sumStats(stats: readonly AggregateStat[]): AggregateStat {
  let count = 0;
  let principalCents = 0;
  let basisCents = 0;
  for (const s of stats) {
    count += s.count;
    principalCents += s.principalCents;
    basisCents += s.basisCents;
  }
  return { count, principalCents, basisCents };
}

/**
 * The timeline with running totals attached.
 *
 * `valueAtCents` is what the counter *would have read* at the end of each month:
 * everything logged up to that point, compounded to that point and no further.
 * That is what makes the accrual chart a history rather than a bar chart with a
 * curve drawn over it — the curve is the same function the odometer runs,
 * evaluated backwards.
 *
 * Note the asymmetry that follows from the epoch floor in `secondsSinceEpoch`:
 * everything before {@link DEBT_EPOCH_MS} accrues nothing, so the pre-epoch
 * stretch of the archive is flat by construction. That is correct — nobody was
 * counting yet — and it is visible in the chart, which is the point.
 */
export function withCumulative(timeline: readonly TimelineBucket[]): CumulativeBucket[] {
  let principal = 0;
  let basis = 0;
  return timeline.map((bucket) => {
    principal += bucket.principalCents;
    basis += bucket.basisCents;
    // The month's END, not its start: a bucket's own entries have to be inside
    // the value it reports, or every point on the line lags a month behind the
    // rows that produced it.
    const endMs = endOfMonthMs(bucket.startMs);
    return {
      ...bucket,
      cumulativePrincipalCents: principal,
      cumulativeBasisCents: basis,
      valueAtCents: basis * accrualFactor(endMs),
    };
  });
}

/** Epoch millis of the last instant of the UTC month `startMs` belongs to. */
export function endOfMonthMs(startMs: number): number {
  const d = new Date(startMs);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - 1;
}

/** One sample of the forward projection. */
export interface ProjectedPoint {
  atMs: number;
  cents: number;
}

/**
 * Where the counter is going, sampled between `fromMs` and `toMs`.
 *
 * Drawn as the dashed continuation of the accrual line. It is a *projection of
 * the current books only* — it assumes nobody adds anything, which is the one
 * assumption that is certainly wrong and the only one that can be made honestly.
 * The chart says so in its legend rather than in a footnote nobody reads.
 */
export function projectSeries(
  basisCents: number,
  fromMs: number,
  toMs: number,
  steps = 48,
): ProjectedPoint[] {
  const n = Math.max(1, Math.floor(steps));
  const out: ProjectedPoint[] = [];
  for (let i = 0; i <= n; i++) {
    const atMs = fromMs + ((toMs - fromMs) * i) / n;
    out.push({ atMs, cents: basisCents * accrualFactor(atMs) });
  }
  return out;
}

/**
 * When the debt reaches `targetCents`, in epoch millis — the inverse of the
 * projection.
 *
 * `basis · e^(r·t) = target` solves to `t = ln(target/basis) / r`, so a
 * "when does he owe a million" readout is exact rather than a search. Returns
 * `null` when the target is already behind us or when there is no debt at all
 * (a basis of zero never reaches anything, which is the honest answer).
 */
export function timeToReachMs(basisCents: number, targetCents: number): number | null {
  if (!(basisCents > 0) || !(targetCents > 0)) return null;
  const SECONDS_PER_YEAR = 365.2425 * 24 * 60 * 60;
  const seconds = (Math.log(targetCents / basisCents) / ANNUAL_INTEREST_RATE) * SECONDS_PER_YEAR;
  // `secondsSinceEpoch` floors at the epoch, so a target below the basis is
  // "already there" rather than a time before the meter started.
  return seconds <= 0 ? null : DEBT_EPOCH_MS + seconds * 1000;
}

/* -------------------------------------------------------------------------- */
/* Scales and paths — the small amount of chart maths worth sharing           */
/* -------------------------------------------------------------------------- */

/** A point in chart space, already projected to pixels. */
export interface Pt {
  x: number;
  y: number;
}

/**
 * A linear map from a data domain onto a pixel range.
 *
 * Returned as a plain function rather than a d3-style object with `.ticks()`
 * hanging off it: the charts here need exactly this and `niceTicks`, and a
 * scale that also knows how to format its own axis is how a chart library
 * starts.
 */
export function linearScale(
  d0: number,
  d1: number,
  r0: number,
  r1: number,
): (value: number) => number {
  const span = d1 - d0;
  if (span === 0) return () => (r0 + r1) / 2;
  return (value) => r0 + ((value - d0) / span) * (r1 - r0);
}

/**
 * Log scale, with a floor.
 *
 * The debt spans orders of magnitude — that is the joke — so several of these
 * charts offer a log toggle. `floor` is what a zero maps to: `log(0)` is `-∞`,
 * and a chart with one bar at negative infinity is not a chart. Half the
 * smallest positive value in the domain is the conventional choice and the one
 * used here.
 */
export function logScale(
  d0: number,
  d1: number,
  r0: number,
  r1: number,
  floor = 1,
): (value: number) => number {
  const lo = Math.log10(Math.max(floor, d0));
  const hi = Math.log10(Math.max(floor * 10, d1));
  const span = hi - lo;
  if (span === 0) return () => (r0 + r1) / 2;
  return (value) => r0 + ((Math.log10(Math.max(floor, value)) - lo) / span) * (r1 - r0);
}

/**
 * Round tick values covering `[min, max]`, at most `count` of them.
 *
 * The standard 1/2/5/10 ladder. Axis labels that read $2,500 and $5,000 are
 * legible; ones that read $2,387 and $4,774 are a chart apologising for its own
 * data range.
 */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return [min];
  const raw = (max - min) / Math.max(1, count);
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  const step = (normalized >= 5 ? 10 : normalized >= 2 ? 5 : normalized >= 1 ? 2 : 1) * magnitude;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 0.001; v += step) {
    out.push(Number(v.toFixed(10)));
  }
  return out;
}

/** Powers of ten spanning `[min, max]` — the log axis's own ladder. */
export function logTicks(min: number, max: number, floor = 1): number[] {
  const lo = Math.floor(Math.log10(Math.max(floor, min)));
  const hi = Math.ceil(Math.log10(Math.max(floor * 10, max)));
  const out: number[] = [];
  for (let e = lo; e <= hi; e++) out.push(10 ** e);
  return out;
}

/** `M x y L x y …` for a polyline. Empty string for an empty series. */
export function linePath(points: readonly Pt[]): string {
  if (points.length === 0) return '';
  let d = `M${points[0]!.x.toFixed(2)} ${points[0]!.y.toFixed(2)}`;
  for (let i = 1; i < points.length; i++) {
    d += `L${points[i]!.x.toFixed(2)} ${points[i]!.y.toFixed(2)}`;
  }
  return d;
}

/** The same polyline, closed down to `baselineY` — the fill under a line. */
export function areaPath(points: readonly Pt[], baselineY: number): string {
  if (points.length === 0) return '';
  const first = points[0]!;
  const last = points[points.length - 1]!;
  return `${linePath(points)}L${last.x.toFixed(2)} ${baselineY.toFixed(2)}L${first.x.toFixed(
    2,
  )} ${baselineY.toFixed(2)}Z`;
}

/**
 * The index of the point nearest `x`, by binary search.
 *
 * The crosshair calls this on every pointer move over a series that can be
 * hundreds of points long; a linear scan would be fine and this is two lines
 * longer.
 */
export function nearestIndex(xs: readonly number[], x: number): number {
  if (xs.length === 0) return -1;
  let lo = 0;
  let hi = xs.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid]! < x) lo = mid;
    else hi = mid;
  }
  return Math.abs(xs[lo]! - x) <= Math.abs(xs[hi]! - x) ? lo : hi;
}

/* -------------------------------------------------------------------------- */
/* Treemap                                                                    */
/* -------------------------------------------------------------------------- */

/** One tile of a treemap, in the same units the caller passed its box in. */
export interface Tile {
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Squarified treemap layout (Bruls, Huizing & van Wijk, 2000).
 *
 * The naive alternative — slice and dice — is four lines shorter and produces
 * tiles with aspect ratios in the hundreds, which is unreadable and, worse,
 * makes a small share *look* like a big one because a long thin sliver reads as
 * a large object. Squarifying keeps every tile near square, so area is the only
 * thing carrying magnitude, which is the entire premise of the form.
 *
 * Values are taken in the caller's order and tiles come back keyed by the
 * original index, so a treemap of categories keeps each category's palette slot
 * no matter where it lands — the fixed-hue rule survives the layout.
 *
 * Zero and negative values are dropped rather than laid out at zero size: a
 * degenerate rectangle is a hit target that swallows pointer events over its
 * neighbours.
 */
export function squarify(values: readonly number[], width: number, height: number): Tile[] {
  const items = values
    .map((value, index) => ({ value, index }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value);

  const total = items.reduce((sum, item) => sum + item.value, 0);
  if (total <= 0 || width <= 0 || height <= 0) return [];

  // Work in area units so a row's aspect ratio is comparable to the box's.
  const scale = (width * height) / total;
  const out: Tile[] = [];

  let x = 0;
  let y = 0;
  let w = width;
  let h = height;
  let row: { value: number; index: number }[] = [];

  /** Worst aspect ratio in `candidate`, laid along the shorter side of the box. */
  const worst = (candidate: readonly { value: number }[], side: number): number => {
    if (candidate.length === 0 || side <= 0) return Infinity;
    let sum = 0;
    let min = Infinity;
    let max = 0;
    for (const item of candidate) {
      const area = item.value * scale;
      sum += area;
      if (area < min) min = area;
      if (area > max) max = area;
    }
    const s2 = side * side;
    const sum2 = sum * sum;
    return Math.max((s2 * max) / sum2, sum2 / (s2 * min));
  };

  /** Commit the current row along the box's shorter side and shrink the box. */
  const flush = () => {
    if (row.length === 0) return;
    const side = Math.min(w, h);
    const area = row.reduce((sum, item) => sum + item.value * scale, 0);
    const depth = area / side;

    let offset = 0;
    for (const item of row) {
      const length = (item.value * scale) / depth;
      if (w >= h) {
        out.push({ index: item.index, x, y: y + offset, width: depth, height: length });
      } else {
        out.push({ index: item.index, x: x + offset, y, width: length, height: depth });
      }
      offset += length;
    }

    if (w >= h) {
      x += depth;
      w -= depth;
    } else {
      y += depth;
      h -= depth;
    }
    row = [];
  };

  for (const item of items) {
    const side = Math.min(w, h);
    if (row.length > 0 && worst([...row, item], side) > worst(row, side)) {
      flush();
    }
    row.push(item);
  }
  flush();

  return out;
}

/* -------------------------------------------------------------------------- */
/* Formatting                                                                 */
/* -------------------------------------------------------------------------- */

const COMPACT = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

/**
 * `123456789` cents → `"$1.2M"`.
 *
 * Locale-fixed for the same reason `formatDebt` is (see `debt.ts`): these labels
 * sit on axes whose tick spacing is computed in pixels, and a locale that
 * renders `1,2 Mio.` where another renders `1.2M` changes the label width by
 * enough to overlap its neighbour. The *prose* around the charts is translated;
 * the tick marks are not.
 */
export function formatCompactDebt(cents: number): string {
  const dollars = cents / 100;
  if (!Number.isFinite(dollars)) return '—';
  if (Math.abs(dollars) < 1000) return formatDebt(cents);
  return `$${COMPACT.format(dollars)}`;
}

/** `0.4213` → `"42.1%"`. Shares, never money. */
export function formatShare(fraction: number): string {
  if (!Number.isFinite(fraction)) return '—';
  return `${(fraction * 100).toFixed(1)}%`;
}

/** `1717200000000` → `"Jun 2024"`. Month labels on the accrual axis. */
const MONTH_LABEL = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
export function formatMonth(atMs: number): string {
  return MONTH_LABEL.format(new Date(atMs));
}

/**
 * The eight categories, in their canonical order.
 *
 * Re-exported so a chart imports its axis order from the same place its colours
 * are indexed from. The order is the palette's order (rule 1 of the data-viz
 * colour formula: fixed hue assignment, never cycled), so slot `i` is category
 * `i` in every chart on the page, whatever subset is on screen.
 */
export const CATEGORY_ORDER: readonly DebtCategory[] = DEBT_CATEGORIES;

/** Zero-filled stats — what the charts render while the request is in flight. */
export function emptyStats(asOfMs: number): DebtStats {
  return {
    asOfMs,
    totals: {
      count: 0,
      principalCents: 0,
      basisCents: 0,
      memberPrincipalCents: 0,
      memberEntryCount: 0,
      contributorCount: 0,
      creditorCount: 0,
    },
    categories: CATEGORY_ORDER.map((category) => ({
      category,
      count: 0,
      principalCents: 0,
      basisCents: 0,
      minCents: 0,
      maxCents: 0,
      memberCount: 0,
      memberPrincipalCents: 0,
    })),
    timeline: [],
    grid: [],
    distribution: DISTRIBUTION_EDGES.map((loCents, index) => ({
      index,
      loCents,
      hiCents: DISTRIBUTION_EDGES[index + 1] ?? Number.POSITIVE_INFINITY,
      count: 0,
      principalCents: 0,
      basisCents: 0,
    })),
    rhythm: [],
    creditors: [],
    contributors: [],
    largest: [],
    moments: {
      p10Cents: 0,
      p25Cents: 0,
      p50Cents: 0,
      p75Cents: 0,
      p90Cents: 0,
      p99Cents: 0,
      meanCents: 0,
      stdevCents: 0,
      gini: 0,
      hhi: 0,
    },
    sources: [],
    span: { oldestMs: asOfMs, newestMs: asOfMs },
  };
}

/**
 * The (month × category) grid, densified and measured — what the 3D terrain, the
 * 4D projection and the globe are all built from.
 *
 * They share one builder rather than each densifying the payload their own way,
 * because "the same numbers in all three views" is the property that makes
 * looking at the same data three ways worth doing. Three separate normalisations
 * would give three pictures that disagree about where the spike is.
 */
export interface GridFrame {
  /** Ascending month starts, epoch millis. */
  months: number[];
  categories: readonly DebtCategory[];
  /** `months.length × categories.length`, row-major: month-major, then category. */
  cells: GridCell[];
  /** The largest single cell, by each measure — every view's normaliser. */
  maxCount: number;
  maxPrincipalCents: number;
  maxBasisCents: number;
}

export function buildGrid(grid: readonly GridCell[]): GridFrame {
  const monthSet = new Set<number>();
  for (const cell of grid) monthSet.add(cell.startMs);
  const months = [...monthSet].sort((a, b) => a - b);
  const byKey = new Map<string, GridCell>();
  for (const cell of grid) byKey.set(`${cell.startMs}:${cell.category}`, cell);

  const cells: GridCell[] = [];
  let maxCount = 0;
  let maxPrincipalCents = 0;
  let maxBasisCents = 0;
  for (const startMs of months) {
    for (const category of CATEGORY_ORDER) {
      const cell = byKey.get(`${startMs}:${category}`) ?? {
        startMs,
        category,
        count: 0,
        principalCents: 0,
        basisCents: 0,
      };
      cells.push(cell);
      if (cell.count > maxCount) maxCount = cell.count;
      if (cell.principalCents > maxPrincipalCents) maxPrincipalCents = cell.principalCents;
      if (cell.basisCents > maxBasisCents) maxBasisCents = cell.basisCents;
    }
  }

  return { months, categories: CATEGORY_ORDER, cells, maxCount, maxPrincipalCents, maxBasisCents };
}

/**
 * Fill in the 7 × 24 grid the SQL returns sparsely.
 *
 * Postgres only emits hours that have rows in them, and a heatmap with holes in
 * it is a heatmap that lies: an empty cell and a missing cell look identical
 * once they are drawn, but only one of them means "nothing happened then".
 */
export function densifyRhythm(cells: readonly RhythmCell[]): RhythmCell[] {
  const byKey = new Map<number, RhythmCell>();
  for (const cell of cells) byKey.set(cell.weekday * 24 + cell.hour, cell);
  const out: RhythmCell[] = [];
  for (let weekday = 0; weekday < 7; weekday++) {
    for (let hour = 0; hour < 24; hour++) {
      out.push(
        byKey.get(weekday * 24 + hour) ?? {
          weekday,
          hour,
          count: 0,
          principalCents: 0,
          basisCents: 0,
        },
      );
    }
  }
  return out;
}
