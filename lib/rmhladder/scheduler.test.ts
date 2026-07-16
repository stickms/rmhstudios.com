import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LADDER_CRON,
  DEFAULT_STALE_AFTER_MS,
  isScrapeStale,
  resolveLadderCron,
} from './scheduler';

describe('resolveLadderCron', () => {
  it('defaults to every twelve hours', () => {
    expect(resolveLadderCron(undefined)).toBe('0 */12 * * *');
    expect(DEFAULT_LADDER_CRON).toBe('0 */12 * * *');
  });

  it('accepts a valid deployment override', () => {
    expect(resolveLadderCron('15 */2 * * *')).toBe('15 */2 * * *');
  });

  it('fails fast on invalid cron configuration', () => {
    expect(() => resolveLadderCron('not a cron')).toThrow(/Invalid LADDER_CRON_SCHEDULE/);
  });
});

describe('isScrapeStale', () => {
  const now = new Date('2026-07-12T12:00:00.000Z');

  it('is stale when no completed run exists', () => {
    expect(isScrapeStale(null, now)).toBe(true);
  });

  it('becomes stale at the twelve-hour boundary', () => {
    expect(isScrapeStale(new Date('2026-07-12T00:00:00.001Z'), now)).toBe(false);
    expect(isScrapeStale(new Date('2026-07-12T00:00:00.000Z'), now)).toBe(true);
    expect(DEFAULT_STALE_AFTER_MS).toBe(43_200_000);
  });
});
