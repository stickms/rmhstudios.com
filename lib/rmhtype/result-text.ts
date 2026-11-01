/** One-line, shareable summary of a solo run, e.g. "87 WPM · 96% accuracy · 31.4s — RMHType". */
export function formatSoloResult(r: { wpm: number; accuracy: number; timeMs: number }): string {
  const seconds = (Math.max(0, r.timeMs) / 1000).toFixed(1);
  return `${r.wpm} WPM · ${r.accuracy}% accuracy · ${seconds}s — RMHType`;
}
