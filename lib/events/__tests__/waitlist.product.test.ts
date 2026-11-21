import { describe, expect, it } from 'vitest';
import {
  MAX_WAITLIST,
  canJoinWaitlist,
  freeSeats,
  orderWaitlist,
  pickPromotions,
  waitlistPosition,
  type WaitlistEntry,
} from '@/lib/events/waitlist';

const at = (n: number) => new Date(1_000_000 + n);
const entry = (userId: string, n: number): WaitlistEntry => ({ userId, waitlistedAt: at(n) });
const START = new Date(2_000_000_000_000);
const BEFORE = new Date(START.getTime() - 60_000);

describe('orderWaitlist', () => {
  it('is first in, first out, with the user id breaking a tie, and does not mutate its input', () => {
    const input = [entry('c', 3), entry('b', 1), entry('a', 1)];
    expect(orderWaitlist(input).map((e) => e.userId)).toEqual(['a', 'b', 'c']);
    expect(input.map((e) => e.userId)).toEqual(['c', 'b', 'a']);
  });
});

describe('freeSeats', () => {
  it('is capacity minus going, never negative, and none without a capacity', () => {
    expect(freeSeats(5, 3)).toBe(2);
    expect(freeSeats(2, 5)).toBe(0);
    expect(freeSeats(null, 0)).toBe(0);
  });
});

describe('pickPromotions', () => {
  const waitlist = [entry('c', 3), entry('a', 1), entry('b', 2)];
  const base = { startsAt: START, now: BEFORE, waitlist };

  it('promotes the earliest as many as there are free seats', () => {
    expect(pickPromotions({ ...base, capacity: 3, going: 2 })).toEqual(['a']);
    expect(pickPromotions({ ...base, capacity: 4, going: 2 })).toEqual(['a', 'b']);
  });

  it('promotes everyone who fits and no more than are waiting', () => {
    expect(pickPromotions({ ...base, capacity: 10, going: 0 })).toEqual(['a', 'b', 'c']);
  });

  it('promotes nobody when the event is full or over capacity', () => {
    expect(pickPromotions({ ...base, capacity: 2, going: 2 })).toEqual([]);
    expect(pickPromotions({ ...base, capacity: 2, going: 5 })).toEqual([]);
  });

  it('promotes everybody when the capacity is removed', () => {
    expect(pickPromotions({ ...base, capacity: null, going: 9 })).toEqual(['a', 'b', 'c']);
  });

  it('promotes nobody at or after the start', () => {
    expect(pickPromotions({ ...base, capacity: 9, going: 0, now: START })).toEqual([]);
    expect(pickPromotions({ ...base, capacity: 9, going: 0, now: new Date(START.getTime() + 1) })).toEqual([]);
  });

  it('is empty for an empty waitlist', () => {
    expect(pickPromotions({ ...base, waitlist: [], capacity: 3, going: 0 })).toEqual([]);
  });
});

describe('waitlistPosition', () => {
  const waitlist = [entry('c', 3), entry('a', 1), entry('b', 2)];
  it('is 1-based in FIFO order, and null for someone not on the list', () => {
    expect(waitlistPosition(waitlist, 'a')).toBe(1);
    expect(waitlistPosition(waitlist, 'c')).toBe(3);
    expect(waitlistPosition(waitlist, 'zed')).toBeNull();
    expect(waitlistPosition([], 'a')).toBeNull();
  });
});

describe('canJoinWaitlist', () => {
  it('is open before the start while there is room, closed from the start, full at the cap', () => {
    expect(canJoinWaitlist({ startsAt: START, now: BEFORE, waiting: 0 })).toBe('ok');
    expect(canJoinWaitlist({ startsAt: START, now: BEFORE, waiting: MAX_WAITLIST - 1 })).toBe('ok');
    expect(canJoinWaitlist({ startsAt: START, now: BEFORE, waiting: MAX_WAITLIST })).toBe('full');
    expect(canJoinWaitlist({ startsAt: START, now: START, waiting: 0 })).toBe('closed');
  });
});
