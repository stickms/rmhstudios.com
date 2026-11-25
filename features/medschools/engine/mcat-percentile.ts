/**
 * MCAT percentile ranks (owner 2026-11-25: "Target band should use percentiles"): a static lookup of AAMC's published
 * table, `data/medschools/mcat-percentiles.json` ("Percentile Ranks for MCAT Total and Section Scores", the table in
 * effect for the period the file names). Pure and client-safe, no table in the database: the file is small and is the
 * same for everyone. Only the list builder imports it (its endpoint, and its page through `builder/label.ts`), so it
 * never reaches the shared entry.
 *
 * A rank is stored exactly as AAMC prints it: a whole number, or "<1" for the lowest scores (numerically 0 here, so a
 * comparison treats it as below 1). A score that is not a whole number in the table has no rank (`null`): the caller
 * does not compare it. `mcat-percentile.test.ts` holds the table's shape (472-528 with no gaps, ranks never falling);
 * `scripts/medschools/check-mcat-percentiles.ts` re-reads the PDF by hand.
 */
import table from '../../../data/medschools/mcat-percentiles.json';

export interface McatPercentile {
  score: number;
  /** For comparison: the printed rank, with "<1" as 0. */
  rank: number;
  /** As printed: "84", "<1". */
  printed: string;
}

export interface McatPercentileSource {
  /** "May 1, 2026 – April 30, 2027", as the PDF prints it. */
  period: string;
  /** AAMC's page that links the current table. */
  pageUrl: string;
  /** The PDF itself. */
  sourceUrl: string;
  /** "Source: AAMC, Percentile Ranks for MCAT Total and Section Scores, <period>". */
  attribution: string;
}

export const MCAT_PERCENTILE_SOURCE: McatPercentileSource = {
  period: table.inEffect,
  pageUrl: table.pageUrl,
  sourceUrl: table.sourceUrl,
  attribution: table.attribution,
};

export const MCAT_TOTAL_MIN = 472;
export const MCAT_TOTAL_MAX = 528;

/** "<1" is 0; a whole number is itself; anything else is not a rank. */
export function rankValue(printed: string): number | null {
  if (printed === '<1') return 0;
  return /^\d{1,3}$/.test(printed) ? Number(printed) : null;
}

const TOTAL: ReadonlyMap<number, string> = new Map(table.total.map((r) => [r.score, r.rank]));

/** The percentile rank of a whole MCAT total in AAMC's table, or null (not a whole number, or not in the table). */
export function mcatPercentile(score: number): McatPercentile | null {
  if (!Number.isInteger(score)) return null;
  const printed = TOTAL.get(score);
  if (printed === undefined) return null;
  const rank = rankValue(printed);
  return rank === null ? null : { score, rank, printed };
}
