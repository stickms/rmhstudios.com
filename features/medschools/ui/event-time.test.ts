import { describe, expect, it } from 'vitest';
import { EVENT_TIP_CLOSED, exactEventTime, isDayOnlyEvent, nextEventTip } from './event-time';

describe('exactEventTime', () => {
  it('an event with a time prints in the given zone, with the zone named', () => {
    const r = exactEventTime('2026-11-24T20:42:00.000Z', false, 'en-US', 'America/New_York');
    expect(r).toEqual({ text: 'Tue, Nov 24, 2026, 3:42 PM EST', dayOnly: false });
    expect(exactEventTime('2026-11-24T20:42:00.000Z', false, 'en-US', 'Asia/Tokyo').text).toBe(
      'Wed, Nov 25, 2026, 5:42 AM GMT+9',
    );
  });
  it('a day-only event gets the full calendar date and no invented time, and the day never shifts', () => {
    const r = exactEventTime('2026-11-24T00:00:00.000Z', true, 'en-US', 'America/Los_Angeles');
    expect(r).toEqual({ text: 'Tuesday, November 24, 2026', dayOnly: true });
    expect(r.text).not.toMatch(/\d:\d\d/);
    // A bare tracker date reads the same day in any zone.
    expect(exactEventTime('2026-11-24', true, 'en-US', 'Pacific/Kiritimati').text).toBe('Tuesday, November 24, 2026');
  });
  it('uses the locale it is given', () => {
    expect(exactEventTime('2026-11-24T00:00:00.000Z', true, 'de-DE').text).toBe('Dienstag, 24. November 2026');
    expect(exactEventTime('2026-11-24T20:42:00.000Z', false, 'de-DE', 'Europe/Berlin').text).toBe(
      'Di., 24. Nov. 2026, 21:42 MEZ',
    );
  });
  it('ADMIT and SDN at exactly 00:00 UTC are day-only (the arrivals rule); everything else has a time', () => {
    expect(isDayOnlyEvent('SDN', '2026-11-24T00:00:00.000Z')).toBe(true);
    expect(isDayOnlyEvent('ADMIT', '2026-11-24T00:00:00.000Z')).toBe(true);
    expect(isDayOnlyEvent('ADMIT', '2026-11-24T00:01:00.000Z')).toBe(false);
    expect(isDayOnlyEvent('CYCLETRACK', '2026-11-24T00:00:00.000Z')).toBe(false);
  });
});

describe('nextEventTip', () => {
  it('focus and hover show it; leaving hides it unless a press pinned it; Escape and blur always hide it', () => {
    const shown = nextEventTip(EVENT_TIP_CLOSED, 'focus');
    expect(shown).toEqual({ open: true, pinned: false });
    expect(nextEventTip(EVENT_TIP_CLOSED, 'hover')).toEqual(shown);
    expect(nextEventTip(shown, 'leave')).toEqual(EVENT_TIP_CLOSED);
    const pinned = nextEventTip(shown, 'press');
    expect(pinned).toEqual({ open: true, pinned: true });
    expect(nextEventTip(pinned, 'leave')).toEqual(pinned);
    expect(nextEventTip(pinned, 'press')).toEqual(EVENT_TIP_CLOSED);
    expect(nextEventTip(pinned, 'escape')).toEqual(EVENT_TIP_CLOSED);
    expect(nextEventTip(pinned, 'blur')).toEqual(EVENT_TIP_CLOSED);
    // A tap on a touch screen: focus, then the press pins it.
    expect(nextEventTip(nextEventTip(EVENT_TIP_CLOSED, 'focus'), 'press')).toEqual(pinned);
  });
});
