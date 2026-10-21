// Fixed log-scale latency histogram for the performance collector.
//
// A histogram of counts (not a list of samples) is what keeps the per-request
// cost O(1) and the memory fixed, and — the reason it is also exported as plain
// number arrays — it is what lets percentiles be recomputed ACROSS processes:
// you cannot average two p95s, but you can add two bucket arrays and ask the sum.

/** Upper bounds in ms; a final implicit bucket holds everything above the last. */
export const LATENCY_BOUNDS_MS = [
  1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000,
] as const;

/** Bucket count including the +Inf bucket. */
export const LATENCY_BUCKETS = LATENCY_BOUNDS_MS.length + 1;

/** The serialisable shape: bucket counts plus the aggregates a bucket loses. */
export interface HistogramData {
  /** `LATENCY_BUCKETS` counts; index i holds values <= BOUNDS[i] (last: above). */
  counts: number[];
  count: number;
  sum: number;
  max: number;
}

export function newHistogram(): HistogramData {
  return { counts: new Array<number>(LATENCY_BUCKETS).fill(0), count: 0, sum: 0, max: 0 };
}

/** Record one observation. Negative/NaN values are ignored. */
export function observe(h: HistogramData, valueMs: number): void {
  if (!(valueMs >= 0)) return;
  let i = 0;
  // 15 buckets: a linear scan beats a binary search at this size.
  while (i < LATENCY_BOUNDS_MS.length && valueMs > LATENCY_BOUNDS_MS[i]) i++;
  h.counts[i]++;
  h.count++;
  h.sum += valueMs;
  if (valueMs > h.max) h.max = valueMs;
}

/**
 * The p-th percentile (0..100), interpolated linearly inside the bucket that
 * contains the rank. The open top bucket interpolates up to the observed max, and
 * every result is clamped to the max so a sparse bucket cannot report a latency
 * that never happened.
 */
export function percentile(h: HistogramData, p: number): number {
  if (h.count === 0) return 0;
  const rank = (Math.min(Math.max(p, 0), 100) / 100) * h.count;
  let before = 0;
  for (let i = 0; i < h.counts.length; i++) {
    const c = h.counts[i];
    if (c === 0) continue;
    if (before + c >= rank) {
      const lo = i === 0 ? 0 : LATENCY_BOUNDS_MS[i - 1];
      const hi = i < LATENCY_BOUNDS_MS.length ? LATENCY_BOUNDS_MS[i] : Math.max(h.max, lo);
      const frac = (rank - before) / c;
      // `max` of 0 on a populated histogram means "unknown" (a histogram rebuilt
      // from bare bucket counts), not "every sample was 0".
      const cap = h.max > 0 ? h.max : Infinity;
      return Math.min(lo + (hi - lo) * Math.min(Math.max(frac, 0), 1), cap);
    }
    before += c;
  }
  return h.max;
}

export function mean(h: HistogramData): number {
  return h.count === 0 ? 0 : h.sum / h.count;
}

/** `a + b` as a new histogram (inputs untouched). */
export function mergeHistograms(a: HistogramData, b: HistogramData): HistogramData {
  const counts = new Array<number>(LATENCY_BUCKETS);
  for (let i = 0; i < LATENCY_BUCKETS; i++) counts[i] = (a.counts[i] ?? 0) + (b.counts[i] ?? 0);
  return { counts, count: a.count + b.count, sum: a.sum + b.sum, max: Math.max(a.max, b.max) };
}

export function cloneHistogram(h: HistogramData): HistogramData {
  return { counts: h.counts.slice(), count: h.count, sum: h.sum, max: h.max };
}

/** Rebuild a histogram from the bare bucket array a snapshot carries. */
export function fromCounts(counts: number[], sum = 0, max = 0): HistogramData {
  const c = new Array<number>(LATENCY_BUCKETS).fill(0);
  let total = 0;
  for (let i = 0; i < LATENCY_BUCKETS; i++) {
    c[i] = counts[i] ?? 0;
    total += c[i];
  }
  return { counts: c, count: total, sum, max };
}
