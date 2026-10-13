import { describe, expect, it } from 'vitest';
import { addDays, wallToUtcMs, wallTimeOf, dayOf } from '../tz';
import {
  checkPollParams,
  isValidAnswers,
  isValidLock,
  layoutGrid,
  pollSlotStarts,
  rankPoll,
  type PollParams,
} from '../poll-slots';
import { hostFor, nextOccurrence, occurrenceIndexOf, occurrencesBetween } from '../recurrence';

const NY = 'America/New_York';
const params: PollParams = {
  tz: NY,
  firstDay: '2026-10-12',
  days: 3,
  dayStartHour: 18,
  dayEndHour: 22,
  slotMin: 60,
};

describe('tz', () => {
  it('converts wall time across a DST change', () => {
    // 8pm in New York is 00:00Z in summer time and 01:00Z after the fall-back.
    expect(new Date(wallToUtcMs({ y: 2026, mo: 10, d: 31, h: 20, mi: 0 }, NY)).toISOString()).toBe(
      '2026-11-01T00:00:00.000Z',
    );
    expect(new Date(wallToUtcMs({ y: 2026, mo: 11, d: 7, h: 20, mi: 0 }, NY)).toISOString()).toBe(
      '2026-11-08T01:00:00.000Z',
    );
  });
  it('round-trips and does day arithmetic', () => {
    const ms = Date.UTC(2026, 5, 1, 12, 30);
    expect(wallTimeOf(ms, 'Asia/Kolkata')).toMatchObject({ h: 18, mi: 0 });
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(dayOf(Date.UTC(2026, 0, 1, 2), NY)).toBe('2025-12-31');
  });
});

describe('poll slots', () => {
  it('derives slots from the organiser window', () => {
    const starts = pollSlotStarts(params);
    expect(starts).toHaveLength(12);
    expect(checkPollParams(params)).toBeNull();
    expect(new Date(starts[0] * 60_000).toISOString()).toBe('2026-10-12T22:00:00.000Z');
  });
  it('rejects bad params', () => {
    expect(checkPollParams({ ...params, days: 15 })).toBe('bad-days');
    expect(checkPollParams({ ...params, tz: 'Nope/Nowhere' })).toBe('bad-timezone');
    expect(checkPollParams({ ...params, dayEndHour: 18 })).toBe('bad-hours');
    expect(checkPollParams({ ...params, slotMin: 45 })).toBe('bad-slot');
  });
  it('validates answers and locks', () => {
    expect(isValidAnswers('012', 3)).toBe(true);
    expect(isValidAnswers('013', 3)).toBe(false);
    expect(isValidAnswers('01', 3)).toBe(false);
    const starts = pollSlotStarts(params);
    expect(isValidLock(starts[0], starts[0] + 120, starts, 60)).toBe(true);
    // 4 slots in a day: a run cannot cross into the next day's window.
    expect(isValidLock(starts[3], starts[3] + 120, starts, 60)).toBe(false);
    expect(isValidLock(starts[0], starts[0] + 90, starts, 60)).toBe(false);
  });
  it('ranks runs and treats a pending required invitee as unavailable', () => {
    const starts = pollSlotStarts(params);
    const n = starts.length;
    const a = '1'.repeat(n);
    const b = '0'.repeat(2) + '1'.repeat(2) + '0'.repeat(n - 4);
    const ranked = rankPoll(
      params,
      [
        { userId: 'a', answers: a, required: false },
        { userId: 'b', answers: b, required: true },
      ],
      [],
    );
    expect(ranked.runs[0].startMin).toBe(starts[2]);
    const withPending = rankPoll(params, [{ userId: 'a', answers: a, required: false }], ['c']);
    expect(withPending.runs).toHaveLength(0);
  });
  it('lays out in another timezone', () => {
    const layout = layoutGrid(pollSlotStarts(params), 'Europe/Berlin');
    // 18:00-22:00 New York is 00:00-04:00 Berlin the next morning.
    expect(layout.rows).toEqual([0, 60, 120, 180]);
    expect(layout.days).toHaveLength(3);
    expect(layout.cells.filter((c) => c >= 0)).toHaveLength(12);
  });
});

describe('recurrence', () => {
  const weekly = {
    rule: 'W' as const,
    tz: NY,
    first: new Date('2026-10-30T00:00:00Z'), // Thu 8pm EDT
    until: null,
  };
  it('keeps wall-clock time across DST', () => {
    const occ = occurrencesBetween(
      weekly,
      new Date('2026-10-29T00:00:00Z'),
      new Date('2026-11-20T00:00:00Z'),
    );
    expect(occ.map((o) => o.startsAt.toISOString())).toEqual([
      '2026-10-30T00:00:00.000Z',
      '2026-11-06T01:00:00.000Z',
      '2026-11-13T01:00:00.000Z',
    ]);
  });
  it('finds the next occurrence and honours until', () => {
    expect(nextOccurrence(weekly, new Date('2026-11-07T00:00:00Z'))?.index).toBe(2);
    const ended = { ...weekly, until: new Date('2026-11-06T00:00:00Z') };
    expect(nextOccurrence(ended, new Date('2026-11-08T00:00:00Z'))).toBeNull();
    expect(occurrenceIndexOf(weekly, new Date('2026-11-13T01:00:00Z'))).toBe(2);
    expect(occurrenceIndexOf(weekly, new Date('2026-11-13T00:00:00Z'))).toBeNull();
  });
  it('monthly follows the nth weekday', () => {
    const monthly = {
      rule: 'M' as const,
      tz: 'UTC',
      first: new Date('2026-10-14T19:00:00Z'),
      until: null,
    }; // 2nd Wed
    const occ = occurrencesBetween(
      monthly,
      new Date('2026-10-01T00:00:00Z'),
      new Date('2027-01-31T00:00:00Z'),
    );
    expect(occ.map((o) => o.startsAt.toISOString().slice(0, 10))).toEqual([
      '2026-10-14',
      '2026-11-11',
      '2026-12-09',
      '2027-01-13',
    ]);
  });
  it('rotates hosts', () => {
    expect(hostFor('owner', [], 3)).toBe('owner');
    expect(hostFor('owner', ['a', 'b'], 3)).toBe('b');
  });
});

