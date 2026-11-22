import { describe, expect, it } from 'vitest';
import {
  accumulate,
  drain,
  GAP_CAP_MS,
  initialClock,
  MAX_SECONDS_PER_REQUEST,
  minutesOf,
  onActivity,
  onHidden,
  onListenEnd,
  onListenStart,
  roomInDay,
  shouldFlush,
} from '@/lib/reading/time';

const S = 1000;

describe('accumulate', () => {
  it('counts nothing for the first activity', () => {
    expect(accumulate(null, 5000)).toBe(0);
  });
  it('counts the whole gap up to the cap', () => {
    expect(accumulate(0, 30 * S)).toBe(30 * S);
    expect(accumulate(0, GAP_CAP_MS)).toBe(GAP_CAP_MS);
  });
  it('counts a longer gap as the cap, not the gap', () => {
    expect(accumulate(0, 10 * 60 * S)).toBe(GAP_CAP_MS);
  });
  it('never counts a negative gap (clock going backwards)', () => {
    expect(accumulate(10_000, 5_000)).toBe(0);
  });
});

describe('the clock', () => {
  it('adds consecutive gaps and flushes whole seconds, keeping the remainder', () => {
    let s = onActivity(initialClock, 0);
    s = onActivity(s, 10_500);
    s = onActivity(s, 20_000);
    expect(s.pendingMs).toBe(20_000);
    const out = drain(s, 20_000);
    expect(out.seconds).toBe(20);
    expect(out.state.pendingMs).toBe(0);
    const part = drain(
      {
        ...s,
        pendingMs: 1_900,
      },
      0,
    );
    expect(part.seconds).toBe(1);
    expect(part.state.pendingMs).toBe(900);
  });

  it('a long page without scrolling counts as the cap only', () => {
    const s = onActivity(onActivity(initialClock, 0), 20 * 60 * S);
    expect(s.pendingMs).toBe(GAP_CAP_MS);
  });

  it('hidden time is excluded: hide closes the gap and the return starts a new one', () => {
    let s = onActivity(initialClock, 0);
    s = onHidden(s, 30 * S);
    expect(s.pendingMs).toBe(30 * S);
    expect(s.last).toBeNull();
    // An hour later the tab is shown again: nothing for the hidden hour.
    s = onActivity(s, 3600 * S);
    expect(s.pendingMs).toBe(30 * S);
    expect(onHidden(s, 3600 * S + 10 * S).pendingMs).toBe(40 * S);
  });

  it('a hidden tab that never comes back adds at most the cap', () => {
    const s = onHidden(onActivity(initialClock, 0), 60 * 60 * S);
    expect(s.pendingMs).toBe(GAP_CAP_MS);
  });

  it('one request carries at most 900 seconds', () => {
    const out = drain(
      {
        last: null,
        pendingMs: 2000 * S,
        listenFrom: null,
      },
      0,
    );
    expect(out.seconds).toBe(MAX_SECONDS_PER_REQUEST);
    expect(out.state.pendingMs).toBe((2000 - MAX_SECONDS_PER_REQUEST) * S);
  });

  it('flushes from the activity handler only past five minutes', () => {
    expect(
      shouldFlush(
        {
          last: 0,
          pendingMs: 300 * S,
          listenFrom: null,
        },
        0,
      ),
    ).toBe(false);
    expect(
      shouldFlush(
        {
          last: 0,
          pendingMs: 301 * S,
          listenFrom: null,
        },
        0,
      ),
    ).toBe(true);
  });
});

describe('listen spans', () => {
  it('counts from start to end and nothing twice when the reader also scrolls', () => {
    let s = onActivity(initialClock, 0);
    s = onListenStart(s, 10 * S);
    expect(s.pendingMs).toBe(10 * S);
    s = onActivity(s, 40 * S); // a scroll during speech adds nothing by itself
    expect(s.pendingMs).toBe(10 * S);
    s = onListenEnd(s, 100 * S);
    expect(s.pendingMs).toBe(100 * S);
    expect(s.listenFrom).toBeNull();
  });

  it('keeps counting while hidden (speech plays on in the background)', () => {
    let s = onListenStart(onActivity(initialClock, 0), 0);
    s = onHidden(s, 60 * S);
    expect(s.listenFrom).toBe(0);
    s = onListenEnd(s, 90 * S);
    expect(s.pendingMs).toBe(90 * S);
  });

  it('an open span flushes in pieces and restarts', () => {
    const s = onListenStart(initialClock, 0);
    const out = drain(s, 1000 * S);
    expect(out.seconds).toBe(MAX_SECONDS_PER_REQUEST);
    expect(out.state.listenFrom).toBe(1000 * S);
    expect(out.state.pendingMs).toBe(100 * S);
  });

  it('starting twice or ending without a start changes nothing', () => {
    const a = onListenStart(initialClock, 5);
    expect(onListenStart(a, 99)).toBe(a);
    expect(onListenEnd(initialClock, 99)).toBe(initialClock);
  });
});

describe('caps and display', () => {
  it('roomInDay drops the excess over 24 hours', () => {
    expect(roomInDay(0, 900)).toBe(900);
    expect(roomInDay(86_400 - 100, 900)).toBe(100);
    expect(roomInDay(86_400, 900)).toBe(0);
  });
  it('minutesOf shows any time as at least a minute', () => {
    expect(minutesOf(0)).toBe(0);
    expect(minutesOf(20)).toBe(1);
    expect(minutesOf(1200)).toBe(20);
  });
});
