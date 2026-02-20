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
  { value: 1e63, suffix: 'Vg',  name: 'Omniscient' },
  { value: 1e60, suffix: 'Nv',  name: 'Eternal' },
  { value: 1e57, suffix: 'Oc',  name: 'Infinite' },
  { value: 1e54, suffix: 'Sp',  name: 'Divine' },
  { value: 1e51, suffix: 'Sx',  name: 'Celestial' },
  { value: 1e48, suffix: 'Qi',  name: 'Holy' },
  { value: 1e45, suffix: 'Qa',  name: 'Blessed' },
  { value: 1e42, suffix: 'Tg',  name: 'Transcendent' },
  { value: 1e39, suffix: 'Dg',  name: 'Exalted' },
  { value: 1e36, suffix: 'Ud',  name: 'Ascended' },
  { value: 1e33, suffix: 'Dc',  name: 'Sacred' },
  { value: 1e30, suffix: 'No',  name: 'Hallowed' },
  { value: 1e27, suffix: 'Oc',  name: 'Radiant' },
  { value: 1e24, suffix: 'Sp',  name: 'Luminous' },
  { value: 1e21, suffix: 'Sx',  name: 'Sublime' },
  { value: 1e18, suffix: 'Qi',  name: 'Holy' },
  { value: 1e15, suffix: 'Qa',  name: 'Blessed' },
  { value: 1e12, suffix: 'T',   name: 'Transcendent' },
  { value: 1e9,  suffix: 'B',   name: 'Exalted' },
  { value: 1e6,  suffix: 'M',   name: 'Devout' },
  { value: 1e3,  suffix: 'K',   name: 'Humble' },
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
