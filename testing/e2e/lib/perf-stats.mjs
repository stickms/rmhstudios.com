// Small statistics helpers for the eversion perf suite (T36). Pure, no I/O.

/** Median of a list of numbers (NaN for an empty list). */
export function median(values) {
  return percentile(values, 0.5);
}

/** Nearest-rank percentile, `p` in [0, 1]; the median averages the middle pair. NaN for an empty list. */
export function percentile(values, p) {
  const v = values.filter((x) => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return Number.NaN;
  if (p === 0.5 && v.length % 2 === 0) return (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
  return v[Math.min(v.length - 1, Math.max(0, Math.ceil(p * v.length) - 1))];
}

/** A compact per-destination summary of effect samples, for the JSON report. */
export function summarise(samples) {
  const out = {};
  for (const s of samples) {
    if (s.failed) continue;
    (out[s.dest] ??= { n: 0, readyMs: [], durationMs: [] }).n++;
    out[s.dest].readyMs.push(s.readyMs);
    if (typeof s.durationMs === 'number') out[s.dest].durationMs.push(s.durationMs);
  }
  for (const d of Object.values(out)) {
    d.readyMedian = median(d.readyMs);
    d.durationMedian = median(d.durationMs);
  }
  return out;
}
