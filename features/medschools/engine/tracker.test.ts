import { afterEach, describe, expect, it } from 'vitest';
import {
  HOME_STATE_CODES,
  LIMITS,
  MILESTONE_TYPES,
  SHARE_MIN_ACCOUNT_AGE_DAYS,
  accountOldEnoughToShare,
  SHAREABLE,
  cellKey,
  cleanText,
  cycleYearProblem,
  milestoneDateProblem,
  milestoneDateWindow,
  normalizeHomeState,
  reorderIds,
  toSharedEvent,
  unsetMilestoneTypes,
  type MilestoneType,
} from './tracker';

const base = {
  type: 'INTERVIEW' as MilestoneType,
  date: '2026-11-20',
  schoolId: 'sch',
  program: 'PHD' as const,
  cycleYear: 2027,
  sharing: true,
};

describe('SHAREABLE', () => {
  it('maps the seven public types to themselves and keeps SUBMITTED, COMPLETE and SECONDARY_SUBMITTED private', () => {
    for (const t of ['SECONDARY', 'INTERVIEW', 'WAITLIST', 'REJECTION', 'ACCEPTANCE', 'WITHDRAWN', 'HOLD'] as const) {
      expect(SHAREABLE[t]).toBe(t);
    }
    expect(SHAREABLE.SUBMITTED).toBeNull();
    expect(SHAREABLE.COMPLETE).toBeNull();
    expect(SHAREABLE.SECONDARY_SUBMITTED).toBeNull();
  });

  it('covers every milestone type, in display order', () => {
    expect(MILESTONE_TYPES).toEqual([
      'SUBMITTED',
      'COMPLETE',
      'SECONDARY',
      'SECONDARY_SUBMITTED',
      'INTERVIEW',
      'WAITLIST',
      'REJECTION',
      'ACCEPTANCE',
      'WITHDRAWN',
      'HOLD',
    ]);
    expect(Object.keys(SHAREABLE).sort()).toEqual([...MILESTONE_TYPES].sort());
  });

  it('LIMITS are the spec numbers', () => {
    expect(LIMITS).toEqual({
      lists: 20,
      itemsPerList: 200,
      listName: 60,
      note: 500,
      trackerNotes: 1000,
      applicationsPerCycle: 60,
    });
  });
});

describe('toSharedEvent', () => {
  const tz = process.env.TZ;
  afterEach(() => {
    if (tz === undefined) delete process.env.TZ;
    else process.env.TZ = tz;
  });

  it('is null when sharing is off or the type is private', () => {
    expect(toSharedEvent({ ...base, sharing: false })).toBeNull();
    expect(toSharedEvent({ ...base, type: 'SUBMITTED' })).toBeNull();
    expect(toSharedEvent({ ...base, type: 'COMPLETE' })).toBeNull();
  });

  it.each(['America/Los_Angeles', 'Pacific/Kiritimati', 'UTC'])('dates the event at 00:00 UTC under TZ=%s', (zone) => {
    process.env.TZ = zone;
    const e = toSharedEvent(base);
    expect(e).toEqual({
      schoolId: 'sch',
      cycleYear: 2027,
      program: 'PHD',
      eventType: 'INTERVIEW',
      occurredAt: new Date('2026-11-20T00:00:00.000Z'),
    });
  });

  it('passes the program through unchanged and carries nothing else', () => {
    expect(toSharedEvent({ ...base, program: 'REG' })?.program).toBe('REG');
    expect(Object.keys(toSharedEvent(base) ?? {}).sort()).toEqual([
      'cycleYear',
      'eventType',
      'occurredAt',
      'program',
      'schoolId',
    ]);
  });

  it('is null for a date that is not a calendar day rather than an invalid Date', () => {
    expect(toSharedEvent({ ...base, date: '2026-02-30' })).toBeNull();
    expect(toSharedEvent({ ...base, date: 'nope' })).toBeNull();
  });
});

describe('cellKey', () => {
  it('is school|program|cycle|day|type', () => {
    const e = toSharedEvent(base);
    expect(e && cellKey(e)).toBe('sch|PHD|2027|2026-11-20|INTERVIEW');
  });
});

