import { describe, expect, it } from 'vitest';
import { normalizeNytPage, toParty } from '../nyt';
import { governorPage, housePage, senatePage } from './fixtures';

describe('normalizeNytPage — senate', () => {
  const page = normalizeNytPage(senatePage, 'senate');
  const byId = (id: string) => page.races.find((r) => r.id === id)!;

  it('classifies called / counting / upcoming', () => {
    expect(byId('PA-G-S-2026-11-03').status).toBe('called');
    expect(byId('OH-S_W-S-2026-11-03').status).toBe('counting');
    expect(byId('TX-G-S-2026-11-03').status).toBe('upcoming');
  });

  it('computes shares, margin, leader and orders candidates by votes', () => {
    const oh = byId('OH-S_W-S-2026-11-03');
    expect(oh.candidates.map((c) => c.lastName)).toEqual(['Beta', 'Alpha', 'Gamma']);
    expect(oh.candidates[0]).toMatchObject({ leader: true, party: 'GOP', incumbent: true });
    expect(oh.candidates[2].party).toBe('OTH');
    expect(oh.margin).toBe(1);
    expect(oh.special).toBe(true);
    expect(oh.label).toBe('Senate · Ohio (special)');
    expect(oh.pctReporting).toBe(62);
  });

  it('reports the winner, party and flip', () => {
    const mi = byId('MI-G-S-2026-11-03');
    expect(mi.winnerParty).toBe('GOP');
    expect(mi.flipped).toBe(true);
    expect(mi.candidates[0].won).toBe(true);
  });

  it('has no counts or reporting percent before votes', () => {
    const tx = byId('TX-G-S-2026-11-03');
    expect(tx.totalVotes).toBe(0);
    expect(tx.pctReporting).toBeNull();
    expect(tx.margin).toBeNull();
    expect(tx.rating).toBe('likely-rep');
    expect(tx.candidates.map((c) => c.lastName)).toEqual(['Quill', 'Stone']); // ballot order
  });

  it('reads the chamber table from the source', () => {
    expect(page.chamber).toMatchObject({
      office: 'senate',
      total: 100,
      seatsUp: 35,
      toWin: 51,
      racesCalled: 2,
      derived: false,
      controlledBy: null,
    });
    expect(page.chamber?.seats).toEqual({ DEM: 36, GOP: 33, OTH: 0 });
    expect(page.chamber?.before).toEqual({ DEM: 45, GOP: 53, OTH: 2 });
    expect(page.chamber?.flips.GOP).toBe(1);
  });

  it('collects poll closing times and the source timestamp', () => {
    expect(page.pollClosings.PA).toEqual({ iso: '2026-11-04T01:00:00.000Z', displayET: '8 p.m.' });
    expect(page.sourceUpdatedAt).toBe('2026-11-04T02:00:00.000Z');
  });
});

describe('normalizeNytPage — governor', () => {
  it("ignores a control table for the wrong office and derives from called races", () => {
    const page = normalizeNytPage(governorPage, 'governor');
    expect(page.chamber?.derived).toBe(true);
    expect(page.chamber?.office).toBe('governor');
    expect(page.chamber?.total).toBe(50);
    expect(page.chamber?.seats).toEqual({ DEM: 1, GOP: 0, OTH: 0 });
    expect(page.chamber?.flips.DEM).toBe(1);
  });
});

describe('normalizeNytPage — house', () => {
  const page = normalizeNytPage(housePage, 'house');
  it('drops the national roll-up and labels districts', () => {
    expect(page.races).toHaveLength(2);
    expect(page.races.map((r) => r.label)).toEqual(['House · WY-AL', 'House · AL-2']);
    expect(page.races[0].district).toBe('AL');
  });
});

describe('robustness', () => {
  it('never throws on garbage', () => {
    for (const bad of [null, undefined, 42, 'x', [], {}, { races: 'nope' }, { races: [null, 1, {}] }]) {
      expect(() => normalizeNytPage(bad, 'senate')).not.toThrow();
      expect(normalizeNytPage(bad, 'senate').races).toEqual([]);
    }
  });
  it('maps parties', () => {
    expect(toParty('DEM')).toBe('DEM');
    expect(toParty('GOP')).toBe('GOP');
    expect(toParty('LIB')).toBe('OTH');
    expect(toParty(undefined)).toBe('OTH');
  });
});
