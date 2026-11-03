import { describe, expect, it } from 'vitest';
import { relevantRaces, raceForPrompt } from '../ask';
import { buildElectionFeedItem, isFeedWindow } from '../feed';
import { cycleForYear } from '../calendar';
import { normalizeNytPage } from '../nyt';
import { buildFacts } from '../summary';
import type { ElectionSnapshot } from '../types';
import { governorPage, senatePage } from './fixtures';

function snap(live: boolean): ElectionSnapshot {
  const s = normalizeNytPage(senatePage, 'senate');
  const g = normalizeNytPage(governorPage, 'governor');
  const preS = live ? s : { ...s, races: s.races.map((r) => ({ ...r, status: 'upcoming' as const, totalVotes: 0, winnerParty: null })) };
  return {
    date: '2026-11-03',
    kind: 'general',
    source: 'nyt',
    fetchedAt: 'x',
    sourceUpdatedAt: null,
    live,
    chambers: { senate: s.chamber!, governor: g.chamber! },
    races: [...preS.races, ...g.races],
    pollClosings: {},
    missing: [],
    providers: [],
  };
}

describe('relevantRaces', () => {
  const s = snap(true);
  it('matches full state names and candidate last names', () => {
    expect(relevantRaces('Who is ahead in Pennsylvania?', s).map((r) => r.state)).toEqual(['PA']);
    expect(relevantRaces('how is Jones doing', s).map((r) => r.state)).toEqual(['PA']);
  });
  it('matches postal codes only when capitalised', () => {
    expect(relevantRaces('what about WI', s).map((r) => r.state)).toEqual(['WI']);
    // "in", "or", "me", "ok" must not match Indiana/Oregon/Maine/Oklahoma.
    expect(relevantRaces('who is in or me ok', s)).toEqual([]);
  });
  it('caps the result', () => {
    expect(relevantRaces('Pennsylvania Ohio Texas Michigan Wisconsin', s).length).toBeLessThanOrEqual(6);
  });
  it('compacts a race for the prompt', () => {
    const r = raceForPrompt(s.races[0]);
    expect(r.race).toBe('Senate · Pennsylvania');
    expect(r.candidates[0]).toMatchObject({ party: 'DEM', winner: true });
    expect(JSON.stringify(r)).not.toContain('imageUrl');
  });
});

describe('buildFacts tossups', () => {
  it('lists uncalled toss-ups for "what to watch"', () => {
    const f = buildFacts(snap(true));
    // PA & MI are rated toss-ups but already called; WI too. None left.
    expect(f.tossups).toEqual([]);
    const pre = buildFacts(snap(false));
    expect(pre.tossups.map((t) => t.label)).toContain('Senate · Pennsylvania');
  });
});

describe('election feed card', () => {
  const cycle = cycleForYear(2026);
  it('only appears in the window around Election Day', () => {
    expect(isFeedWindow(cycle, new Date('2026-09-01T12:00:00Z'))).toBe(false); // 63 days out
    expect(isFeedWindow(cycle, new Date('2026-10-01T12:00:00Z'))).toBe(true);
    expect(isFeedWindow(cycle, new Date('2026-11-04T12:00:00Z'))).toBe(true);
    expect(isFeedWindow(cycle, new Date('2026-12-30T12:00:00Z'))).toBe(false);
  });
  it('is a calendar-only card when the source is down', () => {
    const item = buildElectionFeedItem(cycle, null, new Date('2026-11-01T12:00:00Z'))!;
    expect(item.type).toBe('election_announcement');
    expect(item.id).toBe('election:2026-11-03');
    expect(item.description).toMatch(/2 days away/);
    expect(item.election?.chambers).toEqual([]);
    expect(item.href).toBe('/elections');
  });
  it('shows current control before votes and the running score once live', () => {
    const now = new Date('2026-11-02T12:00:00Z');
    const pre = buildElectionFeedItem(cycle, snap(false), now)!;
    expect(pre.title).toBe('2026 Midterm Elections');
    expect(pre.election?.live).toBe(false);
    const senate = pre.election?.chambers.find((c) => c.office === 'senate');
    expect(senate).toMatchObject({ dem: 45, gop: 53, basis: 'current' });

    const live = buildElectionFeedItem(cycle, snap(true), new Date('2026-11-04T03:00:00Z'))!;
    expect(live.title).toBe('LIVE · 2026 Midterm Elections');
    expect(live.tags).toContain('Live results');
    expect(live.election?.called).toBe(3);
    expect(live.election?.chambers.find((c) => c.office === 'senate')).toMatchObject({ dem: 36, gop: 33, basis: 'results' });
  });
  it('is null once the counting window is over', () => {
    expect(buildElectionFeedItem(cycle, null, new Date('2027-01-15T00:00:00Z'))).toBeNull();
  });
});
