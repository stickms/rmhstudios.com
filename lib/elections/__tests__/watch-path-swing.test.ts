import { describe, expect, it } from 'vitest';
import { watchByClosing } from '../watch';
import { pathToControl } from '../path';
import { buildBaseline, fmtMargin, signedMargin, swingFrom } from '../swing';
import type { ChamberControl, ElectionSnapshot, Race, Rating } from '../types';

const cand = (party: 'DEM' | 'GOP', pct: number) =>
  ({ id: party + pct, name: party, lastName: party, party, partyLabel: party, incumbent: false, imageUrl: null, votes: pct * 100, pct, leader: false, won: false });

function race(o: Partial<Race> & { id: string }): Race {
  return {
    office: 'senate', state: 'PA', stateName: 'Pennsylvania', district: null, label: `Senate · ${o.state ?? 'PA'}`, type: 'General',
    special: false, rating: null, status: 'upcoming', winnerParty: null, flipped: false, pctReporting: null, totalVotes: 0,
    electoralVotes: null, candidates: [], margin: null, uncontested: false, updatedAt: null, primaryParty: null, calledBy: [], source: 'nyt', ...o,
  } as Race;
}

const snap = (races: Race[], closings: ElectionSnapshot['pollClosings'] = {}): ElectionSnapshot => ({
  date: '2026-11-03', kind: 'general', source: 'nyt', fetchedAt: '', sourceUpdatedAt: null, live: false, chambers: {},
  races, pollClosings: closings, missing: [], providers: [],
});

describe('watchByClosing', () => {
  it('groups competitive open races by closing time, earliest first, and drops called ones', () => {
    const races = [
      race({ id: 'a', state: 'GA', rating: 'tossup' }),
      race({ id: 'b', state: 'PA', rating: 'lean-dem' }),
      race({ id: 'c', state: 'GA', rating: 'tossup', status: 'called' }),
      race({ id: 'd', state: 'AZ', rating: 'solid-rep' }),
      race({ id: 'e', state: 'PA', office: 'house', district: '7', rating: 'lean-rep' }),
    ];
    const out = watchByClosing(
      snap(races, { GA: { iso: '2026-11-04T00:00:00Z', displayET: '7 p.m.' }, PA: { iso: '2026-11-04T01:00:00Z', displayET: '8 p.m.' } }),
      new Date('2026-11-04T00:30:00Z'),
    );
    expect(out.map((g) => [g.displayET, g.closed, g.races.map((r) => r.id)])).toEqual([
      ['7 p.m.', true, ['a']],
      ['8 p.m.', false, ['b']],
    ]);
  });
});

describe('pathToControl', () => {
  const chamber = (seats: [number, number], toWin = 51): ChamberControl => ({
    office: 'senate', total: 100, seatsUp: 35, seats: { DEM: seats[0], GOP: seats[1], OTH: 0 }, notUp: { DEM: 0, GOP: 0, OTH: 0 },
    before: { DEM: 0, GOP: 0, OTH: 0 }, toWin, racesCalled: 0, flips: { DEM: 0, GOP: 0, OTH: 0 }, controlledBy: null, derived: false,
  });
  it('counts leans and the toss-ups a party still needs', () => {
    const rs = (r: Rating, n: number) => Array.from({ length: n }, (_, i) => race({ id: `${r}${i}`, state: `S${r}${i}`, rating: r }));
    const out = pathToControl(
      { senate: chamber([40, 45]) },
      [...rs('lean-dem', 5), ...rs('solid-rep', 3), ...rs('tossup', 4)],
    );
    expect(out[0].dem).toMatchObject({ seats: 40, leaning: 5, tossupsNeeded: 6, reachable: false });
    expect(out[0].gop).toMatchObject({ seats: 45, leaning: 3, tossupsNeeded: 3, reachable: true });
  });
  it('skips a chamber with no holdover tally', () => {
    expect(pathToControl({ senate: { ...chamber([1, 1]), derived: true } }, [])).toEqual([]);
  });
});

describe('swing', () => {
  it('signs margins D minus R and formats them', () => {
    const r = race({ id: 'x', totalVotes: 100, candidates: [cand('DEM', 52), cand('GOP', 47)] });
    expect(signedMargin(r)).toBe(5);
    expect(fmtMargin(5)).toBe('D+5.0');
    expect(fmtMargin(-2.25)).toBe('R+2.3');
    expect(signedMargin(race({ id: 'y' }))).toBeNull();
  });
  it('baselines a senate race on the state presidential vote and a house race on the district', () => {
    const prior = [
      race({ id: 'p', office: 'president', state: 'PA', totalVotes: 100, candidates: [cand('DEM', 48), cand('GOP', 51)] }),
      race({ id: 'h', office: 'house', state: 'PA', district: '7', totalVotes: 100, candidates: [cand('DEM', 49), cand('GOP', 50)] }),
    ];
    const cur = [race({ id: 's', state: 'PA' }), race({ id: 'h26', office: 'house', state: 'PA', district: '7' })];
    const b = buildBaseline(cur, prior, 2024);
    expect(b.s).toEqual({ margin: -3, year: 2024, kind: 'president' });
    expect(b.h26).toEqual({ margin: -1, year: 2024, kind: 'house' });
    const now = race({ id: 's', totalVotes: 100, candidates: [cand('DEM', 50), cand('GOP', 49)] });
    expect(swingFrom(now, b.s)).toBe(4);
  });
});
