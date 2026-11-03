import { describe, expect, it } from 'vitest';
import type { ElectionEvent } from '../events';
import {
  DWELL_MS,
  MAJOR_DWELL_MS,
  nextFollowTarget,
  pickRaceForState,
  raceForEvent,
  type FollowTarget,
} from '../follow';
import { MAX_POINTS, appendPoint, layoutLines, type SeriesPoint } from '../history';
import { normalizeNytPage } from '../nyt';
import { governorPage, senatePage } from './fixtures';

const races = [
  ...normalizeNytPage(senatePage, 'senate').races,
  ...normalizeNytPage(governorPage, 'governor').races,
];
const ev = (o: Partial<ElectionEvent>): ElectionEvent => ({
  id: 'e',
  at: 0,
  date: '2026-11-03',
  kind: 'call',
  importance: 2,
  text: 'something happened',
  ...o,
});

describe('pickRaceForState', () => {
  it('prefers the asked-for office, else Senate over Governor', () => {
    expect(pickRaceForState(races, 'WI')?.office).toBe('governor');
    expect(pickRaceForState(races, 'PA')?.office).toBe('senate');
    expect(pickRaceForState(races, 'ZZ')).toBeNull();
  });
  it('prefers a live (uncalled) race over a called one in the same state', () => {
    const live = races.find((r) => r.state === 'OH')!;
    const called = {
      ...live,
      id: 'OH-G-G-x',
      office: 'governor' as const,
      status: 'called' as const,
    };
    expect(pickRaceForState([called, live], 'OH', 'governor')?.id).toBe(live.id);
  });
});

describe('raceForEvent', () => {
  it('uses the race id when present and falls back to the state', () => {
    expect(raceForEvent(ev({ raceId: 'MI-G-S-2026-11-03' }), races)?.state).toBe('MI');
    expect(raceForEvent(ev({ raceId: 'nope', state: 'PA' }), races)?.state).toBe('PA');
    expect(raceForEvent(ev({ raceId: undefined, state: undefined }), races)).toBeNull();
  });
});

describe('nextFollowTarget', () => {
  const T0 = 1_000_000;
  const first = nextFollowTarget(
    null,
    ev({ raceId: 'PA-G-S-2026-11-03', text: 'AP calls PA' }),
    races,
    'calls',
    T0,
  );
  const prev = first.target as FollowTarget;

  it('switches immediately when nothing is showing', () => {
    expect(prev).toMatchObject({
      state: 'PA',
      office: 'senate',
      raceId: 'PA-G-S-2026-11-03',
      reason: 'AP calls PA',
      at: T0,
    });
    expect(first.deferred).toBeNull();
  });
  it('ignores events its mode does not follow, and events it cannot show', () => {
    expect(
      nextFollowTarget(
        prev,
        ev({ kind: 'polls-closed', raceId: 'MI-G-S-2026-11-03' }),
        races,
        'calls',
        T0 + 99_000,
      ).target,
    ).toBe(prev);
    expect(
      nextFollowTarget(prev, ev({ raceId: 'nope', state: 'ZZ' }), races, 'all', T0 + 99_000).target,
    ).toBe(prev);
    expect(
      nextFollowTarget(prev, ev({ raceId: 'MI-G-S-2026-11-03' }), races, 'off', T0 + 99_000).target,
    ).toBe(prev);
  });
  it('holds an ordinary event during the dwell and defers it, then lets it through after', () => {
    const during = nextFollowTarget(
      prev,
      ev({ raceId: 'MI-G-S-2026-11-03', importance: 2 }),
      races,
      'calls',
      T0 + 5_000,
    );
    expect(during.target).toBe(prev);
    expect(during.deferred?.retryAt).toBe(T0 + DWELL_MS);
    const after = nextFollowTarget(
      prev,
      ev({ raceId: 'MI-G-S-2026-11-03', importance: 2 }),
      races,
      'calls',
      T0 + DWELL_MS + 1,
    );
    expect(after.target?.state).toBe('MI');
  });
  it('lets a major event cut in after the shorter hold, not before', () => {
    const major = ev({ raceId: 'MI-G-S-2026-11-03', importance: 3, kind: 'flip' });
    expect(
      nextFollowTarget(prev, major, races, 'major', T0 + MAJOR_DWELL_MS - 1).deferred,
    ).not.toBeNull();
    expect(nextFollowTarget(prev, major, races, 'major', T0 + MAJOR_DWELL_MS).target?.state).toBe(
      'MI',
    );
  });
  it('refreshes the reason when the same race has news again', () => {
    const again = nextFollowTarget(
      prev,
      ev({ raceId: 'PA-G-S-2026-11-03', text: 'Lead flips in PA', kind: 'lead-change' }),
      races,
      'all',
      T0 + 1_000,
    );
    expect(again.target).toMatchObject({
      raceId: 'PA-G-S-2026-11-03',
      reason: 'Lead flips in PA',
      at: T0,
    });
  });
  it('follows polls closing when asked to', () => {
    const t = nextFollowTarget(
      null,
      ev({ kind: 'polls-closed', state: 'WI', raceId: undefined, importance: 2 }),
      races,
      'closings',
      T0,
    ).target;
    expect(t).toMatchObject({ state: 'WI', office: 'governor' });
  });
});

describe('appendPoint', () => {
  const pa = races.find((r) => r.state === 'PA')!; // 600 vs 400
  const at = (n: number) => 1000 * n;

  it('records the first count and ignores unchanged totals and empty races', () => {
    let s: SeriesPoint[] = [];
    s = appendPoint(s, pa, at(1));
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ t: at(1), votes: 1000 });
    expect(Object.values(s[0].pct)).toEqual([60, 40]);
    expect(appendPoint(s, pa, at(2))).toBe(s); // same total: no new point
    expect(appendPoint([], { ...pa, totalVotes: 0 }, at(1))).toEqual([]);
  });
  it('adds a point when the count moves and refuses out-of-order times', () => {
    let s = appendPoint([], pa, at(10));
    s = appendPoint(s, { ...pa, totalVotes: 2000 }, at(20));
    expect(s.map((p) => p.t)).toEqual([at(10), at(20)]);
    expect(appendPoint(s, { ...pa, totalVotes: 3000 }, at(5))).toBe(s);
  });
  it('thins old points when full but keeps the recent half and the latest point', () => {
    let s: SeriesPoint[] = [];
    for (let i = 1; i <= 400; i++) s = appendPoint(s, { ...pa, totalVotes: i * 10 }, at(i));
    expect(s.length).toBeLessThanOrEqual(MAX_POINTS);
    expect(s[s.length - 1].votes).toBe(4000);
    expect(s.every((p, i) => i === 0 || p.t > s[i - 1].t)).toBe(true);
  });
});

describe('layoutLines', () => {
  it('needs two points, scales x to 0–1 and pads the y axis', () => {
    const s: SeriesPoint[] = [
      { t: 0, votes: 1, pct: { a: 55, b: 45 } },
      { t: 100, votes: 2, pct: { a: 52, b: 48 } },
      { t: 200, votes: 3, pct: { a: 50, b: 50 } },
    ];
    expect(layoutLines(s.slice(0, 1), ['a']).lines).toEqual([]);
    const { lines, yMax } = layoutLines(s, ['a', 'b', 'missing']);
    expect(lines.map((l) => l.id)).toEqual(['a', 'b']);
    expect(lines[0].points.map((p) => p.x)).toEqual([0, 0.5, 1]);
    expect(yMax).toBe(60);
  });
});
