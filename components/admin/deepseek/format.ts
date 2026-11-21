// Formatting for the DeepSeek balance page. Locale-aware; currency codes are
// ISO symbols from the API, so no translation is needed.

const DASH = '—';

export function fmtMoney(n: number | null | undefined, currency: string, digits = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return DASH;
  try {
    return n.toLocaleString(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: Math.min(2, digits),
      maximumFractionDigits: digits,
    });
  } catch {
    return `${n.toLocaleString(undefined, { maximumFractionDigits: digits })} ${currency}`;
  }
}

export function fmtSigned(n: number | null | undefined, currency: string): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return DASH;
  if (n === 0) return fmtMoney(0, currency, 4);
  return `${n > 0 ? '+' : '−'}${fmtMoney(Math.abs(n), currency, 4)}`;
}

/** "3d 4h" / "5h" — a projection, so no finer than the hour. */
export function fmtDuration(hours: number | null | undefined): string {
  if (hours === null || hours === undefined || !Number.isFinite(hours)) return DASH;
  const total = Math.round(hours);
  if (total < 1) return '<1h';
  const d = Math.floor(total / 24);
  const h = total % 24;
  if (d >= 365) return `${Math.round(d / 365)}y+`;
  return d > 0 ? `${d}d ${h}h` : `${h}h`;
}

export function fmtHour(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? DASH
    : d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: undefined,
      });
}

export function fmtDateTime(iso: string | number | null | undefined): string {
  if (!iso) return DASH;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? DASH : d.toLocaleString();
}
