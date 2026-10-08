import { describe, it, expect } from 'vitest';

/**
 * Rebar & Rutabaga's booking rules (W1).
 *
 * The page has printed these three sentences since it shipped — Wednesday to
 * Saturday, two seatings, bookings open on the first for the month after next —
 * and until now nothing enforced them, because the only way to book was an
 * email. These tests are the sentences.
 *
 * The month-window arithmetic is the part worth covering hardest: it crosses a
 * year boundary twice a year and a timezone boundary every night.
 */

import {
  COVERS_PER_SEATING,
  MAX_PARTY_SIZE,
  bookableDates,
  bookableMonth,
  checkServiceDate,
  fits,
  isSeating,
  isServiceDateShape,
  isServiceDay,
  seatsLeft,
} from '@/lib/rebar-rutabaga/booking';

/** Noon UTC on a given day, to keep the fixtures away from zone edges. */
const at = (iso: string) => new Date(`${iso}T12:00:00.000Z`);

describe('isServiceDateShape', () => {
  it('accepts a real day', () => {
    expect(isServiceDateShape('2026-11-18')).toBe(true);
  });

  it('rejects a malformed string', () => {
    for (const bad of ['', '2026-11', '18/11/2026', '2026-11-18T00:00', 'tomorrow']) {
      expect(isServiceDateShape(bad)).toBe(false);
    }
  });

  it('rejects a well-formed date that does not exist', () => {
    // `new Date('2026-02-30')` rolls forward to 2 March rather than failing,
    // which is exactly how an invalid day would otherwise get through.
    expect(isServiceDateShape('2026-02-30')).toBe(false);
    expect(isServiceDateShape('2026-13-01')).toBe(false);
  });
});

describe('isServiceDay — Wednesday to Saturday', () => {
  it('serves Wed, Thu, Fri, Sat', () => {
    // 2026-11-18 is a Wednesday.
    expect(['2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21'].map(isServiceDay)).toEqual([
      true, true, true, true,
    ]);
  });

  it('is dark Sun, Mon, Tue', () => {
    expect(['2026-11-22', '2026-11-23', '2026-11-24'].map(isServiceDay)).toEqual([
      false, false, false,
    ]);
  });
});

describe('bookableMonth — the month after next', () => {
  it('is May when it is March', () => {
    expect(bookableMonth(at('2026-03-03'))).toBe('2026-05');
  });

  it('carries the year', () => {
    expect(bookableMonth(at('2026-11-15'))).toBe('2027-01');
    expect(bookableMonth(at('2026-12-01'))).toBe('2027-02');
  });

  it('turns over on the restaurant\'s midnight, not UTC\'s', () => {
    // 23:30 UTC on 31 January is already 1 February in Gothenburg (UTC+1),
    // so the window has moved to April even though UTC still says January.
    expect(bookableMonth(new Date('2026-01-31T23:30:00.000Z'))).toBe('2026-04');
    expect(bookableMonth(new Date('2026-01-31T22:30:00.000Z'))).toBe('2026-03');
  });
});

describe('checkServiceDate', () => {
  const now = at('2026-03-03'); // window is 2026-05

  it('accepts a service day inside the window', () => {
    expect(checkServiceDate('2026-05-06', now)).toBeNull(); // a Wednesday
  });

  it('refuses a dark night inside the window', () => {
    expect(checkServiceDate('2026-05-04', now)).toBe('not-a-service-day'); // Monday
  });

  it('refuses a service day outside the window', () => {
    expect(checkServiceDate('2026-04-01', now)).toBe('outside-window');
    expect(checkServiceDate('2026-06-03', now)).toBe('outside-window');
  });

  it('reports a malformed date as malformed, not as the wrong night', () => {
    expect(checkServiceDate('not-a-date', now)).toBe('malformed');
  });
});

describe('bookableDates', () => {
  const dates = bookableDates(at('2026-03-03')); // 2026-05

  it('lists only service nights, in order', () => {
    expect(dates.every(isServiceDay)).toBe(true);
    expect([...dates].sort()).toEqual(dates);
  });

  it('stays inside the open month', () => {
    expect(dates.every((d) => d.startsWith('2026-05'))).toBe(true);
  });

  it('gets the month length right', () => {
    // May 2026: Wed/Thu/Fri/Sat. 1 May is a Friday.
    expect(dates[0]).toBe('2026-05-01');
    expect(dates.at(-1)).toBe('2026-05-30');
  });

  it('handles February in a leap year', () => {
    // From December 2027, the window is February 2028 — a 29-day month.
    const feb = bookableDates(at('2027-12-10'));
    expect(feb.every((d) => d.startsWith('2028-02'))).toBe(true);
    expect(feb).toContain('2028-02-26');
  });
});

describe('seating and capacity', () => {
  it('knows the two seatings and nothing else', () => {
    expect(isSeating('17:30')).toBe(true);
    expect(isSeating('20:45')).toBe(true);
    expect(isSeating('19:00')).toBe(false);
  });

  it('never reports negative seats after a manual overbook', () => {
    expect(seatsLeft(COVERS_PER_SEATING + 5)).toBe(0);
  });

  it('seats a party that fits and refuses one that does not', () => {
    expect(fits(COVERS_PER_SEATING - 4, 4)).toBe(true);
    expect(fits(COVERS_PER_SEATING - 3, 4)).toBe(false);
  });

  it('sends a party larger than the form takes to the email path', () => {
    expect(fits(0, MAX_PARTY_SIZE)).toBe(true);
    expect(fits(0, MAX_PARTY_SIZE + 1)).toBe(false);
  });

  it('refuses a nonsense party size', () => {
    expect(fits(0, 0)).toBe(false);
    expect(fits(0, -2)).toBe(false);
  });
});
