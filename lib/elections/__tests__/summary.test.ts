import { describe, expect, it } from 'vitest';
import { normalizeNytPage } from '../nyt';
import {
  buildFacts,
  deterministicSummary,
  headline,
  ratingLean,
  snapshotFingerprint,
} from '../summary';
import type { ElectionSnapshot } from '../types';
import { governorPage, senatePage } from './fixtures';

function snap(live = true): ElectionSnapshot {
  const s = normalizeNytPage(senatePage, 'senate');
  const g = normalizeNytPage(governorPage, 'governor');
  const races = [...s.races, ...g.races];
  return {
    date: '2026-11-03',
    kind: 'general',
    source: 'nyt',
    fetchedAt: '2026-11-04T02:00:00Z',
    sourceUpdatedAt: null,
    live,
    chambers: { senate: s.chamber!, governor: g.chamber! },
    races: live ? races : races.map((r) => ({ ...r, status: 'upcoming', totalVotes: 0, margin: null })),
    pollClosings: {},
    missing: [],
    providers: [],
  };
}

describe('buildFacts', () => {
  it('counts called/counting and lists flips and closest races', () => {
    const f = buildFacts(snap());
    expect(f.racesTotal).toBe(5);
    expect(f.racesCalled).toBe(3);
    expect(f.racesCounting).toBe(1);
    expect(f.flips.map((r) => r.label)).toEqual(['Senate · Michigan', 'Governor · Wisconsin']);
    expect(f.closest[0].label).toBe('Senate · Ohio (special)');
  });
});

describe('deterministicSummary / headline', () => {
  it('says what is on the ballot before results', () => {
    const lines = deterministicSummary(snap(false));
    expect(lines.at(-1)).toMatch(/Polls have not reported yet/);
    expect(headline(snap(false))).toMatch(/On the ballot/);
  });
  it('reports seat counts, flips and close races once live', () => {
    const lines = deterministicSummary(snap());
    expect(lines[0]).toBe('3 of 5 races called · 1 still counting');
    expect(lines.some((l) => l.startsWith('Senate: GOP 33 · Dem 36 (51 to win)'))).toBe(true);
    expect(lines.some((l) => l.startsWith('Flip: Senate · Michigan'))).toBe(true);
    expect(lines.some((l) => l.startsWith('Too close: Senate · Ohio'))).toBe(true);
  });
  it('is empty with no races', () => {
    expect(deterministicSummary({ ...snap(), races: [], chambers: {} })).toEqual([]);
  });
});

describe('snapshotFingerprint', () => {
  it('moves when a race is called and holds still otherwise', () => {
    const a = snap();
    const b = structuredClone(a);
    b.fetchedAt = 'later';
    expect(snapshotFingerprint(b)).toBe(snapshotFingerprint(a));
    const c = structuredClone(a);
    c.races[1].status = 'called';
    expect(snapshotFingerprint(c)).not.toBe(snapshotFingerprint(a));
  });
});

describe('ratingLean', () => {
  it('buckets ratings by lean', () => {
    expect(ratingLean(snap().races)).toEqual({ dem: 0, tossup: 3, gop: 2 });
  });
});
