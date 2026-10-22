// Number formatting for the Performance page. Locale-aware (`toLocaleString`) so
// separators follow the viewer; units are symbols, not words, so they need no
// translation.

const DASH = '—';

export function fmtInt(n: number | null | undefined): string {
  return n === null || n === undefined || !Number.isFinite(n)
    ? DASH
    : Math.round(n).toLocaleString();
}

export function fmtNum(n: number | null | undefined, digits = 1): string {
  return n === null || n === undefined || !Number.isFinite(n)
    ? DASH
    : n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export function fmtPct(n: number | null | undefined, digits = 1): string {
  return n === null || n === undefined || !Number.isFinite(n) ? DASH : `${fmtNum(n, digits)}%`;
}

export function fmtMs(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return DASH;
  if (n >= 10_000) return `${fmtNum(n / 1000, 1)} s`;
  if (n >= 1000) return `${fmtNum(n / 1000, 2)} s`;
  if (n >= 100) return `${fmtInt(n)} ms`;
  return `${fmtNum(n, n < 10 ? 2 : 1)} ms`;
}

export function fmtBytes(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return DASH;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = n;
  let i = 0;
  while (Math.abs(value) >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${fmtNum(value, value >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function fmtUptime(sec: number | null | undefined): string {
  if (sec === null || sec === undefined || !Number.isFinite(sec)) return DASH;
  const d = Math.floor(sec / 86_400);
  const h = Math.floor((sec % 86_400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${Math.floor(sec % 60)}s`;
}

export function fmtClock(ts: number | null | undefined): string {
  return ts ? new Date(ts).toLocaleTimeString() : DASH;
}
