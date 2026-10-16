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

/* ── Extraction from posting text (F7) ───────────────────────────────────── */

const AMOUNT = String.raw`[$£€]\s?\d[\d,]*(?:\.\d+)?\s?[kK]?`;
const PAY_SNIPPET = new RegExp(
  String.raw`(?:\b(?:USD|CAD|AUD|GBP|EUR)\s?)?${AMOUNT}(?:\s*(?:-|–|—|to)\s*[$£€]?\s?\d[\d,]*(?:\.\d+)?\s?[kK]?)?` +
    String.raw`(?:\s*(?:\/|per\s|a\s)\s*(?:hour|hr|year|yr|annum|month|mo|week|wk)\b|\s+(?:annually|hourly|monthly))?`,
  'g',
);
/** Money that is in a posting but is not the base pay. */
const NOT_BASE_PAY =
  /bonus|relocation|sign-?on|signing|tuition|equity|stock|reimburs|per diem|revenue|funding|raised|assets|billion|million|budget|401|allowance|insurance|HSA|gift|perk|stipend for (?:housing|travel)/i;
/** Sane annual bounds; anything outside is a parsing accident, not a salary. */
const MIN_ANNUAL = 8_000;
const MAX_ANNUAL = 1_500_000;

/**
 * Finds the first base-pay statement in a posting's text and parses it. Only a
 * currency-marked amount counts, and it must be a range or carry an explicit
 * period ("$45/hr", "$80K–$95K"): a lone "$50" is a gift card, not a wage.
 * Returns null rather than guessing.
 */
export function extractPay(text: string | null | undefined): Pay | null {
  if (!text) return null;
  for (const m of text.matchAll(PAY_SNIPPET)) {
    const idx = m.index ?? 0;
    // Judge by the same sentence only, so a bonus next door does not hide base pay.
    const before = text.slice(Math.max(0, idx - 60), idx).split(/[.!?\n]\s/).pop() ?? '';
    const after = text.slice(idx + m[0].length, idx + m[0].length + 60).split(/[.!?\n]\s/)[0] ?? '';
    const around = `${before}${m[0]}${after}`;
    if (NOT_BASE_PAY.test(around)) continue;
    // "$80-95K": the K applies to both ends.
    const snippet = m[0].replace(
      /(?<![\d,.])(\d{1,3})(?=\s*(?:-|–|—|to)\s*[$£€]?\s?\d[\d,.]*\s?[kK]\b)/,
      '$1K',
    );
    const isRange = amounts(snippet).length >= 2;
    const hasPeriod = detectPeriod(snippet) !== null;
    if (!isRange && !hasPeriod) continue;
    const pay = parsePay(snippet);
    if (pay && pay.maxAnnual >= MIN_ANNUAL && pay.maxAnnual <= MAX_ANNUAL) return pay;
  }
  return null;
}

/** "$96k" / "£36k" / "CHF 90k" — whole-thousand shorthand for a yearly amount. */
function shortMoney(amount: number, currency: string): string {
  const sym = Object.entries(SYMBOLS).find(([, c]) => c === currency)?.[0];
  const body = amount >= 1000 ? `${Math.round(amount / 1000)}k` : String(Math.round(amount));
  return sym ? `${sym}${body}` : `${currency} ${body}`;
}

/** "≈ $96k/yr" or "≈ $80k–$95k/yr" (never a range of two equal ends). */
export function formatPay(pay: Pick<Pay, 'currency' | 'minAnnual' | 'maxAnnual'>): string {
  const lo = shortMoney(pay.minAnnual, pay.currency);
  const hi = shortMoney(pay.maxAnnual, pay.currency);
  return `≈ ${lo === hi ? lo : `${lo}–${hi}`}/yr`;
}
