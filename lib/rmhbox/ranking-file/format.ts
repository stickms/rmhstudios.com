/**
 * RMHbox — Ranking File value formatting (pure; the pack's data is English).
 */

/** "1066", "44 BC", "10^6", "8,849 m": a revealed value with its unit. */
export function formatRankingValue(value: number, unit: string): string {
  if (unit === 'year') return value < 0 ? `${-value} BC` : String(value);
  if (unit === 'power of ten') return `10^${value}`;
  if (unit === 'degrees latitude') return `${Math.abs(value)}° ${value >= 0 ? 'N' : 'S'}`;
  const number = value.toLocaleString('en-US', { maximumFractionDigits: 3 });
  return `${number} ${unit}`;
}
