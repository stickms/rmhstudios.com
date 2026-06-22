/**
 * RMH Coding Simulator — number & time formatting.
 *
 * Incremental games live and die by readable big numbers. We abbreviate with
 * standard short-scale suffixes up to 1e63, then fall back to scientific
 * notation. Tuned to mirror the readability conventions used by Cookie Clicker
 * and AdVenture Capitalist (the games this clicker's economy is modelled on).
 */

interface Tier {
  value: number;
  suffix: string;
}

// Short-scale suffixes. Lowercase single letters for the small tiers, then the
// classic two/three-letter scientific-name abbreviations used by idle games.
const TIERS: Tier[] = [
  { value: 1e63, suffix: 'Vg' },
  { value: 1e60, suffix: 'Nd' },
  { value: 1e57, suffix: 'Od' },
  { value: 1e54, suffix: 'Spd' },
  { value: 1e51, suffix: 'Sd' },
  { value: 1e48, suffix: 'Qd' },
  { value: 1e45, suffix: 'Qtd' },
  { value: 1e42, suffix: 'Td' },
  { value: 1e39, suffix: 'Dd' },
  { value: 1e36, suffix: 'Ud' },
  { value: 1e33, suffix: 'Dc' },
  { value: 1e30, suffix: 'No' },
  { value: 1e27, suffix: 'Oc' },
  { value: 1e24, suffix: 'Sp' },
  { value: 1e21, suffix: 'Sx' },
  { value: 1e18, suffix: 'Qi' },
  { value: 1e15, suffix: 'Qa' },
  { value: 1e12, suffix: 'T' },
  { value: 1e9, suffix: 'B' },
  { value: 1e6, suffix: 'M' },
  { value: 1e3, suffix: 'K' },
];

/** Abbreviated form, e.g. 1.23M, 4.50B. */
export function formatShort(n: number, decimals = 2): string {
  if (!isFinite(n) || isNaN(n)) return '0';
  if (n < 0) return '-' + formatShort(-n, decimals);
  if (n < 1000) return n % 1 === 0 ? n.toString() : n.toFixed(decimals);

  for (const tier of TIERS) {
    if (n >= tier.value) {
      const val = n / tier.value;
      return val.toFixed(decimals) + tier.suffix;
    }
  }
  return n.toFixed(0);
}

/** Scientific form, e.g. 1.23e15. */
export function formatScientific(n: number): string {
  if (!isFinite(n) || isNaN(n)) return '0';
  if (n < 1000) return formatShort(n, 2);
  const exp = Math.floor(Math.log10(Math.abs(n)));
  const coef = n / Math.pow(10, exp);
  return `${coef.toFixed(2)}e${exp}`;
}

/** Format with the player's chosen notation. */
export function fmt(n: number, format: 'short' | 'scientific' = 'short'): string {
  return format === 'scientific' ? formatScientific(n) : formatShort(n);
}

/** Format a per-second rate. */
export function fmtRate(n: number, format: 'short' | 'scientific' = 'short'): string {
  return `${fmt(n, format)}/s`;
}

/** Whole-number display with thousands separators (for counts, clicks, etc.). */
export function fmtInt(n: number): string {
  return Math.floor(n).toLocaleString('en-US');
}

/** Human-readable duration from seconds. */
export function formatDuration(seconds: number): string {
  if (!isFinite(seconds) || seconds <= 0) return '0s';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return s ? `${m}m ${s}s` : `${m}m`;
  }
  if (seconds < 86400) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  return h ? `${d}d ${h}h` : `${d}d`;
}
