import { describe, expect, it } from 'vitest';
import { formatLastPlayed, formatPlaytime } from '@/lib/games/format-playtime';

describe('formatPlaytime', () => {
  it('shows minutes under an hour and hours with one decimal from an hour up', () => {
    expect(formatPlaytime(0)).toBe('0 min');
    expect(formatPlaytime(59)).toBe('0 min');
    expect(formatPlaytime(60)).toBe('1 min');
    expect(formatPlaytime(3540)).toBe('59 min');
    expect(formatPlaytime(3600)).toBe('1.0 h');
    expect(formatPlaytime(37800)).toBe('10.5 h');
  });

  it('clamps nonsense to zero', () => {
    expect(formatPlaytime(-5)).toBe('0 min');
    expect(formatPlaytime(Number.NaN)).toBe('0 min');
  });
});

describe('formatLastPlayed', () => {
  const now = new Date('2026-10-30T12:00:00.000Z');
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

  it('says never for null', () => {
    expect(formatLastPlayed(null, now)).toEqual({ key: 'never' });
  });

  it('buckets into today, yesterday and days ago by UTC day', () => {
    expect(formatLastPlayed(ago(3 * 3600_000), now)).toEqual({ key: 'today' });
    expect(formatLastPlayed(ago(24 * 3600_000), now)).toEqual({ key: 'yesterday' });
    expect(formatLastPlayed(ago(5 * 24 * 3600_000), now)).toEqual({ key: 'days', days: 5 });
  });
});
