/**
 * SM-2 spaced-repetition scheduling (#31). Pure functions.
 * Grade: 0 = again, 1 = hard, 2 = good, 3 = easy.
 */

export type Grade = 0 | 1 | 2 | 3;

export interface SrsState {
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function nextState(prev: SrsState, grade: Grade): SrsState & { dueAt: Date } {
  let { easeFactor, intervalDays, repetitions } = prev;

  // Map our 4-button grade onto SM-2's 0..5 quality.
  const quality = grade === 0 ? 2 : grade === 1 ? 3 : grade === 2 ? 4 : 5;

  if (grade === 0) {
    // Lapse — reset reps, short relearn interval.
    repetitions = 0;
    intervalDays = 0;
  } else {
    repetitions += 1;
    if (repetitions === 1) intervalDays = 1;
    else if (repetitions === 2) intervalDays = 6;
    else intervalDays = Math.round(intervalDays * easeFactor);
  }

  easeFactor = Math.max(1.3, easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));

  // "again" is due in ~10 minutes; otherwise N days out.
  const dueAt = grade === 0 ? new Date(Date.now() + 10 * 60 * 1000) : new Date(Date.now() + intervalDays * DAY_MS);

  return { easeFactor, intervalDays, repetitions, dueAt };
}
