import { describe, expect, it } from 'vitest';
import { derivePrimaryDays, mergeDays, parseFecDates } from '../calendar-days';
import type { Race } from '../types';

const cand = (img: string | null) => ({
  id: 'x', name: 'n', lastName: 'n', party: 'DEM' as const, partyLabel: 'Democrat', incumbent: false, imageUrl: img, votes: 0, pct: 0, leader: false, won: false,
});
const race = (...imgs: (string | null)[]): Race =>
  ({ candidates: imgs.map(cand) }) as unknown as Race;
const H = (id: string) => `https://static01.nyt.com/elections-assets/2026/headshots/${id}-x-1.png`;

describe('derivePrimaryDays', () => {
  const races = [
    race(H('AL-R-S-2026-05-19'), H('AL-G-S-2026-11-03'), null),
    race(H('NC-D-S-2026-03-03'), H('NC-R-S-2026-03-03'), H('TX-R-H-12-2026-03-03')),
    race(H('OH-S_W-S-2026-11-03'), H('FL-APP-S-2025-01-21'), H('GA-L-S-2026-05-19')),
    race(H('MS-D-H-2-2024-03-12')), // a different year: excluded
    race(H('TN-S_J-S-2026-08-06')),
  ];
  const days = derivePrimaryDays(races, 2026);

  it('reads state, kind and date back out of headshot ids, sorted by date', () => {
    expect(days.map((d) => d.date)).toEqual(['2026-03-03', '2026-05-19', '2026-08-06']);
    expect(days[0].states).toEqual(['NC', 'TX']);
    expect(days[1].states).toEqual(['AL', 'GA']);
  });
  it('excludes generals, appointees, other years and the general-election date itself', () => {
    expect(days.some((d) => d.date === '2026-11-03')).toBe(false);
    expect(days.some((d) => d.date.startsWith('2024'))).toBe(false);
    expect(days.some((d) => d.states.includes('FL'))).toBe(false);
  });
  it('labels specials and flags days with an official feed', () => {
    expect(days[2].kinds).toEqual(['special']);
    expect(days[0].official).toBe(true); // NC
    expect(days[1].official).toBe(false);
  });
  it('ignores candidates without a usable headshot', () => {
    expect(derivePrimaryDays([race(null, 'not-a-url')], 2026)).toEqual([]);
  });
});

describe('parseFecDates', () => {
  const json = {
    results: [
      { election_date: '2026-03-03', election_state: 'NC', election_type_id: 'P' },
      { election_date: '2026-05-26', election_state: 'TX', election_type_id: 'PR' },
      { election_date: '2026-06-10', election_state: 'GA', election_type_id: 'S' },
      { election_date: '2026-11-03', election_state: 'NC', election_type_id: 'G' },
      { election_date: 'garbage', election_state: 'NC', election_type_id: 'P' },
      null,
    ],
  };
  it('maps primary / runoff / special and drops generals and junk', () => {
    const days = parseFecDates(json, 2026);
    expect(days.map((d) => [d.date, d.kinds[0], d.from[0]])).toEqual([
      ['2026-03-03', 'primary', 'fec'],
      ['2026-05-26', 'runoff', 'fec'],
      ['2026-06-10', 'special', 'fec'],
    ]);
  });
  it('is safe on unexpected shapes', () => {
    for (const bad of [null, {}, { results: 'x' }, []]) expect(parseFecDates(bad, 2026)).toEqual([]);
  });
});

describe('mergeDays', () => {
  it('unions states, kinds and provenance by date', () => {
    const a = derivePrimaryDays([race(H('NC-R-S-2026-03-03'))], 2026);
    const b = parseFecDates({ results: [{ election_date: '2026-03-03', election_state: 'TX', election_type_id: 'P' }, { election_date: '2026-04-14', election_state: 'NC', election_type_id: 'R' }] }, 2026);
    const m = mergeDays(a, b);
    expect(m.map((d) => d.date)).toEqual(['2026-03-03', '2026-04-14']);
    expect(m[0].states).toEqual(['NC', 'TX']);
    expect([...m[0].from].sort()).toEqual(['fec', 'feed']);
    expect(m[1].kinds).toEqual(['runoff']);
  });
});
