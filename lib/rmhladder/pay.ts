/**
 * Pay normalization — pure and client-safe.
 * Feature idea F7 in docs/plans/2026-10-12-feature-ideas-every-surface.md.
 *
 * Postings state pay every way there is: "$45/hr", "$80K – $95K", "USD
 * 120,000-140,000 per year", "£3,000 a month", "$8,500/mo stipend". Levels.fyi
 * is useful because it puts all of those on one axis; RMHLadder can sort and
 * filter by pay only once it does the same. This turns a free-text pay string
 * into `{ currency, minAnnual, maxAnnual, period }`.
 *
 * Annualization uses a full-time year — 2,080 hours, 52 weeks, 12 months —
 * because that is the convention every pay-transparency law and every
 * comparison site uses. For internships that is an *annualized rate*, not
 * what an intern will earn over a 12-week summer; the UI labels it so
 * ("$96k/yr equivalent") rather than pretending otherwise.
 *
 * It refuses rather than guesses: no number, or a period it cannot read and
 * a magnitude that could plausibly be either hourly or annual, returns null.
 * A wrong salary on a job card is worse than none.
 */

export type PayPeriod = 'hour' | 'week' | 'month' | 'year';

export interface Pay {
  currency: string;
  period: PayPeriod;
  minAnnual: number;
  maxAnnual: number;
}

const PER_YEAR: Record<PayPeriod, number> = { hour: 2080, week: 52, month: 12, year: 1 };

const SYMBOLS: Record<string, string> = {
  $: 'USD',
  '£': 'GBP',
  '€': 'EUR',
  '¥': 'JPY',
  '₹': 'INR',
};
const CODES = ['USD', 'CAD', 'AUD', 'GBP', 'EUR', 'JPY', 'INR', 'SGD', 'CHF', 'NZD'];

const PERIOD_PATTERNS: Array<[RegExp, PayPeriod]> = [
  [/\b(per|an?|\/)\s*(hour|hr|h)\b|\bhourly\b/i, 'hour'],
  [/\b(per|a|\/)\s*(week|wk)\b|\bweekly\b/i, 'week'],
  [/\b(per|a|\/)\s*(month|mo)\b|\bmonthly\b|\bstipend\b/i, 'month'],
  [/\b(per|a|\/)\s*(year|yr|annum)\b|\bannual(ly)?\b|\bsalary\b|\bp\.?a\.?\b/i, 'year'],
];

function detectCurrency(s: string): string {
  const upper = s.toUpperCase();
  for (const code of CODES) if (new RegExp(`\\b${code}\\b`).test(upper)) return code;
  if (/\bC\$|CA\$/.test(s)) return 'CAD';
  if (/\bA\$|AU\$/.test(s)) return 'AUD';
  for (const [sym, code] of Object.entries(SYMBOLS)) if (s.includes(sym)) return code;
  return 'USD';
}

function detectPeriod(s: string): PayPeriod | null {
  for (const [re, period] of PERIOD_PATTERNS) if (re.test(s)) return period;
  return null;
}

/** Numbers in order of appearance, with k/K and m/M suffixes applied. */
function amounts(s: string): number[] {
  const out: number[] = [];
  for (const m of s.matchAll(/(\d{1,3}(?:[,\s]\d{3})+|\d+(?:\.\d+)?)\s*([kKmM])?(?![\d%])/g)) {
    let v = Number(m[1]!.replace(/[,\s]/g, ''));
    if (m[2] === 'k' || m[2] === 'K') v *= 1_000;
    if (m[2] === 'm' || m[2] === 'M') v *= 1_000_000;
    if (Number.isFinite(v) && v > 0) out.push(v);
  }
  return out;
}

/** Magnitude-only fallback when the string names no period. */
function inferPeriod(max: number): PayPeriod | null {
  if (max >= 15_000) return 'year';
  if (max >= 1_500 && max < 15_000) return 'month';
  if (max >= 7 && max <= 250) return 'hour';
  return null;
}

export function parsePay(raw: string | null | undefined): Pay | null {
  if (!raw) return null;
  const nums = amounts(raw).slice(0, 2);
  if (nums.length === 0) return null;
  const lo = Math.min(...nums);
  const hi = Math.max(...nums);
  const period = detectPeriod(raw) ?? inferPeriod(hi);
  if (!period) return null;
  const k = PER_YEAR[period];
  return {
    currency: detectCurrency(raw),
    period,
    minAnnual: Math.round(lo * k),
    maxAnnual: Math.round(hi * k),
  };
}
