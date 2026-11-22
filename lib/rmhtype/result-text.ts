/** One-line, shareable summary of a solo run, e.g. "87 WPM · 96% accuracy · 31.4s — RMHType". */
export function formatSoloResult(r: { wpm: number; accuracy: number; timeMs: number }): string {
  const seconds = (Math.max(0, r.timeMs) / 1000).toFixed(1);
  return `${r.wpm} WPM · ${r.accuracy}% accuracy · ${seconds}s — RMHType`;
}

/** The daily challenge's share line, e.g. "RMHType daily 2026-11-22 · 84 wpm · 98%". `day` is the `YYYY-MM-DD` form. */
export function formatDailyResult(r: { day: string; wpm: number; accuracy: number }): string {
  return `RMHType daily ${r.day} · ${Math.round(r.wpm)} wpm · ${Math.round(r.accuracy)}%`;
}
