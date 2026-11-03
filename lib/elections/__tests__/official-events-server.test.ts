import { afterEach, describe, expect, it } from 'vitest';
import { crossCheck, checkRace, OFFICIAL_TOLERANCE_PTS } from '../official';
import { __resetEvents, eventHistory, ingestSnapshot, publishNews, subscribeEvents } from '../events.server';
import { normalizeNytPage } from '../nyt';
import { parseNcsbeResults, finalizeRaces, classifyContest } from '../sources/ncsbe';
import type { ElectionSnapshot, Race } from '../types';
import { senatePage } from './fixtures';

/** A trimmed slice of a REAL NC SBE precinct file (2026-03-03 primary), same columns and quirks. */
const HEADER = 'County\tElection Date\tPrecinct\tContest Group ID\tContest Type\tContest Name\tChoice\tChoice Party\tVote For\tElection Day\tEarly Voting\tAbsentee by Mail\tProvisional\tTotal Votes\tReal Precinct\t';
const row = (county: string, prec: string, type: string, contest: string, choice: string, party: string, total: number) =>
  `${county}\t03/03/2026\t${prec}\t1\t${type}\t${contest}\t${choice}\t${party}\t1\t0\t0\t0\t0\t${total}\tY\t\r`;
const TSV = [
  HEADER + '\r',
  row('WAKE', '01', 'S', 'US SENATE (DEM)', 'Roy Cooper', 'DEM', 900),
  row('WAKE', '01', 'S', 'US SENATE (DEM)', 'Justin E. Dues', 'DEM', 60),
  row('WAKE', '02', 'S', 'US SENATE (DEM)', 'Roy Cooper', 'DEM', 700),
  row('WAKE', '02', 'S', 'US SENATE (DEM)', 'Justin E. Dues', 'DEM', 40),
  row('WAKE', '02', 'S', 'US SENATE (DEM)', 'Jane Doe (Write-In)', '', 5),
  row('WAKE', '02', 'S', 'US SENATE (DEM)', 'John Roe (Write-In)', '', 4),
  row('WAKE', '03', 'S', 'US SENATE (DEM)', 'Roy Cooper', 'DEM', 0), // precinct not yet in
  row('WAKE', '03', 'S', 'US SENATE (DEM)', 'Justin E. Dues', 'DEM', 0),
  row('WAKE', '01', 'S', 'US SENATE (REP)', 'Michael Whatley', 'REP', 500),
  row('WAKE', '01', 'S', 'US SENATE (REP)', 'Don Brown', 'REP', 400),
  row('WAKE', '01', 'S', 'US SENATE (REP)', 'Thomas Johnson', 'REP', 300),
  row('WAKE', '01', 'S', 'US HOUSE OF REPRESENTATIVES DISTRICT 11 (REP)', 'Chuck Edwards', 'REP', 70),
  row('WAKE', '01', 'S', 'US HOUSE OF REPRESENTATIVES DISTRICT 11 (REP)', 'Adam R. Smith', 'REP', 30),
  row('WAKE', '01', 'S', 'NC HOUSE OF REPRESENTATIVES DISTRICT 003 (DEM)', 'A State Rep', 'DEM', 99), // STATE house: not ours
  row('WAKE', '01', 'C', 'WAKE COUNTY SHERIFF (REP)', 'A Sheriff', 'REP', 99), // county contest: not ours
  row('WAKE', '01', 'S', 'NC GOVERNOR', 'Martin Luther King Jr.', '', 3),
  row('WAKE', '01', 'S', 'NC GOVERNOR', 'Someone Else', 'DEM', 3), // exact tie
].join('\n');

describe('classifyContest', () => {
  it('carries federal and governor contests and not the state house or local races', () => {
    expect(classifyContest('US SENATE (REP)')).toEqual({ office: 'senate', district: null, primary: 'REP' });
    expect(classifyContest('US SENATE')).toEqual({ office: 'senate', district: null, primary: null });
    expect(classifyContest('US HOUSE OF REPRESENTATIVES DISTRICT 04 (DEM)')).toEqual({ office: 'house', district: '4', primary: 'DEM' });
    expect(classifyContest('NC GOVERNOR (LIB)')?.office).toBe('governor');
    expect(classifyContest('PRESIDENTIAL PREFERENCE (REP)')).toEqual({ office: 'president', district: null, primary: 'REP' });
    expect(classifyContest('US PRESIDENT')?.primary).toBeNull();
    expect(classifyContest('NC HOUSE OF REPRESENTATIVES DISTRICT 003 (DEM)')).toBeNull();
    expect(classifyContest('NC STATE SENATE DISTRICT 01 (REP)')).toBeNull();
    expect(classifyContest('WAKE COUNTY SHERIFF (REP)')).toBeNull();
  });
});

