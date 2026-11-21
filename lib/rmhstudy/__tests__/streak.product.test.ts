import { describe, expect, it } from 'vitest';
import { currentStreakDays, deriveStreak, longestRun, nextStudyStreak, studyDayKey } from '@/lib/rmhstudy/streak';

const at = (iso: string) => new Date(iso);
const NY = 'America/New_York';

/** Replays `sessions` through `nextStudyStreak`, as the hub does one at a time. */
function replay(sessions: string[], zone?: string) {
  let state = {
    currentStreak: 0,
    longestStreak: 0,
    lastStudyDate: null as Date | null,
  };
  for (const iso of sessions) {
    const next = nextStudyStreak(state, at(iso), zone);
    state = {
      ...next,
      lastStudyDate: at(iso),
    };
  }
  return state;
}

describe('nextStudyStreak with a zone', () => {
  it('counts two 21:00 evenings on consecutive local days as 2 in New York', () => {
    expect(replay(['2026-11-18T02:00:00Z', '2026-11-19T02:00:00Z'], NY).currentStreak).toBe(2);
  });

  it('counts a session at 23:30 and one at 00:30 local as consecutive days', () => {
    expect(replay(['2026-11-19T04:30:00Z', '2026-11-19T05:30:00Z'], NY).currentStreak).toBe(2);
  });

  it('keeps one day for sessions that straddle UTC midnight inside one local day', () => {
    expect(replay(['2026-11-18T21:00:00Z', '2026-11-19T03:00:00Z'], NY).currentStreak).toBe(1);
  });

  it('does not skip or double a day across the autumn DST change (2026-11-01)', () => {
    const run = replay(['2026-10-31T23:00:00Z', '2026-11-01T23:00:00Z', '2026-11-02T23:00:00Z'], NY);
    expect(run.currentStreak).toBe(3);
  });

  it('does not skip or double a day across the spring DST change (2026-03-08)', () => {
    expect(replay(['2026-03-07T23:00:00Z', '2026-03-08T23:00:00Z'], NY).currentStreak).toBe(2);
  });

  it('breaks after a missed local day and keeps the longest', () => {
    const run = replay(
      ['2026-11-10T15:00:00Z', '2026-11-11T15:00:00Z', '2026-11-12T15:00:00Z', '2026-11-14T15:00:00Z'],
      NY,
    );
    expect(run).toMatchObject({
      currentStreak: 1,
      longestStreak: 3,
    });
  });

  it('reads the previous session in the current zone after a zone change', () => {
    const prev = {
      currentStreak: 4,
      longestStreak: 4,
      lastStudyDate: at('2026-11-18T23:00:00Z'),
    };
    // 23:00 UTC is already the 19th in Tokyo, so 12:00 UTC on the 19th is the same Tokyo day.
    expect(nextStudyStreak(prev, at('2026-11-19T12:00:00Z'), 'Asia/Tokyo').currentStreak).toBe(4);
    expect(nextStudyStreak(prev, at('2026-11-19T12:00:00Z'), 'UTC').currentStreak).toBe(5);
  });

  it('falls back to UTC for a missing or unknown zone', () => {
    const prev = {
      currentStreak: 2,
      longestStreak: 2,
      lastStudyDate: at('2026-11-20T23:30:00Z'),
    };
    for (const zone of [undefined, null, 'Nowhere/Land']) {
      expect(nextStudyStreak(prev, at('2026-11-21T00:15:00Z'), zone).currentStreak).toBe(3);
    }
    expect(studyDayKey(at('2026-11-21T00:15:00Z'), 'Nowhere/Land')).toBe('2026-11-21');
  });
});

describe('deriveStreak', () => {
  it('counts back from today', () => {
    expect(deriveStreak(['2026-11-19', '2026-11-20', '2026-11-21'], '2026-11-21')).toEqual({
      current: 3,
      longest: 3,
    });
  });

  it('keeps the streak alive while today has no session yet', () => {
    expect(deriveStreak(['2026-11-18', '2026-11-19', '2026-11-20'], '2026-11-21').current).toBe(3);
  });

  it('is 0 once a whole day is missed', () => {
    expect(deriveStreak(['2026-11-18', '2026-11-19'], '2026-11-21')).toEqual({
      current: 0,
      longest: 2,
    });
  });

  it('ignores order and repeats and finds the longest run', () => {
    const keys = ['2026-11-05', '2026-11-03', '2026-11-04', '2026-11-04', '2026-11-10'];
    expect(deriveStreak(keys, '2026-11-10')).toEqual({
      current: 1,
      longest: 3,
    });
    expect(longestRun(keys)).toBe(3);
    expect(longestRun([])).toBe(0);
  });

  it('lists the days of the current streak oldest first', () => {
    expect(currentStreakDays(['2026-11-18', '2026-11-19', '2026-11-15'], '2026-11-20')).toEqual([
      '2026-11-18',
      '2026-11-19',
    ]);
    expect(currentStreakDays(['2026-11-10'], '2026-11-20')).toEqual([]);
  });
});

describe('nextStudyStreak and deriveStreak agree', () => {
  it('give the same current and longest streak for the same sessions', () => {
    const sessions = [
      '2026-10-30T14:00:00Z',
      '2026-10-31T23:30:00Z',
      '2026-11-01T14:00:00Z',
      '2026-11-02T14:00:00Z',
      '2026-11-02T20:00:00Z',
      '2026-11-05T14:00:00Z',
      '2026-11-06T02:30:00Z',
    ];
    const replayed = replay(sessions, NY);
    const keys = sessions.map((s) => studyDayKey(at(s), NY));
    const last = keys[keys.length - 1] as string;
    const derived = deriveStreak(keys, last);
    expect(replayed.currentStreak).toBe(derived.current);
    expect(replayed.longestStreak).toBe(derived.longest);
  });
});
