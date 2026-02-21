/**
 * Temple of Joy — Number Formatting
 * Converts large numbers to abbreviated form with religious tier names.
 */

interface Tier {
  value: number;
  suffix: string;
  name: string;
}

const TIERS: Tier[] = [
  // Custom high tiers (1e66+) — game-specific flavor names
  { value: 1e99, suffix: 'JC',   name: 'Joy Complete' },
  { value: 1e96, suffix: 'BI',   name: 'Beyond Infinity' },
  { value: 1e93, suffix: 'AB',   name: 'Absolute Bliss' },
  { value: 1e90, suffix: 'OH',   name: 'Omega Happiness' },
  { value: 1e87, suffix: 'JV',   name: 'Joy Convergence' },
  { value: 1e84, suffix: 'TC',   name: 'Total Contentment' },
  { value: 1e81, suffix: 'NO',   name: 'Nirvana Overflow' },
  { value: 1e78, suffix: 'GE',   name: 'Great Exhale' },
  { value: 1e75, suffix: 'IC',   name: 'Infinite Cuddle' },
  { value: 1e72, suffix: 'RC',   name: 'Rapture Cascade' },
  { value: 1e69, suffix: 'Nc',   name: 'Nice' },
  { value: 1e66, suffix: 'GS',   name: 'Grand Sigh' },
  // Standard English number names (1e3–1e63)
  { value: 1e63, suffix: 'Vg',   name: 'Vigintillion' },
  { value: 1e60, suffix: 'Nvd',  name: 'Novemdecillion' },
  { value: 1e57, suffix: 'Ocd',  name: 'Octodecillion' },
  { value: 1e54, suffix: 'Spd',  name: 'Septendecillion' },
  { value: 1e51, suffix: 'Sxd',  name: 'Sexdecillion' },
  { value: 1e48, suffix: 'Qid',  name: 'Quindecillion' },
  { value: 1e45, suffix: 'Qad',  name: 'Quattuordecillion' },
  { value: 1e42, suffix: 'Td',   name: 'Tredecillion' },
  { value: 1e39, suffix: 'Dd',   name: 'Duodecillion' },
  { value: 1e36, suffix: 'Ud',   name: 'Undecillion' },
  { value: 1e33, suffix: 'Dc',   name: 'Decillion' },
  { value: 1e30, suffix: 'No',   name: 'Nonillion' },
  { value: 1e27, suffix: 'Oc',   name: 'Octillion' },
  { value: 1e24, suffix: 'Sp',   name: 'Septillion' },
  { value: 1e21, suffix: 'Sx',   name: 'Sextillion' },
  { value: 1e18, suffix: 'Qi',   name: 'Quintillion' },
  { value: 1e15, suffix: 'Qa',   name: 'Quadrillion' },
  { value: 1e12, suffix: 'T',    name: 'Trillion' },
  { value: 1e9,  suffix: 'B',    name: 'Billion' },
  { value: 1e6,  suffix: 'M',    name: 'Million' },
  { value: 1e3,  suffix: 'K',    name: 'Thousand' },
];

/**
 * Format a number in abbreviated form.
 * @param n The number to format
 * @param decimals Decimal places (default 2)
 */
export function formatNumber(n: number, decimals = 2): string {
  if (!isFinite(n) || isNaN(n)) return '0';
  if (n < 0) return '-' + formatNumber(-n, decimals);
  if (n < 1000) return n % 1 === 0 ? n.toString() : n.toFixed(decimals);

  for (const tier of TIERS) {
    if (n >= tier.value) {
      const val = n / tier.value;
      return val.toFixed(decimals) + tier.suffix;
    }
  }
  return n.toFixed(0);
}

/**
 * Format in scientific notation.
 */
export function formatScientific(n: number): string {
  if (!isFinite(n) || isNaN(n)) return '0';
  if (n < 1000) return formatNumber(n, 2);
  const exp = Math.floor(Math.log10(Math.abs(n)));
  const coef = n / Math.pow(10, exp);
  return `${coef.toFixed(2)}e${exp}`;
}

/**
 * Format a number using the player's chosen format.
 */
export function fmt(n: number, format: 'abbreviated' | 'scientific' = 'abbreviated'): string {
  return format === 'scientific' ? formatScientific(n) : formatNumber(n);
}

/**
 * Format a duration in seconds to a human-readable string.
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}m ${s}s`;
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

/**
 * Format HPS rate.
 */
export function formatRate(hps: number, format: 'abbreviated' | 'scientific' = 'abbreviated'): string {
  return `${fmt(hps, format)}/s`;
}

/**
 * Get the religious tier name for a value (for flavor text).
 */
export function getTierName(n: number): string {
  for (const tier of TIERS) {
    if (n >= tier.value) return tier.name;
  }
  return 'Humble';
}