describe('milestoneDateProblem', () => {
  const now = new Date('2026-11-20T23:30:00Z');
  const p = (c: number, d: unknown, n = now) => milestoneDateProblem(c, d, n);

  it('accepts a day inside the window', () => {
    expect(p(2027, '2026-10-05')).toBeNull();
    expect(p(2027, '2026-05-01')).toBeNull();
    expect(p(2027, '2026-11-21')).toBeNull(); // tomorrow UTC: a viewer in Hawaii can be a day behind
  });

  it('calendar: a day that does not exist', () => {
    expect(p(2027, '2026-02-30')).toBe('calendar');
    expect(p(2027, '2026-13-01')).toBe('calendar');
    expect(p(2027, '2026-00-10')).toBe('calendar');
    expect(p(2027, '2026-04-31')).toBe('calendar');
  });

  it('format: anything but a bare YYYY-MM-DD string', () => {
    for (const bad of [
      '2026-11-20T10:00',
      '11/20/2026',
      20261120,
      ['2026-11-20'],
      null,
      undefined,
      '',
      ' 2026-11-20',
      {},
    ]) {
      expect(p(2027, bad), String(bad)).toBe('format');
    }
  });

  it('window: [cycleYear-1-05-01, cycleYear-08-31]', () => {
    expect(p(2027, '2026-04-30')).toBe('window');
    expect(p(2027, '2027-09-01')).toBe('window');
    expect(p(2027, '0099-01-01')).toBe('window');
    expect(p(2027, '2027-08-31', new Date('2027-12-01T00:00:00Z'))).toBeNull();
  });

  it('future: after tomorrow UTC', () => {
    expect(p(2027, '2026-11-22')).toBe('future');
    expect(p(2027, '2027-03-01')).toBe('future');
  });

  it('a leap day is valid in a leap year and not otherwise', () => {
    expect(p(2028, '2028-02-29', new Date('2028-03-01T00:00:00Z'))).toBeNull();
    expect(p(2027, '2027-02-29', new Date('2027-03-01T00:00:00Z'))).toBe('calendar');
  });
});

describe('cycleYearProblem', () => {
  const now = new Date('2026-11-20T12:00:00Z'); // the 2027 cycle
  it('accepts current-3 through current+1', () => {
    for (const y of [2024, 2025, 2026, 2027, 2028]) expect(cycleYearProblem(y, now), String(y)).toBeNull();
  });
  it('rejects outside, fractions and strings', () => {
    for (const y of [1999, 2023, 2029, 2101, 2027.5, '2027', null, undefined, NaN]) {
      expect(cycleYearProblem(y, now), String(y)).toBe('range');
    }
  });
  it('the current cycle rolls over on June 1 UTC', () => {
    expect(cycleYearProblem(2028, new Date('2026-06-01T00:00:00Z'))).toBeNull();
    expect(cycleYearProblem(2028, new Date('2026-05-31T23:59:59Z'))).toBe('range');
  });
});

describe('normalizeHomeState', () => {
  it('upper-cases and trims', () => {
    expect(normalizeHomeState('nc ')).toBe('NC');
    expect(normalizeHomeState(' NC')).toBe('NC');
    expect(normalizeHomeState('DC')).toBe('DC');
    expect(normalizeHomeState('pr')).toBe('PR');
  });
  it('empty is null', () => {
    expect(normalizeHomeState('')).toBeNull();
    expect(normalizeHomeState('  ')).toBeNull();
    expect(normalizeHomeState(undefined)).toBeNull();
    expect(normalizeHomeState(null)).toBeNull();
  });
  it('anything else is invalid', () => {
    for (const bad of ['ZZ', 'N', 'NCC', 'N C', 12, ['NC'], 'N1'])
      expect(normalizeHomeState(bad), String(bad)).toBe('invalid');
  });
});

