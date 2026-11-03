import { describe, expect, it } from 'vitest';
import { csvField, racesToCsv, CSV_COLUMNS } from '../csv';
import { nailBiters } from '../watch';
import type { Race } from '../types';

const cand = (party: 'DEM' | 'GOP', name: string, pct: number) => ({ id: name, name, lastName: name, party, partyLabel: party, incumbent: false, imageUrl: null, votes: pct * 10, pct, leader: false, won: false });
const race = (o: Partial<Race>): Race => ({ id: 'X', office: 'senate', state: 'PA', stateName: 'Pennsylvania', district: null, label: 'Senate · Pennsylvania', type: 'General', special: false, rating: null, status: 'counting', winnerParty: null, flipped: false, pctReporting: 50, totalVotes: 1000, electoralVotes: null, candidates: [], margin: 1, uncontested: false, updatedAt: null, primaryParty: null, calledBy: [], source: 'nyt', ...o }) as Race;

describe('csv', () => {
  it('quotes commas, quotes and newlines, and defuses formulas', () => {
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvField('-5')).toBe("'-5");
    expect(csvField(-5.5)).toBe('-5.5');
    expect(csvField(null)).toBe('');
    expect(csvField(3)).toBe('3');
  });
  it('writes a header and one line per race', () => {
    const csv = racesToCsv([race({ id: 'PA-G-S-2026-11-03', totalVotes: 100, candidates: [cand('DEM', 'Ann', 52), cand('GOP', 'Bob', 47)] })]);
    const [head, line] = csv.trim().split('\r\n');
    expect(head.split(',')).toEqual([...CSV_COLUMNS]);
    expect(line).toContain('PA-G-S-2026-11-03');
    expect(line).toContain('Ann,DEM,52,Bob,47,5');
  });
});

describe('nailBiters', () => {
  it('keeps counting races with a thin lead and real votes in, closest first', () => {
    const out = nailBiters([
      race({ id: 'a', margin: 0.4 }),
      race({ id: 'b', margin: 3 }),
      race({ id: 'c', margin: 9 }),
      race({ id: 'd', margin: 0.1, pctReporting: 2 }),
      race({ id: 'e', margin: 0.2, status: 'called' }),
    ]);
    expect(out.map((r) => r.id)).toEqual(['a', 'b']);
  });
});
