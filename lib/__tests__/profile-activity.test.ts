import { describe, it, expect } from 'vitest';
import { bucketByDay, heatLevel, windowDays, windowStart, HEATMAP_WEEKS } from '@/lib/profile/activity';

const NOW = new Date('2026-11-01T15:30:00Z');

describe('profile activity heatmap', () => {
  it('starts the window 26 weeks of days back, at UTC midnight', () => {
    expect(windowStart(NOW).toISOString()).toBe('2026-05-04T00:00:00.000Z');
  });

  it('lists exactly weeks*7 days ending today', () => {
    const days = windowDays({}, NOW);
    expect(days).toHaveLength(HEATMAP_WEEKS * 7);
    expect(days[0]!.date).toBe('2026-05-04');
    expect(days.at(-1)!.date).toBe('2026-11-01');
  });

  it('buckets by UTC day and drops anything outside the window', () => {
    const counts = bucketByDay(
      [
        new Date('2026-11-01T00:00:00Z'),
        new Date('2026-11-01T23:59:59Z'),
        new Date('2026-10-31T12:00:00Z'),
        new Date('2026-05-03T23:59:59Z'), // one second before the window
        new Date('2026-11-02T00:00:00Z'), // tomorrow
      ],
      NOW,
    );
    expect(counts).toEqual({ '2026-11-01': 2, '2026-10-31': 1 });
  });

  it('shades relative to the busiest day', () => {
    expect(heatLevel(0, 10)).toBe(0);
    expect(heatLevel(1, 10)).toBe(1);
    expect(heatLevel(3, 10)).toBe(2);
    expect(heatLevel(6, 10)).toBe(3);
    expect(heatLevel(10, 10)).toBe(4);
    expect(heatLevel(5, 0)).toBe(0);
  });
});
