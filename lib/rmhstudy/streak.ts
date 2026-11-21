/**
 * RMHStudy's daily focus streak, as the hub updates it when a work session ends.
 * Pure, so the rule is tested where the socket hub cannot be.
 *
 * A streak counts UTC calendar days with at least one finished focus session: a
 * second session the same day keeps it, the next day extends it, and a missed day
 * starts again at 1. Days, not 24-hour gaps: a session at 23:00 and one at 07:00
 * the next morning are consecutive days even though they are 8 hours apart.
 */
const DAY_MS = 86_400_000;

function utcDay(date: Date): number {
  return Math.floor(date.getTime() / DAY_MS);
}

export interface StudyStreakState {
  currentStreak: number;
  longestStreak: number;
  lastStudyDate: Date | null;
}

export function nextStudyStreak(
  previous: StudyStreakState | null,
  now: Date,
): { currentStreak: number; longestStreak: number } {
  if (!previous?.lastStudyDate) {
    return { currentStreak: 1, longestStreak: Math.max(previous?.longestStreak ?? 0, 1) };
  }
  const gap = utcDay(now) - utcDay(previous.lastStudyDate);
  const currentStreak =
    gap <= 0 ? Math.max(previous.currentStreak, 1) : gap === 1 ? previous.currentStreak + 1 : 1;
  return { currentStreak, longestStreak: Math.max(previous.longestStreak, currentStreak) };
}
