/** The RMHStudy streak rule (a member's stored progress, written by the hub on every focus session). */
import { describe, expect, it } from 'vitest';
import { nextStudyStreak } from '@/lib/rmhstudy/streak';

const at = (iso: string) => new Date(iso);

describe('nextStudyStreak', () => {
  it('starts at 1 for a first session', () => {
    expect(nextStudyStreak(null, at('2026-11-21T10:00:00Z'))).toEqual({ currentStreak: 1, longestStreak: 1 });
  });

  it('keeps the streak for a second session the same day and extends it the next day', () => {
    const prev = { currentStreak: 3, longestStreak: 5, lastStudyDate: at('2026-11-20T08:00:00Z') };
    expect(nextStudyStreak(prev, at('2026-11-20T21:00:00Z'))).toEqual({ currentStreak: 3, longestStreak: 5 });
    expect(nextStudyStreak(prev, at('2026-11-21T07:00:00Z'))).toEqual({ currentStreak: 4, longestStreak: 5 });
  });

  it('counts calendar days, not 24-hour gaps', () => {
    const prev = { currentStreak: 5, longestStreak: 5, lastStudyDate: at('2026-11-20T23:30:00Z') };
    expect(nextStudyStreak(prev, at('2026-11-21T00:15:00Z'))).toEqual({ currentStreak: 6, longestStreak: 6 });
  });

  it('starts again after a missed day and keeps the longest', () => {
    const prev = { currentStreak: 7, longestStreak: 9, lastStudyDate: at('2026-11-18T12:00:00Z') };
    expect(nextStudyStreak(prev, at('2026-11-20T12:00:00Z'))).toEqual({ currentStreak: 1, longestStreak: 9 });
  });
});
