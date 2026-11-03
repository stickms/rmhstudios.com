import { describe, expect, it } from 'vitest';
import { cardStats } from '../card-stats';
import { normalizeNytPage } from '../nyt';
import type { ElectionSnapshot } from '../types';
import { governorPage, housePage, senatePage } from './fixtures';

function snap(live: boolean): ElectionSnapshot {
  const s = normalizeNytPage(senatePage, 'senate');
  const g = normalizeNytPage(governorPage, 'governor');
  const h = normalizeNytPage(housePage, 'house');
  const idle = (rs: typeof s.races) => rs.map((r) => ({ ...r, status: 'upcoming' as const, totalVotes: 0, winnerParty: null, margin: null }));
  return {
    date: '2026-11-03', kind: 'general', source: 'nyt', fetchedAt: 'x', sourceUpdatedAt: null, live,
    chambers: { senate: s.chamber!, governor: g.chamber!, house: h.chamber! },
    races: live ? [...s.races, ...g.races, ...h.races] : [...idle(s.races), ...idle(g.races), ...idle(h.races)],
    pollClosings: {}, missing: [], providers: [],
  };
}

describe('cardStats', () => {
  it('before any votes shows seats on the ballot, never a misleading score', () => {
    const stats = cardStats(snap(false));
    expect(stats.map((x) => x.label)).toEqual(['Senate on the ballot', 'House on the ballot', 'Governors on the ballot']);
    expect(stats.map((x) => x.value)).toEqual(['35', '2', '1']); // counts of seats up, not a D–R score
    expect(stats.every((x) => x.tone === 'ink' && !x.value.includes('–'))).toBe(true);
  });

  it('once races are called shows the D–R running count per chamber and the called tally', () => {
    const stats = cardStats(snap(true));
    const senate = stats.find((x) => x.label.startsWith('Senate'))!;
    expect(senate).toMatchObject({ value: '36–33', tone: 'result', dem: 36, gop: 33 });
    expect(stats.at(-1)).toMatchObject({ tone: 'ink', label: 'races called' });
    expect(stats.length).toBeLessThanOrEqual(4);
  });

  it('marks a tally derived from called races only', () => {
    const gov = cardStats(snap(true)).find((x) => x.label.startsWith('Governors'));
    expect(gov?.label).toBe('Governors D–R · called');
  });

  it('is empty when there are no races', () => {
    expect(cardStats({ ...snap(false), races: [], chambers: {} })).toEqual([]);
  });
});
