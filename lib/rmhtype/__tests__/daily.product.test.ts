import { describe, expect, it } from 'vitest';
import { dayKey, isoDay, passageForDay, plausible, scoreOf, shiftDay, streakFrom } from '@/lib/rmhtype/daily';
import { PASSAGES } from '@/lib/rmhtype/passages';

const ids = PASSAGES.map((p) => p.id);

function daysOfYear(year: number): string[] {
  const out: string[] = [];
  for (let d = `${year}0101`; d.startsWith(String(year)); d = shiftDay(d, 1)) out.push(d);
  return out;
}

describe('dayKey', () => {
  it('is the UTC calendar day, zero-padded', () => {
    expect(dayKey(new Date('2026-11-22T23:59:59Z'))).toBe('20261122');
    expect(dayKey(new Date('2026-01-05T00:00:00Z'))).toBe('20260105');
    expect(isoDay('20261122')).toBe('2026-11-22');
  });
});

describe('passageForDay', () => {
  it('gives the same passage for the same day, whatever the list order', () => {
    expect(passageForDay('20261122', ids)).toBe(passageForDay('20261122', ids));
    expect(passageForDay('20261122', ids)).toBe(passageForDay('20261122', [...ids].reverse()));
  });

  it('does not repeat until the list is exhausted', () => {
    const days = daysOfYear(2026).slice(0, ids.length);
    const seen = days.map((d) => passageForDay(d, ids));
    expect(new Set(seen).size).toBe(ids.length);
  });

  it('starts over after the list is used up', () => {
    const days = daysOfYear(2026);
    expect(days.length).toBeGreaterThan(ids.length);
    expect(passageForDay(days[ids.length] as string, ids)).toBe(passageForDay(days[0] as string, ids));
  });

  it('reshuffles each year', () => {
    const a = daysOfYear(2026)
      .slice(0, ids.length)
      .map((d) => passageForDay(d, ids));
    const b = daysOfYear(2027)
      .slice(0, ids.length)
      .map((d) => passageForDay(d, ids));
    expect(b).not.toEqual(a);
  });

  it('always returns a passage from the list, including on a leap day', () => {
    for (const d of daysOfYear(2028)) expect(ids).toContain(passageForDay(d, ids));
  });
});

describe('streakFrom', () => {
  it('counts consecutive days ending today', () => {
    expect(streakFrom(['20261120', '20261121', '20261122'], '20261122')).toBe(3);
  });

  it('keeps a streak that reaches yesterday while today is not done', () => {
    expect(streakFrom(['20261120', '20261121'], '20261122')).toBe(2);
  });

  it('resets after a missed day', () => {
    expect(streakFrom(['20261119', '20261120'], '20261122')).toBe(0);
    expect(streakFrom(['20261118', '20261120', '20261122'], '20261122')).toBe(1);
  });

  it('runs across a month end and a year end', () => {
    expect(streakFrom(['20261230', '20261231', '20270101'], '20270101')).toBe(3);
    expect(streakFrom(['20260228', '20260301'], '20260301')).toBe(2);
  });

  it('runs across a leap day', () => {
    expect(streakFrom(['20280228', '20280229', '20280301'], '20280301')).toBe(3);
  });

  it('is zero with no days and ignores duplicates', () => {
    expect(streakFrom([], '20261122')).toBe(0);
    expect(streakFrom(['20261122', '20261122'], '20261122')).toBe(1);
  });
});

describe('scoreOf and plausible', () => {
  const length = 100;
  // 100 characters in one minute is 20 wpm.
  const honest = {
    correct: 98,
    total: 100,
    elapsedMs: 60_000,
  };

  it('scores net wpm and keystroke accuracy', () => {
    expect(scoreOf(honest, length)).toEqual({
      wpm: 19.6,
      accuracy: 98,
    });
  });

  it('accepts an honest run', () => {
    expect(plausible(honest, length)).toBe(true);
  });

  it('rejects faster than 250 wpm and accepts exactly the limit', () => {
    expect(
      plausible(
        {
          correct: 100,
          total: 100,
          elapsedMs: 1_000,
        },
        length,
      ),
    ).toBe(false);
    expect(
      plausible(
        {
          correct: 100,
          total: 100,
          elapsedMs: 4_800,
        },
        length,
      ),
    ).toBe(true);
  });

  it('rejects a run outside the window', () => {
    expect(
      plausible(
        {
          ...honest,
          elapsedMs: 15 * 60_000 + 1,
        },
        length,
      ),
    ).toBe(false);
    expect(
      plausible(
        {
          ...honest,
          elapsedMs: 0,
        },
        length,
      ),
    ).toBe(false);
    expect(
      plausible(
        {
          ...honest,
          elapsedMs: Number.NaN,
        },
        length,
      ),
    ).toBe(false);
  });

  it('rejects counts that do not fit the passage', () => {
    expect(
      plausible(
        {
          correct: 101,
          total: 100,
          elapsedMs: 60_000,
        },
        length,
      ),
    ).toBe(false);
    expect(
      plausible(
        {
          correct: 50,
          total: 60,
          elapsedMs: 60_000,
        },
        length,
      ),
    ).toBe(false);
    expect(
      plausible(
        {
          correct: 90,
          total: 600,
          elapsedMs: 60_000,
        },
        length,
      ),
    ).toBe(false);
    expect(
      plausible(
        {
          correct: -1,
          total: 100,
          elapsedMs: 60_000,
        },
        length,
      ),
    ).toBe(false);
    expect(
      plausible(
        {
          correct: 98.5,
          total: 100,
          elapsedMs: 60_000,
        },
        length,
      ),
    ).toBe(false);
  });
});
