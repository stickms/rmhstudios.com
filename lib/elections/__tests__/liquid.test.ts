import { describe, expect, it } from 'vitest';
import { chamberLean, demWinChance, normalCdf, RATING_PRIOR } from '../liquid';
import type { ChamberControl, Race, Rating } from '../types';

const cand = (party: 'DEM' | 'GOP', pct: number) => ({ id: party, name: party, lastName: party, party, partyLabel: party, incumbent: false, imageUrl: null, votes: pct * 10, pct, leader: false, won: false });
const race = (o: Partial<Race>): Race => ({ id: 'x', office: 'senate', state: 'PA', stateName: 'PA', district: null, label: 'x', type: 'General', special: false, rating: null, status: 'upcoming', winnerParty: null, flipped: false, pctReporting: null, totalVotes: 0, electoralVotes: null, candidates: [], margin: null, uncontested: false, updatedAt: null, primaryParty: null, calledBy: [], source: 'nyt', ...o }) as Race;
const chamber = (dem: number, gop: number, toWin = 51, extra: Partial<ChamberControl> = {}): ChamberControl => ({
  office: 'senate', total: 100, seatsUp: 35, seats: { DEM: dem, GOP: gop, OTH: 0 }, notUp: { DEM: 0, GOP: 0, OTH: 0 }, before: { DEM: 0, GOP: 0, OTH: 0 },
  toWin, racesCalled: 0, flips: { DEM: 0, GOP: 0, OTH: 0 }, controlledBy: null, derived: false, ...extra,
});
const open = (rating: Rating, n: number) => Array.from({ length: n }, (_, i) => race({ id: `${rating}${i}`, rating }));

describe('normalCdf', () => {
  it('is the standard normal', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 4);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(normalCdf(-1.96)).toBeCloseTo(0.025, 3);
  });
});

describe('demWinChance', () => {
  it('starts from the rating and moves toward the count as votes come in', () => {
    expect(demWinChance(race({ rating: 'solid-rep' }))).toBe(RATING_PRIOR['solid-rep']);
    expect(demWinChance(race({ rating: 'tossup' }))).toBe(0.5);
    const early = demWinChance(race({ rating: 'tossup', totalVotes: 100, pctReporting: 10, candidates: [cand('DEM', 55), cand('GOP', 45)] }));
    const late = demWinChance(race({ rating: 'tossup', totalVotes: 100, pctReporting: 90, candidates: [cand('DEM', 55), cand('GOP', 45)] }));
    expect(early).toBeGreaterThan(0.5);
    expect(late).toBeGreaterThan(early);
    // a rated-Republican race that the Democrat is winning 60–40 with most counted flips toward the Democrat
    expect(demWinChance(race({ rating: 'lean-rep', totalVotes: 100, pctReporting: 85, candidates: [cand('DEM', 60), cand('GOP', 40)] }))).toBeGreaterThan(0.9);
  });
});

describe('chamberLean', () => {
  it('adds expected seats to what is held, and puts the majority line in share terms', () => {
    const lean = chamberLean('senate', chamber(45, 45), [...open('lean-dem', 4), ...open('tossup', 2), ...open('solid-rep', 4)])!;
    expect(lean.undecided).toBe(10);
    expect(lean.dem + lean.gop).toBeCloseTo(100, 6);
    // 45 + 4*.66 + 2*.5 + 4*.02 = 48.72
    expect(lean.dem).toBeCloseTo(48.72, 1);
    expect(lean.majorityShare).toBeCloseTo(51 / 100, 3);
    expect(lean.basis).toBe('ratings');
  });
  it('is certain once control is decided, and final with nothing open', () => {
    const won = chamberLean('senate', chamber(51, 40, 51, { controlledBy: 'DEM' }), open('tossup', 3))!;
    expect(won.demControl).toBe(1);
    expect(won.gopControl).toBe(0);
    const done = chamberLean('senate', chamber(52, 48), [])!;
    expect(done.basis).toBe('final');
    expect(done.demControl).toBe(1);
    expect(done.gopControl).toBe(0);
    expect(done.lean).toBe('dem');
  });
  it('declines a chamber with no holdover tally', () => {
    expect(chamberLean('senate', chamber(10, 10, 51, { derived: true }), [])).toBeNull();
    expect(chamberLean('senate', undefined, [])).toBeNull();
  });
  it('a long shot is a small chance, a coin flip is near half', () => {
    const flip = chamberLean('senate', chamber(47, 47), open('tossup', 6))!;
    expect(flip.demControl).toBeGreaterThan(0.3);
    expect(flip.demControl).toBeLessThan(0.7);
    const longShot = chamberLean('senate', chamber(40, 50), open('solid-rep', 10))!;
    expect(longShot.demControl).toBeLessThan(0.01);
  });
});