describe('parseNcsbeResults', () => {
  const { races, rows } = parseNcsbeResults(TSV, '2026-03-03');
  const byId = (id: string) => races.find((r) => r.id === id)!;

  it('aggregates precincts, folds write-ins into one line and ignores non-federal contests', () => {
    expect(rows).toBe(17);
    expect(races.map((r) => r.id)).toEqual([
      'NC-G-G-2026-03-03',
      'NC-PR_DEM-S-2026-03-03',
      'NC-PR_REP-H-11-2026-03-03',
      'NC-PR_REP-S-2026-03-03',
    ]);
    const dem = byId('NC-PR_DEM-S-2026-03-03');
    expect(dem.candidates.map((c) => [c.name, c.votes])).toEqual([['Roy Cooper', 1600], ['Justin E. Dues', 100], ['Write-ins', 9]]);
    expect(dem.totalVotes).toBe(1709);
    expect(dem.primaryParty).toBe('DEM');
    expect(dem.label).toBe('Senate · North Carolina (DEM primary)');
    expect(dem.source).toBe('ncsbe');
  });

  it('estimates reporting from precincts with votes, and leaves unreported races empty', () => {
    expect(byId('NC-PR_DEM-S-2026-03-03').pctReporting).toBeCloseTo(66.7, 1); // 2 of 3 precincts
    expect(byId('NC-PR_REP-S-2026-03-03').pctReporting).toBe(100);
  });

  it('maps parties, strips suffixes from last names and computes margins from raw votes', () => {
    const rep = byId('NC-PR_REP-H-11-2026-03-03');
    expect(rep.candidates[0]).toMatchObject({ name: 'Chuck Edwards', party: 'GOP', lastName: 'Edwards', pct: 70 });
    expect(rep.margin).toBe(40);
    expect(rep.district).toBe('11');
    expect(byId('NC-G-G-2026-03-03').candidates.map((c) => c.lastName).sort()).toEqual(['Else', 'King']);
  });

  it('refuses a file that is not the expected shape rather than guessing', () => {
    expect(parseNcsbeResults('<html>Access Denied</html>', '2026-03-03')).toEqual({ races: [], rows: 0 });
    expect(parseNcsbeResults('', '2026-03-03').races).toEqual([]);
  });

  describe('finalizeRaces', () => {
    it('calls nothing mid-count', () => {
      expect(finalizeRaces(races, false).some((r) => r.status === 'called')).toBe(false);
    });
    it('on a final count: plurality needs >30% in a primary, and a tie is never called', () => {
      const fin = finalizeRaces(races, true);
      expect(fin.find((r) => r.id === 'NC-PR_DEM-S-2026-03-03')).toMatchObject({ status: 'called', winnerParty: 'DEM', calledBy: ['ncsbe-final'] });
      expect(fin.find((r) => r.id === 'NC-PR_REP-S-2026-03-03')).toMatchObject({ status: 'called', winnerParty: 'GOP' }); // 41.7%
      expect(fin.find((r) => r.id === 'NC-G-G-2026-03-03')?.status).toBe('counting'); // exact tie
      const lowShare: Race = { ...races[0], primaryParty: 'GOP', office: 'senate', candidates: [{ ...races[0].candidates[0], pct: 29, votes: 29 }, { ...races[0].candidates[0], id: 'b', pct: 28, votes: 28 }] };
      expect(finalizeRaces([lowShare], true)[0].status).not.toBe('called'); // would force a runoff
    });
  });
});

