import { describe, expect, it } from 'vitest';
import {
  LEARN_MORE_STEP,
  applyAllowances,
  daysLeft,
  dayStartUtc,
  extraToday,
  isValidTestDate,
  newAllowance,
  newCardForecast,
  suggestedPace,
  testDateState,
  todayKey,
  zoneOrUtc,
} from '@/lib/study/pace';
import { NEW_PER_SESSION } from '@/lib/study/queue';
import { paceBody } from '@/lib/study/pace-schema';

const paced = (newPerDay: number | null, extraNewDay: string | null = null, extraNew = 0) => ({
  newPerDay,
  extraNewDay,
  extraNew,
});

describe('the daily allowance', () => {
  it('is the pace less what was first graded today', () => {
    expect(newAllowance(paced(5), '2026-11-30', 0)).toBe(5);
    expect(newAllowance(paced(5), '2026-11-30', 3)).toBe(2);
    expect(newAllowance(paced(5), '2026-11-30', 9)).toBe(0);
  });

  it('is null (no daily limit) for an unpaced deck', () => {
    expect(newAllowance(paced(null), '2026-11-30', 40)).toBeNull();
  });

  it('a zero pace adds none', () => {
    expect(newAllowance(paced(0), '2026-11-30', 0)).toBe(0);
  });

  it('"Learn more" adds ten for the day it was pressed only', () => {
    expect(LEARN_MORE_STEP).toBe(10);
    expect(extraToday(paced(5, '2026-11-30', 10), '2026-11-30')).toBe(10);
    expect(extraToday(paced(5, '2026-11-29', 10), '2026-11-30')).toBe(0);
    expect(newAllowance(paced(5, '2026-11-30', 10), '2026-11-30', 5)).toBe(10);
    expect(newAllowance(paced(5, '2026-11-29', 10), '2026-11-30', 5)).toBe(0);
  });
});

describe('applying allowances to a batch of new cards', () => {
  const cards = (deckId: string, n: number) => Array.from({ length: n }, (_, i) => ({ deckId, id: `${deckId}${i}` }));

  it('keeps an unpaced deck as it is (the per-session rule)', () => {
    const { kept, saturated, held } = applyAllowances(cards('a', 5), new Map([['a', null]]));
    expect(kept).toHaveLength(5);
    expect(saturated.size + held.size).toBe(0);
  });

  it('never keeps more than the allowance for a paced deck', () => {
    const { kept, held } = applyAllowances(cards('a', 8), new Map([['a', 5]]));
    expect(kept).toHaveLength(5);
    expect([...held]).toEqual(['a']);
  });

  it('a zero allowance keeps none', () => {
    expect(applyAllowances(cards('a', 3), new Map([['a', 0]])).kept).toEqual([]);
  });

  it('a mix of paced and unpaced decks stays within the batch size when the batch is cut to it', () => {
    const pool = [...cards('a', 4), ...cards('b', 20)];
    const { kept } = applyAllowances(
      pool.slice(0, NEW_PER_SESSION),
      new Map<string, number | null>([
        ['a', 3],
        ['b', null],
      ]),
    );
    expect(kept.length).toBeLessThanOrEqual(NEW_PER_SESSION);
    expect(kept.filter((c) => c.deckId === 'a')).toHaveLength(3);
  });

  it('marks a deck saturated when its last allowance was just taken', () => {
    const { kept, saturated, held } = applyAllowances(cards('a', 2), new Map([['a', 2]]));
    expect(kept).toHaveLength(2);
    expect([...saturated]).toEqual(['a']);
    expect(held.size).toBe(0);
  });
});

