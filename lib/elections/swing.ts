/**
 * How a race compares with the last time that ground was voted on. Pure.
 *
 * The free results feed keeps only recent pages (2024 exists; 2022 and 2020 do not), so the baseline is the
 * 2024 vote: for a Senate or governor race, the state's presidential margin; for a House race, the same
 * district's House margin. It says where the electorate stood, not an apples-to-apples rematch, and the UI
 * labels it that way.
 */

import type { Race } from './types';

/** Democratic share minus Republican share, in points; positive means Democratic. Null before any votes. */
export function signedMargin(r: Race): number | null {
  if (!(r.totalVotes > 0)) return null;
  const best = (p: 'DEM' | 'GOP') => r.candidates.filter((c) => c.party === p).reduce((m, c) => Math.max(m, c.pct), 0);
  const d = best('DEM');
  const g = best('GOP');
  if (d === 0 && g === 0) return null;
  return Math.round((d - g) * 10) / 10;
}

export function fmtMargin(m: number): string {
  if (m === 0) return 'Even';
  return `${m > 0 ? 'D' : 'R'}+${Math.abs(m).toFixed(1)}`;
}

export interface Baseline {
  /** Signed margin (D − R, points) in the baseline contest. */
  margin: number;
  /** The year of the baseline contest. */
  year: number;
  /** What it was: the state's presidential vote, or the same district's House vote. */
  kind: 'president' | 'house';
}

/** Match each current race to its baseline contest, by race id. */
export function buildBaseline(current: Race[], prior: Race[], year: number): Record<string, Baseline> {
  const pres = new Map<string, Race>();
  const house = new Map<string, Race>();
  for (const r of prior) {
    if (r.office === 'president') pres.set(r.state, r);
    else if (r.office === 'house') house.set(`${r.state}-${r.district ?? ''}`, r);
  }
  const out: Record<string, Baseline> = {};
  for (const r of current) {
    const base =
      r.office === 'house' ? house.get(`${r.state}-${r.district ?? ''}`) : r.office === 'president' ? undefined : pres.get(r.state);
    const margin = base ? signedMargin(base) : null;
    if (base && margin != null) out[r.id] = { margin, year, kind: base.office === 'house' ? 'house' : 'president' };
  }
  return out;
}

/** The shift since the baseline, in points; positive means it moved toward the Democrats. */
export function swingFrom(r: Race, b: Baseline | undefined): number | null {
  const now = signedMargin(r);
  if (now == null || !b) return null;
  return Math.round((now - b.margin) * 10) / 10;
}