describe('crossCheck', () => {
  const nyt = normalizeNytPage(senatePage, 'senate').races;
  const pa = nyt.find((r) => r.state === 'PA')!;
  const official = (smith: number, jones: number): Race => ({ ...pa, source: 'ncsbe', totalVotes: smith + jones, candidates: pa.candidates.map((c) => ({ ...c, votes: c.lastName === 'Smith' ? smith : jones })) });

  it('agrees when the two counts match to within tolerance', () => {
    const c = checkRace(pa, official(6010, 3990), 'NC SBE')!;
    expect(c.agrees).toBe(true);
    expect(c.deltaPts).toBeLessThanOrEqual(OFFICIAL_TOLERANCE_PTS);
    expect(c.source).toBe('NC SBE');
  });
  it('flags a real disagreement with its size', () => {
    const c = checkRace(pa, official(5000, 5000), 'NC SBE')!;
    expect(c.agrees).toBe(false);
    expect(c.deltaPts).toBeCloseTo(10, 0);
  });
  it('compares shares, not totals (the official count may be further along)', () => {
    expect(checkRace(pa, official(60000, 40000), 'x')?.agrees).toBe(true);
  });
  it('cannot compare races it cannot line up, or that have no votes', () => {
    expect(checkRace(pa, { ...official(1, 1), totalVotes: 0 }, 'x')).toBeNull();
    expect(checkRace({ ...pa, totalVotes: 0 }, official(5, 5), 'x')).toBeNull();
    expect(checkRace(pa, { ...official(5, 5), candidates: [] }, 'x')).toBeNull();
  });
  it('attaches the check only to the matching race', () => {
    const out = crossCheck(nyt.map((r) => ({ ...r, state: 'PA' })).slice(0, 1), [official(6000, 4000)], 'NC SBE');
    expect(out[0].official?.agrees).toBe(true);
    expect(crossCheck(nyt, [], 'x')).toBe(nyt);
    const other = crossCheck([{ ...pa, state: 'OH' }], [official(6000, 4000)], 'x');
    expect(other[0].official).toBeUndefined();
  });
});

describe('events hub', () => {
  afterEach(() => __resetEvents());
  const snap = (called: boolean): ElectionSnapshot => {
    const s = normalizeNytPage(senatePage, 'senate');
    return {
      date: '2026-11-03', kind: 'general', source: 'nyt', fetchedAt: 'x', sourceUpdatedAt: null, live: true,
      chambers: { senate: s.chamber! },
      races: s.races.map((r) => (r.state === 'OH' && called ? { ...r, status: 'called' as const, winnerParty: 'GOP' as const, candidates: r.candidates.map((c, i) => ({ ...c, won: i === 0 })) } : r)),
      pollClosings: { OH: { iso: '2026-11-04T00:30:00.000Z', displayET: '7:30 p.m.' } },
      missing: [], providers: [],
    };
  };
  const NOW = Date.parse('2026-11-04T00:35:00Z');

  it('stays silent on the first snapshot (no replaying history), then emits the diff once', () => {
    const seen: string[] = [];
    subscribeEvents('2026-11-03', (e) => seen.push(e.id));
    expect(ingestSnapshot(snap(false), NOW).map((e) => e.kind)).toEqual(['polls-closed']); // closed 5 min ago: fresh
    const ev = ingestSnapshot(snap(true), NOW + 20_000);
    expect(ev.map((e) => e.id)).toEqual(['call:OH-S_W-S-2026-11-03']);
    expect(ingestSnapshot(snap(true), NOW + 40_000)).toEqual([]);
    expect(seen).toEqual(['closed:2026-11-03:OH', 'call:OH-S_W-S-2026-11-03']);
    expect(eventHistory('2026-11-03').map((e) => e.id)).toEqual(['closed:2026-11-03:OH', 'call:OH-S_W-S-2026-11-03']);
  });

  it('ignores empty snapshots and never throws', () => {
    expect(ingestSnapshot({ ...snap(false), races: [] }, NOW)).toEqual([]);
  });

  it('publishes a few headlines as news events', () => {
    const n = (i: number) => ({ id: `n${i}`, title: `Headline ${i}`, url: 'https://x.test/' + i, source: 'NPR', publishedAt: '2026-11-04T00:00:00Z', snippet: '', states: i === 1 ? ['OH'] : [] });
    publishNews('2026-11-03', [1, 2, 3, 4, 5].map(n));
    const h = eventHistory('2026-11-03');
    expect(h).toHaveLength(3);
    expect(h[0]).toMatchObject({ kind: 'news', importance: 1, text: 'NPR: Headline 1', url: 'https://x.test/1', state: 'OH' });
  });
});
