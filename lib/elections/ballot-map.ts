/** Group ballot measures and other offices by state, for the "pick your state" ballot map. Pure. */

import type { OtherRace } from './downballot';
import type { BallotMeasure } from './measures';

export interface StateBallotEntry {
  measures: BallotMeasure[];
  others: OtherRace[];
  /** Any of it has votes in or a call. */
  live: boolean;
}

export function ballotByState(measures: BallotMeasure[], others: OtherRace[]): Map<string, StateBallotEntry> {
  const out = new Map<string, StateBallotEntry>();
  const entry = (s: string): StateBallotEntry => {
    let e = out.get(s);
    if (!e) out.set(s, (e = { measures: [], others: [], live: false }));
    return e;
  };
  for (const m of measures) {
    const e = entry(m.state);
    e.measures.push(m);
    if (m.status !== 'upcoming') e.live = true;
  }
  for (const r of others) {
    const e = entry(r.state);
    e.others.push(r);
    if (r.status !== 'upcoming') e.live = true;
  }
  return out;
}

/** Statewide first, then local; within each, by title. */
export const statewideFirst = <T extends { scope: 'statewide' | 'local'; title: string }>(xs: T[]): T[] =>
  [...xs].sort((a, b) => Number(a.scope === 'local') - Number(b.scope === 'local') || a.title.localeCompare(b.title));
