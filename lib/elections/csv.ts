/**
 * The races as CSV, for anyone who wants the numbers in a spreadsheet. Pure.
 *
 * Every field is quoted when needed, and a field that a spreadsheet would read as a formula (leading = + - @)
 * is prefixed with an apostrophe so opening the file can never execute anything.
 */

import { signedMargin } from './swing';
import type { Race } from './types';

export const CSV_COLUMNS = [
  'id', 'office', 'state', 'district', 'label', 'status', 'rating', 'percent_reporting', 'total_votes',
  'leader', 'leader_party', 'leader_percent', 'runner_up', 'runner_up_percent', 'margin_dem_minus_rep',
  'winner_party', 'flipped',
] as const;

export function csvField(v: unknown): string {
  let s = v == null ? '' : String(v);
  // Real numbers (margins can be negative) are safe; only text a spreadsheet might read as a formula is defused.
  if (typeof v !== 'number' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function racesToCsv(races: Race[]): string {
  const rows = races.map((r) => {
    const [a, b] = r.candidates;
    return [
      r.id, r.office, r.state, r.district ?? '', r.label, r.status, r.rating ?? '',
      r.pctReporting ?? '', r.totalVotes, a?.name ?? '', a?.party ?? '', a?.pct ?? '', b?.name ?? '', b?.pct ?? '',
      signedMargin(r) ?? '', r.winnerParty ?? '', r.flipped ? 'yes' : '',
    ].map(csvField).join(',');
  });
  return [CSV_COLUMNS.join(','), ...rows].join('\r\n') + '\r\n';
}