describe('the test date', () => {
  it('counts whole days up to the test day, the test day excluded', () => {
    expect(daysLeft('2026-12-10', '2026-11-30')).toBe(10);
    expect(daysLeft('2026-12-01', '2026-11-30')).toBe(1);
    expect(daysLeft('2026-11-30', '2026-11-30')).toBe(0);
    expect(daysLeft('2026-11-29', '2026-11-30')).toBe(-1);
  });

  it('is unmoved by a daylight-saving change between the two days', () => {
    // US clocks went forward on 2026-03-08 and back on 2026-11-01.
    expect(daysLeft('2026-03-10', '2026-03-07')).toBe(3);
    expect(daysLeft('2026-11-03', '2026-10-31')).toBe(3);
    expect(daysLeft('2026-04-01', '2026-03-01')).toBe(31);
  });

  it('suggests ceil(new / days left)', () => {
    expect(suggestedPace(100, 30)).toBe(4);
    expect(suggestedPace(90, 30)).toBe(3);
    expect(suggestedPace(0, 5)).toBe(0);
    expect(suggestedPace(10, 0)).toBe(0);
    expect(suggestedPace(5000, 1)).toBe(200);
  });

  it('reads the state: upcoming with a suggestion, the day itself, and passed', () => {
    expect(testDateState('2026-12-10', '2026-11-30', 95)).toEqual({ kind: 'upcoming', daysLeft: 10, suggested: 10 });
    expect(testDateState('2026-11-30', '2026-11-30', 95)).toEqual({ kind: 'today' });
    expect(testDateState('2026-11-20', '2026-11-30', 95)).toEqual({ kind: 'passed' });
  });

  it('refuses a past date or one that is not a calendar day', () => {
    expect(isValidTestDate('2026-11-30', '2026-11-30')).toBe(true);
    expect(isValidTestDate('2026-11-29', '2026-11-30')).toBe(false);
    expect(isValidTestDate('2026-02-30', '2026-01-01')).toBe(false);
    expect(isValidTestDate('soon', '2026-01-01')).toBe(false);
  });
});

describe('the day in the member zone', () => {
  it('uses the zone for today and for the start of today', () => {
    const now = new Date('2026-11-30T02:00:00Z');
    expect(todayKey(now, 'UTC')).toBe('2026-11-30');
    expect(todayKey(now, 'America/Los_Angeles')).toBe('2026-11-29');
    expect(dayStartUtc('2026-11-29', 'America/Los_Angeles').toISOString()).toBe('2026-11-29T08:00:00.000Z');
  });

  it('day start follows the offset after a clock change', () => {
    expect(dayStartUtc('2026-03-08', 'America/New_York').toISOString()).toBe('2026-03-08T05:00:00.000Z');
    expect(dayStartUtc('2026-03-09', 'America/New_York').toISOString()).toBe('2026-03-09T04:00:00.000Z');
  });

  it('falls back to UTC for a missing or unknown zone', () => {
    expect(zoneOrUtc(undefined)).toBe('UTC');
    expect(zoneOrUtc('Not/AZone')).toBe('UTC');
    expect(zoneOrUtc('Europe/Paris')).toBe('Europe/Paris');
  });
});

describe('the new-card forecast', () => {
  it('adds the rest of today then the full pace, never past the cards left', () => {
    expect(newCardForecast(paced(5), 12, 2, '2026-11-30')).toEqual([3, 5, 4, 0, 0, 0, 0]);
  });

  it('adds nothing for an unpaced deck', () => {
    expect(newCardForecast(paced(null), 40, 0, '2026-11-30')).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });
});

describe('the pace request', () => {
  it('takes a pace from 0 to 200, null to clear, or a date', () => {
    expect(paceBody.safeParse({ newPerDay: 0 }).success).toBe(true);
    expect(paceBody.safeParse({ newPerDay: 200 }).success).toBe(true);
    expect(paceBody.safeParse({ newPerDay: null }).success).toBe(true);
    expect(paceBody.safeParse({ newPerDay: 201 }).success).toBe(false);
    expect(paceBody.safeParse({ newPerDay: 1.5 }).success).toBe(false);
    expect(paceBody.safeParse({ testDate: '2026-12-10' }).success).toBe(true);
    expect(paceBody.safeParse({ testDate: 'tomorrow' }).success).toBe(false);
    expect(paceBody.safeParse({}).success).toBe(false);
  });

  it('learnMore stands alone', () => {
    expect(paceBody.safeParse({ learnMore: true, tz: 'UTC' }).success).toBe(true);
    expect(paceBody.safeParse({ learnMore: true, newPerDay: 5 }).success).toBe(false);
  });
});