describe('reorderIds', () => {
  it('returns the requested order when it is a permutation', () => {
    expect(reorderIds(['a', 'b', 'c'], ['c', 'a', 'b'])).toEqual(['c', 'a', 'b']);
  });
  it('null for a missing, extra, foreign or duplicated id', () => {
    expect(reorderIds(['a', 'b', 'c'], ['a', 'b'])).toBeNull();
    expect(reorderIds(['a', 'b'], ['a', 'b', 'c'])).toBeNull();
    expect(reorderIds(['a', 'b', 'c'], ['a', 'b', 'x'])).toBeNull();
    expect(reorderIds(['a', 'b', 'c'], ['a', 'a', 'b'])).toBeNull();
    expect(reorderIds(['a', 'a', 'b'], ['a', 'a', 'b'])).toBeNull();
  });
  it('an empty list reorders to an empty list', () => {
    expect(reorderIds([], [])).toEqual([]);
  });
});

describe('cleanText', () => {
  it('trims and strips control characters and NUL', () => {
    expect(cleanText('  x\u0000y  ', 10)).toBe('xy');
    expect(cleanText('a\u0007b\u001bc', 10)).toBe('abc');
  });
  it('keeps newlines inside a note', () => {
    expect(cleanText('a\r\nb', 10)).toBe('a\nb');
  });
  it('counts code points, not UTF-16 units', () => {
    expect(cleanText('😀'.repeat(60), 60)).toBe('😀'.repeat(60));
    expect(cleanText('😀'.repeat(61), 60)).toBeNull();
    expect(cleanText('a'.repeat(61), 60)).toBeNull();
  });
  it('NFC-normalises before counting', () => {
    expect(cleanText('é', 1)).toBe('é');
  });
  it('empty, whitespace and non-strings are null', () => {
    expect(cleanText('', 10)).toBeNull();
    expect(cleanText('   \u0000 ', 10)).toBeNull();
    expect(cleanText(undefined, 10)).toBeNull();
    expect(cleanText(5, 10)).toBeNull();
  });
  it('markup stays text (the rendering side escapes it)', () => {
    expect(cleanText('<b>hi</b>', 20)).toBe('<b>hi</b>');
  });
});

describe('milestoneDateWindow (the date input agrees with milestoneDateProblem)', () => {
  const now = new Date('2026-11-20T10:00:00Z');
  it('min is May 1 of the year before; max is the cycle end or tomorrow, whichever is earlier', () => {
    expect(milestoneDateWindow(2027, now)).toEqual({ min: '2026-05-01', max: '2026-11-21' });
    expect(milestoneDateWindow(2026, now)).toEqual({ min: '2025-05-01', max: '2026-08-31' });
  });
  it('every day inside the window passes milestoneDateProblem and the days just outside fail', () => {
    for (const cy of [2026, 2027]) {
      const { min, max } = milestoneDateWindow(cy, now);
      expect(milestoneDateProblem(cy, min, now)).toBeNull();
      expect(milestoneDateProblem(cy, max, now)).toBeNull();
    }
    expect(milestoneDateProblem(2027, '2026-04-30', now)).toBe('window');
    expect(milestoneDateProblem(2027, '2026-11-22', now)).toBe('future');
  });
});

describe('sharing age and the client lists', () => {
  it('accountOldEnoughToShare is exactly 7 days', () => {
    expect(SHARE_MIN_ACCOUNT_AGE_DAYS).toBe(7);
    const now = new Date('2026-11-20T12:00:00.000Z');
    expect(accountOldEnoughToShare(new Date('2026-11-13T12:00:00.000Z'), now)).toBe(true);
    expect(accountOldEnoughToShare(new Date('2026-11-13T12:00:00.001Z'), now)).toBe(false);
  });
  it('unsetMilestoneTypes keeps display order and drops what is set', () => {
    expect(unsetMilestoneTypes([])).toEqual([...MILESTONE_TYPES]);
    expect(unsetMilestoneTypes([{ type: 'INTERVIEW' }, { type: 'SUBMITTED' }])).not.toContain('INTERVIEW');
    expect(unsetMilestoneTypes(MILESTONE_TYPES.map((type) => ({ type })))).toEqual([]);
  });
  it('home state codes are exactly what normalizeHomeState accepts', () => {
    for (const c of HOME_STATE_CODES) expect(normalizeHomeState(c)).toBe(c);
    expect(HOME_STATE_CODES).toContain('DC');
  });
});
