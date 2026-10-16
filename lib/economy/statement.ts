/**
 * Monthly coin statement (C4) — pure and client-safe.
 *
 * A bank statement for `CoinTransaction`: every movement in a calendar month
 * (UTC), bucketed by what it was, with opening and closing balance.
 *
 * ## Categories
 *
 * The ledger's `type` says what a row *is*; the statement says what it meant to
 * the member, so the mapping is by type and direction:
 *
 *   staked  WAGER, either direction: stakes going out, payouts coming back.
 *   gifted  GIFT and TIP, either direction: coins given or received.
 *   earned  any other credit: rewards, quests, market proceeds, refunds.
 *   spent   any other debit: shop, fees, memberships.
 *
 * Every row falls into exactly one bucket, so the buckets always sum to the
 * month's net movement — the property the statement's arithmetic rests on.
 */

export type StatementCategory = 'earned' | 'spent' | 'gifted' | 'staked';
export type StatementDirection = 'in' | 'out';

export const STATEMENT_CATEGORIES: readonly StatementCategory[] = [
  'earned',
  'spent',
  'gifted',
  'staked',
];

/** Hard cap on CSV rows — a blast-radius limit, not a product rule. */
export const STATEMENT_CSV_MAX_ROWS = 20_000;

export function categorize(type: string, direction: StatementDirection): StatementCategory {
  if (type === 'WAGER') return 'staked';
  if (type === 'GIFT' || type === 'TIP') return 'gifted';
  return direction === 'in' ? 'earned' : 'spent';
}

/** A grouped total from the database: one (type, direction) bucket. */
export interface TypeTotal {
  type: string;
  direction: StatementDirection;
  total: number;
  count: number;
}

export interface CategoryTotals {
  category: StatementCategory;
  inTotal: number;
  outTotal: number;
  count: number;
}

export interface StatementSummary {
  month: string;
  /** Balance at 00:00 UTC on the first of the month. */
  openingBalance: number;
  /** Balance at the end of the month (or now, for the current month). */
  closingBalance: number;
  categories: CategoryTotals[];
  totalIn: number;
  totalOut: number;
  net: number;
  rowCount: number;
}

/** Fold grouped (type, direction) totals into the four statement categories. */
export function summarize(
  month: string,
  groups: readonly TypeTotal[],
  closingBalance: number,
): StatementSummary {
  const byCat = new Map<StatementCategory, CategoryTotals>(
    STATEMENT_CATEGORIES.map((c) => [c, { category: c, inTotal: 0, outTotal: 0, count: 0 }]),
  );
  let totalIn = 0;
  let totalOut = 0;
  let rowCount = 0;
  for (const g of groups) {
    const bucket = byCat.get(categorize(g.type, g.direction))!;
    if (g.direction === 'in') {
      bucket.inTotal += g.total;
      totalIn += g.total;
    } else {
      bucket.outTotal += g.total;
      totalOut += g.total;
    }
    bucket.count += g.count;
    rowCount += g.count;
  }
  const net = totalIn - totalOut;
  return {
    month,
    // Opening is derived from closing and the month's own net, so the identity
    // opening + net = closing holds by construction.
    openingBalance: closingBalance - net,
    closingBalance,
    categories: [...byCat.values()],
    totalIn,
    totalOut,
    net,
    rowCount,
  };
}

/** `YYYY-MM` → UTC [start, end) of that month, or null if malformed / in the future. */
export function monthRange(
  month: string,
  now: Date = new Date(),
): { start: Date; end: Date } | null {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!m) return null;
  const start = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
  const end = new Date(Date.UTC(Number(m[1]), Number(m[2]), 1));
  if (start.getTime() > now.getTime()) return null;
  // Ledger history is not worth unbounded scans; three years is generous.
  if (now.getTime() - start.getTime() > 3 * 366 * 86_400_000) return null;
  return { start, end };
}

/** The last `count` month keys, newest first, ending at the month containing `now`. */
export function recentMonths(now: Date = new Date(), count = 12): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

/**
 * Escape one CSV cell. Beyond RFC 4180 quoting, a cell that starts with a
 * formula trigger (`= + - @`, tab, CR) is prefixed with a quote so a note a
 * stranger wrote ("=HYPERLINK(...)") cannot execute when the member opens the
 * statement in a spreadsheet.
 */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  let s = String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export interface StatementCsvRow {
  createdAt: Date;
  type: string;
  direction: StatementDirection;
  amount: number;
  counterparty: string;
  note: string | null;
  reference: string;
}

export const CSV_HEADER = [
  'date_utc',
  'type',
  'category',
  'direction',
  'amount',
  'counterparty',
  'note',
  'reference',
];

/** Render rows as CSV. `amount` is signed: credits positive, debits negative. */
export function toCsv(rows: readonly StatementCsvRow[]): string {
  const lines = [CSV_HEADER.join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.createdAt.toISOString(),
        r.type,
        categorize(r.type, r.direction),
        r.direction,
        r.direction === 'in' ? r.amount : -r.amount,
        r.counterparty,
        r.note,
        r.reference,
      ]
        .map(csvCell)
        .join(','),
    );
  }
  // CRLF is what RFC 4180 and Excel expect.
  return lines.join('\r\n') + '\r\n';
}
