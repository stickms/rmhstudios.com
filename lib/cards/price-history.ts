/**
 * Price history for a card, derived from its SOLD listings (no table of its own).
 * Pure and client-safe; drawn by `PriceChart`. See
 * docs/superpowers/specs/2026-10-30-market-depth-design.md.
 */

export type Sale = { priceCoins: number; closedAt: Date };

export type DayBucket = {
  /** UTC calendar day, `YYYY-MM-DD`. */
  day: string;
  avg: number | null;
  min: number | null;
  max: number | null;
  volume: number;
};

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

const DAY_MS = 86_400_000;
const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/** One bucket per UTC day for the last `days` days, oldest first, ending today. */
export function bucketDaily(sales: readonly Sale[], now: Date, days = 30): DayBucket[] {
  const buckets = new Map<string, number[]>();
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const k = dayKey(new Date(now.getTime() - i * DAY_MS));
    keys.push(k);
    buckets.set(k, []);
  }
  for (const s of sales) buckets.get(dayKey(s.closedAt))?.push(s.priceCoins);
  return keys.map((day) => {
    const v = buckets.get(day) as number[];
    if (v.length === 0) return { day, avg: null, min: null, max: null, volume: 0 };
    return {
      day,
      avg: Math.round((v.reduce((n, x) => n + x, 0) / v.length) * 100) / 100,
      min: Math.min(...v),
      max: Math.max(...v),
      volume: v.length,
    };
  });
}

export function summarize(sales: readonly Sale[]) {
  if (sales.length === 0) return null;
  const prices = sales.map((s) => s.priceCoins);
  return { median: median(prices), low: Math.min(...prices), high: Math.max(...prices), volume: sales.length };
}
