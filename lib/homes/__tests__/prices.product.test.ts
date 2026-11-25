import { describe, expect, it } from 'vitest';
import {
  HISTORY_LIMIT,
  MAX_NOTIFIED_FAVOURITERS,
  isPriceChange,
  isPriceDrop,
  isReducedWithin,
  mayNotifyDrop,
  nextNoticeAt,
  noticeCutoff,
  percentChange,
  reducedByCents,
  reducedSince,
} from '../prices';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-12-01T12:00:00Z');

describe('the drop rule', () => {
  it('counts a fall of exactly 1% and anything larger', () => {
    expect(isPriceDrop(100_000, 99_000)).toBe(true);
    expect(isPriceDrop(150_000, 140_000)).toBe(true);
  });
  it('does not count a fall under 1%, a rise, no change or a zero old price', () => {
    expect(isPriceDrop(100_000, 99_001)).toBe(false);
    expect(isPriceDrop(100_000, 100_000)).toBe(false);
    expect(isPriceDrop(100_000, 120_000)).toBe(false);
    expect(isPriceDrop(0, 0)).toBe(false);
  });
  it('treats only a different price as a change', () => {
    expect(isPriceChange(100, 100)).toBe(false);
    expect(isPriceChange(100, 101)).toBe(true);
    expect(isPriceChange(100, Number.NaN)).toBe(false);
  });
  it('gives the cents of a drop and nothing for a rise', () => {
    expect(reducedByCents(150_000, 140_000)).toBe(10_000);
    expect(reducedByCents(140_000, 150_000)).toBeNull();
    expect(reducedByCents(100_000, 99_999)).toBeNull();
  });
});

describe('the percent', () => {
  it('rounds to one decimal and is negative for a drop', () => {
    expect(percentChange(150_000, 140_000)).toBe(-6.7);
    expect(percentChange(100_000, 101_000)).toBe(1);
    expect(percentChange(300_000, 299_000)).toBe(-0.3);
  });
  it('is 0 for no change and for an old price of 0, never -0', () => {
    expect(Object.is(percentChange(100, 100), 0)).toBe(true);
    expect(percentChange(0, 500)).toBe(0);
    expect(Object.is(percentChange(1_000_000, 999_999), 0)).toBe(true);
  });
});

describe('the 30-day window', () => {
  it('starts 30 days before now', () => {
    expect(reducedSince(NOW).getTime()).toBe(NOW.getTime() - 30 * DAY);
    expect(reducedSince(NOW.getTime()).getTime()).toBe(NOW.getTime() - 30 * DAY);
  });
  it('includes the edges and excludes older drops, future drops and no drop', () => {
    expect(isReducedWithin(new Date(NOW.getTime() - 30 * DAY), NOW)).toBe(true);
    expect(isReducedWithin(new Date(NOW.getTime() - 30 * DAY - 1), NOW)).toBe(false);
    expect(isReducedWithin(NOW, NOW)).toBe(true);
    expect(isReducedWithin(new Date(NOW.getTime() + 1), NOW)).toBe(false);
    expect(isReducedWithin(null, NOW)).toBe(false);
    expect(isReducedWithin('not a date', NOW)).toBe(false);
  });
});

describe('the 7-day notice rule', () => {
  it('lets a member who was never told be told', () => {
    expect(mayNotifyDrop(null, NOW)).toBe(true);
    expect(nextNoticeAt(null)).toBeNull();
  });
  it('holds a second notice for 7 days, to the millisecond', () => {
    const told = new Date(NOW.getTime() - 2 * DAY);
    expect(mayNotifyDrop(told, NOW)).toBe(false);
    expect(mayNotifyDrop(new Date(NOW.getTime() - 7 * DAY + 1), NOW)).toBe(false);
    expect(mayNotifyDrop(new Date(NOW.getTime() - 7 * DAY), NOW)).toBe(true);
    expect(nextNoticeAt(told)?.getTime()).toBe(told.getTime() + 7 * DAY);
  });
  it('has a cut-off equal to the earliest told-at that may be told again', () => {
    expect(noticeCutoff(NOW).getTime()).toBe(NOW.getTime() - 7 * DAY);
  });
});

describe('the limits', () => {
  it('shows 20 history rows and tells at most 1,000 favouriters', () => {
    expect(HISTORY_LIMIT).toBe(20);
    expect(MAX_NOTIFIED_FAVOURITERS).toBe(1000);
  });
});
