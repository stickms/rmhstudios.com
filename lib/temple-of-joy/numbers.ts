/**
 * How the temple writes numbers down.
 *
 * An idle game spends most of its life somewhere between a thousand and
 * 10^100, and the player has to be able to compare two of those at a glance.
 * The short-scale names run to vigintillion and then keep going on the
 * standard Latin construction, so `1.24 Qig` and `3.10 Qig` sort by eye the
 * same way `1.24M` and `3.10M` do.
 */

/** Short-scale names, 10^3 upward, index 0 = thousand. */
const ONES = ['', 'Un', 'Do', 'Tre', 'Qua', 'Qui', 'Sex', 'Sep', 'Oct', 'Non'];
const TENS = ['', 'Dec', 'Vig', 'Tri', 'Qua', 'Qui', 'Sex', 'Sep', 'Oct', 'Non'];
const SMALL = ['K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

/**
 * The suffix for 10^(3(n+1)). `n = 0` is thousand.
 *
 * Built rather than tabulated: a table long enough for the deep game is a
 * hundred lines of strings nobody will ever proof-read, and the construction
 * rule is four lines.
 */
function suffixFor(n: number): string {
  if (n < SMALL.length) return SMALL[n]!;
  // Past decillion the names are regular: ones prefix + tens prefix.
  const index = n - 1; // undecillion is 10^36 → index 11
  const ones = index % 10;
  const tens = Math.floor(index / 10);
  if (tens >= TENS.length) return `e${(n + 1) * 3}`;
  return `${ONES[ones]}${TENS[tens]}`.trim() || `e${(n + 1) * 3}`;
}

/**
 * Format for display. Under a thousand the number is shown as-is (whole
 * numbers stay whole — "15" not "15.00"); above it, three significant figures
 * and a suffix.
 */
export function formatNumber(n: number, decimals = 3): string {
  if (!Number.isFinite(n)) return '∞';
  if (Number.isNaN(n)) return '0';
  if (n < 0) return `−${formatNumber(-n, decimals)}`;
  if (n < 1) return n === 0 ? '0' : n.toFixed(Math.min(decimals, 3));
  if (n < 1000) {
    // 12.5 reads better than 12.500, and 15 better than 15.0.
    return Number.isInteger(n) ? String(n) : n.toFixed(n < 10 ? 2 : 1);
  }

  const power = Math.floor(Math.log10(n) / 3);
  const scaled = n / Math.pow(1000, power);
  const suffix = suffixFor(power - 1);
  // Keep the width steady: 3 significant figures, however big the mantissa.
  const text =
    scaled >= 100 ? scaled.toFixed(1) : scaled >= 10 ? scaled.toFixed(2) : scaled.toFixed(3);
  return `${text} ${suffix}`;
}

export function formatScientific(n: number): string {
  if (!Number.isFinite(n)) return '∞';
  if (Number.isNaN(n)) return '0';
  if (n < 0) return `−${formatScientific(-n)}`;
  if (n < 1000) return formatNumber(n);
  const exponent = Math.floor(Math.log10(n));
  return `${(n / Math.pow(10, exponent)).toFixed(3)}e${exponent}`;
}

export function fmt(n: number, format: 'named' | 'scientific' = 'named'): string {
  return format === 'scientific' ? formatScientific(n) : formatNumber(n);
}

/** A rate, with its unit. */
export function fmtRate(n: number, format: 'named' | 'scientific' = 'named'): string {
  return `${fmt(n, format)}/s`;
}

/** A whole number of things you own. Never abbreviated below a million. */
export function fmtCount(n: number): string {
  return n < 1e6 ? n.toLocaleString('en-US') : formatNumber(n);
}

/**
 * A duration, at the coarsest useful precision: seconds under a minute, then
 * minutes, then hours-and-minutes, then days.
 */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return s === 0 ? `${m}m` : `${m}m ${s}s`;
  }
  if (seconds < 86_400) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return m === 0 ? `${h}h` : `${h}h ${m}m`;
  }
  const d = Math.floor(seconds / 86_400);
  const h = Math.floor((seconds % 86_400) / 3600);
  return h === 0 ? `${d}d` : `${d}d ${h}h`;
}

/**
 * "in 2h 40m" — how long until you can afford `cost` at `rate`, given what you
 * already hold. The single most useful number on a source row, and the reason
 * an idle game feels navigable rather than arbitrary.
 */
export function formatTimeTo(cost: number, held: number, rate: number): string {
  if (held >= cost) return '';
  if (rate <= 0) return '—';
  return formatDuration((cost - held) / rate);
}