import { expandSlots, isBookableSlot, weekBounds, windowsOverlap } from '../office-hours';

describe('office hours', () => {
  const cfg = {
    tz: NY,
    slotMin: 30,
    windows: [{ weekday: 2, startMinute: 18 * 60, endMinute: 19 * 60 + 30 }], // Tuesdays 18:00-19:30
  };
  it('expands weekly windows into slots in the host timezone', () => {
    const slots = expandSlots(
      cfg,
      new Date('2026-10-12T00:00:00Z'),
      new Date('2026-10-20T00:00:00Z'),
    );
    expect(slots.map((s) => s.startsAt.toISOString())).toEqual([
      '2026-10-13T22:00:00.000Z',
      '2026-10-13T22:30:00.000Z',
      '2026-10-13T23:00:00.000Z',
    ]);
  });
  it('only accepts real, future slots', () => {
    const now = new Date('2026-10-12T00:00:00Z');
    expect(isBookableSlot(cfg, new Date('2026-10-13T22:30:00Z'), now)).toBe(true);
    expect(isBookableSlot(cfg, new Date('2026-10-13T22:15:00Z'), now)).toBe(false);
    expect(
      isBookableSlot(cfg, new Date('2026-10-13T22:30:00Z'), new Date('2026-10-13T22:20:00Z')),
    ).toBe(false);
    expect(isBookableSlot(cfg, new Date('2026-12-01T23:00:00Z'), now)).toBe(false);
  });
  it('finds overlapping windows and the booking week', () => {
    expect(
      windowsOverlap([
        { weekday: 1, startMinute: 0, endMinute: 60 },
        { weekday: 1, startMinute: 30, endMinute: 90 },
      ]),
    ).toBe(true);
    expect(
      windowsOverlap([
        { weekday: 1, startMinute: 0, endMinute: 60 },
        { weekday: 2, startMinute: 30, endMinute: 90 },
      ]),
    ).toBe(false);
    const wk = weekBounds(new Date('2026-10-14T12:00:00Z'), NY); // a Wednesday
    expect(wk.start.toISOString()).toBe('2026-10-12T04:00:00.000Z');
    expect(wk.end.toISOString()).toBe('2026-10-19T04:00:00.000Z');
  });
});

import { effectiveAttendance } from '../recurrence';

describe('effectiveAttendance', () => {
  it('carries every-time RSVPs and lets an occurrence override them', () => {
    const att = effectiveAttendance(
      [
        { userId: 'a', status: 'going' },
        { userId: 'b', status: 'going' },
      ],
      [
        { userId: 'b', status: 'no' },
        { userId: 'c', status: 'maybe' },
        { userId: 'a', status: 'maybe' },
      ],
    );
    expect([...att.entries()].sort()).toEqual([
      ['a', 'maybe'],
      ['c', 'maybe'],
    ]);
  });
});

import { isStudySlot, roomOpenFor, studySlotOptions, subjectKey } from '../study-buddy';

describe('study buddy', () => {
  it('normalises subjects so spelling noise does not split a match', () => {
    expect(subjectKey('  Linear   Algebra!! ')).toBe('linear algebra');
    expect(subjectKey('Maths', 'math')).toBe('preset:math');
    expect(subjectKey('x', 'not-a-preset')).toBe('x');
  });
  it('offers future half-hour slots', () => {
    const now = new Date('2026-10-13T10:07:00Z');
    const opts = studySlotOptions(now);
    expect(opts.every((o) => o % 1_800_000 === 0 && o >= now.getTime() + 30 * 60_000)).toBe(true);
    expect(isStudySlot(new Date(opts[0]), now)).toBe(true);
    expect(isStudySlot(new Date(opts[0] + 60_000), now)).toBe(false);
  });
  it('opens the room shortly before the start and closes at the end', () => {
    const m = {
      startsAt: new Date('2026-10-13T12:00:00Z'),
      endsAt: new Date('2026-10-13T12:25:00Z'),
    };
    expect(roomOpenFor(m, new Date('2026-10-13T11:50:00Z'))).toBe(false);
    expect(roomOpenFor(m, new Date('2026-10-13T11:56:00Z'))).toBe(true);
    expect(roomOpenFor(m, new Date('2026-10-13T12:26:00Z'))).toBe(false);
  });
});
