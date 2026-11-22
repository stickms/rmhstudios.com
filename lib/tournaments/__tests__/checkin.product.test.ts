import { describe, expect, it } from 'vitest';
import {
  CHECK_IN_MINUTES,
  checkInOpensAt,
  checkInPhase,
  checkInShortfall,
  checkedInCount,
  isCheckInMinutes,
  isCheckInOpen,
  noShows,
} from '@/lib/tournaments/checkin';

const START = new Date('2026-12-01T18:00:00.000Z');
const at = (iso: string) => new Date(iso);

describe('the check-in window', () => {
  it('offers 10, 15, 30 and 60 minutes only', () => {
    expect([...CHECK_IN_MINUTES]).toEqual([10, 15, 30, 60]);
    expect([10, 15, 30, 60].every(isCheckInMinutes)).toBe(true);
    expect([0, 5, 20, 45, 90, -15, 15.5, null, '15'].some(isCheckInMinutes)).toBe(false);
  });

  it('opens the chosen number of minutes before the start', () => {
    expect(checkInOpensAt({ startsAt: START, checkInMinutes: 15 })?.toISOString()).toBe('2026-12-01T17:45:00.000Z');
    expect(checkInOpensAt({ startsAt: START, checkInMinutes: 60 })?.toISOString()).toBe('2026-12-01T17:00:00.000Z');
  });

  it('has no window without a start time or without a setting', () => {
    expect(checkInOpensAt({ startsAt: null, checkInMinutes: 15 })).toBeNull();
    expect(checkInOpensAt({ startsAt: START, checkInMinutes: null })).toBeNull();
  });

  it('is open from the opening minute and stays open past the start (start is manual)', () => {
    const t = { startsAt: START, checkInMinutes: 15 };
    expect(isCheckInOpen(t, at('2026-12-01T17:44:59.999Z'))).toBe(false);
    expect(isCheckInOpen(t, at('2026-12-01T17:45:00.000Z'))).toBe(true);
    expect(isCheckInOpen(t, at('2026-12-01T18:00:00.000Z'))).toBe(true);
    expect(isCheckInOpen(t, at('2026-12-02T09:00:00.000Z'))).toBe(true);
  });

  it('is never open without check-in', () => {
    expect(isCheckInOpen({ startsAt: START, checkInMinutes: null }, at('2026-12-01T18:00:00Z'))).toBe(false);
    expect(isCheckInOpen({ startsAt: null, checkInMinutes: 30 }, at('2026-12-01T18:00:00Z'))).toBe(false);
  });

  it('names the phase: off, before, open', () => {
    expect(checkInPhase({ startsAt: START, checkInMinutes: null }, START)).toBe('off');
    expect(checkInPhase({ startsAt: START, checkInMinutes: 10 }, at('2026-12-01T17:00:00Z'))).toBe('before');
    expect(checkInPhase({ startsAt: START, checkInMinutes: 10 }, at('2026-12-01T17:50:00Z'))).toBe('open');
  });
});

describe('the drop list', () => {
  const entrants = [
    { id: 'a', checkedInAt: at('2026-12-01T17:50:00Z') },
    { id: 'b', checkedInAt: null },
    { id: 'c', checkedInAt: at('2026-12-01T17:55:00Z') },
    { id: 'd', checkedInAt: null },
  ];
  const t = { startsAt: START, checkInMinutes: 15 };

  it('drops exactly the entrants who have not checked in once the window is open', () => {
    expect(noShows(t, entrants, at('2026-12-01T17:59:00Z')).map((e) => e.id)).toEqual(['b', 'd']);
  });

  it('drops nobody before the window opens, or when check-in is off', () => {
    expect(noShows(t, entrants, at('2026-12-01T17:00:00Z'))).toEqual([]);
    expect(noShows({ startsAt: START, checkInMinutes: null }, entrants, START)).toEqual([]);
  });

  it('drops nobody when everyone checked in', () => {
    expect(
      noShows(
        t,
        entrants.filter((e) => e.checkedInAt),
        START,
      ),
    ).toEqual([]);
  });

  it('counts the checked-in entrants', () => {
    expect(checkedInCount(entrants)).toBe(2);
    expect(checkedInCount([])).toBe(0);
  });
});

describe('the refusal numbers', () => {
  it('reports how many are in and how many the tournament needs', () => {
    expect(checkInShortfall(3, 4)).toEqual({ checkedIn: 3, needed: 4 });
    expect(checkInShortfall(0, 2)).toEqual({ checkedIn: 0, needed: 2 });
  });

  it('is null once enough have checked in', () => {
    expect(checkInShortfall(4, 4)).toBeNull();
    expect(checkInShortfall(8, 4)).toBeNull();
  });
});
